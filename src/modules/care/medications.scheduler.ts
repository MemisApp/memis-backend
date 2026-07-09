import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../../prisma/prisma.service';
import { NotifyService } from '../../common/notify/notify.service';
import { isSameZonedDay, zonedParts } from '../../common/time.util';

// Wait this long after a scheduled dose time before counting it as missed.
const DOSE_GRACE_MINUTES = 60;
// Re-alert about the same low medication stock at most weekly.
const REFILL_ALERT_THROTTLE_MS = 7 * 24 * 60 * 60 * 1000;

@Injectable()
export class MedicationsScheduler {
  private readonly logger = new Logger(MedicationsScheduler.name);
  private readonly timezone: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly notify: NotifyService,
    config: ConfigService,
  ) {
    this.timezone = config.get<string>('APP_TIMEZONE') || 'Europe/Vilnius';
  }

  private parseTimes(times: unknown): number[] {
    if (!Array.isArray(times)) return [];
    const out: number[] = [];
    for (const t of times) {
      if (typeof t === 'string' && /^\d{1,2}:\d{2}$/.test(t)) {
        const [h, m] = t.split(':').map(Number);
        if (h >= 0 && h <= 23 && m >= 0 && m <= 59) out.push(h * 60 + m);
      }
    }
    return out;
  }

  /**
   * Every 30 min: escalate missed medication doses to the care circle and warn
   * about low stock. Missed = a scheduled dose whose time (plus a grace period)
   * has passed today with no TAKEN/SKIPPED log, throttled to one alert/day.
   */
  @Cron(CronExpression.EVERY_30_MINUTES, { name: 'medications-adherence' })
  async handleAdherence(): Promise<void> {
    const now = new Date();
    const nowParts = zonedParts(now, this.timezone);
    const nowMinutes = nowParts.hour * 60 + nowParts.minute;

    const dayStart = new Date();
    dayStart.setHours(0, 0, 0, 0);

    const patients = await this.prisma.patient.findMany({
      where: { medications: { some: { isActive: true } } },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        careSettings: { select: { lastMissedMedAlertAt: true } },
        medications: {
          where: { isActive: true },
          select: {
            id: true,
            name: true,
            times: true,
            quantity: true,
            refillThreshold: true,
            lastRefillAlertAt: true,
          },
        },
      },
    });

    let missedAlerts = 0;
    let refillAlerts = 0;

    for (const patient of patients) {
      try {
        // ---- Missed-dose escalation ----
        let dueByNow = 0;
        for (const med of patient.medications) {
          const times = this.parseTimes(med.times);
          dueByNow += times.filter(
            (t) => t + DOSE_GRACE_MINUTES <= nowMinutes,
          ).length;
        }

        if (dueByNow > 0) {
          const logs = await this.prisma.medicationLog.count({
            where: {
              patientId: patient.id,
              loggedAt: { gte: dayStart },
              status: { in: ['TAKEN', 'SKIPPED'] },
            },
          });
          const missed = dueByNow - logs;
          const alertedToday =
            !!patient.careSettings?.lastMissedMedAlertAt &&
            isSameZonedDay(
              patient.careSettings.lastMissedMedAlertAt,
              now,
              this.timezone,
            );

          if (missed > 0 && !alertedToday) {
            const name = `${patient.firstName} ${patient.lastName}`.trim();
            await this.notify.notifyCaregivers(patient.id, {
              title: 'Medication not logged',
              body: `${name} has ${missed} medication dose(s) not marked as taken today. Please check in.`,
              type: 'MEDICATION_MISSED',
              metadata: { patientId: patient.id, missed },
            });
            await this.prisma.patientCareSettings.upsert({
              where: { patientId: patient.id },
              create: { patientId: patient.id, lastMissedMedAlertAt: now },
              update: { lastMissedMedAlertAt: now },
            });
            missedAlerts++;
          }
        }

        // ---- Low-stock refill alerts (per medication) ----
        for (const med of patient.medications) {
          const low =
            typeof med.quantity === 'number' &&
            typeof med.refillThreshold === 'number' &&
            med.quantity <= med.refillThreshold;
          if (!low) continue;
          const throttled =
            !!med.lastRefillAlertAt &&
            now.getTime() - med.lastRefillAlertAt.getTime() <
              REFILL_ALERT_THROTTLE_MS;
          if (throttled) continue;

          const name = `${patient.firstName} ${patient.lastName}`.trim();
          await this.notify.notifyCaregivers(patient.id, {
            title: 'Medication running low',
            body: `${name}'s ${med.name} is running low (${med.quantity} left). Time to refill.`,
            type: 'MEDICATION_REFILL',
            metadata: { patientId: patient.id, medicationId: med.id },
          });
          await this.prisma.medication.update({
            where: { id: med.id },
            data: { lastRefillAlertAt: now },
          });
          refillAlerts++;
        }
      } catch (err) {
        this.logger.error(
          `Adherence check failed for patient ${patient.id}`,
          err as Error,
        );
      }
    }

    if (missedAlerts || refillAlerts) {
      this.logger.log(
        `[MEDS] ${missedAlerts} missed-dose alert(s), ${refillAlerts} refill alert(s)`,
      );
    }
  }
}
