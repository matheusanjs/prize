import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger, OnModuleDestroy } from '@nestjs/common';
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
export class PushProcessor extends WorkerHost implements OnModuleDestroy {
  private readonly logger = new Logger(PushProcessor.name);
  private apnProvider: apn.Provider | null = null;

  constructor(
    private prisma: PrismaService,
    private config: ConfigService,
  ) {
    super();
    this.initApn();
  }

  async onModuleDestroy() {
    if (this.apnProvider) {
      try { this.apnProvider.shutdown(); } catch { /* ignore */ }
      this.apnProvider = null;
    }
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

    // 1. Web Push in parallel (with timeout). Skip for silent iOS-only pushes.
    const subs = payload.silent
      ? []
      : await this.prisma.pushSubscription.findMany({ where: { userId } });
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
            const isSilent = !!payload.silent || (!payload.title && !payload.body);

            // Deep-link URL: travel under data.url so clients can route on tap
            const dataPayload: Record<string, any> = { ...(payload.data || {}) };
            if (payload.url) dataPayload.url = payload.url;
            if (payload.category) dataPayload.category = payload.category;

            if (isSilent) {
              // Silent / background push: no alert, content-available=1, priority 5.
              // iOS throttles these aggressively — only used for background sync.
              notification.pushType = 'background';
              notification.priority = 5;
              notification.contentAvailable = true;
              notification.payload = dataPayload;
              // Long TTL so iOS can deliver it when the device wakes up.
              notification.expiry = Math.floor(Date.now() / 1000) + 24 * 3600;
            } else {
              notification.pushType = 'alert';
              notification.alert = { title: payload.title || '', body: payload.body || '' };
              // node-apn's typings don't allow undefined here, use empty string to suppress.
              notification.sound = payload.sound === null ? '' : (payload.sound || 'default');
              // Apple recommends priority 10 for user-visible alerts so they are delivered
              // immediately. Priority 5 is only for background / low-priority pushes.
              // Respect explicit low urgency (battery-friendly) but default to 10.
              notification.priority = payload.urgency === 'very-low' || payload.urgency === 'low' ? 5 : 10;
              notification.payload = dataPayload;
              notification.badge = typeof payload.badgeCount === 'number' ? payload.badgeCount : unread;
              if (payload.category) (notification as any).category = payload.category;
              // Enable NSE (rich notifications / images) whenever the payload carries
              // an imageUrl or explicitly requests it.
              if (payload.mutableContent || dataPayload.imageUrl) notification.mutableContent = true;
              // 24h TTL for alerts so they are still delivered if the phone is offline.
              notification.expiry = Math.floor(Date.now() / 1000) + 24 * 3600;
            }

            notification.topic = apnTopic;
            // Group notifications in the tray by category/type when no explicit threadId given.
            notification.threadId = payload.threadId || payload.category || dataPayload.type || 'prize-general';
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
            this.logger.warn(
              `APNs failed for user ${userId} token=${dt.token.slice(0, 8)}… reason=${reason || 'unknown'}`,
            );
            if (reason === 'BadDeviceToken' || reason === 'Unregistered' || reason === 'ExpiredProviderToken' || reason === 'DeviceTokenNotForTopic') {
              await this.prisma.deviceToken.delete({ where: { id: dt.id } }).catch(() => {});
            }
          } else {
            sent++;
            // Track SENT event (server-side) for analytics. apns-id comes back in res.sent[0].
            const apnsId = (res.sent?.[0] as any)?.apnsId || undefined;
            this.prisma.notificationEvent.create({
              data: {
                userId,
                deviceTokenId: dt.id,
                kind: 'SENT',
                notificationId: (payload.data as any)?.notificationId || undefined,
                messageId: apnsId,
                data: { tag: payload.tag, threadId: payload.threadId, category: payload.category },
              },
            }).catch(() => { /* analytics are best-effort */ });
          }
        }
      }
    }

    return { sent, failed };
  }
}
