import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../../prisma/prisma.service';
import { NotifyService } from '../../common/notify/notify.service';
import { PushService } from '../clinical/push.service';
import { isSameZonedDay, zonedParts } from '../../common/time.util';
import { CognitiveService } from './cognitive.service';
import { DigestService } from './digest.service';

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;
const SIX_DAYS_MS = 6 * 24 * 60 * 60 * 1000;
// Local hour at which daily/weekly digests are delivered.
const DIGEST_HOUR = 8;

@Injectable()
export class MonitoringScheduler {
  private readonly logger = new Logger(MonitoringScheduler.name);
  private readonly timezone: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly notify: NotifyService,
    private readonly push: PushService,
    private readonly cognitive: CognitiveService,
    private readonly digest: DigestService,
    config: ConfigService,
  ) {
    this.timezone = config.get<string>('APP_TIMEZONE') || 'Europe/Vilnius';
  }

  /**
   * Daily: for patients with cognitive monitoring enabled, flag a downward MMSE
   * trend to the care circle (once per new declining test) and nudge the patient
   * to take a fresh memory check if it's been over a month.
   */
  @Cron(CronExpression.EVERY_DAY_AT_9AM, { name: 'cognitive-monitoring' })
  async handleCognitiveMonitoring(): Promise<void> {
    const now = new Date();
    const patients = await this.prisma.patient.findMany({
      where: { careSettings: { cognitiveMonitoringEnabled: true } },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        careSettings: {
          select: { lastDeclineAlertAt: true, lastCognitivePromptAt: true },
        },
      },
    });

    let declineAlerts = 0;
    let prompts = 0;
    for (const patient of patients) {
      try {
        const s = patient.careSettings;
        const report = await this.cognitive.buildReport(patient.id);
        const name = `${patient.firstName} ${patient.lastName}`.trim();

        // Decline alert — only when a NEW declining test arrived since last alert.
        if (
          report.trend === 'declining' &&
          report.lastTestAt &&
          (!s?.lastDeclineAlertAt || s.lastDeclineAlertAt < report.lastTestAt)
        ) {
          await this.notify.notifyCaregivers(patient.id, {
            title: 'Possible cognitive decline',
            body: `${name}'s latest memory test dropped ${Math.abs(report.change ?? 0)} points (now ${report.latestScore}/30). Consider discussing with their doctor.`,
            type: 'COGNITIVE_DECLINE',
            metadata: {
              patientId: patient.id,
              latestScore: report.latestScore,
              change: report.change,
            },
          });
          await this.prisma.patientCareSettings.update({
            where: { patientId: patient.id },
            data: { lastDeclineAlertAt: now },
          });
          declineAlerts++;
        }

        // Monthly self-test prompt to the patient device.
        const staleTest =
          !report.lastTestAt ||
          now.getTime() - report.lastTestAt.getTime() > THIRTY_DAYS_MS;
        const promptThrottled =
          !!s?.lastCognitivePromptAt &&
          now.getTime() - s.lastCognitivePromptAt.getTime() < THIRTY_DAYS_MS;
        if (staleTest && !promptThrottled) {
          await this.push.sendToPatient(
            patient.id,
            'Time for a memory check',
            'A quick monthly memory check helps track your health. Tap to start.',
            { type: 'COGNITIVE_TEST_PROMPT', patientId: patient.id },
          );
          await this.prisma.patientCareSettings.upsert({
            where: { patientId: patient.id },
            create: { patientId: patient.id, lastCognitivePromptAt: now },
            update: { lastCognitivePromptAt: now },
          });
          prompts++;
        }
      } catch (err) {
        this.logger.error(
          `Cognitive monitoring failed for patient ${patient.id}`,
          err as Error,
        );
      }
    }

    if (declineAlerts || prompts) {
      this.logger.log(
        `[COGNITIVE] ${declineAlerts} decline alert(s), ${prompts} test prompt(s)`,
      );
    }
  }

  /**
   * Hourly: deliver daily/weekly care digests at the configured local hour to
   * every patient's care circle, throttled so each is sent at most once/period.
   */
  @Cron(CronExpression.EVERY_HOUR, { name: 'care-digest' })
  async handleDigests(): Promise<void> {
    const now = new Date();
    const nowParts = zonedParts(now, this.timezone);
    if (nowParts.hour !== DIGEST_HOUR) return;

    const patients = await this.prisma.patient.findMany({
      where: { careSettings: { digestFrequency: { in: ['DAILY', 'WEEKLY'] } } },
      select: {
        id: true,
        careSettings: {
          select: { digestFrequency: true, lastDigestAt: true },
        },
      },
    });

    let sent = 0;
    for (const patient of patients) {
      try {
        const s = patient.careSettings;
        if (!s) continue;
        const freq = s.digestFrequency as 'DAILY' | 'WEEKLY';

        if (freq === 'DAILY') {
          if (
            s.lastDigestAt &&
            isSameZonedDay(s.lastDigestAt, now, this.timezone)
          ) {
            continue;
          }
        } else {
          // Weekly digests go out on Mondays.
          if (nowParts.weekday !== 1) continue;
          if (
            s.lastDigestAt &&
            now.getTime() - s.lastDigestAt.getTime() < SIX_DAYS_MS
          ) {
            continue;
          }
        }

        const digest = await this.digest.build(patient.id, freq);
        const title =
          freq === 'WEEKLY'
            ? `Weekly update on ${digest.patientName}`
            : `Daily update on ${digest.patientName}`;
        await this.notify.notifyCaregivers(patient.id, {
          title,
          body: digest.summary || 'No activity recorded.',
          type: 'CARE_DIGEST',
          metadata: { patientId: patient.id, period: freq },
        });
        await this.prisma.patientCareSettings.update({
          where: { patientId: patient.id },
          data: { lastDigestAt: now },
        });
        sent++;
      } catch (err) {
        this.logger.error(
          `Digest failed for patient ${patient.id}`,
          err as Error,
        );
      }
    }

    if (sent > 0) this.logger.log(`[DIGEST] Sent ${sent} care digest(s)`);
  }
}
