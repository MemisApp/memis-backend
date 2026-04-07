import { Injectable, Logger } from '@nestjs/common';
import Expo, { ExpoPushMessage, ExpoPushTicket } from 'expo-server-sdk';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class PushService {
  private readonly expo = new Expo();
  private readonly logger = new Logger(PushService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Store or update the Expo push token for a specific patient device.
   */
  async registerToken(
    patientId: string,
    devicePublicId: string,
    token: string,
  ): Promise<void> {
    await this.prisma.device.updateMany({
      where: { patientId, devicePublicId },
      data: { expoPushToken: token },
    });
  }

  /**
   * Send a push notification to every registered device for a patient.
   * Silently removes invalid tokens from the database.
   */
  async sendToPatient(
    patientId: string,
    title: string,
    body: string,
    data?: Record<string, unknown>,
  ): Promise<void> {
    const devices = await this.prisma.device.findMany({
      where: { patientId, expoPushToken: { not: null } },
      select: { id: true, expoPushToken: true, devicePublicId: true },
    });

    if (!devices.length) {
      this.logger.debug(`No push tokens found for patient ${patientId}`);
      return;
    }

    const messages: ExpoPushMessage[] = [];
    const validDeviceIds: string[] = [];

    for (const device of devices) {
      const token = device.expoPushToken!;
      if (!Expo.isExpoPushToken(token)) {
        this.logger.warn(
          `Invalid push token for device ${String(device.devicePublicId)}: ${String(token)}`,
        );
        continue;
      }
      messages.push({
        to: token,
        title,
        body,
        data: data ?? {},
        sound: 'default',
      });
      validDeviceIds.push(device.id);
    }

    if (!messages.length) return;

    const chunks = this.expo.chunkPushNotifications(messages);
    const tickets: ExpoPushTicket[] = [];

    for (const chunk of chunks) {
      try {
        const chunkTickets = await this.expo.sendPushNotificationsAsync(chunk);
        tickets.push(...chunkTickets);
      } catch (err) {
        this.logger.error('Failed to send push notification chunk', err);
      }
    }

    // Remove tokens that are no longer valid (DeviceNotRegistered errors).
    for (let i = 0; i < tickets.length; i++) {
      const ticket = tickets[i];
      if (
        ticket.status === 'error' &&
        ticket.details?.error === 'DeviceNotRegistered'
      ) {
        const deviceId = validDeviceIds[i];
        if (deviceId) {
          this.logger.warn(
            `Clearing invalid push token for device ${deviceId}`,
          );
          await this.prisma.device.update({
            where: { id: deviceId },
            data: { expoPushToken: null },
          });
        }
      }
    }
  }
}
