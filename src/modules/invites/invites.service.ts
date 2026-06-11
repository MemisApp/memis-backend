import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import * as crypto from 'crypto';
import { CaregiverRole, InviteStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { MailService } from '../../common/mail/mail.service';
import { ChatService } from '../chat/chat.service';

const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

@Injectable()
export class InvitesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly mail: MailService,
    private readonly chat: ChatService,
  ) {}

  private makeToken(): { raw: string; hashed: string } {
    const raw = crypto.randomBytes(32).toString('hex');
    const hashed = crypto.createHash('sha256').update(raw).digest('hex');
    return { raw, hashed };
  }

  private hashToken(raw: string): string {
    return crypto.createHash('sha256').update(raw).digest('hex');
  }

  /** Only an OWNER caregiver (or ADMIN) of the patient may manage invites. */
  private async assertOwner(userId: string, patientId: string): Promise<void> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { role: true },
    });
    if (user?.role === 'ADMIN') return;
    const link = await this.prisma.patientCaregiver.findUnique({
      where: { patientId_caregiverId: { patientId, caregiverId: userId } },
      select: { role: true },
    });
    if (!link || link.role !== 'OWNER') {
      throw new ForbiddenException('Only the primary caregiver can invite');
    }
  }

  async createInvite(
    userId: string,
    patientId: string,
    email: string,
    role: CaregiverRole,
  ) {
    await this.assertOwner(userId, patientId);

    const normalizedEmail = email.trim().toLowerCase();

    const patient = await this.prisma.patient.findUnique({
      where: { id: patientId },
      select: { firstName: true, lastName: true },
    });
    if (!patient) throw new NotFoundException('Patient not found');

    // If the invitee already cares for this patient, nothing to do.
    const existingUser = await this.prisma.user.findUnique({
      where: { email: normalizedEmail },
      select: { id: true },
    });
    if (existingUser) {
      const already = await this.prisma.patientCaregiver.findUnique({
        where: {
          patientId_caregiverId: { patientId, caregiverId: existingUser.id },
        },
        select: { id: true },
      });
      if (already) {
        throw new BadRequestException(
          'That person is already part of this care circle',
        );
      }
    }

    // Revoke any prior pending invite for the same email+patient.
    await this.prisma.caregiverInvite.updateMany({
      where: {
        patientId,
        email: normalizedEmail,
        status: InviteStatus.PENDING,
      },
      data: { status: InviteStatus.REVOKED },
    });

    const token = this.makeToken();
    const invite = await this.prisma.caregiverInvite.create({
      data: {
        patientId,
        invitedById: userId,
        email: normalizedEmail,
        role,
        tokenHash: token.hashed,
        expiresAt: new Date(Date.now() + INVITE_TTL_MS),
      },
      select: {
        id: true,
        email: true,
        role: true,
        status: true,
        createdAt: true,
      },
    });

    const inviter = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { firstName: true, lastName: true },
    });

    await this.mail.sendCaregiverInviteEmail(
      normalizedEmail,
      token.raw,
      `${patient.firstName} ${patient.lastName}`.trim(),
      inviter
        ? `${inviter.firstName} ${inviter.lastName}`.trim()
        : 'A caregiver',
    );

    return invite;
  }

  async listInvites(userId: string, patientId: string) {
    await this.assertOwner(userId, patientId);
    return this.prisma.caregiverInvite.findMany({
      where: { patientId },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        email: true,
        role: true,
        status: true,
        createdAt: true,
        expiresAt: true,
        acceptedAt: true,
      },
    });
  }

  async revokeInvite(userId: string, inviteId: string) {
    const invite = await this.prisma.caregiverInvite.findUnique({
      where: { id: inviteId },
      select: { patientId: true, status: true },
    });
    if (!invite) throw new NotFoundException('Invite not found');
    await this.assertOwner(userId, invite.patientId);
    if (invite.status === InviteStatus.PENDING) {
      await this.prisma.caregiverInvite.update({
        where: { id: inviteId },
        data: { status: InviteStatus.REVOKED },
      });
    }
    return { success: true };
  }

  private async loadValidInvite(rawToken: string) {
    const invite = await this.prisma.caregiverInvite.findUnique({
      where: { tokenHash: this.hashToken(rawToken) },
      include: {
        patient: { select: { firstName: true, lastName: true } },
        invitedBy: { select: { firstName: true, lastName: true } },
      },
    });
    if (!invite || invite.status !== InviteStatus.PENDING) {
      throw new BadRequestException('This invitation is no longer valid');
    }
    if (invite.expiresAt.getTime() < Date.now()) {
      await this.prisma.caregiverInvite.update({
        where: { id: invite.id },
        data: { status: InviteStatus.EXPIRED },
      });
      throw new BadRequestException('This invitation has expired');
    }
    return invite;
  }

  /** Details shown on the accept screen before the user confirms. */
  async lookup(rawToken: string) {
    const invite = await this.loadValidInvite(rawToken);
    return {
      email: invite.email,
      role: invite.role,
      patientName:
        `${invite.patient.firstName} ${invite.patient.lastName}`.trim(),
      invitedByName:
        `${invite.invitedBy.firstName} ${invite.invitedBy.lastName}`.trim(),
    };
  }

  async accept(userId: string, rawToken: string) {
    const invite = await this.loadValidInvite(rawToken);

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { email: true },
    });
    if (!user) throw new NotFoundException('User not found');
    if (user.email.trim().toLowerCase() !== invite.email) {
      throw new ForbiddenException(
        'This invitation was sent to a different email address. Sign in with that email to accept.',
      );
    }

    await this.prisma.patientCaregiver.upsert({
      where: {
        patientId_caregiverId: {
          patientId: invite.patientId,
          caregiverId: userId,
        },
      },
      create: {
        patientId: invite.patientId,
        caregiverId: userId,
        role: invite.role,
      },
      update: { role: invite.role },
    });

    await this.prisma.caregiverInvite.update({
      where: { id: invite.id },
      data: {
        status: InviteStatus.ACCEPTED,
        acceptedById: userId,
        acceptedAt: new Date(),
      },
    });

    // Add the new caregiver to the family group chat.
    await this.chat.ensureGroupRoom(invite.patientId);

    return { success: true, patientId: invite.patientId };
  }
}
