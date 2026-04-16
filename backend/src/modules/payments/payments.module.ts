import { Module, OnModuleInit, forwardRef } from '@nestjs/common';
import { WooviController } from './woovi.controller';
import { WooviService } from './woovi.service';
import { FinanceModule } from '../finance/finance.module';
import { FinanceService } from '../finance/finance.service';

@Module({
  imports: [forwardRef(() => FinanceModule)],
  controllers: [WooviController],
  providers: [WooviService],
  exports: [WooviService],
})
export class PaymentsModule implements OnModuleInit {
  constructor(
    private wooviService: WooviService,
    private financeService: FinanceService,
  ) {}

  async onModuleInit() {
    this.financeService.setWooviService(this.wooviService);
  }
}
