import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as admin from 'firebase-admin';

@Injectable()
export class FcmService implements OnModuleInit {
  private readonly logger = new Logger(FcmService.name);
  private initialized = false;

  constructor(private readonly config: ConfigService) {}

  onModuleInit() {
    try {
      const keyPath = this.config.get<string>('FCM_SERVICE_ACCOUNT_PATH');
      if (keyPath) {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const serviceAccount = require(keyPath) as admin.ServiceAccount;
        admin.initializeApp({
          credential: admin.credential.cert(serviceAccount),
        });
        this.initialized = true;
        this.logger.log(
          `Firebase Admin initialized from file (project: ${String(serviceAccount.projectId)})`,
        );
        return;
      }

      const keyJson = this.config.get<string>('FCM_SERVICE_ACCOUNT_JSON');
      if (keyJson) {
        const raw = JSON.parse(keyJson) as Record<string, string>;
        if (raw.private_key && typeof raw.private_key === 'string') {
          raw.private_key = raw.private_key.replace(/\\n/g, '\n');
        }
        const sa: admin.ServiceAccount = {
          projectId: raw.project_id,
          clientEmail: raw.client_email,
          privateKey: raw.private_key,
        };
        admin.initializeApp({ credential: admin.credential.cert(sa) });
        this.initialized = true;
        this.logger.log(
          `Firebase Admin initialized from env JSON (project: ${String(sa.projectId)})`,
        );
        return;
      }

      this.logger.warn(
        'FCM_SERVICE_ACCOUNT_PATH and FCM_SERVICE_ACCOUNT_JSON are both empty – ' +
          'FCM direct push DISABLED. Android push will NOT work.',
      );
    } catch (err) {
      this.logger.error('FAILED to initialize Firebase Admin SDK', err);
    }
  }

  get isAvailable(): boolean {
    return this.initialized;
  }

  async sendToDevice(
    fcmToken: string,
    title: string,
    body: string,
    data?: Record<string, unknown>,
    channelId = 'default',
  ): Promise<boolean> {
    if (!this.initialized) {
      this.logger.error(
        '[FCM] Not initialized – cannot send. Check FCM_SERVICE_ACCOUNT_JSON env var.',
      );
      return false;
    }

    const stringData: Record<string, string> = {
      title,
      message: body,
      body: JSON.stringify(data || {}),
      channelId,
    };

    const messagePayload: admin.messaging.Message = {
      token: fcmToken,
      data: stringData,
      android: {
        priority: 'high',
      },
    };

    try {
      const messageId = await admin.messaging().send(messagePayload);
      this.logger.log(
        `[FCM] SENT OK → token=${fcmToken.substring(0, 15)}… ` +
          `title="${title}" channel=${channelId} msgId=${messageId}`,
      );
      return true;
    } catch (err: unknown) {
      const e = err as Record<string, unknown>;
      const info = e?.errorInfo as Record<string, unknown> | undefined;
      const code = (e?.code ?? info?.code ?? 'unknown') as string;
      if (
        code === 'messaging/registration-token-not-registered' ||
        code === 'messaging/invalid-registration-token'
      ) {
        this.logger.warn(
          `[FCM] Token invalid (${code}): ${fcmToken.substring(0, 15)}…`,
        );
        return false;
      }
      this.logger.error(
        `[FCM] SEND FAILED → token=${fcmToken.substring(0, 15)}… ` +
          `code=${code} title="${title}"`,
        err,
      );
      return false;
    }
  }

  async sendToDevices(
    fcmTokens: string[],
    title: string,
    body: string,
    data?: Record<string, unknown>,
    channelId = 'default',
  ): Promise<string[]> {
    const invalidTokens: string[] = [];
    for (const token of fcmTokens) {
      const ok = await this.sendToDevice(token, title, body, data, channelId);
      if (!ok) invalidTokens.push(token);
    }
    return invalidTokens;
  }
}
