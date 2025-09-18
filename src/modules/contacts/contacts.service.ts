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
    // Check if user has edit access to this patient
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
      },
      select: {
        id: true,
        relation: true,
        name: true,
        phone: true,
        photoUrl: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return contact;
  }

  async findByPatient(patientId: string, userId: string) {
    // Check if user has access to this patient
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
        createdAt: true,
        updatedAt: true,
      },
      orderBy: [{ name: 'asc' }],
    });

    return contacts;
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
        createdAt: true,
        updatedAt: true,
      },
    });

    if (!contact) {
      throw new NotFoundException('Contact not found');
    }

    // Check access to the patient
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

    // Check edit access to the patient
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
      },
      select: {
        id: true,
        relation: true,
        name: true,
        phone: true,
        photoUrl: true,
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

    // Check edit access to the patient
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
