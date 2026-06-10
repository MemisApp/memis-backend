import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { MedicationLogStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateMedicationDto } from './dto/create-medication.dto';
import { UpdateMedicationDto } from './dto/update-medication.dto';
import { LogMedicationDto } from './dto/log-medication.dto';

@Injectable()
export class MedicationsService {
  constructor(private readonly prisma: PrismaService) {}

  /** Caregivers must be linked to the patient; patients access their own data. */
  private async ensureCaregiverAccess(caregiverId: string, patientId: string) {
    const link = await this.prisma.patientCaregiver.findUnique({
      where: { patientId_caregiverId: { patientId, caregiverId } },
    });
    if (!link) throw new ForbiddenException('No access to this patient');
  }

  async listForPatient(patientId: string) {
    return this.prisma.medication.findMany({
      where: { patientId },
      orderBy: [{ isActive: 'desc' }, { createdAt: 'desc' }],
    });
  }

  async listForCaregiver(caregiverId: string, patientId: string) {
    await this.ensureCaregiverAccess(caregiverId, patientId);
    return this.listForPatient(patientId);
  }

  async create(caregiverId: string, patientId: string, dto: CreateMedicationDto) {
    await this.ensureCaregiverAccess(caregiverId, patientId);
    return this.prisma.medication.create({
      data: {
        patientId,
        name: dto.name,
        dosage: dto.dosage,
        frequency: dto.frequency,
        times: (dto.times ?? undefined) as Prisma.InputJsonValue | undefined,
        quantity: dto.quantity,
        refillThreshold: dto.refillThreshold,
        prescriber: dto.prescriber,
        notes: dto.notes,
      },
    });
  }

  async update(
    caregiverId: string,
    patientId: string,
    medicationId: string,
    dto: UpdateMedicationDto,
  ) {
    await this.ensureCaregiverAccess(caregiverId, patientId);
    const med = await this.prisma.medication.findUnique({ where: { id: medicationId } });
    if (!med || med.patientId !== patientId) {
      throw new NotFoundException('Medication not found');
    }
    return this.prisma.medication.update({
      where: { id: medicationId },
      data: {
        name: dto.name ?? undefined,
        dosage: dto.dosage ?? undefined,
        frequency: dto.frequency ?? undefined,
        times: (dto.times ?? undefined) as Prisma.InputJsonValue | undefined,
        quantity: dto.quantity ?? undefined,
        refillThreshold: dto.refillThreshold ?? undefined,
        prescriber: dto.prescriber ?? undefined,
        notes: dto.notes ?? undefined,
        isActive: dto.isActive ?? undefined,
      },
    });
  }

  async remove(caregiverId: string, patientId: string, medicationId: string) {
    await this.ensureCaregiverAccess(caregiverId, patientId);
    const med = await this.prisma.medication.findUnique({ where: { id: medicationId } });
    if (!med || med.patientId !== patientId) {
      throw new NotFoundException('Medication not found');
    }
    await this.prisma.medication.delete({ where: { id: medicationId } });
    return { success: true };
  }

  /** Records an intake (used by the patient device or caregiver). */
  async log(patientId: string, dto: LogMedicationDto) {
    const med = await this.prisma.medication.findUnique({
      where: { id: dto.medicationId },
    });
    if (!med || med.patientId !== patientId) {
      throw new NotFoundException('Medication not found');
    }

    const log = await this.prisma.medicationLog.create({
      data: {
        medicationId: dto.medicationId,
        patientId,
        status: (dto.status as MedicationLogStatus) || MedicationLogStatus.TAKEN,
        scheduledFor: dto.scheduledFor ? new Date(dto.scheduledFor) : null,
      },
    });

    // Decrement remaining quantity on a taken dose so refill tracking works.
    if (log.status === MedicationLogStatus.TAKEN && typeof med.quantity === 'number') {
      await this.prisma.medication.update({
        where: { id: med.id },
        data: { quantity: Math.max(0, med.quantity - 1) },
      });
    }

    return log;
  }

  /** Today's doses derived from each medication's configured times. */
  async getToday(patientId: string) {
    const meds = await this.prisma.medication.findMany({
      where: { patientId, isActive: true },
    });

    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const logs = await this.prisma.medicationLog.findMany({
      where: { patientId, loggedAt: { gte: start } },
    });

    return meds.map((m) => {
      const times = Array.isArray(m.times) ? (m.times as string[]) : [];
      const takenToday = logs.filter(
        (l) => l.medicationId === m.id && l.status === 'TAKEN',
      ).length;
      return {
        id: m.id,
        name: m.name,
        dosage: m.dosage,
        frequency: m.frequency,
        times,
        quantity: m.quantity,
        refillThreshold: m.refillThreshold,
        needsRefill:
          typeof m.quantity === 'number' &&
          typeof m.refillThreshold === 'number' &&
          m.quantity <= m.refillThreshold,
        dosesPerDay: times.length || 1,
        takenToday,
      };
    });
  }

  /** Adherence report over the last `days` (default 7) for caregivers. */
  async getAdherence(caregiverId: string, patientId: string, days = 7) {
    await this.ensureCaregiverAccess(caregiverId, patientId);

    const since = new Date();
    since.setHours(0, 0, 0, 0);
    since.setDate(since.getDate() - (days - 1));

    const [meds, logs] = await Promise.all([
      this.prisma.medication.findMany({ where: { patientId, isActive: true } }),
      this.prisma.medicationLog.findMany({
        where: { patientId, loggedAt: { gte: since } },
      }),
    ]);

    const expectedPerDay = meds.reduce((acc, m) => {
      const times = Array.isArray(m.times) ? (m.times as string[]).length : 0;
      return acc + (times || 1);
    }, 0);
    const expectedTotal = expectedPerDay * days;
    const takenTotal = logs.filter((l) => l.status === 'TAKEN').length;
    const adherencePct =
      expectedTotal > 0 ? Math.min(100, Math.round((takenTotal / expectedTotal) * 100)) : 0;

    return {
      days,
      expectedTotal,
      takenTotal,
      missedTotal: Math.max(0, expectedTotal - takenTotal),
      adherencePct,
      activeMedications: meds.length,
      refillsNeeded: meds.filter(
        (m) =>
          typeof m.quantity === 'number' &&
          typeof m.refillThreshold === 'number' &&
          m.quantity <= m.refillThreshold,
      ).length,
    };
  }
}
