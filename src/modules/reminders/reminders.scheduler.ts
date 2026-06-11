import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron, CronExpression } from '@nestjs/schedule';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { PushService } from '../clinical/push.service';

const DAY_MS = 24 * 60 * 60 * 1000;
const INACTIVITY_THRESHOLD_MS = DAY_MS; // 24h with no completed reminder.

@Injectable()
export class RemindersScheduler {
  private readonly logger = new Logger(RemindersScheduler.name);
  private readonly timezone: string;
  private readonly serverPushReminders: boolean;

  constructor(
    private readonly prisma: PrismaService,
    private readonly push: PushService,
    config: ConfigService,
  ) {
    this.timezone = config.get<string>('APP_TIMEZONE') || 'Europe/Vilnius';
    this.serverPushReminders =
      config.get<string>('REMINDER_SERVER_PUSH') === 'true';
  }

  /** Calendar parts (in the configured timezone) for a given instant. */
  private zonedParts(date: Date): {
    hour: number;
    minute: number;
    weekday: number; // 0 = Sunday .. 6 = Saturday
    year: number;
    month: number; // 1-12
    day: number; // 1-31
    dateKey: string; // YYYY-MM-DD in the configured tz
  } {
    const fmt = new Intl.DateTimeFormat('en-US', {
      timeZone: this.timezone,
      hour12: false,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      weekday: 'short',
    });
    const parts = fmt.formatToParts(date);
    const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
    const weekdayMap: Record<string, number> = {
      Sun: 0,
      Mon: 1,
      Tue: 2,
      Wed: 3,
      Thu: 4,
      Fri: 5,
      Sat: 6,
    };
    let hour = parseInt(get('hour'), 10);
    if (hour === 24) hour = 0; // some ICU builds emit 24 for midnight
    const year = parseInt(get('year'), 10);
    const month = parseInt(get('month'), 10);
    const day = parseInt(get('day'), 10);
    return {
      hour,
      minute: parseInt(get('minute'), 10),
      weekday: weekdayMap[get('weekday')] ?? new Date(date).getDay(),
      year,
      month,
      day,
      dateKey: `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`,
    };
  }

  private scheduledMinutes(
    schedule?: string | null,
    fallback?: Date | null,
  ): number | null {
    if (schedule && /^\d{1,2}:\d{2}$/.test(schedule)) {
      const [h, m] = schedule.split(':').map(Number);
      if (h >= 0 && h <= 23 && m >= 0 && m <= 59) return h * 60 + m;
    }
    if (fallback) {
      const p = this.zonedParts(fallback);
      return p.hour * 60 + p.minute;
    }
    return null;
  }

  /** Whether a reminder is due on the given (zoned) day, by recurrence rule. */
  private isDueToday(
    reminder: { recurrence: string; scheduledDate: Date | null },
    now: ReturnType<typeof this.zonedParts>,
  ): boolean {
    const recurrence = (reminder.recurrence || 'DAILY').toUpperCase();
    const sd = reminder.scheduledDate
      ? this.zonedParts(reminder.scheduledDate)
      : null;

    switch (recurrence) {
      case 'ONCE':
        return !!sd && sd.dateKey === now.dateKey;
      case 'WEEKLY':
        return !!sd && sd.weekday === now.weekday;
      case 'MONTHLY':
        return !!sd && sd.day === now.day;
      case 'YEARLY':
        return !!sd && sd.month === now.month && sd.day === now.day;
      case 'DAILY':
      default:
        return true;
    }
  }

  /** True if `completedAt` falls on the same zoned calendar day as `now`. */
  private completedToday(
    completedAt: Date | null,
    now: { dateKey: string },
  ): boolean {
    if (!completedAt) return false;
    return this.zonedParts(completedAt).dateKey === now.dateKey;
  }

  /** True if `firedAt` already happened on the current zoned calendar day. */
  private firedToday(firedAt: Date | null, now: { dateKey: string }): boolean {
    if (!firedAt) return false;
    return this.zonedParts(firedAt).dateKey === now.dateKey;
  }

  @Cron(CronExpression.EVERY_MINUTE, { name: 'reminders-due' })
  async handleDueReminders(): Promise<void> {
    if (!this.serverPushReminders) return;

    const nowDate = new Date();
    const now = this.zonedParts(nowDate);
    const nowMinutes = now.hour * 60 + now.minute;

    const reminders = await this.prisma.reminder.findMany({
      where: { isActive: true },
      select: {
        id: true,
        patientId: true,
        title: true,
        notes: true,
        type: true,
        schedule: true,
        recurrence: true,
        scheduledDate: true,
        completedAt: true,
        lastFiredAt: true,
      },
    });

    let fired = 0;
    for (const r of reminders) {
      try {
        if (!this.isDueToday(r, now)) continue;

        const dueMinutes = this.scheduledMinutes(r.schedule, r.scheduledDate);
        if (dueMinutes === null) continue;

        // Only fire at/after the scheduled minute.
        if (nowMinutes < dueMinutes) continue;

        // Don't fire more than once per day, and never if already done today.
        if (this.firedToday(r.lastFiredAt, now)) continue;
        if (this.completedToday(r.completedAt, now)) continue;

        // For one-off reminders, never re-fire once fired.
        if ((r.recurrence || '').toUpperCase() === 'ONCE' && r.lastFiredAt)
          continue;

        await this.push.sendToPatient(
          r.patientId,
          r.title,
          r.notes || 'Time to do this now. Tap to mark as complete.',
          { type: 'REMINDER_DUE', reminderId: r.id, reminderType: r.type },
        );

        await this.prisma.reminder.update({
          where: { id: r.id },
          data: { lastFiredAt: nowDate },
        });
        fired++;
      } catch (err) {
        this.logger.error(`Failed to fire reminder ${r.id}`, err as Error);
      }
    }

    if (fired > 0) {
      this.logger.log(
        `[REMINDERS] Pushed ${fired} due reminder(s) at ${now.dateKey} ${now.hour}:${String(now.minute).padStart(2, '0')} (${this.timezone})`,
      );
    }
  }

  /**
   * Hourly watchdog: if a patient with active reminders hasn't completed ANY
   * reminder in the last 24h, push an urgent "please check on them" alert to
   * every linked caregiver (throttled to once per 24h per patient).
   */
  @Cron(CronExpression.EVERY_HOUR, { name: 'reminders-inactivity' })
  async handleInactivityWatchdog(): Promise<void> {
    const now = Date.now();
    const cutoff = new Date(now - INACTIVITY_THRESHOLD_MS);

    // Candidate patients: those that have at least one active reminder that has
    // existed for more than 24h (so freshly set-up patients don't trigger).
    const patients = await this.prisma.patient.findMany({
      where: {
        reminders: {
          some: { isActive: true, createdAt: { lte: cutoff } },
        },
      },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        lastInactivityAlertAt: true,
        reminders: {
          where: { isActive: true },
          select: { completedAt: true },
        },
      },
    });

    let alerted = 0;
    for (const patient of patients) {
      try {
        // Throttle: at most one alert per patient per 24h.
        if (
          patient.lastInactivityAlertAt &&
          now - patient.lastInactivityAlertAt.getTime() <
            INACTIVITY_THRESHOLD_MS
        ) {
          continue;
        }

        const lastCompletion = patient.reminders.reduce<number | null>(
          (latest, r) => {
            if (!r.completedAt) return latest;
            const t = r.completedAt.getTime();
            return latest === null || t > latest ? t : latest;
          },
          null,
        );

        const inactive =
          lastCompletion === null ||
          now - lastCompletion >= INACTIVITY_THRESHOLD_MS;
        if (!inactive) continue;

        const caregivers = await this.prisma.patientCaregiver.findMany({
          where: { patientId: patient.id },
          select: { caregiverId: true },
        });
        if (!caregivers.length) continue;

        const name = `${patient.firstName} ${patient.lastName}`.trim();
        const hours = lastCompletion
          ? Math.floor((now - lastCompletion) / (60 * 60 * 1000))
          : null;
        const title = 'Check on your loved one';
        const body = hours
          ? `${name} hasn't completed any reminders in ${hours} hours. Please check in on them.`
          : `${name} hasn't completed any reminders in over 24 hours. Please check in on them.`;
        const metadata = { patientId: patient.id, lastCompletion };

        // Persist in-app notifications for each caregiver.
        await this.prisma.appNotification.createMany({
          data: caregivers.map((c) => ({
            userId: c.caregiverId,
            patientId: patient.id,
            title,
            body,
            type: 'PATIENT_INACTIVITY_ALERT',
            metadata: metadata as Prisma.InputJsonValue,
          })),
        });

        // Push (FCM/Expo) to all caregivers.
        await this.push.sendToUsers(
          caregivers.map((c) => c.caregiverId),
          title,
          body,
          { type: 'PATIENT_INACTIVITY_ALERT', ...metadata },
        );

        await this.prisma.patient.update({
          where: { id: patient.id },
          data: { lastInactivityAlertAt: new Date() },
        });
        alerted++;
      } catch (err) {
        this.logger.error(
          `Inactivity check failed for patient ${patient.id}`,
          err as Error,
        );
      }
    }

    if (alerted > 0) {
      this.logger.log(
        `[INACTIVITY] Sent ${alerted} caregiver check-in alert(s)`,
      );
    }
  }
}
