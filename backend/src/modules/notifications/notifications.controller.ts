import { Controller, Get, Post, Patch, Delete, Param, Query, Body, Headers, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { NotificationsService } from './notifications.service';
import { PushService } from './push.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@ApiTags('notifications')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('notifications')
export class NotificationsController {
  constructor(
    private notificationsService: NotificationsService,
    private pushService: PushService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Minhas notificações' })
  getMyNotifications(@CurrentUser('id') userId: string, @Query('page') page?: number) {
    return this.notificationsService.getUserNotifications(userId, page);
  }

  @Patch(':id/read')
  @ApiOperation({ summary: 'Marcar notificação como lida' })
  markAsRead(@Param('id') id: string) {
    return this.notificationsService.markAsRead(id);
  }

  @Patch('read-all')
  @ApiOperation({ summary: 'Marcar todas como lidas' })
  markAllAsRead(@CurrentUser('id') userId: string) {
    return this.notificationsService.markAllAsRead(userId);
  }

  /* ─── Push Subscription ─── */

  @Get('push/public-key')
  @ApiOperation({ summary: 'VAPID public key para subscrição push' })
  getPublicKey() {
    return { publicKey: this.pushService.getPublicKey() };
  }

  @Post('push/subscribe')
  @ApiOperation({ summary: 'Registrar subscrição push' })
  subscribe(
    @CurrentUser('id') userId: string,
    @Body() body: { subscription: { endpoint: string; keys: { p256dh: string; auth: string } } },
    @Headers('user-agent') userAgent?: string,
  ) {
    return this.pushService.subscribe(userId, body.subscription, userAgent);
  }

  @Post('push/device-token')
  @ApiOperation({ summary: 'Registrar device token (iOS/Android nativo)' })
  registerDeviceToken(
    @CurrentUser('id') userId: string,
    @Body() body: {
      token: string;
      platform?: string;
      deviceName?: string;
      osVersion?: string;
      appVersion?: string;
      locale?: string;
      timezone?: string;
      bundleId?: string;
      enabled?: boolean;
    },
  ) {
    return this.pushService.registerDeviceToken(userId, body.token, body.platform || 'ios', {
      deviceName: body.deviceName,
      osVersion: body.osVersion,
      appVersion: body.appVersion,
      locale: body.locale,
      timezone: body.timezone,
      bundleId: body.bundleId,
      enabled: body.enabled,
    });
  }

  @Delete('push/device-token')
  @ApiOperation({ summary: 'Remover device token' })
  removeDeviceToken(@Body() body: { token: string }) {
    return this.pushService.removeDeviceToken(body.token);
  }

  /* ─── Analytics ─── */

  @Post('push/events/delivered')
  @ApiOperation({ summary: 'Push recebido pelo dispositivo' })
  eventDelivered(
    @CurrentUser('id') userId: string,
    @Body() body: { token?: string; notificationId?: string; messageId?: string; data?: Record<string, any> },
  ) {
    return this.pushService.recordEvent(userId, { kind: 'DELIVERED', ...body });
  }

  @Post('push/events/opened')
  @ApiOperation({ summary: 'Usuário abriu notificação' })
  eventOpened(
    @CurrentUser('id') userId: string,
    @Body() body: { token?: string; notificationId?: string; messageId?: string; data?: Record<string, any> },
  ) {
    return this.pushService.recordEvent(userId, { kind: 'OPENED', ...body });
  }

  @Post('push/events/dismissed')
  @ApiOperation({ summary: 'Usuário dispensou notificação' })
  eventDismissed(
    @CurrentUser('id') userId: string,
    @Body() body: { token?: string; notificationId?: string; messageId?: string; data?: Record<string, any> },
  ) {
    return this.pushService.recordEvent(userId, { kind: 'DISMISSED', ...body });
  }

  @Post('push/events/action')
  @ApiOperation({ summary: 'Usuário usou ação interativa na notificação' })
  eventAction(
    @CurrentUser('id') userId: string,
    @Body() body: { token?: string; notificationId?: string; messageId?: string; actionId?: string; data?: Record<string, any> },
  ) {
    return this.pushService.recordEvent(userId, {
      kind: 'ACTION',
      token: body.token,
      notificationId: body.notificationId,
      messageId: body.messageId,
      data: { ...(body.data || {}), actionId: body.actionId },
    });
  }

  @Delete('push/unsubscribe')
  @ApiOperation({ summary: 'Remover subscrição push' })
  unsubscribe(@Body() body: { endpoint: string }) {
    return this.pushService.unsubscribe(body.endpoint);
  }
}
