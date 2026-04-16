import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../../database/prisma.service';
import { NotificationsService } from './notifications.service';

const BRT = 'America/Sao_Paulo';

function todayBRT(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: BRT });
}

function tomorrowBRT(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return d.toLocaleDateString('en-CA', { timeZone: BRT });
}

@Injectable()
export class NotificationCronService {
  private readonly logger = new Logger(NotificationCronService.name);

  constructor(
    private prisma: PrismaService,
    private notifications: NotificationsService,
  ) {}

  /* ─── CHARGE: Due tomorrow (runs 09:00 BRT) ─── */
  @Cron('0 12 * * *') // 12:00 UTC = 09:00 BRT
  async chargeDueTomorrow() {
    const tomorrow = tomorrowBRT();
    const start = new Date(`${tomorrow}T00:00:00-03:00`);
    const end = new Date(`${tomorrow}T23:59:59-03:00`);

    const charges = await this.prisma.charge.findMany({
      where: { status: 'PENDING', dueDate: { gte: start, lte: end } },
    });

    for (const charge of charges) {
      const boatName = charge.boatId
        ? (await this.prisma.boat.findUnique({ where: { id: charge.boatId }, select: { name: true } }))?.name
        : null;

      await this.notifications.send({
        userId: charge.userId,
        type: 'CHARGE_DUE_TOMORROW',
        title: '⚠️ Fatura vence amanhã',
        body: `Sua fatura de R$ ${Number(charge.amount).toFixed(2)} (${boatName || 'Embarcação'}) vence amanhã.`,
        data: { chargeId: charge.id, url: '/faturas' },
        pushTag: `charge-due-${charge.id}`,
        pushUrgency: 'high',
      });
    }

    if (charges.length) this.logger.log(`Sent ${charges.length} charge-due-tomorrow notifications`);
  }

  /* ─── CHARGE: Due today (runs 08:00 BRT) ─── */
  @Cron('0 11 * * *') // 11:00 UTC = 08:00 BRT
  async chargeDueToday() {
    const today = todayBRT();
    const start = new Date(`${today}T00:00:00-03:00`);
    const end = new Date(`${today}T23:59:59-03:00`);

    const charges = await this.prisma.charge.findMany({
      where: { status: 'PENDING', dueDate: { gte: start, lte: end } },
    });

    for (const charge of charges) {
      const boatName = charge.boatId
        ? (await this.prisma.boat.findUnique({ where: { id: charge.boatId }, select: { name: true } }))?.name
        : null;

      await this.notifications.send({
        userId: charge.userId,
        type: 'CHARGE_DUE_TODAY',
        title: '🔔 Fatura vence hoje',
        body: `Sua fatura de R$ ${Number(charge.amount).toFixed(2)} (${boatName || 'Embarcação'}) vence hoje!`,
        data: { chargeId: charge.id, url: '/faturas' },
        pushTag: `charge-today-${charge.id}`,
        pushUrgency: 'high',
      });
    }

    if (charges.length) this.logger.log(`Sent ${charges.length} charge-due-today notifications`);
  }

  /* ─── CHARGE: Overdue daily alert (runs 10:00 BRT) ─── */
  @Cron('0 13 * * *') // 13:00 UTC = 10:00 BRT
  async chargeOverdueDaily() {
    const charges = await this.prisma.charge.findMany({
      where: { status: 'OVERDUE' },
    });

    for (const charge of charges) {
      const dueDate = new Date(charge.dueDate);
      const daysOverdue = Math.floor((Date.now() - dueDate.getTime()) / 86400000);
      if (daysOverdue < 1) continue;

      const boatName = charge.boatId
        ? (await this.prisma.boat.findUnique({ where: { id: charge.boatId }, select: { name: true } }))?.name
        : null;

      await this.notifications.send({
        userId: charge.userId,
        type: 'CHARGE_OVERDUE',
        title: '🚨 Fatura vencida',
        body: `Fatura de R$ ${Number(charge.amount).toFixed(2)} (${boatName || 'Embarcação'}) está vencida há ${daysOverdue} dia${daysOverdue > 1 ? 's' : ''}. Regularize para evitar bloqueio.`,
        data: { chargeId: charge.id, url: '/faturas', daysOverdue },
        pushTag: `charge-overdue-${charge.id}`,
        pushUrgency: 'high',
      });
    }

    if (charges.length) this.logger.log(`Sent ${charges.length} overdue charge notifications`);
  }

  /* ─── RESERVATION: Reminders (1h before, at start, 1h after) ─── */
  @Cron('*/15 * * * *') // every 15 minutes
  async reservationReminders() {
    const now = new Date();
    const in15 = new Date(now.getTime() + 15 * 60000);

    // Find reservations starting in the next window
    const reservations = await this.prisma.reservation.findMany({
      where: {
        status: { in: ['CONFIRMED', 'PENDING'] },
        startDate: { gte: now, lte: in15 },
      },
      include: { boat: true, user: true },
    });

    for (const res of reservations) {
      const start = new Date(res.startDate);
      const minsUntil = Math.round((start.getTime() - now.getTime()) / 60000);

      // 1h before (45-75 min window)
      if (minsUntil >= 45 && minsUntil <= 75) {
        if (!res.confirmedAt) {
          await this.notifications.send({
            userId: res.userId,
            type: 'RESERVATION_CONFIRM_ARRIVAL',
            title: '⏰ Confirme sua presença',
            body: `Sua reserva em ${res.boat?.name || 'embarcação'} começa em 1 hora. Confirme sua chegada!`,
            data: { reservationId: res.id, boatId: res.boatId, url: '/boats' },
            pushTag: `res-confirm-1h-${res.id}`,
            pushActions: [{ action: 'confirm', title: 'Confirmar' }],
            pushUrgency: 'high',
          });
        }
      }

      // At start time (0-15 min window)
      if (minsUntil >= 0 && minsUntil < 15) {
        if (!res.confirmedAt) {
          await this.notifications.send({
            userId: res.userId,
            type: 'RESERVATION_CONFIRM_ARRIVAL',
            title: '🚤 Sua reserva começou!',
            body: `Sua reserva em ${res.boat?.name || 'embarcação'} começou agora. Confirme sua presença!`,
            data: { reservationId: res.id, boatId: res.boatId, url: '/boats' },
            pushTag: `res-start-${res.id}`,
            pushUrgency: 'high',
          });
        }
      }
    }

    // 1h after start — check reservations that started ~1h ago without confirmation
    const oneHourAgo = new Date(now.getTime() - 75 * 60000);
    const oneHourAgoEnd = new Date(now.getTime() - 45 * 60000);

    const unconfirmed = await this.prisma.reservation.findMany({
      where: {
        status: { in: ['CONFIRMED', 'PENDING'] },
        startDate: { gte: oneHourAgo, lte: oneHourAgoEnd },
        confirmedAt: null,
      },
      include: { boat: true },
    });

    for (const res of unconfirmed) {
      await this.notifications.send({
        userId: res.userId,
        type: 'RESERVATION_CONFIRM_ARRIVAL',
        title: '❗ Presença não confirmada',
        body: `Sua reserva em ${res.boat?.name || 'embarcação'} já começou há 1 hora e sua presença não foi confirmada.`,
        data: { reservationId: res.id, boatId: res.boatId, url: '/boats' },
        pushTag: `res-noshow-${res.id}`,
        pushUrgency: 'high',
      });
    }
  }
}
