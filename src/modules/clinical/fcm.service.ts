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
        const serviceAccount = require(keyPath);
        admin.initializeApp({
          credential: admin.credential.cert(serviceAccount),
        });
        this.initialized = true;
        this.logger.log('Firebase Admin initialized from service account file');
        return;
      }

      const keyJson = this.config.get<string>('FCM_SERVICE_ACCOUNT_JSON');
      if (keyJson) {
        const serviceAccount = JSON.parse(keyJson);
        admin.initializeApp({
          credential: admin.credential.cert(serviceAccount),
        });
        this.initialized = true;
        this.logger.log(
          'Firebase Admin initialized from service account JSON env',
        );
        return;
      }

      this.logger.warn(
        'No FCM_SERVICE_ACCOUNT_PATH or FCM_SERVICE_ACCOUNT_JSON env var set – ' +
          'FCM direct push disabled. Android push will fall back to Expo Push Service.',
      );
    } catch (err) {
      this.logger.error('Failed to initialize Firebase Admin', err);
    }
  }

  get isAvailable(): boolean {
    return this.initialized;
  }

  /**
   * Send a push notification directly via FCM with the `notification` field,
   * so Android OS auto-displays it even when the app is killed.
   */
  async sendToDevice(
    fcmToken: string,
    title: string,
    body: string,
    data?: Record<string, unknown>,
    channelId = 'default',
  ): Promise<boolean> {
    if (!this.initialized) {
      this.logger.warn('FCM not initialized – skipping direct send');
      return false;
    }

    const stringData: Record<string, string> = {};
    if (data) {
      for (const [k, v] of Object.entries(data)) {
        stringData[k] = String(v ?? '');
      }
    }

    const message: admin.messaging.Message = {
      token: fcmToken,
      notification: { title, body },
      data: stringData,
      android: {
        priority: 'high',
        notification: {
          channelId,
          sound: 'default',
          priority: 'high',
          defaultVibrateTimings: true,
          defaultLightSettings: true,
        },
      },
    };

    try {
      const messageId = await admin.messaging().send(message);
      this.logger.debug(`FCM message sent: ${messageId}`);
      return true;
    } catch (err: any) {
      if (
        err?.code === 'messaging/registration-token-not-registered' ||
        err?.code === 'messaging/invalid-registration-token'
      ) {
        this.logger.warn(
          `FCM token invalid/unregistered: ${fcmToken.substring(0, 20)}...`,
        );
        return false;
      }
      this.logger.error(`FCM send failed for token ${fcmToken.substring(0, 20)}...`, err);
      return false;
    }
  }

  /**
   * Send to multiple FCM tokens. Returns list of tokens that failed
   * with "not registered" errors (so caller can clean them up).
   */
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
