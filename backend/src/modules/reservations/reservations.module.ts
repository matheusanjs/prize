import { Module } from '@nestjs/common';
import { ReservationsController } from './reservations.controller';
import { ReservationsService } from './reservations.service';
import { ReservationValidationService } from './reservation-validation.service';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [NotificationsModule],
  controllers: [ReservationsController],
  providers: [ReservationsService, ReservationValidationService],
  exports: [ReservationsService, ReservationValidationService],
})
export class ReservationsModule {}
