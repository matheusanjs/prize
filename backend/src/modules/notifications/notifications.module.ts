import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { BullModule } from '@nestjs/bullmq';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';
import { PushService } from './push.service';
import { PushProcessor } from './push.processor';
import { NotificationCronService } from './notification-cron.service';

@Module({
  imports: [ConfigModule, BullModule.registerQueue({ name: 'push' })],
  controllers: [NotificationsController],
  providers: [NotificationsService, PushService, PushProcessor, NotificationCronService],
  exports: [NotificationsService, PushService],
})
export class NotificationsModule {}
