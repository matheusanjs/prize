import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../database/prisma.service';
import { NotificationsService } from '../modules/notifications/notifications.service';
import { FinanceService } from '../modules/finance/finance.service';

@Injectable()
export class AutomationJobs {
  private readonly logger = new Logger(AutomationJobs.name);

  constructor(
    private prisma: PrismaService,
    private notificationsService: NotificationsService,
    private financeService: FinanceService,
  ) {}

  // ================================================================
  // COBRANÇA AUTOMÁTICA — todo dia 1 às 6h
  // ================================================================
  @Cron('0 6 1 * *', { timeZone: 'America/Sao_Paulo' })
  async autoGenerateMonthlyCharges() {
    this.logger.log('🔄 Gerando cobranças mensais automáticas...');
    try {
      const result = await this.financeService.generateMonthlyCharges();
      this.logger.log(`✅ ${result.generated} cobranças geradas`);
    } catch (error) {
      this.logger.error('❌ Erro ao gerar cobranças', error);
    }
  }

  // ================================================================
  // PROCESSAR INADIMPLÊNCIA — todo dia às 7h
  // ================================================================
  @Cron('0 7 * * *', { timeZone: 'America/Sao_Paulo' })
  async processDelinquencies() {
    this.logger.log('🔄 Processando inadimplências...');
    try {
      const result = await this.financeService.processDelinquencies();
      this.logger.log(`✅ ${result.processed} inadimplências processadas`);
    } catch (error) {
      this.logger.error('❌ Erro ao processar inadimplências', error);
    }
  }

  // ================================================================
  // LEMBRETES DE PAGAMENTO — todo dia às 9h
  // ================================================================
  @Cron('0 9 * * *', { timeZone: 'America/Sao_Paulo' })
  async sendPaymentReminders() {
    this.logger.log('🔔 Enviando lembretes de pagamento...');

    const threeDaysFromNow = new Date();
    threeDaysFromNow.setDate(threeDaysFromNow.getDate() + 3);

    const upcomingCharges = await this.prisma.charge.findMany({
      where: {
        status: 'PENDING',
        dueDate: {
          gte: new Date(),
          lte: threeDaysFromNow,
        },
      },
      include: { user: { select: { id: true, name: true } } },
    });

    for (const charge of upcomingCharges) {
      await this.notificationsService.send({
        userId: charge.userId,
        type: 'GENERAL',
        title: 'Lembrete de pagamento',
        body: `Sua cobrança "${charge.description}" de R$ ${charge.amount.toFixed(2)} vence em ${charge.dueDate.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' })}`,
        data: { chargeId: charge.id },
      });
    }

    this.logger.log(`✅ ${upcomingCharges.length} lembretes enviados`);
  }

  // ================================================================
  // LEMBRETES DE RESERVA — todo dia às 8h
  // ================================================================
  @Cron('0 8 * * *', { timeZone: 'America/Sao_Paulo' })
  async sendReservationReminders() {
    this.logger.log('🔔 Enviando lembretes de reserva...');

    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(0, 0, 0, 0);
    const dayAfter = new Date(tomorrow);
    dayAfter.setDate(dayAfter.getDate() + 1);

    const tomorrowReservations = await this.prisma.reservation.findMany({
      where: {
        status: 'CONFIRMED',
        startDate: { gte: tomorrow, lt: dayAfter },
      },
      include: {
        user: { select: { id: true, name: true } },
        boat: { select: { name: true } },
      },
    });

    for (const reservation of tomorrowReservations) {
      await this.notificationsService.send({
        userId: reservation.userId,
        type: 'RESERVATION_REMINDER',
        title: 'Reserva amanhã!',
        body: `Sua reserva do ${reservation.boat.name} é amanhã. Não esqueça!`,
        data: { reservationId: reservation.id },
      });
    }

    this.logger.log(`✅ ${tomorrowReservations.length} lembretes de reserva enviados`);
  }

  // ================================================================
  // BLOQUEIO AUTOMÁTICO POR INADIMPLÊNCIA — todo dia às 7:30
  // ================================================================
  @Cron('30 7 * * *', { timeZone: 'America/Sao_Paulo' })
  async autoBlockDelinquents() {
    this.logger.log('🚫 Verificando bloqueios por inadimplência...');

    const blockDays = parseInt(process.env.DELINQUENCY_BLOCK_DAYS || '30');

    const toBlock = await this.prisma.delinquency.findMany({
      where: {
        status: 'ACTIVE',
        daysPastDue: { gte: blockDays },
        blockedAt: null,
      },
      include: { user: { select: { id: true, name: true } } },
    });

    for (const delinquency of toBlock) {
      // Block user
      await this.prisma.user.update({
        where: { id: delinquency.userId },
        data: { isActive: false },
      });

      await this.prisma.delinquency.update({
        where: { id: delinquency.id },
        data: { blockedAt: new Date() },
      });

      // Cancel pending reservations
      await this.prisma.reservation.updateMany({
        where: { userId: delinquency.userId, status: { in: ['PENDING', 'CONFIRMED'] } },
        data: { status: 'CANCELLED', cancelReason: 'Bloqueio por inadimplência' },
      });

      await this.notificationsService.send({
        userId: delinquency.userId,
        type: 'GENERAL',
        title: 'Conta bloqueada',
        body: `Sua conta foi bloqueada por inadimplência de R$ ${delinquency.totalAmount.toFixed(2)}. Regularize para reativar.`,
      });

      this.logger.warn(`🚫 Usuário ${delinquency.user.name} bloqueado por inadimplência`);
    }

    this.logger.log(`✅ ${toBlock.length} usuários verificados para bloqueio`);
  }

  // ================================================================
  // ALERTA DE MANUTENÇÃO — todo dia às 10h
  // ================================================================
  @Cron('0 10 * * *', { timeZone: 'America/Sao_Paulo' })
  async maintenanceAlerts() {
    this.logger.log('🔧 Verificando alertas de manutenção...');

    const criticalMaintenance = await this.prisma.maintenance.findMany({
      where: {
        priority: 'CRITICAL',
        status: { in: ['SCHEDULED', 'IN_PROGRESS'] },
      },
      include: { boat: { select: { name: true } } },
    });

    if (criticalMaintenance.length > 0) {
      const admins = await this.prisma.user.findMany({
        where: { role: 'ADMIN', isActive: true },
        select: { id: true },
      });

      for (const admin of admins) {
        await this.notificationsService.send({
          userId: admin.id,
          type: 'GENERAL',
          title: '⚠️ Manutenções críticas pendentes',
          body: `${criticalMaintenance.length} manutenções críticas: ${criticalMaintenance.map(m => `${m.boat.name} — ${m.title}`).join(', ')}`,
        });
      }
    }

    this.logger.log(`✅ ${criticalMaintenance.length} alertas de manutenção`);
  }

  // ================================================================
  // RELATÓRIO DIÁRIO — todo dia às 20h
  // ================================================================
  @Cron('0 20 * * *', { timeZone: 'America/Sao_Paulo' })
  async dailyReport() {
    this.logger.log('📊 Gerando relatório diário...');

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const [
      todayReservations,
      todayPayments,
      todayFuel,
      queueOperations,
    ] = await Promise.all([
      this.prisma.reservation.count({ where: { createdAt: { gte: today, lt: tomorrow } } }),
      this.prisma.payment.aggregate({ where: { paidAt: { gte: today, lt: tomorrow } }, _sum: { amount: true }, _count: true }),
      this.prisma.fuelLog.aggregate({ where: { loggedAt: { gte: today, lt: tomorrow } }, _sum: { liters: true, totalCost: true } }),
      this.prisma.operationalQueue.count({ where: { scheduledAt: { gte: today, lt: tomorrow } } }),
    ]);

    const admins = await this.prisma.user.findMany({
      where: { role: 'ADMIN', isActive: true },
      select: { id: true },
    });

    const reportBody = `📊 Relatório do dia:
• Reservas: ${todayReservations}
• Pagamentos: ${todayPayments._count || 0} (R$ ${(todayPayments._sum.amount || 0).toFixed(2)})
• Combustível: ${(todayFuel._sum.liters || 0).toFixed(1)}L (R$ ${(todayFuel._sum.totalCost || 0).toFixed(2)})
• Operações na fila: ${queueOperations}`;

    for (const admin of admins) {
      await this.notificationsService.send({
        userId: admin.id,
        type: 'GENERAL',
        title: 'Relatório Diário',
        body: reportBody,
      });
    }

    this.logger.log('✅ Relatório diário enviado');
  }
}
