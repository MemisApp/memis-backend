import { ForbiddenException, Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

export interface ActivityItem {
  id: string;
  type: string;
  title: string;
  subtitle?: string;
  patientId: string;
  patientName: string;
  at: Date;
}

@Injectable()
export class ActivityService {
  constructor(private readonly prisma: PrismaService) {}

  async getForCaregiver(
    caregiverId: string,
    opts: { patientId?: string; limit?: number } = {},
  ): Promise<ActivityItem[]> {
    const limit = Math.min(Math.max(opts.limit ?? 30, 1), 100);

    const links = await this.prisma.patientCaregiver.findMany({
      where: {
        caregiverId,
        ...(opts.patientId ? { patientId: opts.patientId } : {}),
      },
      select: {
        patientId: true,
        patient: { select: { firstName: true, lastName: true } },
      },
    });

    if (opts.patientId && links.length === 0) {
      throw new ForbiddenException('No access to this patient');
    }
    if (links.length === 0) return [];

    const patientIds = links.map((l) => l.patientId);
    const nameById = new Map<string, string>(
      links.map((l) => [
        l.patientId,
        `${l.patient.firstName} ${l.patient.lastName}`.trim(),
      ]),
    );
    const nameOf = (id: string) => nameById.get(id) ?? 'Patient';

    const [
      clockTests,
      mmseTests,
      medLogs,
      journal,
      checkIns,
      reminders,
      alerts,
    ] = await Promise.all([
      this.prisma.clockTest.findMany({
        where: { patientId: { in: patientIds } },
        select: { id: true, patientId: true, createdAt: true, metadata: true },
        orderBy: { createdAt: 'desc' },
        take: limit,
      }),
      this.prisma.mMSETest.findMany({
        where: { patientId: { in: patientIds } },
        select: { id: true, patientId: true, createdAt: true, score: true },
        orderBy: { createdAt: 'desc' },
        take: limit,
      }),
      this.prisma.medicationLog.findMany({
        where: { patientId: { in: patientIds } },
        select: {
          id: true,
          patientId: true,
          status: true,
          loggedAt: true,
          medication: { select: { name: true } },
        },
        orderBy: { loggedAt: 'desc' },
        take: limit,
      }),
      this.prisma.journalEntry.findMany({
        where: { patientId: { in: patientIds } },
        select: {
          id: true,
          patientId: true,
          createdAt: true,
          mood: true,
          note: true,
          authorId: true,
        },
        orderBy: { createdAt: 'desc' },
        take: limit,
      }),
      this.prisma.checkIn.findMany({
        where: { patientId: { in: patientIds } },
        select: { id: true, patientId: true, status: true, createdAt: true },
        orderBy: { createdAt: 'desc' },
        take: limit,
      }),
      this.prisma.reminder.findMany({
        where: {
          patientId: { in: patientIds },
          completed: true,
          completedAt: { not: null },
        },
        select: {
          id: true,
          patientId: true,
          title: true,
          type: true,
          completedAt: true,
        },
        orderBy: { completedAt: 'desc' },
        take: limit,
      }),
      this.prisma.appNotification.findMany({
        where: {
          patientId: { in: patientIds },
          type: { in: ['WANDER_ALERT', 'SOS_ALERT'] },
        },
        select: {
          id: true,
          patientId: true,
          type: true,
          body: true,
          createdAt: true,
        },
        orderBy: { createdAt: 'desc' },
        take: limit,
      }),
    ]);

    const items: ActivityItem[] = [];

    for (const t of clockTests) {
      const meta =
        t.metadata && typeof t.metadata === 'object'
          ? (t.metadata as Record<string, unknown>)
          : {};
      const analysis =
        meta.aiAnalysis && typeof meta.aiAnalysis === 'object'
          ? (meta.aiAnalysis as Record<string, unknown>)
          : null;
      const score =
        analysis && typeof analysis.score === 'number' ? analysis.score : null;
      items.push({
        id: `clock:${t.id}`,
        type: 'CLOCK_TEST',
        title: 'Clock drawing test',
        subtitle: score !== null ? `AI score ${score}/5` : 'Completed',
        patientId: t.patientId,
        patientName: nameOf(t.patientId),
        at: t.createdAt,
      });
    }

    for (const m of mmseTests) {
      items.push({
        id: `mmse:${m.id}`,
        type: 'MMSE_TEST',
        title: 'MMSE test',
        subtitle: `Score ${m.score}/30`,
        patientId: m.patientId,
        patientName: nameOf(m.patientId),
        at: m.createdAt,
      });
    }

    for (const log of medLogs) {
      const name = log.medication?.name ?? 'medication';
      const verb =
        log.status === 'TAKEN'
          ? 'Took'
          : log.status === 'SKIPPED'
            ? 'Skipped'
            : 'Missed';
      items.push({
        id: `med:${log.id}`,
        type: 'MEDICATION_LOG',
        title: `${verb} ${name}`,
        subtitle: undefined,
        patientId: log.patientId,
        patientName: nameOf(log.patientId),
        at: log.loggedAt,
      });
    }

    for (const j of journal) {
      const by = j.authorId ? 'Caregiver' : 'Patient';
      const snippet = j.note ? j.note.slice(0, 80) : undefined;
      items.push({
        id: `journal:${j.id}`,
        type: 'JOURNAL',
        title: `Journal entry (${by})`,
        subtitle: snippet ?? (j.mood != null ? `Mood ${j.mood}/5` : undefined),
        patientId: j.patientId,
        patientName: nameOf(j.patientId),
        at: j.createdAt,
      });
    }

    for (const c of checkIns) {
      items.push({
        id: `checkin:${c.id}`,
        type: 'CHECK_IN',
        title: 'Daily check-in',
        subtitle: c.status === 'OK' ? "I'm OK" : c.status,
        patientId: c.patientId,
        patientName: nameOf(c.patientId),
        at: c.createdAt,
      });
    }

    for (const r of reminders) {
      items.push({
        id: `reminder:${r.id}`,
        type: 'REMINDER_COMPLETED',
        title: `Completed: ${r.title}`,
        subtitle: undefined,
        patientId: r.patientId,
        patientName: nameOf(r.patientId),
        at: r.completedAt as Date,
      });
    }

    for (const a of alerts) {
      items.push({
        id: `alert:${a.id}`,
        type: a.type,
        title: a.type === 'SOS_ALERT' ? 'SOS pressed' : 'Left safe zone',
        subtitle: a.body,
        patientId: a.patientId as string,
        patientName: nameOf(a.patientId as string),
        at: a.createdAt,
      });
    }

    items.sort((x, y) => y.at.getTime() - x.at.getTime());
    return items.slice(0, limit);
  }
}
