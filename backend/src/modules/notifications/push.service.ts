import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../database/prisma.service';
import * as webpush from 'web-push';

@Injectable()
export class PushService implements OnModuleInit {
  private readonly logger = new Logger(PushService.name);

  constructor(
    private prisma: PrismaService,
    private config: ConfigService,
  ) {}

  onModuleInit() {
    const publicKey = this.config.get<string>('VAPID_PUBLIC_KEY');
    const privateKey = this.config.get<string>('VAPID_PRIVATE_KEY');
    const subject = this.config.get<string>('VAPID_SUBJECT') || 'mailto:admin@marinaprizeclub.com';

    if (publicKey && privateKey) {
      webpush.setVapidDetails(subject, publicKey, privateKey);
      this.logger.log('VAPID keys configured for Web Push');
    } else {
      this.logger.warn('VAPID keys not configured — push notifications disabled');
    }
  }

  getPublicKey(): string {
    return this.config.get<string>('VAPID_PUBLIC_KEY') || '';
  }

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

  async sendToUser(userId: string, payload: PushPayload): Promise<{ sent: number; failed: number }> {
    const subs = await this.prisma.pushSubscription.findMany({ where: { userId } });
    let sent = 0;
    let failed = 0;

    for (const sub of subs) {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          JSON.stringify(payload),
          { TTL: 86400, urgency: payload.urgency || 'normal' },
        );
        sent++;
      } catch (err: any) {
        // 404 or 410 = subscription expired/invalid — remove
        if (err.statusCode === 404 || err.statusCode === 410) {
          await this.prisma.pushSubscription.delete({ where: { id: sub.id } }).catch(() => {});
          this.logger.debug(`Removed expired subscription ${sub.id}`);
        } else {
          this.logger.error(`Push failed for sub ${sub.id}: ${err.message}`);
        }
        failed++;
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
