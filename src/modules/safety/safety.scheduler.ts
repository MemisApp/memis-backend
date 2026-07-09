import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../../prisma/prisma.service';
import { NotifyService } from '../../common/notify/notify.service';
import { isSameZonedDay, zonedParts } from '../../common/time.util';

@Injectable()
export class SafetyScheduler {
  private readonly logger = new Logger(SafetyScheduler.name);
  private readonly timezone: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly notify: NotifyService,
    config: ConfigService,
  ) {
    this.timezone = config.get<string>('APP_TIMEZONE') || 'Europe/Vilnius';
  }

  /**
   * Hourly: escalate a missed daily check-in. If a patient has check-ins enabled
   * and the local hour is at/after their deadline but they haven't checked in
   * today, alert the care circle (throttled to once per day per patient).
   */
  @Cron(CronExpression.EVERY_HOUR, { name: 'safety-checkin-watchdog' })
  async handleMissedCheckIns(): Promise<void> {
    const now = new Date();
    const nowParts = zonedParts(now, this.timezone);

    const patients = await this.prisma.patient.findMany({
      where: { careSettings: { checkInEnabled: true } },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        careSettings: {
          select: {
            checkInByHour: true,
            lastCheckInAt: true,
            lastMissedCheckInAlertAt: true,
          },
        },
      },
    });

    let alerted = 0;
    for (const patient of patients) {
      try {
        const s = patient.careSettings;
        if (!s) continue;
        if (nowParts.hour < s.checkInByHour) continue;

        const checkedInToday =
          !!s.lastCheckInAt &&
          isSameZonedDay(s.lastCheckInAt, now, this.timezone);
        if (checkedInToday) continue;

        const alreadyAlertedToday =
          !!s.lastMissedCheckInAlertAt &&
          isSameZonedDay(s.lastMissedCheckInAlertAt, now, this.timezone);
        if (alreadyAlertedToday) continue;

        const name = `${patient.firstName} ${patient.lastName}`.trim();
        await this.notify.notifyCaregivers(patient.id, {
          title: 'Missed daily check-in',
          body: `${name} hasn't checked in today. Please make sure they're OK.`,
          type: 'CHECKIN_MISSED',
          metadata: { patientId: patient.id },
        });

        await this.prisma.patientCareSettings.update({
          where: { patientId: patient.id },
          data: { lastMissedCheckInAlertAt: now },
        });
        alerted++;
      } catch (err) {
        this.logger.error(
          `Check-in watchdog failed for patient ${patient.id}`,
          err as Error,
        );
      }
    }

    if (alerted > 0) {
      this.logger.log(`[CHECKIN] Sent ${alerted} missed check-in alert(s)`);
    }
  }
}
