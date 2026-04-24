import { Module } from '@nestjs/common';
import { OrdersController, ConvenienceOrderController } from './orders.controller';
import { OrdersService } from './orders.service';
import { PaymentsModule } from '../payments/payments.module';

@Module({
  imports: [PaymentsModule],
  controllers: [OrdersController, ConvenienceOrderController],
  providers: [OrdersService],
  exports: [OrdersService],
})
export class OrdersModule {}
