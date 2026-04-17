import { Controller, Get, Post, Body, Query, UseGuards, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { NotificationsService, NotifType } from './notifications.service';
import { PushService } from './push.service';
import { PrismaService } from '../../database/prisma.service';

@ApiTags('admin/push')
@Controller('admin/push')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN')
@ApiBearerAuth()
export class AdminPushController {
  constructor(
    private notificationsService: NotificationsService,
    private pushService: PushService,
    private prisma: PrismaService,
  ) {}

  /* ─── Dashboard Stats ─── */

  @Get('stats')
  @ApiOperation({ summary: 'Push notification dashboard stats' })
  async getStats() {
    const [
      totalDevices,
      iosDevices,
      webSubscriptions,
      totalNotifications,
      unreadNotifications,
      totalEvents,
      deliveredEvents,
      openedEvents,
    ] = await Promise.all([
      this.prisma.deviceToken.count({ where: { enabled: true } }),
      this.prisma.deviceToken.count({ where: { enabled: true, platform: 'ios' } }),
      this.prisma.pushSubscription.count(),
      this.prisma.notification.count(),
      this.prisma.notification.count({ where: { read: false } }),
      this.prisma.notificationEvent.count(),
      this.prisma.notificationEvent.count({ where: { kind: 'DELIVERED' } }),
      this.prisma.notificationEvent.count({ where: { kind: 'OPENED' } }),
    ]);

    // Unique users with push capability
    const usersWithDevices = await this.prisma.deviceToken.groupBy({
      by: ['userId'],
      where: { enabled: true },
    });
    const usersWithWeb = await this.prisma.pushSubscription.groupBy({
      by: ['userId'],
    });
    const uniqueUserIds = new Set([
      ...usersWithDevices.map((d) => d.userId),
      ...usersWithWeb.map((d) => d.userId),
    ]);

    // Recent notifications (last 7 days)
    const weekAgo = new Date();
    weekAgo.setDate(weekAgo.getDate() - 7);
    const recentNotifications = await this.prisma.notification.count({
      where: { sentAt: { gte: weekAgo } },
    });

    // Notifications per day (last 7 days)
    const dailyStats = await this.prisma.$queryRaw<
      { day: string; count: bigint }[]
    >`SELECT DATE("sentAt") as day, COUNT(*) as count FROM "Notification" WHERE "sentAt" >= ${weekAgo} GROUP BY DATE("sentAt") ORDER BY day`;

    return {
      devices: {
        total: totalDevices + webSubscriptions,
        ios: iosDevices,
        android: totalDevices - iosDevices,
        web: webSubscriptions,
      },
      reachableUsers: uniqueUserIds.size,
      notifications: {
        total: totalNotifications,
        unread: unreadNotifications,
        lastWeek: recentNotifications,
      },
      engagement: {
        totalEvents,
        delivered: deliveredEvents,
        opened: openedEvents,
        openRate: deliveredEvents > 0 ? Math.round((openedEvents / deliveredEvents) * 100) : 0,
      },
      dailyStats: dailyStats.map((d) => ({
        day: d.day,
        count: Number(d.count),
      })),
    };
  }

  /* ─── Registered Devices ─── */

  @Get('devices')
  @ApiOperation({ summary: 'List registered push devices' })
  async getDevices(@Query('page') page = 1, @Query('limit') limit = 50) {
    const p = Number(page) || 1;
    const l = Math.min(Number(limit) || 50, 100);

    const [data, total] = await Promise.all([
      this.prisma.deviceToken.findMany({
        skip: (p - 1) * l,
        take: l,
        orderBy: { lastSeenAt: 'desc' },
        include: { user: { select: { id: true, name: true, email: true, avatar: true } } },
      }),
      this.prisma.deviceToken.count(),
    ]);

    const webSubs = await this.prisma.pushSubscription.findMany({
      take: l,
      orderBy: { createdAt: 'desc' },
      include: { user: { select: { id: true, name: true, email: true, avatar: true } } },
    });

    return { devices: data, webSubscriptions: webSubs, total, page: p };
  }

  /* ─── Notification History ─── */

  @Get('history')
  @ApiOperation({ summary: 'Notification send history' })
  async getHistory(@Query('page') page = 1, @Query('limit') limit = 30, @Query('type') type?: string) {
    const p = Number(page) || 1;
    const l = Math.min(Number(limit) || 30, 100);
    const where: any = {};
    if (type) where.type = type;

    const [data, total] = await Promise.all([
      this.prisma.notification.findMany({
        where,
        skip: (p - 1) * l,
        take: l,
        orderBy: { sentAt: 'desc' },
        include: { user: { select: { id: true, name: true, email: true } } },
      }),
      this.prisma.notification.count({ where }),
    ]);

    return { data, total, page: p, pages: Math.ceil(total / l) };
  }

  /* ─── Send Notification ─── */

  @Post('send')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Send push notification to selected users' })
  async sendNotification(
    @Body()
    body: {
      title: string;
      body: string;
      target: 'all' | 'clients' | 'operators' | 'specific';
      userIds?: string[];
      type?: NotifType;
      url?: string;
      imageUrl?: string;
    },
  ) {
    const { title, body: msgBody, target, userIds, type, url, imageUrl } = body;
    const notifType = type || 'GENERAL';

    let targetUserIds: string[] = [];

    if (target === 'specific' && userIds?.length) {
      targetUserIds = userIds;
    } else {
      const where: any = {};
      if (target === 'clients') where.role = 'CLIENT';
      else if (target === 'operators') where.role = 'OPERATOR';

      const users = await this.prisma.user.findMany({
        where: { ...where, isActive: true },
        select: { id: true },
      });
      targetUserIds = users.map((u) => u.id);
    }

    if (targetUserIds.length === 0) {
      return { sent: 0, message: 'Nenhum usuário encontrado' };
    }

    // For specific users (small batch), use individual send for better tracking
    if (targetUserIds.length <= 10) {
      const results = await Promise.allSettled(
        targetUserIds.map((userId) =>
          this.notificationsService.send({
            userId,
            type: notifType,
            title,
            body: msgBody,
            url,
            imageUrl,
          }),
        ),
      );
      const sent = results.filter((r) => r.status === 'fulfilled').length;
      return { sent, total: targetUserIds.length, message: `Notificação enviada para ${sent} usuários` };
    }

    // Bulk send
    const result = await this.notificationsService.sendBulk(
      targetUserIds,
      notifType,
      title,
      msgBody,
      { url, imageUrl },
    );

    return { ...result, total: targetUserIds.length, message: `Notificação enviada para ${result.sent} usuários` };
  }

  /* ─── Send Test (single user) ─── */

  @Post('test')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Send a test push notification to yourself' })
  async sendTest(
    @Body() body: { userId: string; title?: string; body?: string },
  ) {
    const title = body.title || '🔔 Teste Push';
    const msg = body.body || 'Esta é uma notificação de teste do painel admin.';

    const notification = await this.notificationsService.send({
      userId: body.userId,
      type: 'GENERAL',
      title,
      body: msg,
    });

    return { success: true, notificationId: notification.id };
  }

  /* ─── Users with push enabled ─── */

  @Get('users')
  @ApiOperation({ summary: 'List users available for targeting' })
  async getUsers(@Query('search') search?: string) {
    const where: any = { isActive: true };
    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { email: { contains: search, mode: 'insensitive' } },
      ];
    }

    const users = await this.prisma.user.findMany({
      where,
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        avatar: true,
        _count: {
          select: {
            deviceTokens: true,
            pushSubscriptions: true,
          },
        },
      },
      orderBy: { name: 'asc' },
      take: 50,
    });

    return users.map((u) => ({
      ...u,
      pushEnabled: u._count.deviceTokens > 0 || u._count.pushSubscriptions > 0,
      deviceCount: u._count.deviceTokens + u._count.pushSubscriptions,
    }));
  }
}
