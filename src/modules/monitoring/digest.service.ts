import { ForbiddenException, Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

export type DigestPeriod = 'DAILY' | 'WEEKLY';

export interface CareDigest {
  period: DigestPeriod;
  since: Date;
  patientName: string;
  reminders: { completed: number; active: number };
  medications: {
    expected: number;
    taken: number;
    missed: number;
    adherencePct: number;
  };
  checkIns: number;
  averageMood: number | null;
  wanderAlerts: number;
  sosAlerts: number;
  lastLocationAt: Date | null;
  summary: string;
}

@Injectable()
export class DigestService {
  constructor(private readonly prisma: PrismaService) {}

  private async ensureCaregiverAccess(caregiverId: string, patientId: string) {
    const link = await this.prisma.patientCaregiver.findUnique({
      where: { patientId_caregiverId: { patientId, caregiverId } },
    });
    if (!link) throw new ForbiddenException('No access to this patient');
  }

  async preview(
    caregiverId: string,
    patientId: string,
    period: DigestPeriod,
  ): Promise<CareDigest> {
    await this.ensureCaregiverAccess(caregiverId, patientId);
    return this.build(patientId, period);
  }

  async build(patientId: string, period: DigestPeriod): Promise<CareDigest> {
    const days = period === 'WEEKLY' ? 7 : 1;
    const since = new Date();
    since.setDate(since.getDate() - days);

    const [patient, activeReminders, remindersCompleted, meds, medLogs, checkIns, journal, wanderAlerts, sosAlerts, settings] =
      await Promise.all([
        this.prisma.patient.findUnique({
          where: { id: patientId },
          select: { firstName: true, lastName: true },
        }),
        this.prisma.reminder.count({ where: { patientId, isActive: true } }),
        this.prisma.reminder.count({
          where: { patientId, completedAt: { gte: since } },
        }),
        this.prisma.medication.findMany({
          where: { patientId, isActive: true },
          select: { times: true },
        }),
        this.prisma.medicationLog.count({
          where: { patientId, status: 'TAKEN', loggedAt: { gte: since } },
        }),
        this.prisma.checkIn.count({
          where: { patientId, createdAt: { gte: since } },
        }),
        this.prisma.journalEntry.findMany({
          where: { patientId, entryDate: { gte: since }, mood: { not: null } },
          select: { mood: true },
        }),
        this.prisma.appNotification.count({
          where: { patientId, type: 'WANDER_ALERT', createdAt: { gte: since } },
        }),
        this.prisma.appNotification.count({
          where: { patientId, type: 'SOS_ALERT', createdAt: { gte: since } },
        }),
        this.prisma.patientCareSettings.findUnique({
          where: { patientId },
          select: { lastLocationAt: true },
        }),
      ]);

    const expectedPerDay = meds.reduce((acc, m) => {
      const times = Array.isArray(m.times) ? (m.times as string[]).length : 0;
      return acc + (times || 1);
    }, 0);
    const expected = expectedPerDay * days;
    const adherencePct =
      expected > 0
        ? Math.min(100, Math.round((medLogs / expected) * 100))
        : 0;

    const moods = journal
      .map((j) => j.mood)
      .filter((m): m is number => typeof m === 'number');
    const averageMood = moods.length
      ? Math.round((moods.reduce((a, b) => a + b, 0) / moods.length) * 10) / 10
      : null;

    const patientName = patient
      ? `${patient.firstName} ${patient.lastName}`.trim()
      : 'Your loved one';

    const digest: CareDigest = {
      period,
      since,
      patientName,
      reminders: { completed: remindersCompleted, active: activeReminders },
      medications: {
        expected,
        taken: medLogs,
        missed: Math.max(0, expected - medLogs),
        adherencePct,
      },
      checkIns,
      averageMood,
      wanderAlerts,
      sosAlerts,
      lastLocationAt: settings?.lastLocationAt ?? null,
      summary: '',
    };
    digest.summary = this.summarize(digest);
    return digest;
  }

  private summarize(d: CareDigest): string {
    const parts: string[] = [];
    parts.push(`${d.reminders.completed} reminder(s) completed`);
    if (d.medications.expected > 0) {
      parts.push(`meds ${d.medications.adherencePct}% on track`);
    }
    if (d.checkIns > 0) parts.push(`${d.checkIns} check-in(s)`);
    if (d.averageMood !== null) parts.push(`avg mood ${d.averageMood}/5`);
    if (d.wanderAlerts > 0) parts.push(`${d.wanderAlerts} wander alert(s)`);
    if (d.sosAlerts > 0) parts.push(`${d.sosAlerts} SOS`);
    return parts.join(' · ');
  }
}
