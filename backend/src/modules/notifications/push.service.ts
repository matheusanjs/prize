import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { PrismaService } from '../../database/prisma.service';
import * as webpush from 'web-push';
import { PushPayload } from './push.types';

@Injectable()
export class PushService implements OnModuleInit {
  private readonly logger = new Logger(PushService.name);

  constructor(
    private prisma: PrismaService,
    private config: ConfigService,
    @InjectQueue('push') private pushQueue: Queue,
  ) {}

  onModuleInit() {
    const publicKey = this.config.get<string>('VAPID_PUBLIC_KEY');
    const privateKey = this.config.get<string>('VAPID_PRIVATE_KEY');
    const subject = this.config.get<string>('VAPID_SUBJECT') || 'mailto:admin@marinaprizeclub.com';
    if (publicKey && privateKey) {
      webpush.setVapidDetails(subject, publicKey, privateKey);
      this.logger.log('VAPID keys configured for Web Push');
    } else {
      this.logger.warn('VAPID keys not configured — web push disabled');
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

  async registerDeviceToken(
    userId: string,
    token: string,
    platform: string = 'ios',
    meta: {
      deviceName?: string;
      osVersion?: string;
      appVersion?: string;
      locale?: string;
      timezone?: string;
      bundleId?: string;
      enabled?: boolean;
    } = {},
  ) {
    return this.prisma.deviceToken.upsert({
      where: { token },
      update: {
        userId,
        platform,
        deviceName: meta.deviceName,
        osVersion: meta.osVersion,
        appVersion: meta.appVersion,
        locale: meta.locale,
        timezone: meta.timezone,
        bundleId: meta.bundleId,
        enabled: meta.enabled ?? true,
        lastSeenAt: new Date(),
      },
      create: {
        userId,
        token,
        platform,
        deviceName: meta.deviceName,
        osVersion: meta.osVersion,
        appVersion: meta.appVersion,
        locale: meta.locale,
        timezone: meta.timezone,
        bundleId: meta.bundleId,
        enabled: meta.enabled ?? true,
      },
    });
  }

  async removeDeviceToken(token: string) {
    return this.prisma.deviceToken.deleteMany({ where: { token } });
  }

  /** Record a client-side notification event (delivered/opened/dismissed/action). */
  async recordEvent(
    userId: string,
    input: {
      kind: 'DELIVERED' | 'OPENED' | 'DISMISSED' | 'ACTION';
      token?: string;
      notificationId?: string;
      messageId?: string;
      data?: Record<string, any>;
    },
  ) {
    let deviceTokenId: string | undefined;
    if (input.token) {
      const dt = await this.prisma.deviceToken
        .findUnique({ where: { token: input.token } })
        .catch(() => null);
      deviceTokenId = dt?.id;
    }
    return this.prisma.notificationEvent.create({
      data: {
        userId,
        kind: input.kind,
        deviceTokenId,
        notificationId: input.notificationId,
        messageId: input.messageId,
        data: input.data ?? undefined,
      },
    });
  }

  async sendToUser(userId: string, payload: PushPayload): Promise<{ queued: true }> {
    await this.pushQueue.add(
      'send',
      { userId, payload },
      {
        attempts: 3,
        backoff: { type: 'exponential', delay: 5000 },
        removeOnComplete: { age: 3600, count: 500 },
        removeOnFail: { age: 86400, count: 200 },
      },
    );
    return { queued: true };
  }

  async sendToUsers(userIds: string[], payload: PushPayload): Promise<{ queued: number }> {
    const jobs = userIds.map((userId) => ({
      name: 'send',
      data: { userId, payload },
      opts: {
        attempts: 3,
        backoff: { type: 'exponential' as const, delay: 5000 },
        removeOnComplete: { age: 3600, count: 500 },
        removeOnFail: { age: 86400, count: 200 },
      },
    }));
    await this.pushQueue.addBulk(jobs);
    return { queued: jobs.length };
  }
}

export { PushPayload };
