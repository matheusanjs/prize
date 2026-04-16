import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { FuelController } from './fuel.controller';
import { FuelService } from './fuel.service';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [ConfigModule, NotificationsModule],
  controllers: [FuelController],
  providers: [FuelService],
  exports: [FuelService],
})
export class FuelModule {}
