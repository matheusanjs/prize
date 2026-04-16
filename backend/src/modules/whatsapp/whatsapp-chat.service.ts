import { Injectable, Logger, Optional, Inject } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GoogleGenerativeAI } from '@google/generative-ai';
import OpenAI from 'openai';
import { PrismaService } from '../../database/prisma.service';
import { WhatsAppMessagingService } from './whatsapp-messaging.service';
import { WeatherService } from '../weather/weather.service';
import { WooviService } from '../payments/woovi.service';

@Injectable()
export class WhatsAppChatService {
  private readonly logger = new Logger(WhatsAppChatService.name);
  private genAI: GoogleGenerativeAI;
  private geminiModel: string;
  private openai: OpenAI | null = null;

  /** Pending reservation creations awaiting SIM/NÃO confirmation: phone → data */
  private pendingCreations = new Map<string, {
    userId: string;
    boatId: string;
    boatName: string;
    startDate: Date;
    endDate: Date;
    expiresAt: Date;
  }>();

  /** Pending PIX charge selection: phone → list of charge IDs */
  private pendingPixSelection = new Map<string, {
    userId: string;
    chargeIds: string[];
    expiresAt: Date;
  }>();

  constructor(
    private config: ConfigService,
    private prisma: PrismaService,
    private messaging: WhatsAppMessagingService,
    @Optional() @Inject(WooviService) private wooviService?: WooviService,
    @Optional() @Inject(WeatherService) private weatherService?: WeatherService,
  ) {
    this.genAI = new GoogleGenerativeAI(
      this.config.get<string>('GEMINI_API_KEY')!,
    );
    this.geminiModel = this.config.get<string>(
      'GEMINI_MODEL',
      'gemini-2.0-flash',
    );
    const openaiKey = this.config.get<string>('OPENAI_API_KEY');
    if (openaiKey) this.openai = new OpenAI({ apiKey: openaiKey, baseURL: 'https://api.openai.com/v1' });
  }

  // ================================================================
  // PUBLIC — main entry point called by incoming service
  // ================================================================

  /**
   * Authenticate user by phone and process their message.
   * Returns true if the message was handled (user found), false otherwise.
   */
  async processAuthenticatedMessage(
    phone: string,
    text: string,
  ): Promise<boolean> {
    const user = await this.findUserByPhone(phone);

    if (!user) {
      return false; // Not authenticated — caller handles unauthenticated flow
    }

    this.logger.log(
      `Authenticated user ${user.name} (${user.id}) via phone ${phone}`,
    );

    try {
      await this.handleUserMessage(user, phone, text);
    } catch (err: any) {
      this.logger.error(
        `Error processing message for ${user.id}: ${err.message}`,
      );
      // AI unavailable — send the menu as a graceful fallback
      await this.sendMenu(user, phone);
    }

    return true;
  }

  // ================================================================
  // PRIVATE — user lookup
  // ================================================================

  private async findUserByPhone(phone: string): Promise<{
    id: string;
    name: string;
    email: string;
    phone: string | null;
    role: string;
  } | null> {
    const cleanPhone = phone.startsWith('55') ? phone.substring(2) : phone;

    return this.prisma.user.findFirst({
      where: {
        isActive: true,
        OR: [
          { phone: cleanPhone },
          { phone },
          { phone: { endsWith: cleanPhone.slice(-8) } },
        ],
      },
      select: { id: true, name: true, email: true, phone: true, role: true },
    });
  }

  // ================================================================
  // PRIVATE — message router
  // ================================================================

  private async handleUserMessage(
    user: { id: string; name: string; role: string },
    phone: string,
    text: string,
  ) {
    const lower = text.toLowerCase().trim();

    // Quick-command shortcuts
    if (lower === 'menu' || lower === 'ajuda' || lower === 'help') {
      return this.sendMenu(user, phone);
    }

    // Check for pending reservation confirmation first (1/2 reply)
    if (lower === '1' || lower === '2') {
      const handled = await this.handleReservationReply(user.id, phone, lower);
      if (handled) return;

      // Check for pending swap request (1=accept, 2=reject)
      const swapHandled = await this.handleSwapReply(user.id, phone, lower);
      if (swapHandled) return;
    }

    // Check for pending PIX charge selection
    const pendingPix = this.pendingPixSelection.get(phone);
    if (pendingPix) {
      if (new Date() > pendingPix.expiresAt) {
        this.pendingPixSelection.delete(phone);
      } else {
        const num = parseInt(lower, 10);
        if (num >= 1 && num <= pendingPix.chargeIds.length) {
          this.pendingPixSelection.delete(phone);
          return this.sendPixForCharge(user, phone, pendingPix.chargeIds[num - 1]);
        }
      }
    }

    // Check for pending reservation creation (SIM/NÃO)
    const pending = this.pendingCreations.get(phone);
    if (pending) {
      if (new Date() > pending.expiresAt) {
        this.pendingCreations.delete(phone);
      } else {
        const handled = await this.handlePendingCreationReply(user, phone, lower);
        if (handled) return;
      }
    }

    // Use AI to classify intent and respond
    await this.handleWithAI(user, phone, text);
  }

  // ================================================================
  // MENU
  // ================================================================

  private async sendMenu(
    user: { id: string; name: string },
    phone: string,
  ) {
    const menu = await this.messaging.resolveTemplate('welcome_menu', {
      nome: user.name.split(' ')[0],
    }) || `Olá, *${user.name.split(' ')[0]}*! Digite um número de 1 a 6 ou sua pergunta.`;

    await this.messaging.send({
      phone,
      body: menu,
      userId: user.id,
      category: 'MENU',
    });
  }

  // ================================================================
  // RESERVATION CONFIRMATION (1/2)
  // ================================================================

  private async handleReservationReply(
    userId: string,
    phone: string,
    reply: string,
  ): Promise<boolean> {
    const lastConfirmMsg = await this.prisma.whatsAppMessage.findFirst({
      where: {
        userId,
        category: 'RESERVATION_CONFIRM',
        direction: 'OUTBOUND',
        status: { in: ['SENT', 'DELIVERED'] },
      },
      orderBy: { createdAt: 'desc' },
    });

    if (!lastConfirmMsg?.referenceId) return false;

    const reservation = await this.prisma.reservation.findUnique({
      where: { id: lastConfirmMsg.referenceId },
      include: { boat: true },
    });

    if (!reservation) return false;

    if (
      reservation.status === 'CONFIRMED' &&
      reservation.confirmedAt
    ) {
      await this.messaging.send({
        phone,
        body: `✅ Sua reserva do *${reservation.boat?.name}* já está confirmada!`,
        userId,
        category: 'RESPONSE',
      });
      return true;
    }

    if (reservation.status === 'CANCELLED') {
      await this.messaging.send({
        phone,
        body: '⚠️ Esta reserva já foi cancelada.',
        userId,
        category: 'RESPONSE',
      });
      return true;
    }

    if (reply === '1') {
      await this.prisma.reservation.update({
        where: { id: reservation.id },
        data: { status: 'CONFIRMED', confirmedAt: new Date() },
      });
      await this.prisma.whatsAppMessage.update({
        where: { id: lastConfirmMsg.id },
        data: { status: 'READ', readAt: new Date() },
      });

      const startTime = new Date(reservation.startDate).toLocaleTimeString(
        'pt-BR',
        { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' },
      );

      await this.messaging.send({
        phone,
        body: `✅ *Reserva confirmada!*\n\n🚤 ${reservation.boat?.name}\n⏰ Horário: ${startTime}\n\nNos vemos na marina! Boa navegação! 🌊`,
        userId,
        category: 'RESPONSE',
        referenceId: reservation.id,
        referenceType: 'RESERVATION',
      });

      await this.prisma.notification.create({
        data: {
          userId,
          type: 'RESERVATION',
          title: 'Reserva confirmada via WhatsApp',
          body: `Reserva do ${reservation.boat?.name} confirmada pelo cliente via WhatsApp.`,
          data: { reservationId: reservation.id },
        },
      });

      this.logger.log(`Reservation ${reservation.id} CONFIRMED via WhatsApp`);
    } else {
      await this.prisma.reservation.update({
        where: { id: reservation.id },
        data: {
          status: 'CANCELLED',
          cancelledAt: new Date(),
          cancelReason: 'Cancelado pelo cliente via WhatsApp',
        },
      });
      await this.prisma.whatsAppMessage.update({
        where: { id: lastConfirmMsg.id },
        data: { status: 'READ', readAt: new Date() },
      });

      await this.messaging.send({
        phone,
        body: `❌ *Reserva cancelada.*\n\n🚤 ${reservation.boat?.name}\n\nSe mudar de ideia, faça uma nova reserva pelo app. 😊`,
        userId,
        category: 'RESPONSE',
        referenceId: reservation.id,
        referenceType: 'RESERVATION',
      });

      await this.prisma.notification.create({
        data: {
          userId,
          type: 'RESERVATION',
          title: 'Reserva cancelada via WhatsApp',
          body: `Reserva do ${reservation.boat?.name} cancelada pelo cliente via WhatsApp.`,
          data: { reservationId: reservation.id },
        },
      });

      this.logger.log(`Reservation ${reservation.id} CANCELLED via WhatsApp`);
    }

    return true;
  }

  // ================================================================
  // SWAP REPLY — handle 1/2 for swap accept/reject
  // ================================================================

  private async handleSwapReply(
    userId: string,
    phone: string,
    reply: string,
  ): Promise<boolean> {
    // Find the most recent SWAP_REQUEST outbound message for this user
    const recentSwapMsg = await this.prisma.whatsAppMessage.findFirst({
      where: {
        userId,
        direction: 'OUTBOUND',
        category: 'SWAP_REQUEST',
        referenceType: 'RESERVATION_SWAP',
        referenceId: { not: null },
        createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) }, // within 24h
      },
      orderBy: { createdAt: 'desc' },
    });

    if (!recentSwapMsg || !recentSwapMsg.referenceId) return false;

    const swapId = recentSwapMsg.referenceId;

    // Validate swap still exists and is PENDING
    const swap = await this.prisma.reservationSwap.findUnique({
      where: { id: swapId },
      include: {
        reservation: { include: { boat: { select: { name: true } } } },
        offeredReservation: true,
        requester: { select: { id: true, name: true, phone: true } },
        targetUser: { select: { id: true, name: true, phone: true } },
      },
    });

    if (!swap || swap.status !== 'PENDING' || swap.targetUserId !== userId) {
      return false;
    }

    const accept = reply === '1';
    const boatName = swap.reservation.boat?.name || 'Embarcação';

    try {
      if (accept) {
        // Swap the dates using interactive transaction to avoid overlap trigger conflict
        const res1Start = swap.reservation.startDate;
        const res1End = swap.reservation.endDate;
        const res2Start = swap.offeredReservation.startDate;
        const res2End = swap.offeredReservation.endDate;

        await this.prisma.$transaction(async (tx) => {
          // Temporarily disable overlap trigger so the intermediate state doesn't conflict
          await tx.$executeRawUnsafe('ALTER TABLE reservations DISABLE TRIGGER trg_reservation_overlap_check');
          await tx.reservation.update({
            where: { id: swap.reservationId },
            data: { startDate: res2Start, endDate: res2End },
          });
          await tx.reservation.update({
            where: { id: swap.offeredReservationId },
            data: { startDate: res1Start, endDate: res1End },
          });
          // Re-enable overlap trigger
          await tx.$executeRawUnsafe('ALTER TABLE reservations ENABLE TRIGGER trg_reservation_overlap_check');
          await tx.reservationSwap.update({
            where: { id: swapId },
            data: { status: 'ACCEPTED', respondedAt: new Date() },
          });
          await tx.operationalQueue.updateMany({
            where: { reservationId: swap.reservationId },
            data: { scheduledAt: res2Start },
          });
          await tx.operationalQueue.updateMany({
            where: { reservationId: swap.offeredReservationId },
            data: { scheduledAt: res1Start },
          });
        });

        const fmtDate = (d: Date) => d.toLocaleDateString('pt-BR', {
          weekday: 'short', day: '2-digit', month: '2-digit',
          timeZone: 'America/Sao_Paulo',
        });
        const fmtTime = (d: Date) => d.toLocaleTimeString('pt-BR', {
          hour: '2-digit', minute: '2-digit',
          timeZone: 'America/Sao_Paulo',
        });

        const newTargetDate = `${fmtDate(res2Start)} ${fmtTime(res2Start)}-${fmtTime(res2End)}`;
        const newRequesterDate = `${fmtDate(res1Start)} ${fmtTime(res1Start)}-${fmtTime(res1End)}`;

        // Notify target (current user)
        await this.messaging.send({
          phone,
          body:
            `✅ *Troca de Data Confirmada!*\n\n` +
            `Você aceitou a troca com *${swap.requester.name.split(' ')[0]}*.\n\n` +
            `🚤 *${boatName}*\n` +
            `📅 Sua nova data: *${newTargetDate}*\n\n` +
            `Boa navegação! 🌊`,
          category: 'SWAP_RESPONSE',
          userId,
        });

        // Notify requester
        if (swap.requester?.phone) {
          await this.messaging.send({
            phone: swap.requester.phone,
            body:
              `✅ *Troca de Data Aceita!*\n\n` +
              `*${swap.targetUser?.name?.split(' ')[0]}* aceitou sua troca!\n\n` +
              `🚤 *${boatName}*\n` +
              `📅 Sua nova data: *${newRequesterDate}*\n\n` +
              `Boa navegação! 🌊`,
            category: 'SWAP_RESPONSE',
            userId: swap.requester.id,
          });
        }
      } else {
        // Reject
        await this.prisma.reservationSwap.update({
          where: { id: swapId },
          data: { status: 'REJECTED', respondedAt: new Date() },
        });

        // Notify target (current user)
        await this.messaging.send({
          phone,
          body: `❌ *Troca recusada.*\n\nSuas datas permanecem inalteradas.`,
          category: 'SWAP_RESPONSE',
          userId,
        });

        // Notify requester
        if (swap.requester?.phone) {
          await this.messaging.send({
            phone: swap.requester.phone,
            body:
              `❌ *Troca de Data Recusada*\n\n` +
              `*${swap.targetUser?.name?.split(' ')[0]}* recusou sua solicitação de troca.\n\n` +
              `🚤 *${boatName}*\n\n` +
              `_Suas datas permanecem inalteradas._`,
            category: 'SWAP_RESPONSE',
            userId: swap.requester.id,
          });
        }
      }
    } catch (error: any) {
      this.logger.error(`Error handling swap reply: ${error.message}`);
      await this.messaging.send({
        phone,
        body: `⚠️ Não foi possível processar a troca. Pode haver conflito com outra reserva. Tente pela página do app.`,
        category: 'SWAP_RESPONSE',
        userId,
      });
    }

    return true;
  }

  // ================================================================
  // AI-POWERED MESSAGE HANDLING
  // ================================================================

  private async handleWithAI(
    user: { id: string; name: string; role: string },
    phone: string,
    text: string,
  ) {
    // 1) Classify intent
    const intent = await this.classifyIntent(text);

    this.logger.log(
      `Intent for user ${user.id}: ${intent.action} (confidence: ${intent.confidence})`,
    );

    // 2) Execute action or answer with AI
    switch (intent.action) {
      case 'LIST_RESERVATIONS':
        return this.actionListReservations(user, phone);
      case 'LIST_CHARGES':
        return this.actionListCharges(user, phone);
      case 'SECOND_INVOICE':
        return this.actionSecondInvoice(user, phone, intent.detail);
      case 'PIX_INFO':
        return this.actionPixInfo(user, phone, intent.detail);
      case 'CONFIRM_RESERVATION':
        return this.actionConfirmNextReservation(user, phone);
      case 'CANCEL_RESERVATION':
        return this.actionCancelReservation(user, phone, intent.detail, text);
      case 'CHECK_AVAILABILITY':
        return this.actionCheckAvailability(user, phone, text);
      case 'CREATE_RESERVATION':
        return this.actionCreateReservation(user, phone, text);
      case 'FUEL_INFO':
        return this.actionFuelInfo(user, phone, text);
      case 'WEATHER_INFO':
        return this.actionWeatherInfo(user, phone, text);
      case 'GENERAL_QUESTION':
      default:
        return this.actionAnswerQuestion(user, phone, text);
    }
  }

  // ================================================================
  // INTENT CLASSIFICATION
  // ================================================================

  private async classifyIntent(
    text: string,
  ): Promise<{ action: string; confidence: number; detail?: string }> {
    const systemPrompt = `Você é um classificador de intenções para o WhatsApp da Marina Prize Club.
Classifique a mensagem do cliente em UMA das ações abaixo.
Responda SOMENTE em JSON válido, sem markdown, sem texto extra.

Ações possíveis:
- LIST_RESERVATIONS: ver reservas existentes (ex: "minhas reservas", "quando tenho reserva", "3")
- LIST_CHARGES: ver cobranças pendentes (ex: "minhas faturas", "quanto devo", "4")
- SECOND_INVOICE: 2ª via de fatura/boleto (ex: "2ª via", "segunda via", "5")
- PIX_INFO: dados PIX para pagamento (ex: "chave pix", "como pagar", "6")
- CONFIRM_RESERVATION: confirmar uma reserva pendente (ex: "confirmar reserva", "confirmo", "1")
- CANCEL_RESERVATION: cancelar uma ou TODAS as reservas (ex: "cancelar reserva", "quero cancelar", "cancela tudo", "cancela todas", "cancelar todas as reservas"). Se disser "tudo/todas/all", coloque detail="tudo"
- CHECK_AVAILABILITY: verificar disponibilidade/dias livres SEM querer reservar agora (ex: "dia livre?", "está disponível?", "quando posso?", "agenda", "calendário", "dias livres", "disponibilidade", "quando está livre?", "próximo dia livre")
- CREATE_RESERVATION: criar/fazer/marcar/agendar nova reserva em data específica (ex: "reservar dia 25", "quero reservar sábado", "agendar amanhã", "marcar dia 20", "bota próximo sábado", "reserva pra mim dia X")
- FUEL_INFO: perguntas sobre combustível, abastecimento, gasolina, diesel, litros, custo de combustível, último abastecimento, quanto gastou de combustível, nível do tanque (ex: "quanto deu meu combustível?", "último abastecimento", "quanto gastei de gasolina", "nível do tanque", "combustível", "quanto deu de gasolina", "preço do combustível")
- WEATHER_INFO: perguntas sobre clima, tempo, vento, chuva, previsão, temperatura, onda, mar, maré, navegação, condições (ex: "como tá o tempo?", "vai chover?", "como tá o vento?", "previsão pra amanhã", "pode navegar?", "como tá o mar?", "tempo pro fim de semana", "condições de navegação")
- GENERAL_QUESTION: qualquer outra pergunta ou assunto

REGRAS:
- Se o cliente quer RESERVAR/AGENDAR/MARCAR uma data → CREATE_RESERVATION
- Se o cliente pergunta DISPONIBILIDADE/DIAS LIVRES sem pedir reserva → CHECK_AVAILABILITY
- Se o cliente diz "próximo dia livre" ou "quando está livre" → CHECK_AVAILABILITY
- Se o cliente diz "reserva o próximo dia livre" ou "reserva próximo sábado" → CREATE_RESERVATION
- Se o cliente pergunta sobre combustível/gasolina/diesel/abastecimento/tanque/litros → FUEL_INFO
- Se o cliente pergunta sobre tempo/clima/vento/chuva/onda/mar/previsão/navegação → WEATHER_INFO

Formato: {"action": "ACAO", "confidence": 0.0-1.0, "detail": "detalhe opcional"}`;

    const lower = text.toLowerCase().trim();

    // Fast shortcut for numbered menu options
    if (lower === '3') return { action: 'LIST_RESERVATIONS', confidence: 1 };
    if (lower === '4') return { action: 'LIST_CHARGES', confidence: 1 };
    if (lower === '5') return { action: 'SECOND_INVOICE', confidence: 1 };
    if (lower === '6') return { action: 'PIX_INFO', confidence: 1 };

    try {
      const result = await this.callAI(systemPrompt, text, 256);
      const cleaned = result
        .replace(/```json\n?/g, '')
        .replace(/```\n?/g, '')
        .trim();
      return JSON.parse(cleaned);
    } catch (err: any) {
      this.logger.warn(`Intent classification failed: ${err.message}`);
      return { action: 'GENERAL_QUESTION', confidence: 0.5 };
    }
  }

  // ================================================================
  // ACTION HANDLERS
  // ================================================================

  private async actionListReservations(
    user: { id: string; name: string },
    phone: string,
  ) {
    const reservations = await this.prisma.reservation.findMany({
      where: {
        userId: user.id,
        status: { in: ['PENDING', 'CONFIRMED'] },
        startDate: { gte: new Date() },
        deletedAt: null,
      },
      orderBy: { startDate: 'asc' },
      take: 5,
      include: { boat: { select: { name: true } } },
    });

    if (reservations.length === 0) {
      await this.messaging.send({
        phone,
        body: `📅 *${user.name.split(' ')[0]}*, você não tem reservas próximas.\n\nFaça uma reserva pelo app! 📱`,
        userId: user.id,
        category: 'RESPONSE',
      });
      return;
    }

    let msg = `📅 *Suas próximas reservas:*\n`;
    for (const r of reservations) {
      const date = new Date(r.startDate).toLocaleDateString('pt-BR', {
        timeZone: 'America/Sao_Paulo',
      });
      const time = new Date(r.startDate).toLocaleTimeString('pt-BR', {
        hour: '2-digit',
        minute: '2-digit',
        timeZone: 'America/Sao_Paulo',
      });
      const statusIcon =
        r.status === 'CONFIRMED' ? '✅' : '⏳';
      msg += `\n${statusIcon} *${r.boat.name}*\n   📆 ${date} às ${time}\n   Status: ${r.status === 'CONFIRMED' ? 'Confirmada' : 'Pendente'}\n`;
    }

    msg += `\n_Total: ${reservations.length} reserva(s)_`;

    await this.messaging.send({
      phone,
      body: msg,
      userId: user.id,
      category: 'RESPONSE',
    });
  }

  private async actionListCharges(
    user: { id: string; name: string },
    phone: string,
  ) {
    const charges = await this.prisma.charge.findMany({
      where: {
        userId: user.id,
        status: { in: ['PENDING', 'OVERDUE'] },
        deletedAt: null,
      },
      orderBy: { dueDate: 'asc' },
      take: 10,
    });

    if (charges.length === 0) {
      await this.messaging.send({
        phone,
        body: `💰 *${user.name.split(' ')[0]}*, você está em dia! Nenhuma cobrança pendente. 🎉`,
        userId: user.id,
        category: 'RESPONSE',
      });
      return;
    }

    let total = 0;
    let msg = `💰 *Suas cobranças pendentes:*\n`;
    for (const c of charges) {
      const dueDate = new Date(c.dueDate).toLocaleDateString('pt-BR', {
        timeZone: 'America/Sao_Paulo',
      });
      const statusIcon = c.status === 'OVERDUE' ? '🔴' : '🟡';
      msg += `\n${statusIcon} *${c.description}*\n   💵 R$ ${c.amount.toFixed(2)}\n   📅 Vencimento: ${dueDate}\n   Status: ${c.status === 'OVERDUE' ? 'Vencida' : 'Pendente'}\n`;
      total += c.amount;
    }

    msg += `\n💵 *Total: R$ ${total.toFixed(2)}*`;
    msg += `\n\n_Digite *5* para 2ª via ou *6* para dados PIX._`;

    await this.messaging.send({
      phone,
      body: msg,
      userId: user.id,
      category: 'RESPONSE',
    });
  }

  private async actionSecondInvoice(
    user: { id: string; name: string },
    phone: string,
    detail?: string,
  ) {
    // Find pending/overdue charges with payment links
    const charges = await this.prisma.charge.findMany({
      where: {
        userId: user.id,
        status: { in: ['PENDING', 'OVERDUE'] },
        deletedAt: null,
      },
      orderBy: { dueDate: 'asc' },
      include: {
        payments: {
          where: { wooviPaymentLinkUrl: { not: null } },
          take: 1,
          orderBy: { createdAt: 'desc' },
        },
      },
    });

    const withLinks = charges.filter((c) => c.payments.length > 0);

    if (withLinks.length === 0) {
      await this.messaging.send({
        phone,
        body: `⚠️ *${user.name.split(' ')[0]}*, não encontramos faturas com link de pagamento disponível.\n\nEntre em contato com a marina para regularização.`,
        userId: user.id,
        category: 'RESPONSE',
      });
      return;
    }

    let msg = `📄 *2ª via das suas faturas:*\n`;
    for (const c of withLinks) {
      const dueDate = new Date(c.dueDate).toLocaleDateString('pt-BR', {
        timeZone: 'America/Sao_Paulo',
      });
      const link = c.payments[0].wooviPaymentLinkUrl;
      msg += `\n💵 *${c.description}* — R$ ${c.amount.toFixed(2)}\n   📅 Vencimento: ${dueDate}\n   🔗 ${link}\n`;
    }

    msg += `\n_Clique no link para pagar via PIX. O pagamento é confirmado automaticamente!_`;

    await this.messaging.send({
      phone,
      body: msg,
      userId: user.id,
      category: 'INVOICE',
    });
  }

  private async actionPixInfo(
    user: { id: string; name: string },
    phone: string,
    detail?: string,
  ) {
    // Find pending/overdue charges
    const charges = await this.prisma.charge.findMany({
      where: {
        userId: user.id,
        status: { in: ['PENDING', 'OVERDUE'] },
        deletedAt: null,
      },
      orderBy: { dueDate: 'asc' },
      take: 15,
    });

    if (charges.length === 0) {
      await this.messaging.send({
        phone,
        body: `✅ *${user.name.split(' ')[0]}*, você está em dia! Nenhuma cobrança pendente. 🎉`,
        userId: user.id,
        category: 'RESPONSE',
      });
      return;
    }

    // If only 1 charge, go straight to PIX
    if (charges.length === 1) {
      return this.sendPixForCharge(user, phone, charges[0].id);
    }

    // Multiple charges — list and ask user to pick
    let msg = `💳 *Qual fatura deseja pagar via PIX?*\n`;
    charges.forEach((c, i) => {
      const dueDate = new Date(c.dueDate).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' });
      const statusIcon = c.status === 'OVERDUE' ? '🔴' : '🟡';
      msg += `\n*${i + 1}.* ${statusIcon} ${c.description}\n    💵 R$ ${c.amount.toFixed(2)} — 📅 ${dueDate}\n`;
    });
    msg += `\n_Digite o *número* da fatura que deseja pagar._`;

    // Store pending selection
    this.pendingPixSelection.set(phone, {
      userId: user.id,
      chargeIds: charges.map((c) => c.id),
      expiresAt: new Date(Date.now() + 5 * 60 * 1000), // 5 min
    });

    await this.messaging.send({
      phone,
      body: msg,
      userId: user.id,
      category: 'PIX_SELECTION',
    });
  }

  /**
   * Generate (if needed) and send PIX copia-e-cola for a specific charge.
   */
  private async sendPixForCharge(
    user: { id: string; name: string },
    phone: string,
    chargeId: string,
  ) {
    const charge = await this.prisma.charge.findUnique({
      where: { id: chargeId },
      include: {
        user: { select: { name: true, cpfCnpj: true } },
        payments: {
          where: { method: 'PIX', wooviCorrelationID: { not: null } },
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
      },
    });

    if (!charge) return;

    let brCode: string | null = null;
    let paymentLink: string | null = null;

    // Check for existing valid PIX payment
    const existing = charge.payments[0];
    if (existing?.wooviBrCode && existing?.wooviExpiresDate && existing.wooviExpiresDate > new Date()) {
      brCode = existing.wooviBrCode;
      paymentLink = existing.wooviPaymentLinkUrl;
    } else if (existing?.wooviBrCode && existing?.wooviStatus === 'ACTIVE') {
      // Has brCode and is active (no expiry check needed or already expired but status still active)
      brCode = existing.wooviBrCode;
      paymentLink = existing.wooviPaymentLinkUrl;
    }

    // If no valid PIX exists, try to generate on-demand via Woovi
    if (!brCode && this.wooviService && charge.status !== 'PAID') {
      try {
        // Delete expired payment if it exists
        if (existing) {
          await this.prisma.payment.delete({ where: { id: existing.id } }).catch(() => {});
        }

        const amountInCents = Math.round(charge.amount * 100);
        const correlationID = `prizeclub-charge-${charge.id}-${Date.now()}`;

        const wooviResponse = await this.wooviService.createCharge({
          value: amountInCents,
          comment: charge.description || `Cobranca ${charge.id}`,
          correlationID,
          customerName: charge.user?.name,
          customerTaxId: charge.user?.cpfCnpj || undefined,
        });

        // Create payment record for webhook matching
        await this.prisma.payment.create({
          data: {
            chargeId: charge.id,
            userId: charge.userId,
            amount: charge.amount,
            method: 'PIX',
            transactionId: wooviResponse.charge.transactionID,
            wooviTransactionId: wooviResponse.charge.transactionID,
            wooviBrCode: wooviResponse.charge.brCode,
            wooviQrCodeUrl: wooviResponse.charge.qrCodeImage,
            wooviPaymentLinkUrl: wooviResponse.charge.paymentLinkUrl,
            wooviPixKey: wooviResponse.charge.pixKey,
            wooviStatus: wooviResponse.charge.status,
            wooviExpiresDate: new Date(wooviResponse.charge.expiresDate),
            wooviFee: wooviResponse.charge.fee / 100,
            wooviCorrelationID: correlationID,
          },
        });

        // Update charge record
        await this.prisma.charge.update({
          where: { id: chargeId },
          data: { wooviBrCode: wooviResponse.charge.brCode, wooviCorrelationID: correlationID },
        });

        brCode = wooviResponse.charge.brCode;
        paymentLink = wooviResponse.charge.paymentLinkUrl;
        this.logger.log(`Generated Woovi PIX on-demand for charge ${chargeId}`);
      } catch (err: any) {
        this.logger.error(`Failed to generate Woovi PIX for charge ${chargeId}: ${err.message}`);
      }
    }

    if (!brCode) {
      await this.messaging.send({
        phone,
        body: `⚠️ *${user.name.split(' ')[0]}*, não foi possível gerar o PIX para esta fatura.\n\nEntre em contato com a marina para regularização.`,
        userId: user.id,
        category: 'RESPONSE',
      });
      return;
    }

    const dueDate = new Date(charge.dueDate).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' });
    let msg = `💳 *PIX — Copia e Cola:*\n\n`;
    msg += `📝 *${charge.description}*\n`;
    msg += `💵 Valor: *R$ ${charge.amount.toFixed(2)}*\n`;
    msg += `📅 Vencimento: ${dueDate}\n\n`;
    msg += `📋 *Código PIX:*\n\`\`\`\n${brCode}\n\`\`\`\n\n`;

    if (paymentLink) {
      msg += `🔗 *Ou pague pelo link:*\n${paymentLink}\n\n`;
    }

    msg += `_Copie o código acima e cole no app do seu banco. O pagamento é confirmado automaticamente! ✅_`;

    await this.messaging.send({
      phone,
      body: msg,
      userId: user.id,
      category: 'INVOICE',
    });
  }

  private async actionConfirmNextReservation(
    user: { id: string; name: string },
    phone: string,
  ) {
    const reservation = await this.prisma.reservation.findFirst({
      where: {
        userId: user.id,
        status: 'PENDING',
        startDate: { gte: new Date() },
        deletedAt: null,
      },
      orderBy: { startDate: 'asc' },
      include: { boat: { select: { name: true } } },
    });

    if (!reservation) {
      await this.messaging.send({
        phone,
        body: `⚠️ *${user.name.split(' ')[0]}*, não encontramos reservas pendentes de confirmação.`,
        userId: user.id,
        category: 'RESPONSE',
      });
      return;
    }

    await this.prisma.reservation.update({
      where: { id: reservation.id },
      data: { status: 'CONFIRMED', confirmedAt: new Date() },
    });

    const startTime = new Date(reservation.startDate).toLocaleTimeString(
      'pt-BR',
      { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' },
    );
    const startDate = new Date(reservation.startDate).toLocaleDateString(
      'pt-BR',
      { timeZone: 'America/Sao_Paulo' },
    );

    await this.messaging.send({
      phone,
      body: `✅ *Reserva confirmada!*\n\n🚤 ${reservation.boat.name}\n📆 ${startDate}\n⏰ ${startTime}\n\nNos vemos na marina! Boa navegação! 🌊`,
      userId: user.id,
      category: 'RESPONSE',
      referenceId: reservation.id,
      referenceType: 'RESERVATION',
    });

    await this.prisma.notification.create({
      data: {
        userId: user.id,
        type: 'RESERVATION',
        title: 'Reserva confirmada via WhatsApp',
        body: `Reserva do ${reservation.boat.name} confirmada pelo cliente via WhatsApp.`,
        data: { reservationId: reservation.id },
      },
    });

    this.logger.log(`Reservation ${reservation.id} CONFIRMED via AI chat`);
  }

  private async actionCancelReservation(
    user: { id: string; name: string },
    phone: string,
    detail?: string,
    originalText?: string,
  ) {
    // Find ALL pending/confirmed reservations
    const reservations = await this.prisma.reservation.findMany({
      where: {
        userId: user.id,
        status: { in: ['PENDING', 'CONFIRMED'] },
        startDate: { gte: new Date() },
        deletedAt: null,
      },
      orderBy: { startDate: 'asc' },
      include: { boat: { select: { name: true } } },
    });

    if (reservations.length === 0) {
      await this.messaging.send({
        phone,
        body: `⚠️ *${user.name.split(' ')[0]}*, não encontramos reservas ativas para cancelar.`,
        userId: user.id,
        category: 'RESPONSE',
      });
      return;
    }

    // Detect "cancel all" intent from detail or original text
    const textToCheck = `${detail || ''} ${originalText || ''}`.toLowerCase();
    const isCancelAll = /tud[oa]s?|todas?\s*(as)?\s*reservas?|cancel[ea]\s*tud|all/.test(textToCheck);

    if (isCancelAll && reservations.length > 1) {
      // Bulk cancel — list all and ask single confirmation
      let msg = `⚠️ Deseja cancelar *TODAS* as ${reservations.length} reservas?\n`;
      for (const r of reservations) {
        const d = new Date(r.startDate).toLocaleDateString('pt-BR', {
          weekday: 'short', day: '2-digit', month: '2-digit',
          timeZone: 'America/Sao_Paulo',
        });
        msg += `\n❌ *${r.boat.name}* — ${d}`;
      }
      msg += `\n\nResponda *SIM* para cancelar TODAS ou *NÃO* para manter.`;

      // Store all IDs in a special cancel-all message
      await this.messaging.send({
        phone,
        body: msg,
        userId: user.id,
        category: 'CANCEL_ALL_CONFIRM',
        referenceId: reservations.map(r => r.id).join(','),
        referenceType: 'RESERVATION',
      });
      return;
    }

    // Single cancel — original behavior
    const reservation = reservations[0];
    const startDate = new Date(reservation.startDate).toLocaleDateString(
      'pt-BR',
      { timeZone: 'America/Sao_Paulo' },
    );

    await this.messaging.send({
      phone,
      body: `⚠️ Deseja cancelar esta reserva?\n\n🚤 *${reservation.boat.name}*\n📆 ${startDate}\n\nResponda *SIM* para cancelar ou *NÃO* para manter.`,
      userId: user.id,
      category: 'CANCEL_CONFIRM',
      referenceId: reservation.id,
      referenceType: 'RESERVATION',
    });
  }

  // ================================================================
  // AI QUESTION ANSWERING
  // ================================================================

  private async actionAnswerQuestion(
    user: { id: string; name: string; role: string },
    phone: string,
    question: string,
  ) {
    // Check if this is a "SIM" reply to cancel confirmation
    const lower = question.toLowerCase().trim();
    if (lower === 'sim' || lower === 'não' || lower === 'nao') {
      // Check for CANCEL_ALL_CONFIRM first (bulk cancel)
      const cancelAllConfirm = await this.prisma.whatsAppMessage.findFirst({
        where: {
          userId: user.id,
          category: 'CANCEL_ALL_CONFIRM',
          direction: 'OUTBOUND',
        },
        orderBy: { createdAt: 'desc' },
      });

      if (
        cancelAllConfirm?.referenceId &&
        new Date().getTime() - new Date(cancelAllConfirm.createdAt).getTime() < 5 * 60 * 1000
      ) {
        if (lower === 'sim') {
          const ids = cancelAllConfirm.referenceId.split(',');
          const reservations = await this.prisma.reservation.findMany({
            where: { id: { in: ids }, status: { in: ['PENDING', 'CONFIRMED'] } },
            include: { boat: { select: { name: true } } },
          });

          if (reservations.length > 0) {
            await this.prisma.reservation.updateMany({
              where: { id: { in: reservations.map(r => r.id) } },
              data: {
                status: 'CANCELLED',
                cancelledAt: new Date(),
                cancelReason: 'Cancelamento em massa via WhatsApp',
              },
            });

            const names = reservations.map(r => {
              const d = new Date(r.startDate).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', timeZone: 'America/Sao_Paulo' });
              return `${r.boat.name} (${d})`;
            }).join(', ');

            await this.messaging.send({
              phone,
              body: `❌ *${reservations.length} reserva(s) cancelada(s):*\n\n${reservations.map(r => {
                const d = new Date(r.startDate).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', timeZone: 'America/Sao_Paulo' });
                return `  ❌ ${r.boat.name} — ${d}`;
              }).join('\n')}`,
              userId: user.id,
              category: 'RESPONSE',
            });

            await this.prisma.notification.create({
              data: {
                userId: user.id,
                type: 'RESERVATION',
                title: 'Reservas canceladas via WhatsApp',
                body: `${reservations.length} reserva(s) cancelada(s) em massa: ${names}`,
                data: { reservationIds: reservations.map(r => r.id) },
              },
            });

            this.logger.log(`${reservations.length} reservations BULK CANCELLED via WhatsApp for ${user.name}`);
            return;
          }
        } else {
          await this.messaging.send({
            phone,
            body: '✅ Ok, suas reservas foram mantidas!',
            userId: user.id,
            category: 'RESPONSE',
          });
          return;
        }
      }

      // Check for single CANCEL_CONFIRM
      const cancelConfirm = await this.prisma.whatsAppMessage.findFirst({
        where: {
          userId: user.id,
          category: 'CANCEL_CONFIRM',
          direction: 'OUTBOUND',
        },
        orderBy: { createdAt: 'desc' },
      });

      if (
        cancelConfirm?.referenceId &&
        new Date().getTime() - new Date(cancelConfirm.createdAt).getTime() <
          5 * 60 * 1000 // within 5 minutes
      ) {
        if (lower === 'sim') {
          const res = await this.prisma.reservation.findUnique({
            where: { id: cancelConfirm.referenceId },
            include: { boat: { select: { name: true } } },
          });
          if (res && ['PENDING', 'CONFIRMED'].includes(res.status)) {
            await this.prisma.reservation.update({
              where: { id: res.id },
              data: {
                status: 'CANCELLED',
                cancelledAt: new Date(),
                cancelReason: 'Cancelado pelo cliente via WhatsApp',
              },
            });
            await this.messaging.send({
              phone,
              body: `❌ Reserva do *${res.boat?.name}* cancelada com sucesso.`,
              userId: user.id,
              category: 'RESPONSE',
              referenceId: res.id,
              referenceType: 'RESERVATION',
            });
            await this.prisma.notification.create({
              data: {
                userId: user.id,
                type: 'RESERVATION',
                title: 'Reserva cancelada via WhatsApp',
                body: `Reserva do ${res.boat?.name} cancelada pelo cliente via WhatsApp.`,
                data: { reservationId: res.id },
              },
            });
            this.logger.log(`Reservation ${res.id} CANCELLED via AI chat`);
            return;
          }
        } else {
          await this.messaging.send({
            phone,
            body: '✅ Ok, sua reserva foi mantida!',
            userId: user.id,
            category: 'RESPONSE',
          });
          return;
        }
      }
    }

    // Build user context with full availability
    const context = await this.buildUserContext(user.id);

    // Get last 6 messages for conversation continuity
    const recentMessages = await this.prisma.whatsAppMessage.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: 'desc' },
      take: 6,
      select: { direction: true, body: true, createdAt: true },
    });

    const conversationHistory = recentMessages
      .reverse()
      .map(
        (m) =>
          `${m.direction === 'INBOUND' ? 'Cliente' : 'Assistente'}: ${m.body}`,
      )
      .join('\n');

    const now = new Date();
    const todayStr = now.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' });
    const dayOfWeek = now.toLocaleDateString('pt-BR', { weekday: 'long', timeZone: 'America/Sao_Paulo' });

    const systemPromptTemplate = await this.messaging.resolveTemplate(
      'ai_system_prompt',
      { nome: user.name },
    );

    const smartInstructions = `

DATA DE HOJE: ${todayStr} (${dayOfWeek})

SUAS CAPACIDADES:
- Você tem acesso à agenda COMPLETA das embarcações nos próximos 30 dias
- Pode ver quais dias estão livres e quais estão ocupados
- Pode informar sobre disponibilidade e orientar o cliente a reservar
- Se o cliente perguntar sobre dias livres, analise a AGENDA COMPLETA e responda
- Se o cliente quiser reservar, oriente que pode dizer "reserva dia X" ou "agendar próximo sábado"
- Pode ver dados de COMBUSTÍVEL: abastecimentos, faturas, nível do tanque, preço do litro
- Na marina, o custo do combustível é rateado entre os cotistas da embarcação
- Pode ver previsão do TEMPO: vento, chuva, temperatura, condições de navegação para hoje e próximos dias

REGRAS OBRIGATÓRIAS:
- Cite APENAS dados do CONTEXTO DO CLIENTE — NUNCA invente datas, valores ou informações
- Se uma data não aparece na agenda, ela está LIVRE
- Use formato WhatsApp: *negrito*, _itálico_
- Responda em português brasileiro, amigável e objetivo
- Use emojis moderadamente
- Quando mencionar disponibilidade, seja específico com datas e dias da semana

CONTEXTO DO CLIENTE:
${context}`;

    const systemPrompt = systemPromptTemplate
      ? `${systemPromptTemplate}${smartInstructions}`
      : `Você é o assistente inteligente da Marina Prize Club no WhatsApp. Você está conversando com ${user.name}.${smartInstructions}`;

    const userPrompt = conversationHistory
      ? `Histórico recente da conversa:\n${conversationHistory}\n\nMensagem atual do cliente: ${question}`
      : `Mensagem do cliente: ${question}`;

    const response = await this.callAI(systemPrompt, userPrompt, 800);

    await this.messaging.send({
      phone,
      body: response,
      userId: user.id,
      category: 'AI_RESPONSE',
    });
  }

  // ================================================================
  // CONTEXT BUILDER
  // ================================================================

  private async buildUserContext(userId: string): Promise<string> {
    const now = new Date();
    const thirtyDaysLater = new Date();
    thirtyDaysLater.setDate(thirtyDaysLater.getDate() + 30);

    const [shares, pendingCharges, overdueCharges, nextReservations, delinquency] =
      await Promise.all([
        this.prisma.share.findMany({
          where: { userId, isActive: true },
          include: {
            boat: { select: { id: true, name: true, model: true, status: true, currentFuel: true, fuelCapacity: true, fuelType: true } },
          },
        }),
        this.prisma.charge.findMany({
          where: { userId, status: 'PENDING', deletedAt: null },
          orderBy: { dueDate: 'asc' },
          take: 5,
        }),
        this.prisma.charge.findMany({
          where: { userId, status: 'OVERDUE', deletedAt: null },
          orderBy: { dueDate: 'asc' },
          take: 5,
        }),
        this.prisma.reservation.findMany({
          where: {
            userId,
            status: { in: ['PENDING', 'CONFIRMED'] },
            startDate: { gte: now },
            deletedAt: null,
          },
          orderBy: { startDate: 'asc' },
          take: 5,
          include: { boat: { select: { name: true } } },
        }),
        this.prisma.delinquency.findFirst({
          where: { userId, status: 'ACTIVE' },
        }),
      ]);

    const parts: string[] = [];

    // Shares / boats info
    if (shares.length > 0) {
      parts.push(`EMBARCAÇÕES DO CLIENTE:`);
      for (const s of shares) {
        parts.push(`  🚤 ${s.boat.name} (${s.boat.model}) — ID: ${s.boat.id} — Status: ${s.boat.status} — Máx reservas: ${s.maxReservations ?? 3}`);
      }
    } else {
      parts.push('Sem cotas ativas — cliente não possui embarcações.');
    }

    // Client's own upcoming reservations
    if (nextReservations.length > 0) {
      parts.push(`\nRESERVAS DO CLIENTE (TOTAL: ${nextReservations.length} — SOMENTE estas):`);
      for (const r of nextReservations) {
        const d = new Date(r.startDate).toLocaleDateString('pt-BR', {
          weekday: 'short', day: '2-digit', month: '2-digit',
          timeZone: 'America/Sao_Paulo',
        });
        const t = new Date(r.startDate).toLocaleTimeString('pt-BR', {
          hour: '2-digit', minute: '2-digit',
          timeZone: 'America/Sao_Paulo',
        });
        const endT = new Date(r.endDate).toLocaleTimeString('pt-BR', {
          hour: '2-digit', minute: '2-digit',
          timeZone: 'America/Sao_Paulo',
        });
        const status = r.status === 'CONFIRMED' ? '✅ CONFIRMADA' : '⏳ PENDENTE';
        parts.push(`  - ${r.boat.name} | ${d} ${t}-${endT} | ${status}`);
      }
      parts.push('⚠️ O cliente NÃO tem reservas em nenhuma outra data além das listadas acima.');
    } else {
      parts.push('\nRESERVAS DO CLIENTE: NENHUMA. O cliente não tem reservas futuras.');
    }

    // Full availability for each boat (all users' reservations next 30 days)
    if (shares.length > 0) {
      parts.push(`\nAGENDA COMPLETA DAS EMBARCAÇÕES (próximos 30 dias — todas as reservas de todos os cotistas):`);
      for (const s of shares) {
        const boatReservations = await this.prisma.reservation.findMany({
          where: {
            boatId: s.boat.id,
            status: { in: ['CONFIRMED', 'PENDING', 'IN_USE'] },
            startDate: { lte: thirtyDaysLater },
            endDate: { gte: now },
            deletedAt: null,
          },
          include: { user: { select: { name: true, id: true } } },
          orderBy: { startDate: 'asc' },
        });

        if (boatReservations.length === 0) {
          parts.push(`  📅 ${s.boat.name}: TOTALMENTE LIVRE nos próximos 30 dias!`);
        } else {
          parts.push(`  📅 ${s.boat.name} — ${boatReservations.length} reserva(s):`);
          for (const r of boatReservations) {
            const start = r.startDate.toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit', timeZone: 'America/Sao_Paulo' });
            const startTime = r.startDate.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' });
            const endTime = r.endDate.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' });
            const endDay = r.endDate.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', timeZone: 'America/Sao_Paulo' });
            const startDay = r.startDate.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', timeZone: 'America/Sao_Paulo' });
            const who = r.user?.id === userId ? 'VOCÊ' : (r.user?.name?.split(' ')[0] || 'Cotista');
            const multi = startDay !== endDay ? ` → ${endDay} ${endTime}` : `-${endTime}`;
            parts.push(`      ${start} ${startTime}${multi} — ${who}`);
          }
        }
      }
    }

    // Blockers
    if (delinquency) {
      parts.push(`\n🔴 BLOQUEIO: Inadimplência ativa de R$ ${delinquency.totalAmount.toFixed(2)} — NÃO pode reservar.`);
    }
    if (overdueCharges.length > 0) {
      const total = overdueCharges.reduce((s, c) => s + c.amount, 0);
      parts.push(`🔴 Cobranças vencidas: ${overdueCharges.length} (R$ ${total.toFixed(2)}) — NÃO pode reservar até regularizar.`);
    }

    // Charges
    if (pendingCharges.length > 0) {
      const total = pendingCharges.reduce((s, c) => s + c.amount, 0);
      parts.push(`\n💰 Cobranças pendentes: ${pendingCharges.length} (R$ ${total.toFixed(2)})`);
    }
    if (pendingCharges.length === 0 && overdueCharges.length === 0) {
      parts.push('\n💰 Sem cobranças pendentes — tudo em dia!');
    }

    // Fuel data — recent fuel charges + fuel logs for user's boats
    const boatIds = shares.map(s => s.boat.id);
    const [fuelCharges, fuelLogs, currentFuelPrice] = await Promise.all([
      this.prisma.charge.findMany({
        where: { userId, category: 'FUEL', deletedAt: null },
        orderBy: { createdAt: 'desc' },
        take: 5,
      }),
      boatIds.length > 0
        ? this.prisma.fuelLog.findMany({
            where: { boatId: { in: boatIds } },
            orderBy: { loggedAt: 'desc' },
            take: 10,
            include: { boat: { select: { name: true } } },
          })
        : Promise.resolve([]),
      this.prisma.fuelPrice.findFirst({
        orderBy: { createdAt: 'desc' },
      }),
    ]);

    if (fuelLogs.length > 0 || fuelCharges.length > 0) {
      parts.push('\n⛽ COMBUSTÍVEL:');

      if (currentFuelPrice) {
        parts.push(`  Preço atual: R$ ${currentFuelPrice.price.toFixed(2)}/litro (${currentFuelPrice.fuelType})`);
      }

      // Show boat current fuel levels
      for (const s of shares) {
        const boat = s.boat as any;
        if (boat.currentFuel !== undefined && boat.currentFuel !== null) {
          const pct = boat.fuelCapacity ? Math.round((boat.currentFuel / boat.fuelCapacity) * 100) : null;
          const pctStr = pct !== null ? ` (${pct}%)` : '';
          parts.push(`  🚤 ${boat.name}: ${boat.currentFuel?.toFixed(1) || '?'}L / ${boat.fuelCapacity || '?'}L${pctStr}`);
        }
      }

      if (fuelLogs.length > 0) {
        parts.push('  Últimos abastecimentos:');
        for (const fl of fuelLogs) {
          const date = fl.loggedAt.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'America/Sao_Paulo' });
          parts.push(`    - ${date} | ${fl.boat.name} | ${fl.liters.toFixed(1)}L × R$${fl.pricePerLiter.toFixed(2)} = R$${fl.totalCost.toFixed(2)}${fl.notes ? ' | ' + fl.notes : ''}`);
        }
      }

      if (fuelCharges.length > 0) {
        parts.push('  Suas faturas de combustível (rateio):');
        for (const fc of fuelCharges) {
          const date = fc.createdAt.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'America/Sao_Paulo' });
          const due = fc.dueDate.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'America/Sao_Paulo' });
          const statusEmoji = fc.status === 'PAID' ? '✅' : fc.status === 'OVERDUE' ? '🔴' : '🟡';
          parts.push(`    ${statusEmoji} ${date} | ${fc.description} | R$${fc.amount.toFixed(2)} | Venc: ${due} | ${fc.status}`);
        }
      }

      // Fuel totals summary
      const paidFuel = await this.prisma.charge.aggregate({
        where: { userId, category: 'FUEL', status: 'PAID', deletedAt: null },
        _sum: { amount: true },
        _count: true,
      });
      const pendingFuel = await this.prisma.charge.aggregate({
        where: { userId, category: 'FUEL', status: { in: ['PENDING', 'OVERDUE'] }, deletedAt: null },
        _sum: { amount: true },
        _count: true,
      });
      if (paidFuel._count > 0) {
        parts.push(`  Total combustível pago: ${paidFuel._count} faturas = R$${(paidFuel._sum.amount || 0).toFixed(2)}`);
      }
      if (pendingFuel._count > 0) {
        parts.push(`  Combustível pendente: ${pendingFuel._count} faturas = R$${(pendingFuel._sum.amount || 0).toFixed(2)}`);
      }
    } else {
      parts.push('\n⛽ COMBUSTÍVEL: Nenhum registro de abastecimento.');
    }

    return parts.join('\n');
  }

  // ================================================================
  // FUEL INFO (AI-powered with fuel context)
  // ================================================================

  private async actionFuelInfo(
    user: { id: string; name: string; role: string },
    phone: string,
    text: string,
  ) {
    const context = await this.buildUserContext(user.id);

    const recentMessages = await this.prisma.whatsAppMessage.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: 'desc' },
      take: 4,
      select: { direction: true, body: true },
    });
    const history = recentMessages.reverse().map(m =>
      `${m.direction === 'INBOUND' ? 'Cliente' : 'Assistente'}: ${m.body}`,
    ).join('\n');

    const now = new Date();
    const todayStr = now.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' });

    const systemPrompt = `Você é o assistente inteligente da Marina Prize Club.
Você está conversando com ${user.name}.

HOJE: ${todayStr}

${context}

TAREFA: O cliente perguntou sobre COMBUSTÍVEL. Responda usando os dados de COMBUSTÍVEL do contexto acima.

VOCÊ PODE RESPONDER SOBRE:
- Último abastecimento: data, litros, custo total
- Quanto o cliente pagou de combustível (suas faturas de rateio)
- Preço atual do litro
- Nível atual do tanque da embarcação
- Histórico de abastecimentos
- Total gasto com combustível
- Status de faturas de combustível (pagas, pendentes, vencidas)

COMO FUNCIONA O COMBUSTÍVEL NA MARINA:
- Quando a embarcação é abastecida, o custo é dividido (rateio) entre todos os cotistas
- Cada cotista recebe uma fatura de combustível proporcional à sua cota
- As faturas de combustível aparecem com categoria FUEL
- O "último combustível" do cliente = sua última fatura de combustível (rateio)
- O "último abastecimento" = último registro de abastecimento da embarcação

REGRAS:
- NUNCA invente valores — use SOMENTE os dados do contexto
- Se não houver dados de combustível, informe que não há registros
- Formato WhatsApp: *negrito*, _itálico_
- Seja claro sobre se é o valor total do abastecimento ou o valor do rateio do cliente`;

    const userPrompt = history
      ? `Histórico:\n${history}\n\nMensagem: ${text}`
      : `Mensagem: ${text}`;

    const response = await this.callAI(systemPrompt, userPrompt, 600);

    await this.messaging.send({
      phone,
      body: response,
      userId: user.id,
      category: 'AI_RESPONSE',
    });
  }

  // ================================================================
  // WEATHER INFO (forecast + current conditions)
  // ================================================================

  private async actionWeatherInfo(
    user: { id: string; name: string; role: string },
    phone: string,
    text: string,
  ) {
    // Gather weather data
    let weatherContext = '';

    try {
      const [latest, forecastData, aiSummary] = await Promise.all([
        this.weatherService?.getLatestValid(),
        Promise.resolve(this.weatherService?.getForecastDays()),
        Promise.resolve(this.weatherService?.getAiSummary()),
      ]);

      if (latest) {
        const collectedAt = latest.collectedAt.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });
        const windKmh = latest.windSpeed ? (latest.windSpeed * 3.6).toFixed(0) : '?';
        const gustKmh = latest.gust ? (latest.gust * 3.6).toFixed(0) : null;
        weatherContext += `CONDIÇÕES ATUAIS (coletado em ${collectedAt}):\n`;
        weatherContext += `  🌡️ Temperatura: ${latest.airTemperature ?? '?'}°C\n`;
        weatherContext += `  💨 Vento: ${windKmh} km/h${gustKmh ? ` (rajadas ${gustKmh} km/h)` : ''}\n`;
        if (latest.windDirection) weatherContext += `  🧭 Direção do vento: ${latest.windDirection}°\n`;
        weatherContext += `  💧 Umidade: ${latest.humidity ?? '?'}%\n`;
        if (latest.precipitation) weatherContext += `  🌧️ Precipitação: ${latest.precipitation}mm\n`;
        if (latest.cloudCover !== null && latest.cloudCover !== undefined) weatherContext += `  ☁️ Cobertura nuvens: ${latest.cloudCover}%\n`;
        weatherContext += `  🚤 Navegação: ${latest.navigationLevel} (score ${latest.navigationScore}/100)\n`;
        if (latest.clientSummary) weatherContext += `  📝 Resumo: ${latest.clientSummary}\n`;
      }

      if (forecastData?.days && forecastData.days.length > 0) {
        weatherContext += `\nPREVISÃO PRÓXIMOS DIAS:\n`;
        for (const day of forecastData.days.slice(0, 7)) {
          const navEmoji = day.navigationLevel === 'BOM' ? '✅' :
            day.navigationLevel === 'ATENCAO' ? '⚠️' :
            day.navigationLevel === 'RUIM' ? '🌊' : '🚫';
          weatherContext += `  ${navEmoji} ${day.dayOfWeek} (${day.date}): ${day.description} | ${day.airTempMin}-${day.airTempMax}°C | Vento ${day.windSpeedMin}km/h | Chuva ${day.rain}mm (${day.rainProbability}%) | Navegação: ${day.navigationLevel}\n`;
        }
      }

      if (aiSummary?.summary) {
        weatherContext += `\nRESUMO IA: ${aiSummary.summary}\n`;
      }
    } catch (err: any) {
      this.logger.warn(`Weather data fetch failed: ${err.message}`);
    }

    if (!weatherContext) {
      weatherContext = 'DADOS DE CLIMA: Não disponíveis no momento.';
    }

    const now = new Date();
    const todayStr = now.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' });
    const dayOfWeek = now.toLocaleDateString('pt-BR', { weekday: 'long', timeZone: 'America/Sao_Paulo' });

    const recentMessages = await this.prisma.whatsAppMessage.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: 'desc' },
      take: 4,
      select: { direction: true, body: true },
    });
    const history = recentMessages.reverse().map(m =>
      `${m.direction === 'INBOUND' ? 'Cliente' : 'Assistente'}: ${m.body}`,
    ).join('\n');

    const systemPrompt = `Você é o assistente inteligente da Marina Prize Club.
Você está conversando com ${user.name}.

HOJE: ${todayStr} (${dayOfWeek})

${weatherContext}

TAREFA: O cliente perguntou sobre CLIMA/TEMPO/VENTO/CONDIÇÕES.

COMO RESPONDER:
- Se perguntar sobre HOJE → use CONDIÇÕES ATUAIS
- Se perguntar sobre AMANHÃ ou data específica → encontre na PREVISÃO PRÓXIMOS DIAS
- Se perguntar "pode navegar?" → analise o nível de navegação (BOM=sim, ATENCAO=com cuidado, RUIM=não recomendado, PERIGOSO=não)
- Se perguntar sobre FIM DE SEMANA → mostre sábado e domingo da previsão
- Se perguntar sobre VENTO → destaque velocidade, rajadas e direção
- Se perguntar sobre CHUVA → destaque precipitação e probabilidade

NÍVEIS DE NAVEGAÇÃO:
- BOM (score <15): ✅ Excelente para navegar
- ATENÇÃO (score 15-34): ⚠️ Pode navegar com cautela
- RUIM (score 35-59): 🌊 Não recomendado
- PERIGOSO (score ≥60): 🚫 Perigoso, não navegar

REGRAS:
- Use SOMENTE os dados do contexto — NUNCA invente previsões
- Formato WhatsApp: *negrito*, _itálico_
- Seja objetivo e útil para quem vai navegar
- Use emojis de clima
- Diga a temperatura, vento e condição de navegação`;

    const userPrompt = history
      ? `Histórico:\n${history}\n\nMensagem: ${text}`
      : `Mensagem: ${text}`;

    const response = await this.callAI(systemPrompt, userPrompt, 600);

    await this.messaging.send({
      phone,
      body: response,
      userId: user.id,
      category: 'AI_RESPONSE',
    });
  }

  // ================================================================
  // CHECK AVAILABILITY (AI-powered with full agenda context)
  // ================================================================

  private async actionCheckAvailability(
    user: { id: string; name: string; role: string },
    phone: string,
    text: string,
  ) {
    const context = await this.buildUserContext(user.id);

    const recentMessages = await this.prisma.whatsAppMessage.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: 'desc' },
      take: 6,
      select: { direction: true, body: true },
    });
    const history = recentMessages.reverse().map(m =>
      `${m.direction === 'INBOUND' ? 'Cliente' : 'Assistente'}: ${m.body}`,
    ).join('\n');

    const now = new Date();
    const todayStr = now.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' });
    const dayOfWeek = now.toLocaleDateString('pt-BR', { weekday: 'long', timeZone: 'America/Sao_Paulo' });

    const systemPrompt = `Você é o assistente inteligente da Marina Prize Club.
Você está conversando com ${user.name}.

HOJE: ${todayStr} (${dayOfWeek})

${context}

TAREFA: O cliente quer saber sobre DISPONIBILIDADE. Analise a AGENDA COMPLETA acima e responda:

1. Se perguntar "próximo dia livre" → encontre o primeiro dia futuro (a partir de amanhã) que NÃO tem reserva na agenda
2. Se perguntar "dias livres esta semana" → liste todos os dias desta semana sem reserva
3. Se perguntar "dias livres este mês" → liste os dias livres do mês
4. Se perguntar sobre uma data específica → diga se está livre ou ocupada
5. Se perguntar "quando posso reservar?" → mostre os próximos 5 dias livres

REGRAS:
- Dias que NÃO aparecem na agenda estão LIVRES
- Cite dias da semana junto com as datas (ex: "sábado 26/04")
- Seja objetivo e organize em lista
- Ao final, diga que o cliente pode reservar dizendo "reserva dia X"
- NUNCA invente dados — use SOMENTE o contexto acima
- Formato WhatsApp: *negrito*, _itálico_`;

    const userPrompt = history
      ? `Histórico:\n${history}\n\nMensagem: ${text}`
      : `Mensagem: ${text}`;

    const response = await this.callAI(systemPrompt, userPrompt, 800);

    await this.messaging.send({
      phone,
      body: response,
      userId: user.id,
      category: 'AI_RESPONSE',
    });
  }

  // ================================================================
  // CREATE RESERVATION (AI extracts params → validate → confirm → create)
  // ================================================================

  private async actionCreateReservation(
    user: { id: string; name: string; role: string },
    phone: string,
    text: string,
  ) {
    // Get user's boats
    const userShares = await this.prisma.share.findMany({
      where: { userId: user.id, isActive: true },
      include: {
        boat: { select: { id: true, name: true, model: true, status: true } },
      },
    });

    if (userShares.length === 0) {
      await this.messaging.send({
        phone,
        body: '⚠️ Você não possui cotas em nenhuma embarcação. Entre em contato com a marina.',
        userId: user.id,
        category: 'RESPONSE',
      });
      return;
    }

    // Check blockers
    const [delinquency, overdueCharge] = await Promise.all([
      this.prisma.delinquency.findFirst({ where: { userId: user.id, status: 'ACTIVE' } }),
      this.prisma.charge.findFirst({
        where: {
          userId: user.id,
          deletedAt: null,
          OR: [
            { status: 'OVERDUE' },
            { status: 'PENDING', dueDate: { lt: new Date() } },
          ],
        },
      }),
    ]);

    if (delinquency) {
      await this.messaging.send({
        phone,
        body: `⚠️ Reservas bloqueadas por inadimplência de R$ ${delinquency.totalAmount.toFixed(2)}. Regularize seus pagamentos.\n\nDigite *4* para ver cobranças.`,
        userId: user.id,
        category: 'RESPONSE',
      });
      return;
    }

    if (overdueCharge) {
      await this.messaging.send({
        phone,
        body: '⚠️ Reservas bloqueadas — faturas vencidas. Regularize seus pagamentos.\n\nDigite *4* para ver cobranças.',
        userId: user.id,
        category: 'RESPONSE',
      });
      return;
    }

    // Build availability context for AI extraction
    const context = await this.buildUserContext(user.id);

    const now = new Date();
    const todayStr = now.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' });
    const dayOfWeek = now.toLocaleDateString('pt-BR', { weekday: 'long', timeZone: 'America/Sao_Paulo' });
    const yearStr = now.getFullYear();

    const boatList = userShares.map(s =>
      `  - "${s.boat.name}" (${s.boat.model}) ID: ${s.boat.id} Status: ${s.boat.status}`,
    ).join('\n');

    // Get recent messages for context
    const recentMessages = await this.prisma.whatsAppMessage.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: 'desc' },
      take: 4,
      select: { direction: true, body: true },
    });
    const history = recentMessages.reverse().map(m =>
      `${m.direction === 'INBOUND' ? 'Cliente' : 'Assistente'}: ${m.body}`,
    ).join('\n');

    const extractPrompt = `Extraia os parâmetros de reserva da mensagem do cliente.

HOJE: ${todayStr} (${dayOfWeek}), ano ${yearStr}
Timezone: America/Sao_Paulo (UTC-3)

EMBARCAÇÕES DO CLIENTE:
${boatList}

${context}

Histórico recente:
${history}

REGRAS DE EXTRAÇÃO:
1. Se o cliente tem APENAS UMA embarcação e não especificou qual, use essa embarcação
2. Se tem MÚLTIPLAS e não especificou, retorne needsClarification=true pedindo qual
3. Interprete datas naturais baseado em HOJE (${todayStr}, ${dayOfWeek}):
   - "amanhã" = dia seguinte
   - "próximo sábado" = próximo sábado futuro (se hoje é sábado, é o da semana que vem)
   - "próxima sexta" = próxima sexta futura
   - "dia 25" = dia 25 do mês atual, ou próximo mês se dia 25 já passou
   - "semana que vem" = próxima segunda-feira
   - "próximo dia livre" = o primeiro dia futuro SEM reserva na agenda da embarcação
   - "próximo fim de semana livre" = primeiro sábado futuro sem reserva
   - "depois de amanhã" = daqui a 2 dias
   - "daqui a X dias" = hoje + X dias
4. Se não especificar horário: startDate=08:00, endDate=17:00 do mesmo dia
5. Se disser "o dia todo" ou "dia inteiro": startDate=08:00, endDate=17:00
6. Datas em formato ISO 8601 com offset -03:00
7. Máximo ${process.env.MAX_RESERVATION_DAYS || '7'} dias por reserva
8. Se não conseguir determinar a data, retorne needsClarification=true

Responda SOMENTE em JSON válido, sem markdown:
{
  "boatId": "id-da-embarcação ou null",
  "boatName": "nome",
  "startDate": "2025-04-25T08:00:00-03:00",
  "endDate": "2025-04-25T17:00:00-03:00",
  "notes": "",
  "needsClarification": false,
  "clarificationMessage": ""
}`;

    try {
      const result = await this.callAI(extractPrompt, `Mensagem do cliente: ${text}`, 512);
      const cleaned = result.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      const params = JSON.parse(cleaned);

      if (params.needsClarification) {
        await this.messaging.send({
          phone,
          body: params.clarificationMessage || '🤔 Pode especificar melhor? Exemplos:\n• "reserva dia 25/04"\n• "reserva próximo sábado"\n• "agendar amanhã das 10h às 16h"',
          userId: user.id,
          category: 'AI_RESPONSE',
        });
        return;
      }

      // Resolve boat
      let boatId = params.boatId;
      let boatName = params.boatName;

      if (!boatId && userShares.length === 1) {
        boatId = userShares[0].boat.id;
        boatName = userShares[0].boat.name;
      } else if (!boatId) {
        const names = userShares.map(s => s.boat.name).join(', ');
        await this.messaging.send({
          phone,
          body: `🚤 Você tem cota em: *${names}*\n\nQual embarcação? Ex: "reserva ${userShares[0].boat.name} dia 25"`,
          userId: user.id,
          category: 'AI_RESPONSE',
        });
        return;
      }

      // Find matching boat
      const matchedShare = userShares.find(s =>
        s.boat.id === boatId ||
        s.boat.name.toLowerCase().includes((boatName || '').toLowerCase()) ||
        (boatName || '').toLowerCase().includes(s.boat.name.toLowerCase()),
      );

      if (!matchedShare) {
        await this.messaging.send({
          phone,
          body: `⚠️ Embarcação não encontrada. Suas embarcações: ${userShares.map(s => s.boat.name).join(', ')}`,
          userId: user.id,
          category: 'RESPONSE',
        });
        return;
      }

      boatId = matchedShare.boat.id;
      boatName = matchedShare.boat.name;

      const startDate = new Date(params.startDate);
      const endDate = new Date(params.endDate);

      // Validate dates
      if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
        await this.messaging.send({
          phone,
          body: '⚠️ Não entendi a data. Tente: "reserva dia 25/04" ou "reserva próximo sábado"',
          userId: user.id,
          category: 'RESPONSE',
        });
        return;
      }

      // Can't book in the past
      if (startDate < new Date()) {
        await this.messaging.send({
          phone,
          body: '⚠️ Não é possível reservar datas passadas.',
          userId: user.id,
          category: 'RESPONSE',
        });
        return;
      }

      if (endDate <= startDate) {
        await this.messaging.send({
          phone,
          body: '⚠️ A data de fim deve ser após o início.',
          userId: user.id,
          category: 'RESPONSE',
        });
        return;
      }

      // Max days check
      const maxDays = parseInt(process.env.MAX_RESERVATION_DAYS || '7');
      const diffDays = (endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24);
      if (diffDays > maxDays) {
        await this.messaging.send({
          phone,
          body: `⚠️ Máximo ${maxDays} dias por reserva.`,
          userId: user.id,
          category: 'RESPONSE',
        });
        return;
      }

      // Boat status check
      if (matchedShare.boat.status !== 'AVAILABLE') {
        await this.messaging.send({
          phone,
          body: `⚠️ *${boatName}* não está disponível (${matchedShare.boat.status}).`,
          userId: user.id,
          category: 'RESPONSE',
        });
        return;
      }

      // Max reservations check
      const maxRes = matchedShare.maxReservations ?? 3;
      const activeCount = await this.prisma.reservation.count({
        where: {
          userId: user.id,
          boatId,
          status: { in: ['CONFIRMED', 'PENDING'] },
          endDate: { gte: new Date() },
          deletedAt: null,
        },
      });
      if (activeCount >= maxRes) {
        await this.messaging.send({
          phone,
          body: `⚠️ Limite de ${maxRes} reserva(s) atingido para *${boatName}*. Cancele uma existente primeiro.\n\nDigite *3* para ver reservas.`,
          userId: user.id,
          category: 'RESPONSE',
        });
        return;
      }

      // Conflict check
      const conflict = await this.prisma.reservation.findFirst({
        where: {
          boatId,
          status: { in: ['CONFIRMED', 'PENDING', 'IN_USE'] },
          deletedAt: null,
          startDate: { lt: endDate },
          endDate: { gt: startDate },
        },
        include: { user: { select: { name: true } } },
      });

      if (conflict) {
        const cStart = conflict.startDate.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' });
        const cEnd = conflict.endDate.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' });
        const who = conflict.userId === user.id ? 'Você já tem' : `${conflict.user?.name || 'Outro cotista'} tem`;
        await this.messaging.send({
          phone,
          body: `⚠️ *Horário indisponível!*\n\n${who} reserva de ${cStart} a ${cEnd}.\n\nDiga "dias livres" para ver disponibilidade.`,
          userId: user.id,
          category: 'RESPONSE',
        });
        return;
      }

      // Maintenance check
      const maintenance = await this.prisma.maintenance.findFirst({
        where: {
          boatId,
          status: { in: ['SCHEDULED', 'IN_PROGRESS'] },
          scheduledAt: { lte: endDate },
        },
      });
      if (maintenance) {
        await this.messaging.send({
          phone,
          body: `⚠️ *${boatName}* em manutenção neste período.`,
          userId: user.id,
          category: 'RESPONSE',
        });
        return;
      }

      // All checks passed — ask for confirmation
      const dateStr = startDate.toLocaleDateString('pt-BR', {
        weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric',
        timeZone: 'America/Sao_Paulo',
      });
      const startTime = startDate.toLocaleTimeString('pt-BR', {
        hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo',
      });
      const endTime = endDate.toLocaleTimeString('pt-BR', {
        hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo',
      });

      const startDay = startDate.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' });
      const endDay = endDate.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' });

      let dateDisplay: string;
      if (startDay !== endDay) {
        const endDateStr = endDate.toLocaleDateString('pt-BR', {
          weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric',
          timeZone: 'America/Sao_Paulo',
        });
        dateDisplay = `📆 De ${dateStr} às ${startTime}\n   Até ${endDateStr} às ${endTime}`;
      } else {
        dateDisplay = `📆 ${dateStr}\n⏰ ${startTime} às ${endTime}`;
      }

      // Store pending creation
      this.pendingCreations.set(phone, {
        userId: user.id,
        boatId,
        boatName,
        startDate,
        endDate,
        expiresAt: new Date(Date.now() + 5 * 60 * 1000),
      });

      await this.messaging.send({
        phone,
        body: `🚤 *Confirma esta reserva?*\n\n🚤 *${boatName}*\n${dateDisplay}\n\nResponda *SIM* para confirmar ou *NÃO* para cancelar.`,
        userId: user.id,
        category: 'RESERVATION_CREATE_CONFIRM',
      });

    } catch (err: any) {
      this.logger.error(`Create reservation extraction failed: ${err.message}`);
      await this.messaging.send({
        phone,
        body: '🤔 Não entendi sua reserva. Exemplos:\n\n• "reserva dia 25/04"\n• "reserva próximo sábado"\n• "agendar amanhã das 10h às 16h"\n• "reserva o próximo dia livre"',
        userId: user.id,
        category: 'AI_RESPONSE',
      });
    }
  }

  // ================================================================
  // PENDING CREATION CONFIRMATION (SIM/NÃO after reservation preview)
  // ================================================================

  private async handlePendingCreationReply(
    user: { id: string; name: string },
    phone: string,
    text: string,
  ): Promise<boolean> {
    const pending = this.pendingCreations.get(phone);
    if (!pending) return false;

    const lower = text.toLowerCase().trim();

    if (['sim', 's', 'confirmar', 'ok', 'confirma', 'yes', 'si'].includes(lower)) {
      this.pendingCreations.delete(phone);
      await this.executeReservationCreation(user, phone, pending);
      return true;
    }

    if (['não', 'nao', 'n', 'cancelar', 'cancela', 'no'].includes(lower)) {
      this.pendingCreations.delete(phone);
      await this.messaging.send({
        phone,
        body: '✅ Ok, reserva não foi criada. Se quiser tentar outra data, é só pedir!',
        userId: user.id,
        category: 'RESPONSE',
      });
      return true;
    }

    // Unrecognized reply — remind them
    await this.messaging.send({
      phone,
      body: '🤔 Responda *SIM* para confirmar a reserva ou *NÃO* para cancelar.',
      userId: user.id,
      category: 'RESPONSE',
    });
    return true;
  }

  // ================================================================
  // EXECUTE RESERVATION CREATION (after SIM confirmation)
  // ================================================================

  private async executeReservationCreation(
    user: { id: string; name: string },
    phone: string,
    pending: { boatId: string; boatName: string; startDate: Date; endDate: Date },
  ) {
    try {
      // Double-check for conflict (race condition)
      const conflict = await this.prisma.reservation.findFirst({
        where: {
          boatId: pending.boatId,
          status: { in: ['CONFIRMED', 'PENDING', 'IN_USE'] },
          deletedAt: null,
          startDate: { lt: pending.endDate },
          endDate: { gt: pending.startDate },
        },
      });

      if (conflict) {
        await this.messaging.send({
          phone,
          body: '⚠️ Ops! Este horário acabou de ser reservado por outro cotista. Tente outra data.\n\nDiga "dias livres" para ver disponibilidade.',
          userId: user.id,
          category: 'RESPONSE',
        });
        return;
      }

      const reservation = await this.prisma.reservation.create({
        data: {
          boatId: pending.boatId,
          userId: user.id,
          startDate: pending.startDate,
          endDate: pending.endDate,
          status: 'CONFIRMED',
          confirmedAt: new Date(),
          notes: 'Reserva criada via WhatsApp',
        },
        include: { boat: { select: { name: true } } },
      });

      const dateStr = pending.startDate.toLocaleDateString('pt-BR', {
        weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric',
        timeZone: 'America/Sao_Paulo',
      });
      const startTime = pending.startDate.toLocaleTimeString('pt-BR', {
        hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo',
      });
      const endTime = pending.endDate.toLocaleTimeString('pt-BR', {
        hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo',
      });

      await this.messaging.send({
        phone,
        body: `✅ *Reserva criada com sucesso!*\n\n🚤 *${pending.boatName}*\n📆 ${dateStr}\n⏰ ${startTime} às ${endTime}\n\nBoa navegação! 🌊`,
        userId: user.id,
        category: 'RESPONSE',
        referenceId: reservation.id,
        referenceType: 'RESERVATION',
      });

      await this.prisma.notification.create({
        data: {
          userId: user.id,
          type: 'RESERVATION',
          title: 'Nova reserva via WhatsApp',
          body: `Reserva do ${pending.boatName} criada via WhatsApp — ${dateStr} ${startTime}-${endTime}.`,
          data: { reservationId: reservation.id },
        },
      });

      this.logger.log(`Reservation ${reservation.id} CREATED via WhatsApp for ${user.name}`);
    } catch (err: any) {
      this.logger.error(`Failed to create reservation via WhatsApp: ${err.message}`);
      let errorMsg = '⚠️ Erro ao criar reserva. ';
      if (err.message?.includes('indisponível') || err.message?.includes('overlap')) {
        errorMsg += 'Horário já foi ocupado. Tente outra data.';
      } else if (err.message?.includes('Limite')) {
        errorMsg += err.message;
      } else {
        errorMsg += 'Tente novamente ou use o app.';
      }
      await this.messaging.send({
        phone,
        body: errorMsg,
        userId: user.id,
        category: 'RESPONSE',
      });
    }
  }

  // ================================================================
  // AI CALL — Gemini → OpenAI fallback
  // ================================================================

  private async callAI(
    systemPrompt: string,
    userPrompt: string,
    maxTokens = 500,
  ): Promise<string> {
    try {
      const model = this.genAI.getGenerativeModel({
        model: this.geminiModel,
        systemInstruction: systemPrompt,
      });
      const result = await model.generateContent(userPrompt);
      return result.response.text();
    } catch (geminiErr: any) {
      this.logger.warn(
        `Gemini failed, trying OpenAI: ${geminiErr.message}`,
      );
      if (!this.openai) {
        return 'Desculpe, estou com dificuldades técnicas. Um administrador irá responder em breve. 🙏';
      }
      const completion = await this.openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        max_tokens: maxTokens,
      });
      return (
        completion.choices[0]?.message?.content ||
        'Desculpe, não consegui processar sua mensagem.'
      );
    }
  }
}
