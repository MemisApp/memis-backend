import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { UpsertJournalEntryDto } from './dto/upsert-journal-entry.dto';

@Injectable()
export class JournalService {
  constructor(private readonly prisma: PrismaService) {}

  private async ensureCaregiverAccess(caregiverId: string, patientId: string) {
    const link = await this.prisma.patientCaregiver.findUnique({
      where: { patientId_caregiverId: { patientId, caregiverId } },
    });
    if (!link) throw new ForbiddenException('No access to this patient');
  }

  private dayStart(iso?: string): Date {
    const d = iso ? new Date(iso) : new Date();
    const out = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
    return out;
  }

  async list(patientId: string, limit = 60) {
    return this.prisma.journalEntry.findMany({
      where: { patientId },
      orderBy: { entryDate: 'desc' },
      take: limit,
    });
  }

  async listForCaregiver(caregiverId: string, patientId: string) {
    await this.ensureCaregiverAccess(caregiverId, patientId);
    return this.list(patientId);
  }

  async upsert(patientId: string, authorId: string | null, dto: UpsertJournalEntryDto) {
    const entryDate = this.dayStart(dto.entryDate);

    // One entry per patient per day: update if it exists.
    const existing = await this.prisma.journalEntry.findFirst({
      where: { patientId, entryDate },
    });

    const data = {
      authorId,
      mood: dto.mood ?? null,
      sleepHours: dto.sleepHours ?? null,
      symptoms: (dto.symptoms ?? undefined) as Prisma.InputJsonValue | undefined,
      note: dto.note ?? null,
    };

    if (existing) {
      return this.prisma.journalEntry.update({
        where: { id: existing.id },
        data,
      });
    }
    return this.prisma.journalEntry.create({
      data: { patientId, entryDate, ...data },
    });
  }

  async createForCaregiver(
    caregiverId: string,
    patientId: string,
    dto: UpsertJournalEntryDto,
  ) {
    await this.ensureCaregiverAccess(caregiverId, patientId);
    return this.upsert(patientId, caregiverId, dto);
  }

  async remove(patientId: string, entryId: string) {
    const entry = await this.prisma.journalEntry.findUnique({ where: { id: entryId } });
    if (!entry || entry.patientId !== patientId) {
      throw new NotFoundException('Journal entry not found');
    }
    await this.prisma.journalEntry.delete({ where: { id: entryId } });
    return { success: true };
  }

  async removeForCaregiver(caregiverId: string, patientId: string, entryId: string) {
    await this.ensureCaregiverAccess(caregiverId, patientId);
    return this.remove(patientId, entryId);
  }
}
