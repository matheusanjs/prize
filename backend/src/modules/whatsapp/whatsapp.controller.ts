import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Body,
  Query,
  UseGuards,
  HttpCode,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { WhatsAppConnectionService } from './whatsapp-connection.service';
import { WhatsAppMessagingService } from './whatsapp-messaging.service';
import { WhatsAppAutomationService } from './whatsapp-automation.service';
import { PrismaService } from '../../database/prisma.service';

@Controller('whatsapp')
@UseGuards(JwtAuthGuard, RolesGuard)
export class WhatsAppController {
  constructor(
    private connection: WhatsAppConnectionService,
    private messaging: WhatsAppMessagingService,
    private automation: WhatsAppAutomationService,
    private prisma: PrismaService,
  ) {}

  // ── Connection ─────────────────────────────────────────
  @Get('status')
  @Roles('ADMIN', 'OPERATOR')
  async getStatus() {
    return this.connection.getStatus();
  }

  @Post('connect')
  @Roles('ADMIN')
  @HttpCode(200)
  async connect() {
    return this.connection.connect();
  }

  @Post('disconnect')
  @Roles('ADMIN')
  @HttpCode(200)
  async disconnect() {
    await this.connection.disconnect();
    return { status: 'DISCONNECTED' };
  }

  // ── Messages ───────────────────────────────────────────
  @Get('messages')
  @Roles('ADMIN', 'OPERATOR')
  async getMessages(
    @Query('phone') phone?: string,
    @Query('category') category?: string,
    @Query('direction') direction?: string,
    @Query('userId') userId?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.messaging.getMessages({
      phone,
      category,
      direction,
      userId,
      page: page ? parseInt(page) : 1,
      limit: limit ? parseInt(limit) : 50,
    });
  }

  @Get('conversation')
  @Roles('ADMIN', 'OPERATOR')
  async getConversation(@Query('phone') phone: string) {
    return this.messaging.getConversation(phone);
  }

  @Get('conversations')
  @Roles('ADMIN', 'OPERATOR')
  async getConversations() {
    return this.messaging.getConversations();
  }

  // ── Send ───────────────────────────────────────────────
  @Post('send')
  @Roles('ADMIN')
  @HttpCode(200)
  async sendMessage(
    @Body() body: { phone: string; message: string; userId?: string },
  ) {
    return this.automation.sendCustomMessage(body.phone, body.message, body.userId);
  }

  @Post('broadcast')
  @Roles('ADMIN')
  @HttpCode(200)
  async broadcast(@Body() body: { message: string }) {
    return this.automation.broadcastToClients(body.message);
  }

  // ── Templates ──────────────────────────────────────────
  @Get('templates')
  @Roles('ADMIN')
  async getTemplates() {
    return this.prisma.whatsAppTemplate.findMany({
      orderBy: { createdAt: 'desc' },
    });
  }

  @Post('templates')
  @Roles('ADMIN')
  @HttpCode(201)
  async createTemplate(
    @Body() body: { slug: string; name: string; body: string; category: string },
  ) {
    return this.prisma.whatsAppTemplate.create({
      data: {
        slug: body.slug,
        name: body.name,
        body: body.body,
        category: body.category,
      },
    });
  }

  @Patch('templates/:id')
  @Roles('ADMIN')
  async updateTemplate(
    @Param('id') id: string,
    @Body() body: { name?: string; body?: string; category?: string; isActive?: boolean },
  ) {
    return this.prisma.whatsAppTemplate.update({
      where: { id },
      data: {
        ...(body.name !== undefined && { name: body.name }),
        ...(body.body !== undefined && { body: body.body }),
        ...(body.category !== undefined && { category: body.category }),
        ...(body.isActive !== undefined && { isActive: body.isActive }),
      },
    });
  }

  // ── Manual triggers ────────────────────────────────────
  @Post('trigger/reservation-confirmations')
  @Roles('ADMIN')
  @HttpCode(200)
  async triggerReservationConfirmations() {
    await this.automation.sendReservationConfirmations();
    return { ok: true };
  }

  @Post('trigger/payment-reminders')
  @Roles('ADMIN')
  @HttpCode(200)
  async triggerPaymentReminders() {
    await this.automation.sendPaymentReminders();
    return { ok: true };
  }

  @Post('trigger/overdue-alerts')
  @Roles('ADMIN')
  @HttpCode(200)
  async triggerOverdueAlerts() {
    await this.automation.sendOverdueAlerts();
    return { ok: true };
  }

  // ── Stats ──────────────────────────────────────────────
  @Get('stats')
  @Roles('ADMIN')
  async getStats() {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const [totalSent, totalReceived, todaySent, todayReceived, totalFailed] =
      await Promise.all([
        this.prisma.whatsAppMessage.count({
          where: { direction: 'OUTBOUND', status: { in: ['SENT', 'DELIVERED', 'READ'] } },
        }),
        this.prisma.whatsAppMessage.count({
          where: { direction: 'INBOUND' },
        }),
        this.prisma.whatsAppMessage.count({
          where: {
            direction: 'OUTBOUND',
            status: { in: ['SENT', 'DELIVERED', 'READ'] },
            createdAt: { gte: todayStart },
          },
        }),
        this.prisma.whatsAppMessage.count({
          where: {
            direction: 'INBOUND',
            createdAt: { gte: todayStart },
          },
        }),
        this.prisma.whatsAppMessage.count({
          where: { status: 'FAILED' },
        }),
      ]);

    return {
      totalSent,
      totalReceived,
      todaySent,
      todayReceived,
      totalFailed,
      connected: this.connection.isConnected(),
    };
  }
}
