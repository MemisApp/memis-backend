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
    const isExpo = this.isExpoToken(token);
    this.logger.log(
      `[REG] Patient token → patient=${patientId} device=${devicePublicId} ` +
        `type=${isExpo ? 'expo' : 'fcm'} token=${token.substring(0, 20)}…`,
    );
    await this.prisma.device.updateMany({
      where: { patientId, devicePublicId },
      data: { expoPushToken: token },
    });
  }

  async registerUserToken(userId: string, token: string): Promise<void> {
    const isExpo = this.isExpoToken(token);
    this.logger.log(
      `[REG] User token → userId=${userId} ` +
        `type=${isExpo ? 'expo' : 'fcm'} token=${token.substring(0, 20)}…`,
    );
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
    this.logger.log(
      `[SEND] sendToPatient → patient=${patientId} title="${title}" ` +
        `type=${(data?.type as string) ?? 'none'}`,
    );

    const devices = await this.prisma.device.findMany({
      where: { patientId, expoPushToken: { not: null } },
      select: { id: true, expoPushToken: true, devicePublicId: true },
    });

    if (!devices.length) {
      this.logger.warn(
        `[SEND] NO tokens found for patient ${patientId} – notification dropped`,
      );
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
            `[SEND] Invalid Expo token for device ${String(device.devicePublicId)}`,
          );
          continue;
        }
        expoMessages.push(this.buildExpoMessage(token, title, body, data));
        expoDeviceIds.push(device.id);
      } else {
        fcmTokens.push({ token, deviceId: device.id });
      }
    }

    this.logger.log(
      `[SEND] Patient ${patientId}: ${expoMessages.length} Expo tokens, ` +
        `${fcmTokens.length} FCM tokens, FCM available=${this.fcm.isAvailable}`,
    );

    if (expoMessages.length) {
      const tickets = await this.dispatchExpoMessages(expoMessages);
      await this.cleanupInvalidTokens(tickets, expoDeviceIds, 'device');
    }

    if (fcmTokens.length) {
      if (this.fcm.isAvailable) {
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
              `[SEND] Clearing dead FCM token for device ${entry.deviceId}`,
            );
            await this.prisma.device.update({
              where: { id: entry.deviceId },
              data: { expoPushToken: null },
            });
          }
        }
      } else {
        this.logger.error(
          `[SEND] FCM NOT AVAILABLE but have ${fcmTokens.length} FCM tokens – ` +
            `notifications WILL NOT be delivered! Set FCM_SERVICE_ACCOUNT_JSON env var.`,
        );
      }
    }
  }

  async sendToUser(
    userId: string,
    title: string,
    body: string,
    data?: Record<string, unknown>,
  ): Promise<void> {
    this.logger.log(
      `[SEND] sendToUser → userId=${userId} title="${title}" ` +
        `type=${(data?.type as string) ?? 'none'}`,
    );

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, expoPushToken: true },
    });

    if (!user?.expoPushToken) {
      this.logger.warn(`[SEND] No push token for user ${userId} – dropped`);
      return;
    }

    const token = user.expoPushToken;
    const isExpo = this.isExpoToken(token);

    this.logger.log(
      `[SEND] User ${userId}: tokenType=${isExpo ? 'expo' : 'fcm'} ` +
        `token=${token.substring(0, 15)}… FCM available=${this.fcm.isAvailable}`,
    );

    if (!isExpo) {
      if (this.fcm.isAvailable) {
        const channelId = this.resolveChannelId(data);
        const ok = await this.fcm.sendToDevice(
          token,
          title,
          body,
          data,
          channelId,
        );
        if (!ok) {
          this.logger.warn(`[SEND] Clearing dead FCM token for user ${userId}`);
          await this.prisma.user.update({
            where: { id: userId },
            data: { expoPushToken: null },
          });
        }
      } else {
        this.logger.error(
          `[SEND] FCM NOT AVAILABLE for user ${userId} – notification dropped!`,
        );
      }
      return;
    }

    if (!Expo.isExpoPushToken(token)) {
      this.logger.warn(`[SEND] Invalid Expo token for user ${userId}`);
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
      this.logger.warn(`[SEND] Clearing dead Expo token for user ${userId}`);
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

    this.logger.log(
      `[SEND] sendToUsers → ${userIds.length} users, title="${title}" ` +
        `type=${(data?.type as string) ?? 'none'}`,
    );

    const users = await this.prisma.user.findMany({
      where: { id: { in: userIds }, expoPushToken: { not: null } },
      select: { id: true, expoPushToken: true },
    });

    if (!users.length) {
      this.logger.warn(
        `[SEND] No tokens for any of ${userIds.length} users – dropped`,
      );
      return;
    }

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

    this.logger.log(
      `[SEND] Users batch: ${expoMessages.length} Expo, ` +
        `${fcmEntries.length} FCM, FCM available=${this.fcm.isAvailable}`,
    );

    if (expoMessages.length) {
      const tickets = await this.dispatchExpoMessages(expoMessages);
      await this.cleanupInvalidTokens(tickets, expoUserIds, 'user');
    }

    if (fcmEntries.length) {
      if (this.fcm.isAvailable) {
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
      } else {
        this.logger.error(
          `[SEND] FCM NOT AVAILABLE but have ${fcmEntries.length} FCM tokens – ` +
            `notifications dropped! Set FCM_SERVICE_ACCOUNT_JSON env var.`,
        );
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
    if (type.includes('ASSIGNED')) return 'tests';
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
        for (const t of chunkTickets) {
          if (t.status === 'ok') {
            this.logger.log(`[EXPO] Sent OK → id=${t.id}`);
          } else {
            this.logger.error(
              `[EXPO] SEND FAILED → ${t.message} (${t.details?.error ?? 'unknown'})`,
            );
          }
        }
      } catch (err) {
        this.logger.error('[EXPO] Failed to send chunk', err);
      }
    }
    return tickets;
  }

  private async cleanupInvalidTokens(
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
        this.logger.warn(
          `[CLEANUP] Clearing dead Expo token for ${entityType} ${id}`,
        );
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
