import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { CaregiverRole, Role } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { CreatePatientDto } from './dto/create-patient.dto';
import { UpdatePatientDto } from './dto/update-patient.dto';

@Injectable()
export class PatientsService {
  constructor(private prisma: PrismaService) {}

  async create(caregiverId: string, dto: CreatePatientDto) {
    // Create patient and automatically assign caregiver as OWNER
    const patient = await this.prisma.patient.create({
      data: {
        firstName: dto.firstName,
        lastName: dto.lastName,
        birthDate: dto.birthDate ? new Date(dto.birthDate) : null,
        avatarUrl: dto.avatarUrl,
        shortIntro: dto.shortIntro,
        maritalDate: dto.maritalDate ? new Date(dto.maritalDate) : null,
        caregivers: {
          create: {
            caregiverId,
            role: CaregiverRole.OWNER,
          },
        },
      },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        birthDate: true,
        avatarUrl: true,
        shortIntro: true,
        maritalDate: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    // Generate initial pairing code
    const pairingCode = await this.generatePairingCode(patient.id, caregiverId);

    return {
      patient,
      pairingCode,
    };
  }

  async findByCaregiver(caregiverId: string) {
    const patientRelations = await this.prisma.patientCaregiver.findMany({
      where: { caregiverId },
      include: {
        patient: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            birthDate: true,
            avatarUrl: true,
            shortIntro: true,
            maritalDate: true,
            createdAt: true,
            updatedAt: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return patientRelations.map((relation) => ({
      ...relation.patient,
      caregiverRole: relation.role,
      assignedAt: relation.createdAt,
    }));
  }

  async findOne(patientId: string, userId: string) {
    // Check if user has access to this patient
    const hasAccess = await this.hasPatientAccess(userId, patientId);
    if (!hasAccess) {
      throw new ForbiddenException('No access to this patient');
    }

    const patient = await this.prisma.patient.findUnique({
      where: { id: patientId },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        birthDate: true,
        avatarUrl: true,
        shortIntro: true,
        maritalDate: true,
        createdAt: true,
        updatedAt: true,
        caregivers: {
          include: {
            caregiver: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                email: true,
              },
            },
          },
        },
      },
    });

    if (!patient) {
      throw new NotFoundException('Patient not found');
    }

    return patient;
  }

  async update(patientId: string, userId: string, dto: UpdatePatientDto) {
    // Check if user has OWNER or EDITOR access
    const hasEditAccess = await this.hasPatientEditAccess(userId, patientId);
    if (!hasEditAccess) {
      throw new ForbiddenException('Insufficient permissions to edit patient');
    }

    const patient = await this.prisma.patient.update({
      where: { id: patientId },
      data: {
        ...(dto.firstName && { firstName: dto.firstName }),
        ...(dto.lastName && { lastName: dto.lastName }),
        ...(dto.birthDate !== undefined && {
          birthDate: dto.birthDate ? new Date(dto.birthDate) : null,
        }),
        ...(dto.avatarUrl !== undefined && { avatarUrl: dto.avatarUrl }),
        ...(dto.shortIntro !== undefined && { shortIntro: dto.shortIntro }),
        ...(dto.maritalDate !== undefined && {
          maritalDate: dto.maritalDate ? new Date(dto.maritalDate) : null,
        }),
      },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        birthDate: true,
        avatarUrl: true,
        shortIntro: true,
        maritalDate: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return patient;
  }

  async remove(patientId: string, userId: string, userRole: string) {
    // Only OWNER caregivers or ADMINs can delete patients
    const isAdmin = userRole === Role.ADMIN;
    const isOwner = await this.isPatientOwner(userId, patientId);

    if (!isAdmin && !isOwner) {
      throw new ForbiddenException(
        'Only patient owners or admins can delete patients',
      );
    }

    await this.prisma.patient.delete({
      where: { id: patientId },
    });

    return { success: true };
  }

  async generatePairingCode(patientId: string, caregiverId: string) {
    // Check access
    const hasAccess = await this.hasPatientAccess(caregiverId, patientId);
    if (!hasAccess) {
      throw new ForbiddenException('No access to this patient');
    }

    // Generate 8-character code
    const code = this.generateRandomCode();
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + 24); // 24 hours expiry

    const pairingCode = await this.prisma.pairingCode.create({
      data: {
        patientId,
        code,
        expiresAt,
        createdBy: caregiverId,
      },
      select: {
        id: true,
        code: true,
        expiresAt: true,
        createdAt: true,
      },
    });

    return pairingCode;
  }

  async getPairingCodes(patientId: string, userId: string) {
    const hasAccess = await this.hasPatientAccess(userId, patientId);
    if (!hasAccess) {
      throw new ForbiddenException('No access to this patient');
    }

    const codes = await this.prisma.pairingCode.findMany({
      where: {
        patientId,
        usedAt: null,
        expiresAt: { gt: new Date() },
      },
      select: {
        id: true,
        code: true,
        expiresAt: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    return codes;
  }

  async revokePairingCode(codeId: string, userId: string) {
    const pairingCode = await this.prisma.pairingCode.findUnique({
      where: { id: codeId },
      include: { patient: true },
    });

    if (!pairingCode) {
      throw new NotFoundException('Pairing code not found');
    }

    const hasAccess = await this.hasPatientAccess(
      userId,
      pairingCode.patientId,
    );
    if (!hasAccess) {
      throw new ForbiddenException('No access to this pairing code');
    }

    await this.prisma.pairingCode.delete({
      where: { id: codeId },
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

  private async isPatientOwner(
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

    return relation?.role === CaregiverRole.OWNER;
  }

  private generateRandomCode(): string {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let result = '';
    for (let i = 0; i < 8; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
  }
}
