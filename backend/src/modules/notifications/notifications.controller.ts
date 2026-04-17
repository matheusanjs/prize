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
    @Body() body: { token: string; platform?: string },
  ) {
    return this.pushService.registerDeviceToken(userId, body.token, body.platform || 'ios');
  }

  @Delete('push/device-token')
  @ApiOperation({ summary: 'Remover device token' })
  removeDeviceToken(@Body() body: { token: string }) {
    return this.pushService.removeDeviceToken(body.token);
  }

  @Delete('push/unsubscribe')
  @ApiOperation({ summary: 'Remover subscrição push' })
  unsubscribe(@Body() body: { endpoint: string }) {
    return this.pushService.unsubscribe(body.endpoint);
  }
}
