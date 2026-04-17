import { Module } from '@nestjs/common';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { BullModule } from '@nestjs/bullmq';
import { ServeStaticModule } from '@nestjs/serve-static';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { join } from 'path';
import { DatabaseModule } from './database/database.module';
import { AuthModule } from './modules/auth/auth.module';import { UsersModule } from './modules/users/users.module';
import { BoatsModule } from './modules/boats/boats.module';
import { SharesModule } from './modules/shares/shares.module';
import { ReservationsModule } from './modules/reservations/reservations.module';
import { FinanceModule } from './modules/finance/finance.module';
import { FuelModule } from './modules/fuel/fuel.module';
import { MaintenanceModule } from './modules/maintenance/maintenance.module';
import { OperationsModule } from './modules/operations/operations.module';
import { QueueModule } from './modules/queue/queue.module';
import { AiModule } from './modules/ai/ai.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { JobsModule } from './jobs/jobs.module';
import { ShareSaleModule } from './modules/share-sale/share-sale.module';
import { MenuModule } from './modules/menu/menu.module';
import { OrdersModule } from './modules/orders/orders.module';
import { PdvModule } from './modules/pdv/pdv.module';
import { WaiterPanelModule } from './modules/waiter-panel/waiter-panel.module';
import { WeatherModule } from './modules/weather/weather.module';
import { PaymentsModule } from './modules/payments/payments.module';
import { WhatsAppModule } from './modules/whatsapp/whatsapp.module';
import { HealthModule } from './modules/health/health.module';
import { SocialModule } from './modules/social/social.module';
import { MailModule } from './modules/mail/mail.module';
import { DashboardModule } from './modules/dashboard/dashboard.module';
import { AuditLogInterceptor } from './interceptors/audit-log.interceptor';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ScheduleModule.forRoot(),
    ThrottlerModule.forRoot([
      { name: 'default', ttl: 60_000, limit: 300 },   // 300 req/min per IP globally
      { name: 'auth',    ttl: 60_000, limit: 10 },    // 10 attempts/min (login/register)
      { name: 'webhook', ttl: 60_000, limit: 120 },   // 120/min for webhooks
      { name: 'upload',  ttl: 60_000, limit: 30 },    // 30 uploads/min
    ]),
    ServeStaticModule.forRoot({
      rootPath: join(__dirname, '..', '..', 'uploads'),
      serveRoot: '/uploads',
    }),
    BullModule.forRoot({
      connection: {
        host: process.env.REDIS_HOST || 'localhost',
        port: parseInt(process.env.REDIS_PORT || '6379'),
        password: process.env.REDIS_PASSWORD || undefined,
      },
    }),
    DatabaseModule,
    AuthModule,
    UsersModule,
    BoatsModule,
    SharesModule,
    ReservationsModule,
    FinanceModule,
    FuelModule,
    MaintenanceModule,
    OperationsModule,
    QueueModule,
    AiModule,
    NotificationsModule,
    JobsModule,
    ShareSaleModule,
    MenuModule,
    OrdersModule,
    PdvModule,
    WaiterPanelModule,
    WeatherModule,
    PaymentsModule,
    WhatsAppModule,
    SocialModule,
    MailModule,
    HealthModule,
    DashboardModule,
  ],
  providers: [
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_INTERCEPTOR, useClass: AuditLogInterceptor },
  ],
})
export class AppModule {}
