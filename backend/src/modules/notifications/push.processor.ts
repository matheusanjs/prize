import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Job } from 'bullmq';
import * as webpush from 'web-push';
import * as apn from '@parse/node-apn';
import { PrismaService } from '../../database/prisma.service';
import { PushPayload } from './push.types';

export interface PushJobData {
  userId: string;
  payload: PushPayload;
}

@Processor('push', { concurrency: 10 })
export class PushProcessor extends WorkerHost {
  private readonly logger = new Logger(PushProcessor.name);
  private apnProvider: apn.Provider | null = null;

  constructor(
    private prisma: PrismaService,
    private config: ConfigService,
  ) {
    super();
    this.initApn();
  }

  private initApn() {
    const apnKeyId = this.config.get<string>('APN_KEY_ID');
    const apnTeamId = this.config.get<string>('APN_TEAM_ID');
    const apnKey = this.config.get<string>('APN_KEY');
    if (!apnKeyId || !apnTeamId || !apnKey) return;

    try {
      let keyContent = apnKey;
      if (!apnKey.includes('BEGIN PRIVATE KEY')) {
        keyContent = Buffer.from(apnKey, 'base64').toString('utf8');
      }
      this.apnProvider = new apn.Provider({
        token: { key: Buffer.from(keyContent), keyId: apnKeyId, teamId: apnTeamId },
        production: true,
      });
      this.logger.log('APNs provider configured (push processor)');
    } catch (err: any) {
      this.logger.error(`Failed to configure APNs in processor: ${err.message}`);
    }
  }

  async process(job: Job<PushJobData>) {
    const { userId, payload } = job.data;
    let sent = 0;
    let failed = 0;

    // 1. Web Push in parallel (with timeout)
    const subs = await this.prisma.pushSubscription.findMany({ where: { userId } });
    if (subs.length > 0) {
      const webResults = await Promise.allSettled(
        subs.map((sub) =>
          Promise.race([
            webpush.sendNotification(
              { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
              JSON.stringify(payload),
              { TTL: 86400, urgency: payload.urgency || 'normal' },
            ),
            new Promise<never>((_, reject) =>
              setTimeout(() => reject(new Error('webpush_timeout')), 5000),
            ),
          ]).then(
            () => ({ ok: true as const, sub }),
            (err: any) => ({ ok: false as const, sub, err }),
          ),
        ),
      );

      for (const r of webResults) {
        if (r.status !== 'fulfilled') { failed++; continue; }
        if (r.value.ok) { sent++; continue; }
        failed++;
        const statusCode = (r.value.err as any)?.statusCode;
        if (statusCode === 404 || statusCode === 410) {
          await this.prisma.pushSubscription
            .delete({ where: { id: r.value.sub.id } })
            .catch(() => {});
        }
      }
    }

    // 2. APNs in parallel (premium flags)
    if (this.apnProvider) {
      const tokens = await this.prisma.deviceToken.findMany({
        where: { userId, platform: 'ios' },
      });
      if (tokens.length > 0) {
        const apnTopic =
          this.config.get<string>('APN_TOPIC') || 'com.marinaprizeclub.app';

        const unread = await this.prisma.notification.count({
          where: { userId, read: false },
        }).catch(() => 0);

        const apnResults = await Promise.allSettled(
          tokens.map((dt) => {
            const notification = new apn.Notification();
            notification.alert = { title: payload.title, body: payload.body };
            notification.badge = unread;
            notification.sound = 'default';
            notification.topic = apnTopic;
            notification.payload = payload.data || {};
            notification.expiry = Math.floor(Date.now() / 1000) + 3600; // 1h TTL
            notification.priority = payload.urgency === 'high' ? 10 : 5;
            notification.pushType = 'alert';
            notification.threadId = payload.threadId || 'prize-general';
            if (payload.tag) notification.collapseId = payload.tag;
            return this.apnProvider!.send(notification, dt.token).then((res) => ({
              dt,
              res,
            }));
          }),
        );

        for (const r of apnResults) {
          if (r.status !== 'fulfilled') { failed++; continue; }
          const { dt, res } = r.value;
          if (res.failed.length > 0) {
            failed++;
            const reason = res.failed[0]?.response?.reason;
            if (reason === 'BadDeviceToken' || reason === 'Unregistered' || reason === 'ExpiredProviderToken') {
              await this.prisma.deviceToken.delete({ where: { id: dt.id } }).catch(() => {});
            }
          } else {
            sent++;
          }
        }
      }
    }

    return { sent, failed };
  }
}
