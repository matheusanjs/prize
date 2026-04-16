import { Module, Global, forwardRef } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { DatabaseModule } from '../../database/database.module';
import { WeatherModule } from '../weather/weather.module';
import { OperationsModule } from '../operations/operations.module';
import { FuelModule } from '../fuel/fuel.module';
import { PaymentsModule } from '../payments/payments.module';
import { WhatsAppConnectionService } from './whatsapp-connection.service';
import { WhatsAppMessagingService } from './whatsapp-messaging.service';
import { WhatsAppAutomationService } from './whatsapp-automation.service';
import { WhatsAppIncomingService } from './whatsapp-incoming.service';
import { WhatsAppChatService } from './whatsapp-chat.service';
import { WhatsAppGroupService } from './whatsapp-group.service';
import { WhatsAppController } from './whatsapp.controller';

@Global()
@Module({
  imports: [DatabaseModule, WeatherModule, OperationsModule, FuelModule, ConfigModule, forwardRef(() => PaymentsModule)],
  controllers: [WhatsAppController],
  providers: [
    WhatsAppConnectionService,
    WhatsAppMessagingService,
    WhatsAppChatService,
    WhatsAppAutomationService,
    WhatsAppIncomingService,
    WhatsAppGroupService,
  ],
  exports: [
    WhatsAppConnectionService,
    WhatsAppMessagingService,
    WhatsAppAutomationService,
    WhatsAppChatService,
    WhatsAppGroupService,
  ],
})
export class WhatsAppModule {}
