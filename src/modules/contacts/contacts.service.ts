import {
  Injectable,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateContactDto } from './dto/create-contact.dto';
import { UpdateContactDto } from './dto/update-contact.dto';
import { CaregiverRole } from '@prisma/client';

@Injectable()
export class ContactsService {
  constructor(private prisma: PrismaService) {}

  async create(patientId: string, userId: string, dto: CreateContactDto) {
    const hasEditAccess = await this.hasPatientEditAccess(userId, patientId);
    if (!hasEditAccess) {
      throw new ForbiddenException(
        'Insufficient permissions to create contacts for this patient',
      );
    }

    const contact = await this.prisma.contact.create({
      data: {
        patientId,
        relation: dto.relation,
        name: dto.name,
        phone: dto.phone,
        photoUrl: dto.photoUrl,
        description: dto.description,
        isEmergencyContact: dto.isEmergencyContact ?? false,
      },
      select: {
        id: true,
        relation: true,
        name: true,
        phone: true,
        photoUrl: true,
        description: true,
        isEmergencyContact: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return contact;
  }

  async findByPatient(patientId: string, userId: string) {
    const hasAccess = await this.hasPatientAccess(userId, patientId);
    if (!hasAccess) {
      throw new ForbiddenException('No access to this patient');
    }

    const contacts = await this.prisma.contact.findMany({
      where: { patientId },
      select: {
        id: true,
        relation: true,
        name: true,
        phone: true,
        photoUrl: true,
        description: true,
        isEmergencyContact: true,
        createdAt: true,
        updatedAt: true,
      },
      orderBy: [{ name: 'asc' }],
    });

    return contacts;
  }

  /**
   * Care-circle members (invited caregivers/viewers) for a patient, shaped so
   * the patient app can list them alongside phonebook contacts. These are User
   * accounts — not editable Contact records — so they're returned read-only.
   */
  async findCareTeam(patientId: string, userId: string) {
    const hasAccess = await this.hasPatientAccess(userId, patientId);
    if (!hasAccess) {
      throw new ForbiddenException('No access to this patient');
    }

    const links = await this.prisma.patientCaregiver.findMany({
      where: { patientId },
      select: {
        role: true,
        caregiver: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            phone: true,
            avatarUrl: true,
          },
        },
      },
    });

    const rolePriority: Record<string, number> = {
      OWNER: 0,
      EDITOR: 1,
      VIEWER: 2,
    };

    return links
      .map((l) => ({
        id: l.caregiver.id,
        firstName: l.caregiver.firstName,
        lastName: l.caregiver.lastName,
        email: l.caregiver.email,
        phone: l.caregiver.phone,
        avatarUrl: l.caregiver.avatarUrl,
        role: l.role,
      }))
      .sort((a, b) => {
        const pr = (rolePriority[a.role] ?? 9) - (rolePriority[b.role] ?? 9);
        if (pr !== 0) return pr;
        return `${a.firstName} ${a.lastName}`.localeCompare(
          `${b.firstName} ${b.lastName}`,
        );
      });
  }

  async findOne(contactId: string, userId: string) {
    const contact = await this.prisma.contact.findUnique({
      where: { id: contactId },
      select: {
        id: true,
        patientId: true,
        relation: true,
        name: true,
        phone: true,
        photoUrl: true,
        description: true,
        isEmergencyContact: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    if (!contact) {
      throw new NotFoundException('Contact not found');
    }

    const hasAccess = await this.hasPatientAccess(userId, contact.patientId);
    if (!hasAccess) {
      throw new ForbiddenException('No access to this contact');
    }

    return contact;
  }

  async update(contactId: string, userId: string, dto: UpdateContactDto) {
    const contact = await this.prisma.contact.findUnique({
      where: { id: contactId },
      select: { id: true, patientId: true },
    });

    if (!contact) {
      throw new NotFoundException('Contact not found');
    }

    const hasEditAccess = await this.hasPatientEditAccess(
      userId,
      contact.patientId,
    );
    if (!hasEditAccess) {
      throw new ForbiddenException(
        'Insufficient permissions to edit this contact',
      );
    }

    const updatedContact = await this.prisma.contact.update({
      where: { id: contactId },
      data: {
        ...(dto.relation && { relation: dto.relation }),
        ...(dto.name && { name: dto.name }),
        ...(dto.phone && { phone: dto.phone }),
        ...(dto.photoUrl !== undefined && { photoUrl: dto.photoUrl }),
        ...(dto.description !== undefined && { description: dto.description }),
        ...(dto.isEmergencyContact !== undefined && {
          isEmergencyContact: dto.isEmergencyContact,
        }),
      },
      select: {
        id: true,
        relation: true,
        name: true,
        phone: true,
        photoUrl: true,
        description: true,
        isEmergencyContact: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return updatedContact;
  }

  async remove(contactId: string, userId: string) {
    const contact = await this.prisma.contact.findUnique({
      where: { id: contactId },
      select: { id: true, patientId: true },
    });

    if (!contact) {
      throw new NotFoundException('Contact not found');
    }

    const hasEditAccess = await this.hasPatientEditAccess(
      userId,
      contact.patientId,
    );
    if (!hasEditAccess) {
      throw new ForbiddenException(
        'Insufficient permissions to delete this contact',
      );
    }

    await this.prisma.contact.delete({
      where: { id: contactId },
    });

    return { success: true };
  }

  private async hasPatientAccess(
    userId: string,
    patientId: string,
  ): Promise<boolean> {
    if (userId === patientId) {
      return true;
    }
    const relation = await this.prisma.patientCaregiver.findUnique({
      where: {
        patientId_caregiverId: {
          patientId,
          caregiverId: userId,
        },
      },
    });

    return !!relation;
  }

  private async hasPatientEditAccess(
    userId: string,
    patientId: string,
  ): Promise<boolean> {
    const relation = await this.prisma.patientCaregiver.findUnique({
      where: {
        patientId_caregiverId: {
          patientId,
          caregiverId: userId,
        },
      },
    });

    return (
      !!relation &&
      (relation.role === CaregiverRole.OWNER ||
        relation.role === CaregiverRole.EDITOR)
    );
  }
}
