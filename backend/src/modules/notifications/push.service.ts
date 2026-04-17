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
