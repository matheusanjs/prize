import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../../database/prisma.service';
import { WhatsAppMessagingService } from './whatsapp-messaging.service';
import { WhatsAppConnectionService } from './whatsapp-connection.service';

@Injectable()
export class WhatsAppAutomationService {
  private readonly logger = new Logger(WhatsAppAutomationService.name);

  constructor(
    private prisma: PrismaService,
    private messaging: WhatsAppMessagingService,
    private connection: WhatsAppConnectionService,
  ) {}

  // ================================================================
  // RESERVATION CONFIRMATION — every day at 09:00
  // Ask clients if they confirm today's reservations
  // ================================================================
  @Cron('0 9 * * *', { timeZone: 'America/Sao_Paulo' })
  async sendReservationConfirmations() {
    if (!this.connection.isConnected()) {
      this.logger.warn('WhatsApp not connected, skipping reservation confirmations');
      return;
    }

    this.logger.log('📱 Sending WhatsApp reservation confirmations...');

    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayEnd = new Date();
    todayEnd.setHours(23, 59, 59, 999);

    const todayReservations = await this.prisma.reservation.findMany({
      where: {
        status: { in: ['PENDING', 'CONFIRMED'] },
        confirmedAt: null,
        startDate: { gte: todayStart, lte: todayEnd },
      },
      include: {
        user: { select: { id: true, name: true, phone: true } },
        boat: { select: { name: true } },
      },
    });

    let sent = 0;
    for (const res of todayReservations) {
      if (!res.user.phone) continue;

      // Check if we already sent confirmation for this reservation today
      const alreadySent = await this.prisma.whatsAppMessage.findFirst({
        where: {
          referenceId: res.id,
          referenceType: 'RESERVATION',
          category: 'RESERVATION_CONFIRM',
          createdAt: { gte: todayStart },
        },
      });
      if (alreadySent) continue;

      const startTime = new Date(res.startDate).toLocaleTimeString('pt-BR', {
        hour: '2-digit',
        minute: '2-digit',
        timeZone: 'America/Sao_Paulo',
      });
      const endTime = new Date(res.endDate).toLocaleTimeString('pt-BR', {
        hour: '2-digit',
        minute: '2-digit',
        timeZone: 'America/Sao_Paulo',
      });

      const body =
        `🚤 *Marina Prize Club*\n\n` +
        `Olá, *${res.user.name.split(' ')[0]}*! Você tem uma reserva hoje:\n\n` +
        `🛥️ *${res.boat?.name}*\n` +
        `⏰ Horário: *${startTime} — ${endTime}*\n\n` +
        `Você confirma sua presença?\n\n` +
        `*1* — ✅ Sim, confirmo\n` +
        `*2* — ❌ Não, cancelar\n\n` +
        `Responda apenas com o número.`;

      const result = await this.messaging.send({
        phone: res.user.phone,
        body,
        category: 'RESERVATION_CONFIRM',
        referenceId: res.id,
        referenceType: 'RESERVATION',
        userId: res.user.id,
      });

      if (result.sent) sent++;
    }

    this.logger.log(`✅ ${sent}/${todayReservations.length} reservation confirmations sent`);
  }

  // ================================================================
  // PAYMENT DUE TODAY — every day at 08:00
  // ================================================================
  @Cron('0 8 * * *', { timeZone: 'America/Sao_Paulo' })
  async sendDueTodayReminders() {
    if (!this.connection.isConnected()) return;

    this.logger.log('💳 Sending due-today WhatsApp reminders...');

    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayEnd = new Date();
    todayEnd.setHours(23, 59, 59, 999);

    const charges = await this.prisma.charge.findMany({
      where: {
        status: 'PENDING',
        dueDate: { gte: todayStart, lte: todayEnd },
      },
      include: {
        user: { select: { id: true, name: true, phone: true } },
      },
    });

    let sent = 0;
    for (const charge of charges) {
      if (!charge.user.phone) continue;

      const alreadySent = await this.prisma.whatsAppMessage.findFirst({
        where: {
          referenceId: charge.id,
          referenceType: 'CHARGE',
          category: 'DUE_TODAY',
          createdAt: { gte: todayStart },
        },
      });
      if (alreadySent) continue;

      const body =
        `⚠️ *Marina Prize Club — Vencimento Hoje*\n\n` +
        `Olá, *${charge.user.name.split(' ')[0]}*!\n\n` +
        `Sua fatura vence *hoje*:\n\n` +
        `📋 *${charge.description}*\n` +
        `💰 Valor: *R$ ${charge.amount.toFixed(2)}*\n\n` +
        `Acesse o app para pagar via Pix. Evite juros e bloqueios!\n\n` +
        `📱 app.marinaprizeclub.com`;

      const result = await this.messaging.send({
        phone: charge.user.phone,
        body,
        category: 'DUE_TODAY',
        referenceId: charge.id,
        referenceType: 'CHARGE',
        userId: charge.user.id,
      });

      if (result.sent) sent++;
    }

    this.logger.log(`✅ ${sent} due-today reminders sent`);
  }

  // ================================================================
  // PAYMENT REMINDER — 3 days before due date, at 10:00
  // ================================================================
  @Cron('0 10 * * *', { timeZone: 'America/Sao_Paulo' })
  async sendPaymentReminders() {
    if (!this.connection.isConnected()) return;

    this.logger.log('🔔 Sending payment reminder WhatsApp messages...');

    const threeDaysFromNow = new Date();
    threeDaysFromNow.setDate(threeDaysFromNow.getDate() + 3);
    threeDaysFromNow.setHours(23, 59, 59, 999);

    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(0, 0, 0, 0);

    const charges = await this.prisma.charge.findMany({
      where: {
        status: 'PENDING',
        dueDate: { gte: tomorrow, lte: threeDaysFromNow },
      },
      include: {
        user: { select: { id: true, name: true, phone: true } },
      },
    });

    let sent = 0;
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    for (const charge of charges) {
      if (!charge.user.phone) continue;

      const alreadySent = await this.prisma.whatsAppMessage.findFirst({
        where: {
          referenceId: charge.id,
          referenceType: 'CHARGE',
          category: 'PAYMENT_REMINDER',
          createdAt: { gte: todayStart },
        },
      });
      if (alreadySent) continue;

      const dueDate = new Date(charge.dueDate).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' });

      const body =
        `🔔 *Marina Prize Club — Lembrete de Pagamento*\n\n` +
        `Olá, *${charge.user.name.split(' ')[0]}*!\n\n` +
        `Você tem uma fatura próxima do vencimento:\n\n` +
        `📋 *${charge.description}*\n` +
        `💰 Valor: *R$ ${charge.amount.toFixed(2)}*\n` +
        `📅 Vencimento: *${dueDate}*\n\n` +
        `Acesse o app para pagar:\n📱 app.marinaprizeclub.com`;

      const result = await this.messaging.send({
        phone: charge.user.phone,
        body,
        category: 'PAYMENT_REMINDER',
        referenceId: charge.id,
        referenceType: 'CHARGE',
        userId: charge.user.id,
      });

      if (result.sent) sent++;
    }

    this.logger.log(`✅ ${sent} payment reminders sent`);
  }

  // ================================================================
  // OVERDUE ALERT — every day at 11:00
  // ================================================================
  @Cron('0 11 * * *', { timeZone: 'America/Sao_Paulo' })
  async sendOverdueAlerts() {
    if (!this.connection.isConnected()) return;

    this.logger.log('🚨 Sending overdue WhatsApp alerts...');

    const now = new Date();
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const overdueCharges = await this.prisma.charge.findMany({
      where: {
        status: { in: ['PENDING', 'OVERDUE'] },
        dueDate: { lt: todayStart },
      },
      include: {
        user: { select: { id: true, name: true, phone: true } },
      },
    });

    // Group by user to avoid spamming
    const byUser: Record<string, typeof overdueCharges> = {};
    for (const c of overdueCharges) {
      if (!c.user.phone) continue;
      if (!byUser[c.userId]) byUser[c.userId] = [];
      byUser[c.userId].push(c);
    }

    let sent = 0;
    for (const [userId, charges] of Object.entries(byUser)) {
      // Only send once per day per user
      const alreadySent = await this.prisma.whatsAppMessage.findFirst({
        where: {
          userId,
          category: 'OVERDUE',
          createdAt: { gte: todayStart },
        },
      });
      if (alreadySent) continue;

      const user = charges[0].user;
      const totalAmount = charges.reduce((sum, c) => sum + c.amount, 0);

      const body =
        `🚨 *Marina Prize Club — Cobranças em Atraso*\n\n` +
        `Olá, *${user.name.split(' ')[0]}*!\n\n` +
        `Você possui *${charges.length} fatura(s)* em atraso:\n` +
        `💰 Total: *R$ ${totalAmount.toFixed(2)}*\n\n` +
        `⚠️ Faturas em atraso podem resultar em bloqueio de reservas.\n\n` +
        `Regularize agora pelo app:\n📱 app.marinaprizeclub.com`;

      const result = await this.messaging.send({
        phone: user.phone!,
        body,
        category: 'OVERDUE',
        userId,
      });

      if (result.sent) sent++;
    }

    this.logger.log(`✅ ${sent} overdue alerts sent`);
  }

  // ================================================================
  // INSTANT: Send charge notification when a charge is created.
  // Called programmatically from FinanceService.
  // ================================================================
  async sendChargeCreatedNotification(chargeId: string) {
    if (!this.connection.isConnected()) return;

    const charge = await this.prisma.charge.findUnique({
      where: { id: chargeId },
      include: {
        user: { select: { id: true, name: true, phone: true } },
      },
    });

    if (!charge?.user?.phone) return;

    const dueDate = new Date(charge.dueDate).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' });

    const body =
      `💳 *Marina Prize Club — Nova Cobrança*\n\n` +
      `Olá, *${charge.user.name.split(' ')[0]}*!\n\n` +
      `Uma nova cobrança foi gerada:\n\n` +
      `📋 *${charge.description}*\n` +
      `💰 Valor: *R$ ${charge.amount.toFixed(2)}*\n` +
      `📅 Vencimento: *${dueDate}*\n\n` +
      `Pague via Pix no app:\n📱 app.marinaprizeclub.com`;

    await this.messaging.send({
      phone: charge.user.phone,
      body,
      category: 'CHARGE_CREATED',
      referenceId: charge.id,
      referenceType: 'CHARGE',
      userId: charge.user.id,
    });
  }

  // ================================================================
  // INSTANT: Send reservation confirmation when created same-day.
  // Called from ReservationsService.
  // ================================================================
  async sendInstantReservationConfirmation(reservationId: string) {
    if (!this.connection.isConnected()) return;

    const reservation = await this.prisma.reservation.findUnique({
      where: { id: reservationId },
      include: {
        user: { select: { id: true, name: true, phone: true } },
        boat: { select: { name: true } },
      },
    });

    if (!reservation?.user?.phone) return;

    const startTime = new Date(reservation.startDate).toLocaleTimeString('pt-BR', {
      hour: '2-digit',
      minute: '2-digit',
      timeZone: 'America/Sao_Paulo',
    });
    const endTime = new Date(reservation.endDate).toLocaleTimeString('pt-BR', {
      hour: '2-digit',
      minute: '2-digit',
      timeZone: 'America/Sao_Paulo',
    });

    const body =
      `🚤 *Marina Prize Club*\n\n` +
      `Olá, *${reservation.user.name.split(' ')[0]}*! Sua reserva para hoje:\n\n` +
      `🛥️ *${reservation.boat?.name}*\n` +
      `⏰ Horário: *${startTime} — ${endTime}*\n\n` +
      `Você confirma sua presença?\n\n` +
      `*1* — ✅ Sim, confirmo\n` +
      `*2* — ❌ Não, cancelar\n\n` +
      `Responda apenas com o número.`;

    await this.messaging.send({
      phone: reservation.user.phone,
      body,
      category: 'RESERVATION_CONFIRM',
      referenceId: reservation.id,
      referenceType: 'RESERVATION',
      userId: reservation.user.id,
    });
  }

  // ================================================================
  // ADMIN: Send custom message to a user.
  // ================================================================
  async sendCustomMessage(phone: string, body: string, userId?: string) {
    return this.messaging.send({
      phone,
      body,
      category: 'CUSTOM',
      userId,
    });
  }

  // ================================================================
  // INSTANT: Welcome notification after user registration.
  // ================================================================
  async sendWelcomeNotification(userId: string) {
    if (!this.connection.isConnected()) return;

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, name: true, phone: true },
    });
    if (!user?.phone) return;

    const body =
      `🎉 *Bem-vindo à Marina Prize Club!*\n\n` +
      `Olá, *${user.name.split(' ')[0]}*!\n\n` +
      `Seu cadastro foi realizado com sucesso. ✅\n\n` +
      `Pelo WhatsApp você pode:\n` +
      `📋 Ver suas reservas\n` +
      `📅 Criar novas reservas\n` +
      `💰 Consultar cobranças\n` +
      `⛽ Ver combustível\n\n` +
      `Digite *menu* a qualquer momento para ver os comandos.\n\n` +
      `📱 Acesse também pelo app:\napp.marinaprizeclub.com`;

    await this.messaging.send({
      phone: user.phone,
      body,
      category: 'WELCOME',
      userId: user.id,
    });
  }

  // ================================================================
  // INSTANT: Notification when a share/quota is purchased.
  // ================================================================
  async sendSharePurchaseNotification(userId: string, boatName: string, shareNumber: number, totalValue: number, installments: number) {
    if (!this.connection.isConnected()) return;

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, name: true, phone: true },
    });
    if (!user?.phone) return;

    const body =
      `🚤 *Marina Prize Club — Nova Cota!*\n\n` +
      `Parabéns, *${user.name.split(' ')[0]}*! 🎉\n\n` +
      `Sua cota foi registrada com sucesso:\n\n` +
      `🛥️ Embarcação: *${boatName}*\n` +
      `🔢 Cota nº: *${shareNumber}*\n` +
      `💰 Valor total: *R$ ${totalValue.toFixed(2)}*\n` +
      `📊 Parcelas: *${installments}x*\n\n` +
      `As cobranças foram geradas automaticamente.\n` +
      `Digite *4* para ver suas cobranças.\n\n` +
      `📱 app.marinaprizeclub.com`;

    await this.messaging.send({
      phone: user.phone,
      body,
      category: 'SHARE_PURCHASE',
      userId: user.id,
    });
  }

  // ================================================================
  // INSTANT: Notification when a payment is confirmed.
  // ================================================================
  async sendPaymentConfirmedNotification(chargeId: string) {
    if (!this.connection.isConnected()) return;

    const charge = await this.prisma.charge.findUnique({
      where: { id: chargeId },
      include: {
        user: { select: { id: true, name: true, phone: true } },
      },
    });
    if (!charge?.user?.phone) return;

    // Check remaining charges
    const remaining = await this.prisma.charge.count({
      where: {
        userId: charge.userId,
        status: { in: ['PENDING', 'OVERDUE'] },
        deletedAt: null,
      },
    });

    const body =
      `✅ *Pagamento Confirmado!*\n\n` +
      `Olá, *${charge.user.name.split(' ')[0]}*!\n\n` +
      `Recebemos seu pagamento:\n\n` +
      `📋 *${charge.description}*\n` +
      `💰 Valor: *R$ ${charge.amount.toFixed(2)}*\n\n` +
      (remaining > 0
        ? `📊 Você ainda tem *${remaining}* cobrança(s) pendente(s).\nDigite *4* para ver detalhes.`
        : `🎉 Você está em dia! Nenhuma cobrança pendente.`) +
      `\n\n📱 app.marinaprizeclub.com`;

    await this.messaging.send({
      phone: charge.user.phone,
      body,
      category: 'PAYMENT_CONFIRMED',
      referenceId: charge.id,
      referenceType: 'CHARGE',
      userId: charge.user.id,
    });
  }

  // ================================================================
  // ADMIN: Broadcast to all clients.
  // ================================================================
  async broadcastToClients(body: string) {
    const clients = await this.prisma.user.findMany({
      where: { role: 'CLIENT', isActive: true, phone: { not: null } },
      select: { id: true, phone: true },
    });

    let sent = 0;
    for (const client of clients) {
      if (!client.phone) continue;
      const result = await this.messaging.send({
        phone: client.phone,
        body,
        category: 'CUSTOM',
        userId: client.id,
      });
      if (result.sent) sent++;
      // Small delay to avoid rate limiting
      await new Promise((r) => setTimeout(r, 1500));
    }

    return { total: clients.length, sent };
  }

  // ================================================================
  // SWAP: Notify target user about new swap request
  // ================================================================
  async sendSwapRequestNotification(swapId: string) {
    if (!this.connection.isConnected()) return;

    const swap = await this.prisma.reservationSwap.findUnique({
      where: { id: swapId },
      include: {
        reservation: {
          include: {
            boat: { select: { name: true } },
            user: { select: { id: true, name: true, phone: true } },
          },
        },
        offeredReservation: {
          include: {
            user: { select: { id: true, name: true, phone: true } },
          },
        },
        requester: { select: { id: true, name: true, phone: true } },
        targetUser: { select: { id: true, name: true, phone: true } },
      },
    });

    if (!swap) return;

    const fmtDate = (d: Date) => d.toLocaleDateString('pt-BR', {
      weekday: 'short', day: '2-digit', month: '2-digit',
      timeZone: 'America/Sao_Paulo',
    });
    const fmtTime = (d: Date) => d.toLocaleTimeString('pt-BR', {
      hour: '2-digit', minute: '2-digit',
      timeZone: 'America/Sao_Paulo',
    });

    const boatName = swap.reservation.boat?.name || 'Embarcação';
    const requesterName = swap.requester.name.split(' ')[0];
    const targetDate = `${fmtDate(swap.reservation.startDate)} ${fmtTime(swap.reservation.startDate)}-${fmtTime(swap.reservation.endDate)}`;
    const offeredDate = `${fmtDate(swap.offeredReservation.startDate)} ${fmtTime(swap.offeredReservation.startDate)}-${fmtTime(swap.offeredReservation.endDate)}`;

    // Notify TARGET user (who receives the swap request)
    if (swap.targetUser?.phone) {
      const body =
        `🔄 *Solicitação de Troca de Data*\n\n` +
        `*${requesterName}* quer trocar de data com você!\n\n` +
        `🚤 *${boatName}*\n` +
        `📅 Sua data: *${targetDate}*\n` +
        `📅 Data oferecida: *${offeredDate}*\n` +
        `${swap.message ? `💬 Mensagem: _${swap.message}_\n` : ''}` +
        `\n*1* — ✅ Aceitar troca\n` +
        `*2* — ❌ Recusar troca\n\n` +
        `Responda apenas com o número.`;

      await this.messaging.send({
        phone: swap.targetUser.phone,
        body,
        category: 'SWAP_REQUEST',
        referenceId: swap.id,
        referenceType: 'RESERVATION_SWAP',
        userId: swap.targetUser.id,
      });
    }

    // Notify REQUESTER that their request was sent
    if (swap.requester?.phone) {
      const targetName = swap.targetUser?.name?.split(' ')[0] || 'cotista';
      const body =
        `🔄 *Troca de Data Solicitada*\n\n` +
        `Sua solicitação foi enviada para *${targetName}*.\n\n` +
        `🚤 *${boatName}*\n` +
        `📅 Sua data atual: *${offeredDate}*\n` +
        `📅 Data desejada: *${targetDate}*\n\n` +
        `_Aguardando resposta do cotista..._`;

      await this.messaging.send({
        phone: swap.requester.phone,
        body,
        category: 'SWAP_SENT',
        userId: swap.requester.id,
      });
    }
  }

  // ================================================================
  // SWAP: Notify both users about swap response
  // ================================================================
  async sendSwapResponseNotification(swapId: string) {
    if (!this.connection.isConnected()) return;

    const swap = await this.prisma.reservationSwap.findUnique({
      where: { id: swapId },
      include: {
        reservation: {
          include: {
            boat: { select: { name: true } },
          },
        },
        offeredReservation: true,
        requester: { select: { id: true, name: true, phone: true } },
        targetUser: { select: { id: true, name: true, phone: true } },
      },
    });

    if (!swap) return;

    const fmtDate = (d: Date) => d.toLocaleDateString('pt-BR', {
      weekday: 'short', day: '2-digit', month: '2-digit',
      timeZone: 'America/Sao_Paulo',
    });
    const fmtTime = (d: Date) => d.toLocaleTimeString('pt-BR', {
      hour: '2-digit', minute: '2-digit',
      timeZone: 'America/Sao_Paulo',
    });

    const boatName = swap.reservation.boat?.name || 'Embarcação';
    const accepted = swap.status === 'ACCEPTED';

    if (accepted) {
      // After swap, dates have been exchanged — show new dates
      const requesterNewDate = `${fmtDate(swap.offeredReservation.startDate)} ${fmtTime(swap.offeredReservation.startDate)}-${fmtTime(swap.offeredReservation.endDate)}`;
      const targetNewDate = `${fmtDate(swap.reservation.startDate)} ${fmtTime(swap.reservation.startDate)}-${fmtTime(swap.reservation.endDate)}`;

      // Notify REQUESTER
      if (swap.requester?.phone) {
        const body =
          `✅ *Troca de Data Aceita!*\n\n` +
          `*${swap.targetUser?.name?.split(' ')[0]}* aceitou sua troca!\n\n` +
          `🚤 *${boatName}*\n` +
          `📅 Sua nova data: *${requesterNewDate}*\n\n` +
          `Boa navegação! 🌊`;

        await this.messaging.send({
          phone: swap.requester.phone,
          body,
          category: 'SWAP_RESPONSE',
          userId: swap.requester.id,
        });
      }

      // Notify TARGET
      if (swap.targetUser?.phone) {
        const body =
          `✅ *Troca de Data Confirmada!*\n\n` +
          `Você aceitou a troca com *${swap.requester?.name?.split(' ')[0]}*.\n\n` +
          `🚤 *${boatName}*\n` +
          `📅 Sua nova data: *${targetNewDate}*\n\n` +
          `Boa navegação! 🌊`;

        await this.messaging.send({
          phone: swap.targetUser.phone,
          body,
          category: 'SWAP_RESPONSE',
          userId: swap.targetUser.id,
        });
      }
    } else {
      // Rejected — notify requester only
      if (swap.requester?.phone) {
        const body =
          `❌ *Troca de Data Recusada*\n\n` +
          `*${swap.targetUser?.name?.split(' ')[0]}* recusou sua solicitação de troca.\n\n` +
          `🚤 *${boatName}*\n\n` +
          `_Suas datas permanecem inalteradas._`;

        await this.messaging.send({
          phone: swap.requester.phone,
          body,
          category: 'SWAP_RESPONSE',
          userId: swap.requester.id,
        });
      }
    }
  }
}
