import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { PushService, PushPayload } from './push.service';

export type NotifType =
  | 'RESERVATION' | 'RESERVATION_CREATED' | 'RESERVATION_CANCELLED'
  | 'RESERVATION_REMINDER' | 'RESERVATION_CONFIRM_ARRIVAL'
  | 'PAYMENT' | 'CHARGE_CREATED' | 'CHARGE_DUE_TOMORROW' | 'CHARGE_DUE_TODAY' | 'CHARGE_OVERDUE'
  | 'FUEL' | 'SWAP_REQUEST' | 'SWAP_ACCEPTED' | 'SWAP_REJECTED'
  | 'CHECKLIST_READY' | 'QUEUE' | 'MAINTENANCE' | 'GENERAL' | 'AI_INSIGHT';

interface SendOpts {
  userId: string;
  type: NotifType;
  title: string;
  body: string;
  data?: Record<string, any>;
  /** push-specific overrides */
  pushTag?: string;
  pushActions?: { action: string; title: string }[];
  pushUrgency?: 'very-low' | 'low' | 'normal' | 'high';
  /** Deep link opened on tap (also stored in data.url). */
  url?: string;
  /** APNs category identifier (pairs with UNNotificationCategory on device). */
  category?: string;
  /** Rich-notification image URL (enables mutable-content=1 so NSE can attach it). */
  imageUrl?: string;
  /** Group key for the notification tray. Defaults to the notification type. */
  threadId?: string;
}

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    private prisma: PrismaService,
    private pushService: PushService,
  ) {}

  /** Create in-app notification + send push to all user devices */
  async send(opts: SendOpts) {
    const { userId, type, title, body, data, pushTag, pushActions, pushUrgency, url, category, imageUrl, threadId } = opts;

    // 1. Save in-app notification
    const notification = await this.prisma.notification.create({
      data: { userId, type: type as any, title, body, data },
    });

    // 2. Push notification
    const mergedData: Record<string, any> = {
      ...data,
      notificationId: notification.id,
      type,
      url: url || data?.url,
    };
    if (imageUrl) mergedData.imageUrl = imageUrl;

    const payload: PushPayload = {
      title,
      body,
      icon: '/icon-192.png',
      badge: '/icon-badge.png',
      tag: pushTag || `${type}-${notification.id}`,
      data: mergedData,
      actions: pushActions,
      urgency: pushUrgency || 'normal',
      url: url || data?.url,
      // Group by type in the iOS tray (e.g. all CHARGE_OVERDUE stacked together).
      threadId: threadId || type,
      category: category || (pushActions && pushActions.length > 0 ? type : undefined),
      mutableContent: !!imageUrl,
    };

    this.pushService.sendToUser(userId, payload).catch((err) => {
      this.logger.error(`Push to ${userId} failed: ${err.message}`);
    });

    return notification;
  }

  /** Send to multiple users */
  async sendBulk(userIds: string[], type: NotifType, title: string, body: string, data?: Record<string, any>) {
    const notifications = await this.prisma.notification.createMany({
      data: userIds.map((userId) => ({ userId, type: type as any, title, body, data })),
    });

    const payload: PushPayload = {
      title,
      body,
      icon: '/icon-192.png',
      badge: '/icon-badge.png',
      tag: `${type}-bulk-${Date.now()}`,
      data: { ...data, type },
    };

    this.pushService.sendToUsers(userIds, payload).catch((err) => {
      this.logger.error(`Bulk push failed: ${err.message}`);
    });

    return { sent: notifications.count };
  }

  async getUserNotifications(userId: string, p = 1, l = 20) {
    const page = Number(p) || 1;
    const limit = Number(l) || 20;
    const [data, total, unreadCount] = await Promise.all([
      this.prisma.notification.findMany({
        where: { userId },
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { sentAt: 'desc' },
      }),
      this.prisma.notification.count({ where: { userId } }),
      this.prisma.notification.count({ where: { userId, read: false } }),
    ]);

    return { data, total, unreadCount, page, pages: Math.ceil(total / limit) };
  }

  async markAsRead(id: string) {
    return this.prisma.notification.update({
      where: { id },
      data: { read: true, readAt: new Date() },
    });
  }

  async markAllAsRead(userId: string) {
    return this.prisma.notification.updateMany({
      where: { userId, read: false },
      data: { read: true, readAt: new Date() },
    });
  }
}
