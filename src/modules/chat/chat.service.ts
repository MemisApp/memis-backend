import {
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { PushService } from '../clinical/push.service';

export type Actor =
  | { kind: 'user'; id: string }
  | { kind: 'patient'; id: string };

export interface CircleMember {
  kind: 'user' | 'patient';
  id: string;
  name: string;
  avatarUrl: string | null;
  role: string; // OWNER/EDITOR/VIEWER/DOCTOR/PATIENT
}

/**
 * Unifies all chat for a patient's "care circle" (the patient + their linked
 * caregivers + assigned doctors):
 *   - exactly ONE group room per circle (key = group:<patientId>)
 *   - on-demand 1:1 DM rooms between any two members (key = dm:<patientId>:<a>|<b>)
 *
 * Membership/access is driven by RoomParticipant (which supports both app users
 * and patients), so a DM that excludes the patient is never exposed to them.
 */
@Injectable()
export class ChatService {
  private readonly logger = new Logger(ChatService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly push: PushService,
  ) {}

  private token(m: { kind: 'user' | 'patient'; id: string }): string {
    return `${m.kind === 'user' ? 'u' : 'p'}:${m.id}`;
  }

  /** Resolve everyone in a patient's care circle. */
  private async getCircleMembers(patientId: string): Promise<{
    patient: CircleMember;
    members: CircleMember[]; // includes the patient
  }> {
    const patient = await this.prisma.patient.findUnique({
      where: { id: patientId },
      select: { id: true, firstName: true, lastName: true, avatarUrl: true },
    });
    if (!patient) throw new NotFoundException('Patient not found');

    const [caregivers, doctors] = await Promise.all([
      this.prisma.patientCaregiver.findMany({
        where: { patientId },
        select: {
          role: true,
          caregiver: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              avatarUrl: true,
            },
          },
        },
      }),
      this.prisma.doctorPatient.findMany({
        where: { patientId },
        select: {
          doctor: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              avatarUrl: true,
            },
          },
        },
      }),
    ]);

    const patientMember: CircleMember = {
      kind: 'patient',
      id: patient.id,
      name: `${patient.firstName} ${patient.lastName}`.trim(),
      avatarUrl: patient.avatarUrl,
      role: 'PATIENT',
    };

    const userMembers = new Map<string, CircleMember>();
    for (const c of caregivers) {
      userMembers.set(c.caregiver.id, {
        kind: 'user',
        id: c.caregiver.id,
        name: `${c.caregiver.firstName} ${c.caregiver.lastName}`.trim(),
        avatarUrl: c.caregiver.avatarUrl,
        role: c.role,
      });
    }
    for (const d of doctors) {
      if (userMembers.has(d.doctor.id)) continue;
      userMembers.set(d.doctor.id, {
        kind: 'user',
        id: d.doctor.id,
        name: `Dr. ${d.doctor.firstName} ${d.doctor.lastName}`.trim(),
        avatarUrl: d.doctor.avatarUrl,
        role: 'DOCTOR',
      });
    }

    return {
      patient: patientMember,
      members: [patientMember, ...userMembers.values()],
    };
  }

  /** Patients a user belongs to as caregiver or active doctor. */
  private async getCirclePatientIdsForUser(userId: string): Promise<string[]> {
    const [cg, dp] = await Promise.all([
      this.prisma.patientCaregiver.findMany({
        where: { caregiverId: userId },
        select: { patientId: true },
      }),
      this.prisma.doctorPatient.findMany({
        where: { doctorId: userId },
        select: { patientId: true },
      }),
    ]);
    return Array.from(
      new Set([...cg.map((c) => c.patientId), ...dp.map((d) => d.patientId)]),
    );
  }

  /** Throws unless the actor belongs to the given circle. */
  async assertInCircle(actor: Actor, patientId: string): Promise<void> {
    if (actor.kind === 'patient') {
      if (actor.id !== patientId)
        throw new ForbiddenException('Not your circle');
      return;
    }
    const ids = await this.getCirclePatientIdsForUser(actor.id);
    if (!ids.includes(patientId))
      throw new ForbiddenException('Not your circle');
  }

  private async ensureThread(
    roomId: string,
    createdById: string,
  ): Promise<string> {
    const existing = await this.prisma.thread.findFirst({
      where: { roomId },
      orderBy: { createdAt: 'asc' },
      select: { id: true },
    });
    if (existing) return existing.id;
    const thread = await this.prisma.thread.create({
      data: { roomId, title: 'General', createdById },
      select: { id: true },
    });
    return thread.id;
  }

  /** Get or create the family group room for a circle, syncing participants. */
  async ensureGroupRoom(
    patientId: string,
  ): Promise<{ roomId: string; threadId: string }> {
    const { patient, members } = await this.getCircleMembers(patientId);
    const key = `group:${patientId}`;
    const ownerUser = members.find((m) => m.kind === 'user');
    if (!ownerUser) {
      throw new ForbiddenException('Circle has no caregiver yet');
    }

    let room = await this.prisma.room.findUnique({
      where: { key },
      select: { id: true },
    });
    if (!room) {
      room = await this.prisma.room.create({
        data: {
          name: `${patient.name} — Family`,
          type: 'GROUP',
          key,
          visibility: 'PRIVATE',
          createdById: ownerUser.id,
          patientId,
        },
        select: { id: true },
      });
    }

    // Sync participants (idempotent).
    await this.prisma.$transaction(
      members.map((m) =>
        this.prisma.roomParticipant.upsert({
          where:
            m.kind === 'user'
              ? { roomId_userId: { roomId: room.id, userId: m.id } }
              : { roomId_patientId: { roomId: room.id, patientId: m.id } },
          create: {
            roomId: room.id,
            userId: m.kind === 'user' ? m.id : null,
            patientId: m.kind === 'patient' ? m.id : null,
            role: m.role === 'OWNER' ? 'OWNER' : 'MEMBER',
          },
          update: {},
        }),
      ),
    );

    const threadId = await this.ensureThread(room.id, ownerUser.id);
    return { roomId: room.id, threadId };
  }

  /** Get or create a 1:1 DM between the actor and another circle member. */
  async ensureDmRoom(
    actor: Actor,
    patientId: string,
    other: { kind: 'user' | 'patient'; id: string },
  ): Promise<{ roomId: string; threadId: string }> {
    await this.assertInCircle(actor, patientId);

    const self = { kind: actor.kind, id: actor.id };
    if (self.kind === other.kind && self.id === other.id) {
      throw new ForbiddenException('Cannot DM yourself');
    }

    // Validate the other member is in the circle.
    const { members } = await this.getCircleMembers(patientId);
    const otherMember = members.find(
      (m) => m.kind === other.kind && m.id === other.id,
    );
    const selfMember = members.find(
      (m) => m.kind === self.kind && m.id === self.id,
    );
    if (!otherMember || !selfMember) {
      throw new ForbiddenException('Member not in circle');
    }

    const pair = [self, other]
      .map((m) => this.token(m))
      .sort((a, b) => a.localeCompare(b));
    const key = `dm:${patientId}:${pair[0]}|${pair[1]}`;

    const ownerUserId =
      self.kind === 'user' ? self.id : other.kind === 'user' ? other.id : null;
    if (!ownerUserId) throw new ForbiddenException('Invalid DM');

    let room = await this.prisma.room.findUnique({
      where: { key },
      select: { id: true },
    });
    if (!room) {
      room = await this.prisma.room.create({
        data: {
          name: 'Direct message',
          type: 'DIRECT',
          key,
          visibility: 'PRIVATE',
          createdById: ownerUserId,
          // Intentionally NOT setting patientId so DMs that exclude the patient
          // are never surfaced via the care-circle patient path.
          participants: {
            create: [self, other].map((m) => ({
              userId: m.kind === 'user' ? m.id : null,
              patientId: m.kind === 'patient' ? m.id : null,
              role: 'MEMBER',
            })),
          },
        },
        select: { id: true },
      });
    }

    const threadId = await this.ensureThread(room.id, ownerUserId);
    return { roomId: room.id, threadId };
  }

  private async isParticipant(actor: Actor, roomId: string): Promise<boolean> {
    const where =
      actor.kind === 'user'
        ? { roomId_userId: { roomId, userId: actor.id } }
        : { roomId_patientId: { roomId, patientId: actor.id } };
    const p = await this.prisma.roomParticipant.findUnique({
      where,
      select: { id: true },
    });
    return !!p;
  }

  /** List the actor's care circles with members and the group room id. */
  async listCircles(actor: Actor) {
    const patientIds =
      actor.kind === 'patient'
        ? [actor.id]
        : await this.getCirclePatientIdsForUser(actor.id);

    const circles: {
      patientId: string;
      patientName: string;
      patientAvatarUrl: string | null;
      groupRoomId: string;
      members: CircleMember[];
    }[] = [];
    for (const pid of patientIds) {
      const { patient, members } = await this.getCircleMembers(pid);
      const group = await this.ensureGroupRoom(pid);
      circles.push({
        patientId: pid,
        patientName: patient.name,
        patientAvatarUrl: patient.avatarUrl,
        groupRoomId: group.roomId,
        // Members the actor can DM (everyone except themselves).
        members: members.filter(
          (m) => !(m.kind === actor.kind && m.id === actor.id),
        ),
      });
    }
    return circles;
  }

  async getRoomMessages(actor: Actor, roomId: string, limit = 50) {
    if (!(await this.isParticipant(actor, roomId))) {
      throw new ForbiddenException('Not a participant');
    }
    const thread = await this.prisma.thread.findFirst({
      where: { roomId },
      orderBy: { createdAt: 'asc' },
      select: { id: true },
    });
    if (!thread) return { roomId, messages: [] };

    const rows = await this.prisma.message.findMany({
      where: { threadId: thread.id },
      orderBy: { createdAt: 'desc' },
      take: Math.min(Math.max(limit, 1), 100),
      include: {
        author: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            avatarUrl: true,
            role: true,
          },
        },
        patientAuthor: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            avatarUrl: true,
          },
        },
      },
    });

    const messages = rows.reverse().map((m) => ({
      id: m.id,
      content: m.content,
      createdAt: m.createdAt,
      editedAt: m.editedAt,
      author: m.author
        ? {
            kind: 'user' as const,
            id: m.author.id,
            name: `${m.author.firstName} ${m.author.lastName}`.trim(),
            avatarUrl: m.author.avatarUrl,
            role: m.author.role,
          }
        : m.patientAuthor
          ? {
              kind: 'patient' as const,
              id: m.patientAuthor.id,
              name: `${m.patientAuthor.firstName} ${m.patientAuthor.lastName}`.trim(),
              avatarUrl: m.patientAuthor.avatarUrl,
              role: 'PATIENT',
            }
          : null,
      mine:
        (actor.kind === 'user' && m.authorId === actor.id) ||
        (actor.kind === 'patient' && m.patientAuthorId === actor.id),
    }));

    return { roomId, messages };
  }

  async sendMessage(actor: Actor, roomId: string, content: string) {
    const trimmed = content.trim();
    if (!trimmed) throw new ForbiddenException('Empty message');
    if (!(await this.isParticipant(actor, roomId))) {
      throw new ForbiddenException('Not a participant');
    }

    const room = await this.prisma.room.findUnique({
      where: { id: roomId },
      select: { id: true, name: true, type: true },
    });
    if (!room) throw new NotFoundException('Room not found');

    const threadId = await this.ensureThread(
      roomId,
      actor.kind === 'user' ? actor.id : await this.firstUserOf(roomId),
    );

    const message = await this.prisma.message.create({
      data: {
        threadId,
        authorId: actor.kind === 'user' ? actor.id : null,
        patientAuthorId: actor.kind === 'patient' ? actor.id : null,
        content: trimmed,
      },
      include: {
        author: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            avatarUrl: true,
            role: true,
          },
        },
        patientAuthor: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            avatarUrl: true,
          },
        },
      },
    });

    this.notifyParticipants(roomId, actor, room.type, trimmed).catch((e) =>
      this.logger.error('Chat notify failed', e as Error),
    );

    return {
      id: message.id,
      content: message.content,
      createdAt: message.createdAt,
      editedAt: message.editedAt,
      author: message.author
        ? {
            kind: 'user' as const,
            id: message.author.id,
            name: `${message.author.firstName} ${message.author.lastName}`.trim(),
            avatarUrl: message.author.avatarUrl,
            role: message.author.role,
          }
        : message.patientAuthor
          ? {
              kind: 'patient' as const,
              id: message.patientAuthor.id,
              name: `${message.patientAuthor.firstName} ${message.patientAuthor.lastName}`.trim(),
              avatarUrl: message.patientAuthor.avatarUrl,
              role: 'PATIENT',
            }
          : null,
      mine: true,
    };
  }

  private async firstUserOf(roomId: string): Promise<string> {
    const p = await this.prisma.roomParticipant.findFirst({
      where: { roomId, userId: { not: null } },
      select: { userId: true },
    });
    if (!p?.userId)
      throw new ForbiddenException('Room has no user participant');
    return p.userId;
  }

  private async notifyParticipants(
    roomId: string,
    sender: Actor,
    roomType: string,
    preview: string,
  ): Promise<void> {
    const participants = await this.prisma.roomParticipant.findMany({
      where: { roomId },
      select: { userId: true, patientId: true },
    });

    const senderName = await this.actorName(sender);
    const title =
      roomType === 'GROUP' ? `${senderName} (family chat)` : senderName;
    const body = preview.length > 120 ? `${preview.slice(0, 117)}…` : preview;
    const data = { type: 'CHAT_MESSAGE', roomId };

    const userIds = participants
      .map((p) => p.userId)
      .filter(
        (id): id is string =>
          !!id && !(sender.kind === 'user' && id === sender.id),
      );
    const patientIds = participants
      .map((p) => p.patientId)
      .filter(
        (id): id is string =>
          !!id && !(sender.kind === 'patient' && id === sender.id),
      );

    if (userIds.length) {
      await this.prisma.appNotification.createMany({
        data: userIds.map((uid) => ({
          userId: uid,
          title,
          body,
          type: 'CHAT_MESSAGE',
          metadata: { roomId },
        })),
      });
      await this.push.sendToUsers(userIds, title, body, data);
    }
    for (const pid of patientIds) {
      await this.push.sendToPatient(pid, title, body, data);
    }
  }

  private async actorName(actor: Actor): Promise<string> {
    if (actor.kind === 'user') {
      const u = await this.prisma.user.findUnique({
        where: { id: actor.id },
        select: { firstName: true, lastName: true },
      });
      return u ? `${u.firstName} ${u.lastName}`.trim() : 'Someone';
    }
    const p = await this.prisma.patient.findUnique({
      where: { id: actor.id },
      select: { firstName: true, lastName: true },
    });
    return p ? `${p.firstName} ${p.lastName}`.trim() : 'Patient';
  }
}
