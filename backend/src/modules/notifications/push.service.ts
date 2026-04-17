import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../database/prisma.service';
import * as webpush from 'web-push';
import * as apn from '@parse/node-apn';

@Injectable()
export class PushService implements OnModuleInit {
  private readonly logger = new Logger(PushService.name);
  private apnProvider: apn.Provider | null = null;

  constructor(
    private prisma: PrismaService,
    private config: ConfigService,
  ) {}

  onModuleInit() {
    // Web Push (VAPID)
    const publicKey = this.config.get<string>('VAPID_PUBLIC_KEY');
    const privateKey = this.config.get<string>('VAPID_PRIVATE_KEY');
    const subject = this.config.get<string>('VAPID_SUBJECT') || 'mailto:admin@marinaprizeclub.com';

    if (publicKey && privateKey) {
      webpush.setVapidDetails(subject, publicKey, privateKey);
      this.logger.log('VAPID keys configured for Web Push');
    } else {
      this.logger.warn('VAPID keys not configured — web push disabled');
    }

    // APNs (iOS native push)
    const apnKeyId = this.config.get<string>('APN_KEY_ID');
    const apnTeamId = this.config.get<string>('APN_TEAM_ID');
    const apnKey = this.config.get<string>('APN_KEY'); // p8 key contents (base64 or raw)
    const apnTopic = this.config.get<string>('APN_TOPIC') || 'com.marinaprizeclub.app';

    if (apnKeyId && apnTeamId && apnKey) {
      try {
        // Decode key: support both raw PEM and base64-encoded
        let keyContent = apnKey;
        if (!apnKey.includes('BEGIN PRIVATE KEY')) {
          keyContent = Buffer.from(apnKey, 'base64').toString('utf8');
        }

        this.apnProvider = new apn.Provider({
          token: {
            key: Buffer.from(keyContent),
            keyId: apnKeyId,
            teamId: apnTeamId,
          },
          production: true,
        });
        this.logger.log('APNs provider configured for iOS push');
      } catch (err: any) {
        this.logger.error(`Failed to configure APNs: ${err.message}`);
      }
    } else {
      this.logger.warn('APNs not configured — iOS native push disabled. Set APN_KEY_ID, APN_TEAM_ID, APN_KEY');
    }
  }

  getPublicKey(): string {
    return this.config.get<string>('VAPID_PUBLIC_KEY') || '';
  }

  // ─── Web Push Subscriptions ───

  async subscribe(userId: string, subscription: { endpoint: string; keys: { p256dh: string; auth: string } }, userAgent?: string) {
    return this.prisma.pushSubscription.upsert({
      where: { endpoint: subscription.endpoint },
      update: { userId, p256dh: subscription.keys.p256dh, auth: subscription.keys.auth, userAgent },
      create: { userId, endpoint: subscription.endpoint, p256dh: subscription.keys.p256dh, auth: subscription.keys.auth, userAgent },
    });
  }

  async unsubscribe(endpoint: string) {
    return this.prisma.pushSubscription.deleteMany({ where: { endpoint } });
  }

  async unsubscribeAll(userId: string) {
    return this.prisma.pushSubscription.deleteMany({ where: { userId } });
  }

  // ─── Device Tokens (iOS/Android native) ───

  async registerDeviceToken(userId: string, token: string, platform = 'ios') {
    return this.prisma.deviceToken.upsert({
      where: { token },
      update: { userId, platform },
      create: { userId, token, platform },
    });
  }

  async removeDeviceToken(token: string) {
    return this.prisma.deviceToken.deleteMany({ where: { token } });
  }

  // ─── Send to User (Web Push + APNs) ───

  async sendToUser(userId: string, payload: PushPayload): Promise<{ sent: number; failed: number }> {
    let sent = 0;
    let failed = 0;

    // 1. Web Push (browser subscriptions)
    const subs = await this.prisma.pushSubscription.findMany({ where: { userId } });
    for (const sub of subs) {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          JSON.stringify(payload),
          { TTL: 86400, urgency: payload.urgency || 'normal' },
        );
        sent++;
      } catch (err: any) {
        if (err.statusCode === 404 || err.statusCode === 410) {
          await this.prisma.pushSubscription.delete({ where: { id: sub.id } }).catch(() => {});
          this.logger.debug(`Removed expired web push subscription ${sub.id}`);
        } else {
          this.logger.error(`Web push failed for sub ${sub.id}: ${err.message}`);
        }
        failed++;
      }
    }

    // 2. APNs (iOS native tokens)
    if (this.apnProvider) {
      const tokens = await this.prisma.deviceToken.findMany({ where: { userId, platform: 'ios' } });
      for (const dt of tokens) {
        try {
          const notification = new apn.Notification();
          notification.alert = { title: payload.title, body: payload.body };
          notification.badge = 1;
          notification.sound = 'default';
          notification.topic = this.config.get<string>('APN_TOPIC') || 'com.marinaprizeclub.app';
          notification.payload = payload.data || {};
          if (payload.tag) notification.collapseId = payload.tag;

          const result = await this.apnProvider.send(notification, dt.token);
          if (result.failed.length > 0) {
            const reason = result.failed[0]?.response?.reason;
            if (reason === 'BadDeviceToken' || reason === 'Unregistered' || reason === 'ExpiredProviderToken') {
              await this.prisma.deviceToken.delete({ where: { id: dt.id } }).catch(() => {});
              this.logger.debug(`Removed invalid APNs token ${dt.id}: ${reason}`);
            } else {
              this.logger.error(`APNs failed for token ${dt.id}: ${reason}`);
            }
            failed++;
          } else {
            sent++;
          }
        } catch (err: any) {
          this.logger.error(`APNs exception for token ${dt.id}: ${err.message}`);
          failed++;
        }
      }
    }

    return { sent, failed };
  }

  async sendToUsers(userIds: string[], payload: PushPayload): Promise<{ sent: number; failed: number }> {
    let totalSent = 0;
    let totalFailed = 0;
    for (const uid of userIds) {
      const { sent, failed } = await this.sendToUser(uid, payload);
      totalSent += sent;
      totalFailed += failed;
    }
    return { sent: totalSent, failed: totalFailed };
  }
}

export interface PushPayload {
  title: string;
  body: string;
  icon?: string;
  badge?: string;
  tag?: string;
  data?: Record<string, any>;
  actions?: { action: string; title: string; icon?: string }[];
  urgency?: 'very-low' | 'low' | 'normal' | 'high';
}
