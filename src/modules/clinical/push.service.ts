import { Injectable, Logger } from '@nestjs/common';
import Expo, { ExpoPushMessage, ExpoPushTicket } from 'expo-server-sdk';
import { PrismaService } from '../../prisma/prisma.service';
import { FcmService } from './fcm.service';

@Injectable()
export class PushService {
  private readonly expo = new Expo();
  private readonly logger = new Logger(PushService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly fcm: FcmService,
  ) {}

  private isExpoToken(token: string): boolean {
    return (
      token.startsWith('ExponentPushToken[') ||
      token.startsWith('ExpoPushToken[')
    );
  }

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

  async registerUserToken(userId: string, token: string): Promise<void> {
    await this.prisma.user.update({
      where: { id: userId },
      data: { expoPushToken: token },
    });
  }

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

    const channelId = this.resolveChannelId(data);
    const expoMessages: ExpoPushMessage[] = [];
    const expoDeviceIds: string[] = [];
    const fcmTokens: { token: string; deviceId: string }[] = [];

    for (const device of devices) {
      const token = device.expoPushToken!;
      if (this.isExpoToken(token)) {
        if (!Expo.isExpoPushToken(token)) {
          this.logger.warn(
            `Invalid Expo token for device ${String(device.devicePublicId)}: ${String(token)}`,
          );
          continue;
        }
        expoMessages.push(this.buildExpoMessage(token, title, body, data));
        expoDeviceIds.push(device.id);
      } else {
        fcmTokens.push({ token, deviceId: device.id });
      }
    }

    if (expoMessages.length) {
      const tickets = await this.dispatchExpoMessages(expoMessages);
      await this.cleanupInvalidExpoTokens(tickets, expoDeviceIds, 'device');
    }

    if (fcmTokens.length && this.fcm.isAvailable) {
      const invalidTokens = await this.fcm.sendToDevices(
        fcmTokens.map((t) => t.token),
        title,
        body,
        data,
        channelId,
      );
      for (const inv of invalidTokens) {
        const entry = fcmTokens.find((t) => t.token === inv);
        if (entry) {
          this.logger.warn(
            `Clearing invalid FCM token for device ${entry.deviceId}`,
          );
          await this.prisma.device.update({
            where: { id: entry.deviceId },
            data: { expoPushToken: null },
          });
        }
      }
    } else if (fcmTokens.length) {
      this.logger.warn(
        'FCM tokens found but FcmService not available – sending via Expo fallback',
      );
      for (const { token, deviceId } of fcmTokens) {
        expoMessages.push(this.buildExpoMessage(token, title, body, data));
        expoDeviceIds.push(deviceId);
      }
      if (expoMessages.length) {
        const tickets = await this.dispatchExpoMessages(expoMessages);
        await this.cleanupInvalidExpoTokens(tickets, expoDeviceIds, 'device');
      }
    }
  }

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
    const channelId = this.resolveChannelId(data);

    if (!this.isExpoToken(token) && this.fcm.isAvailable) {
      const ok = await this.fcm.sendToDevice(
        token,
        title,
        body,
        data,
        channelId,
      );
      if (!ok) {
        this.logger.warn(`Clearing invalid FCM token for user ${userId}`);
        await this.prisma.user.update({
          where: { id: userId },
          data: { expoPushToken: null },
        });
      }
      return;
    }

    if (!Expo.isExpoPushToken(token)) {
      this.logger.warn(`Invalid push token for user ${userId}`);
      return;
    }

    const tickets = await this.dispatchExpoMessages([
      this.buildExpoMessage(token, title, body, data),
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

    const channelId = this.resolveChannelId(data);
    const expoMessages: ExpoPushMessage[] = [];
    const expoUserIds: string[] = [];
    const fcmEntries: { token: string; userId: string }[] = [];

    for (const user of users) {
      const token = user.expoPushToken!;
      if (this.isExpoToken(token)) {
        if (!Expo.isExpoPushToken(token)) continue;
        expoMessages.push(this.buildExpoMessage(token, title, body, data));
        expoUserIds.push(user.id);
      } else {
        fcmEntries.push({ token, userId: user.id });
      }
    }

    if (expoMessages.length) {
      const tickets = await this.dispatchExpoMessages(expoMessages);
      await this.cleanupInvalidExpoTokens(tickets, expoUserIds, 'user');
    }

    if (fcmEntries.length && this.fcm.isAvailable) {
      const invalidTokens = await this.fcm.sendToDevices(
        fcmEntries.map((e) => e.token),
        title,
        body,
        data,
        channelId,
      );
      for (const inv of invalidTokens) {
        const entry = fcmEntries.find((e) => e.token === inv);
        if (entry) {
          await this.prisma.user.update({
            where: { id: entry.userId },
            data: { expoPushToken: null },
          });
        }
      }
    } else if (fcmEntries.length) {
      this.logger.warn(
        'FCM tokens found but FcmService not available – sending via Expo fallback',
      );
      for (const { token, userId } of fcmEntries) {
        if (Expo.isExpoPushToken(token)) {
          expoMessages.push(this.buildExpoMessage(token, title, body, data));
          expoUserIds.push(userId);
        }
      }
      if (expoMessages.length) {
        const tickets = await this.dispatchExpoMessages(expoMessages);
        await this.cleanupInvalidExpoTokens(tickets, expoUserIds, 'user');
      }
    }
  }

  private buildExpoMessage(
    token: string,
    title: string,
    body: string,
    data?: Record<string, unknown>,
  ): ExpoPushMessage {
    return {
      to: token,
      title,
      body,
      data: data ?? {},
      sound: 'default',
      priority: 'high',
      channelId: this.resolveChannelId(data),
    };
  }

  private resolveChannelId(data?: Record<string, unknown>): string {
    const type = typeof data?.type === 'string' ? data.type : '';
    if (type.includes('REMINDER')) return 'reminders';
    if (type === 'CHAT_MESSAGE') return 'messages';
    if (type.includes('TEST') || type.includes('MMSE')) return 'tests';
    return 'default';
  }

  private async dispatchExpoMessages(
    messages: ExpoPushMessage[],
  ): Promise<ExpoPushTicket[]> {
    const chunks = this.expo.chunkPushNotifications(messages);
    const tickets: ExpoPushTicket[] = [];

    for (const chunk of chunks) {
      try {
        const chunkTickets = await this.expo.sendPushNotificationsAsync(chunk);
        tickets.push(...chunkTickets);
      } catch (err) {
        this.logger.error('Failed to send Expo push notification chunk', err);
      }
    }
    return tickets;
  }

  private async cleanupInvalidExpoTokens(
    tickets: ExpoPushTicket[],
    entityIds: string[],
    entityType: 'device' | 'user',
  ): Promise<void> {
    for (let i = 0; i < tickets.length; i++) {
      const ticket = tickets[i];
      if (
        ticket.status === 'error' &&
        ticket.details?.error === 'DeviceNotRegistered'
      ) {
        const id = entityIds[i];
        if (!id) continue;
        this.logger.warn(`Clearing invalid Expo token for ${entityType} ${id}`);
        if (entityType === 'device') {
          await this.prisma.device.update({
            where: { id },
            data: { expoPushToken: null },
          });
        } else {
          await this.prisma.user.update({
            where: { id },
            data: { expoPushToken: null },
          });
        }
      }
    }
  }
}
