import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { PushService } from '../../modules/clinical/push.service';

export interface CaregiverNotification {
  title: string;
  body: string;
  type: string;
  metadata?: Record<string, unknown>;
}

/**
 * Shared helper for fanning an event out to a patient's whole care circle:
 * it persists an in-app AppNotification for every linked caregiver AND sends a
 * push. Used by the safety, medication, cognitive and digest features so they
 * all behave consistently with the existing reminder/inactivity alerts.
 */
@Injectable()
export class NotifyService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly push: PushService,
  ) {}

  async getCaregiverIds(patientId: string): Promise<string[]> {
    const links = await this.prisma.patientCaregiver.findMany({
      where: { patientId },
      select: { caregiverId: true },
    });
    return links.map((l) => l.caregiverId);
  }

  /** Persist in-app notifications for every caregiver of a patient, then push. */
  async notifyCaregivers(
    patientId: string,
    n: CaregiverNotification,
  ): Promise<number> {
    const caregiverIds = await this.getCaregiverIds(patientId);
    if (!caregiverIds.length) return 0;

    await this.prisma.appNotification.createMany({
      data: caregiverIds.map((userId) => ({
        userId,
        patientId,
        title: n.title,
        body: n.body,
        type: n.type,
        metadata: (n.metadata ?? {}) as Prisma.InputJsonValue,
      })),
    });

    await this.push.sendToUsers(caregiverIds, n.title, n.body, {
      type: n.type,
      patientId,
      ...(n.metadata ?? {}),
    });

    return caregiverIds.length;
  }
}
