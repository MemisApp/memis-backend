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
   * Store or update the Expo push token for a caregiver/doctor user.
   */
  async registerUserToken(userId: string, token: string): Promise<void> {
    await this.prisma.user.update({
      where: { id: userId },
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
        priority: 'high',
        channelId: this.resolveChannelId(data),
      });
      validDeviceIds.push(device.id);
    }

    if (!messages.length) return;

    const tickets = await this.dispatchMessages(messages);

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

  /**
   * Send a push notification to a single user (caregiver/doctor) by ID.
   */
  async sendToUser(
    userId: string,
    title: string,
    body: string,
    data?: Record<string, unknown>,
  ): Promise<void> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, expoPushToken: true },
    });
    if (!user?.expoPushToken) return;

    const token = user.expoPushToken;
    if (!Expo.isExpoPushToken(token)) {
      this.logger.warn(`Invalid user push token for ${userId}`);
      return;
    }

    const tickets = await this.dispatchMessages([
      {
        to: token,
        title,
        body,
        data: data ?? {},
        sound: 'default',
        priority: 'high',
        channelId: this.resolveChannelId(data),
      },
    ]);

    const ticket = tickets[0];
    if (
      ticket?.status === 'error' &&
      ticket.details?.error === 'DeviceNotRegistered'
    ) {
      this.logger.warn(`Clearing invalid push token for user ${userId}`);
      await this.prisma.user.update({
        where: { id: userId },
        data: { expoPushToken: null },
      });
    }
  }

  /**
   * Send a push notification to multiple users (caregivers/doctors).
   */
  async sendToUsers(
    userIds: string[],
    title: string,
    body: string,
    data?: Record<string, unknown>,
  ): Promise<void> {
    if (!userIds.length) return;
    const users = await this.prisma.user.findMany({
      where: { id: { in: userIds }, expoPushToken: { not: null } },
      select: { id: true, expoPushToken: true },
    });
    if (!users.length) return;

    const messages: ExpoPushMessage[] = [];
    const validUserIds: string[] = [];

    for (const user of users) {
      const token = user.expoPushToken!;
      if (!Expo.isExpoPushToken(token)) continue;
      messages.push({
        to: token,
        title,
        body,
        data: data ?? {},
        sound: 'default',
        priority: 'high',
        channelId: this.resolveChannelId(data),
      });
      validUserIds.push(user.id);
    }

    if (!messages.length) return;

    const tickets = await this.dispatchMessages(messages);
    for (let i = 0; i < tickets.length; i++) {
      const ticket = tickets[i];
      if (
        ticket.status === 'error' &&
        ticket.details?.error === 'DeviceNotRegistered'
      ) {
        const uid = validUserIds[i];
        if (uid) {
          await this.prisma.user.update({
            where: { id: uid },
            data: { expoPushToken: null },
          });
        }
      }
    }
  }

  private resolveChannelId(data?: Record<string, unknown>): string {
    const type = typeof data?.type === 'string' ? data.type : '';
    if (type.includes('REMINDER')) return 'reminders';
    if (type === 'CHAT_MESSAGE') return 'messages';
    if (type.includes('TEST') || type.includes('MMSE')) return 'tests';
    return 'default';
  }

  private async dispatchMessages(
    messages: ExpoPushMessage[],
  ): Promise<ExpoPushTicket[]> {
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
    return tickets;
  }
}
