import { Module } from '@nestjs/common';
import { ReservationsController } from './reservations.controller';
import { ReservationsService } from './reservations.service';
import { ReservationValidationService } from './reservation-validation.service';
import { ReservationsGateway } from './reservations.gateway';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [NotificationsModule],
  controllers: [ReservationsController],
  providers: [ReservationsService, ReservationValidationService, ReservationsGateway],
  exports: [ReservationsService, ReservationValidationService, ReservationsGateway],
})
export class ReservationsModule {}
