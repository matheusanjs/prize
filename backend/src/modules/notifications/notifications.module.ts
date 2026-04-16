import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';
import { PushService } from './push.service';
import { NotificationCronService } from './notification-cron.service';

@Module({
  imports: [ConfigModule],
  controllers: [NotificationsController],
  providers: [NotificationsService, PushService, NotificationCronService],
  exports: [NotificationsService, PushService],
})
export class NotificationsModule {}
