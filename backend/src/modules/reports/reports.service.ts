import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';

@Injectable()
export class ReportsService {
  private readonly logger = new Logger(ReportsService.name);

  constructor(private prisma: PrismaService) {}

  /* ════════════════════════════════════════════════════
   *  1. FINANCEIRO
   * ════════════════════════════════════════════════════ */
  async getFinanceReport(from: Date, to: Date) {
    const [
      revenueByMonth,
      chargesByCategory,
      chargesByStatus,
      paymentsByMethod,
      topDebtors,
      dailyRevenue,
      monthlyComparison,
    ] = await Promise.all([
      this.prisma.$queryRaw<{ month: string; total: number }[]>`
        SELECT TO_CHAR("paidAt", 'YYYY-MM') as month, COALESCE(SUM(amount),0)::float as total
        FROM "payments" WHERE "paidAt" >= ${from} AND "paidAt" <= ${to}
        GROUP BY TO_CHAR("paidAt", 'YYYY-MM') ORDER BY month`,

      this.prisma.$queryRaw<{ category: string; count: number; total: number }[]>`
        SELECT category, COUNT(*)::int as count, COALESCE(SUM(amount),0)::float as total
        FROM "charges" WHERE "createdAt" >= ${from} AND "createdAt" <= ${to} AND "deletedAt" IS NULL
        GROUP BY category ORDER BY total DESC`,

      this.prisma.$queryRaw<{ status: string; count: number; total: number }[]>`
        SELECT status, COUNT(*)::int as count, COALESCE(SUM(amount),0)::float as total
        FROM "charges" WHERE "createdAt" >= ${from} AND "createdAt" <= ${to} AND "deletedAt" IS NULL
        GROUP BY status ORDER BY count DESC`,

      this.prisma.$queryRaw<{ method: string; count: number; total: number }[]>`
        SELECT method, COUNT(*)::int as count, COALESCE(SUM(amount),0)::float as total
        FROM "payments" WHERE "paidAt" >= ${from} AND "paidAt" <= ${to}
        GROUP BY method ORDER BY total DESC`,

      this.prisma.$queryRaw<{ name: string; email: string; total: number; count: number }[]>`
        SELECT u.name, u.email, COALESCE(SUM(c.amount),0)::float as total, COUNT(*)::int as count
        FROM "charges" c JOIN "users" u ON c."userId" = u.id
        WHERE c.status IN ('OVERDUE','PENDING') AND c."deletedAt" IS NULL
        GROUP BY u.name, u.email ORDER BY total DESC LIMIT 10`,

      this.prisma.$queryRaw<{ day: string; total: number }[]>`
        SELECT DATE("paidAt") as day, COALESCE(SUM(amount),0)::float as total
        FROM "payments" WHERE "paidAt" >= ${from} AND "paidAt" <= ${to}
        GROUP BY DATE("paidAt") ORDER BY day`,

      this.prisma.$queryRaw<{ month: string; charged: number; paid: number }[]>`
        SELECT m.month,
          COALESCE((SELECT SUM(amount) FROM "charges" WHERE TO_CHAR("createdAt",'YYYY-MM')=m.month AND "deletedAt" IS NULL),0)::float as charged,
          COALESCE((SELECT SUM(amount) FROM "payments" WHERE TO_CHAR("paidAt",'YYYY-MM')=m.month),0)::float as paid
        FROM (SELECT DISTINCT TO_CHAR("createdAt",'YYYY-MM') as month FROM "charges" WHERE "createdAt" >= ${from} AND "createdAt" <= ${to}) m
        ORDER BY m.month`,
    ]);

    const totalReceived = dailyRevenue.reduce((s, r) => s + r.total, 0);
    const totalCharged = chargesByCategory.reduce((s, r) => s + r.total, 0);
    const collectionRate = totalCharged > 0 ? Math.round((totalReceived / totalCharged) * 100) : 0;

    return {
      summary: { totalReceived, totalCharged, collectionRate },
      revenueByMonth, chargesByCategory, chargesByStatus, paymentsByMethod,
      topDebtors, dailyRevenue, monthlyComparison,
    };
  }

  /* ════════════════════════════════════════════════════
   *  2. RESERVAS
   * ════════════════════════════════════════════════════ */
  async getReservationsReport(from: Date, to: Date) {
    const [
      byStatus,
      byBoat,
      byDayOfWeek,
      dailyVolume,
      monthlyVolume,
      cancellationReasons,
      topClients,
      avgDuration,
    ] = await Promise.all([
      this.prisma.$queryRaw<{ status: string; count: number }[]>`
        SELECT status, COUNT(*)::int as count FROM "reservations"
        WHERE "startDate" >= ${from} AND "startDate" <= ${to}
        GROUP BY status ORDER BY count DESC`,

      this.prisma.$queryRaw<{ name: string; count: number; confirmed: number; cancelled: number }[]>`
        SELECT b.name, COUNT(*)::int as count,
          SUM(CASE WHEN r.status='CONFIRMED' THEN 1 ELSE 0 END)::int as confirmed,
          SUM(CASE WHEN r.status='CANCELLED' THEN 1 ELSE 0 END)::int as cancelled
        FROM "reservations" r JOIN "boats" b ON r."boatId"=b.id
        WHERE r."startDate" >= ${from} AND r."startDate" <= ${to}
        GROUP BY b.name ORDER BY count DESC`,

      this.prisma.$queryRaw<{ dow: number; label: string; count: number }[]>`
        SELECT EXTRACT(DOW FROM "startDate")::int as dow,
          TO_CHAR("startDate", 'Day') as label, COUNT(*)::int as count
        FROM "reservations" WHERE "startDate" >= ${from} AND "startDate" <= ${to}
        GROUP BY EXTRACT(DOW FROM "startDate"), TO_CHAR("startDate", 'Day') ORDER BY dow`,

      this.prisma.$queryRaw<{ day: string; count: number }[]>`
        SELECT DATE("startDate") as day, COUNT(*)::int as count FROM "reservations"
        WHERE "startDate" >= ${from} AND "startDate" <= ${to}
        GROUP BY DATE("startDate") ORDER BY day`,

      this.prisma.$queryRaw<{ month: string; count: number }[]>`
        SELECT TO_CHAR("startDate",'YYYY-MM') as month, COUNT(*)::int as count
        FROM "reservations" WHERE "startDate" >= ${from} AND "startDate" <= ${to}
        GROUP BY TO_CHAR("startDate",'YYYY-MM') ORDER BY month`,

      this.prisma.$queryRaw<{ count: number }[]>`
        SELECT COUNT(*)::int as count FROM "reservations"
        WHERE status='CANCELLED' AND "startDate" >= ${from} AND "startDate" <= ${to}`,

      this.prisma.$queryRaw<{ name: string; count: number }[]>`
        SELECT u.name, COUNT(*)::int as count
        FROM "reservations" r JOIN "users" u ON r."userId"=u.id
        WHERE r."startDate" >= ${from} AND r."startDate" <= ${to} AND r.status != 'CANCELLED'
        GROUP BY u.name ORDER BY count DESC LIMIT 10`,

      this.prisma.$queryRaw<{ avg_hours: number }[]>`
        SELECT COALESCE(AVG(EXTRACT(EPOCH FROM ("endDate" - "startDate"))/3600),0)::float as avg_hours
        FROM "reservations" WHERE "startDate" >= ${from} AND "startDate" <= ${to} AND status != 'CANCELLED'`,
    ]);

    const total = byStatus.reduce((s, r) => s + r.count, 0);
    const cancelled = cancellationReasons[0]?.count || 0;
    const cancellationRate = total > 0 ? Math.round((cancelled / total) * 100) : 0;

    return {
      summary: { total, cancelled, cancellationRate, avgDurationHours: Math.round((avgDuration[0]?.avg_hours || 0) * 10) / 10 },
      byStatus, byBoat, byDayOfWeek, dailyVolume, monthlyVolume, topClients,
    };
  }

  /* ════════════════════════════════════════════════════
   *  3. COMBUSTÍVEL
   * ════════════════════════════════════════════════════ */
  async getFuelReport(from: Date, to: Date) {
    const [
      byBoat,
      byMonth,
      priceHistory,
      byOperator,
      dailyConsumption,
      totalStats,
    ] = await Promise.all([
      this.prisma.$queryRaw<{ name: string; liters: number; cost: number; count: number }[]>`
        SELECT b.name, COALESCE(SUM(f.liters),0)::float as liters, COALESCE(SUM(f."totalCost"),0)::float as cost, COUNT(*)::int as count
        FROM "fuel_logs" f JOIN "boats" b ON f."boatId"=b.id
        WHERE f."loggedAt" >= ${from} AND f."loggedAt" <= ${to}
        GROUP BY b.name ORDER BY cost DESC`,

      this.prisma.$queryRaw<{ month: string; liters: number; cost: number }[]>`
        SELECT TO_CHAR("loggedAt",'YYYY-MM') as month, COALESCE(SUM(liters),0)::float as liters, COALESCE(SUM("totalCost"),0)::float as cost
        FROM "fuel_logs" WHERE "loggedAt" >= ${from} AND "loggedAt" <= ${to}
        GROUP BY TO_CHAR("loggedAt",'YYYY-MM') ORDER BY month`,

      this.prisma.fuelPrice.findMany({
        orderBy: { createdAt: 'desc' },
        take: 20,
        select: { fuelType: true, price: true, createdAt: true },
      }),

      this.prisma.$queryRaw<{ name: string; liters: number; cost: number; count: number }[]>`
        SELECT u.name, COALESCE(SUM(f.liters),0)::float as liters, COALESCE(SUM(f."totalCost"),0)::float as cost, COUNT(*)::int as count
        FROM "fuel_logs" f JOIN "users" u ON f."operatorId"=u.id
        WHERE f."loggedAt" >= ${from} AND f."loggedAt" <= ${to}
        GROUP BY u.name ORDER BY count DESC`,

      this.prisma.$queryRaw<{ day: string; liters: number; cost: number }[]>`
        SELECT DATE("loggedAt") as day, COALESCE(SUM(liters),0)::float as liters, COALESCE(SUM("totalCost"),0)::float as cost
        FROM "fuel_logs" WHERE "loggedAt" >= ${from} AND "loggedAt" <= ${to}
        GROUP BY DATE("loggedAt") ORDER BY day`,

      this.prisma.$queryRaw<{ liters: number; cost: number; count: number; avg_price: number }[]>`
        SELECT COALESCE(SUM(liters),0)::float as liters, COALESCE(SUM("totalCost"),0)::float as cost,
          COUNT(*)::int as count, COALESCE(AVG("pricePerLiter"),0)::float as avg_price
        FROM "fuel_logs" WHERE "loggedAt" >= ${from} AND "loggedAt" <= ${to}`,
    ]);

    const stats = totalStats[0] || { liters: 0, cost: 0, count: 0, avg_price: 0 };
    return {
      summary: { totalLiters: stats.liters, totalCost: stats.cost, refuelCount: stats.count, avgPrice: Math.round(stats.avg_price * 100) / 100 },
      byBoat, byMonth, priceHistory, byOperator, dailyConsumption,
    };
  }

  /* ════════════════════════════════════════════════════
   *  4. EMBARCAÇÕES
   * ════════════════════════════════════════════════════ */
  async getBoatsReport(from: Date, to: Date) {
    const boats = await this.prisma.boat.findMany({
      where: { deletedAt: null },
      select: { id: true, name: true, model: true, status: true, totalShares: true, hourMeter: true, fuelCapacity: true },
    });

    const boatIds = boats.map(b => b.id);
    if (boatIds.length === 0) return { boats: [] };

    const [reservationsByBoat, fuelByBoat, maintenanceByBoat, revenueByBoat, sharesByBoat] = await Promise.all([
      this.prisma.$queryRaw<{ boatId: string; total: number; confirmed: number; cancelled: number }[]>`
        SELECT "boatId", COUNT(*)::int as total,
          SUM(CASE WHEN status='CONFIRMED' THEN 1 ELSE 0 END)::int as confirmed,
          SUM(CASE WHEN status='CANCELLED' THEN 1 ELSE 0 END)::int as cancelled
        FROM "reservations" WHERE "startDate" >= ${from} AND "startDate" <= ${to} AND "boatId" = ANY(${boatIds})
        GROUP BY "boatId"`,

      this.prisma.$queryRaw<{ boatId: string; liters: number; cost: number }[]>`
        SELECT "boatId", COALESCE(SUM(liters),0)::float as liters, COALESCE(SUM("totalCost"),0)::float as cost
        FROM "fuel_logs" WHERE "loggedAt" >= ${from} AND "loggedAt" <= ${to} AND "boatId" = ANY(${boatIds})
        GROUP BY "boatId"`,

      this.prisma.$queryRaw<{ boatId: string; count: number; cost: number }[]>`
        SELECT "boatId", COUNT(*)::int as count, COALESCE(SUM("actualCost"),0)::float as cost
        FROM "maintenance" WHERE "createdAt" >= ${from} AND "createdAt" <= ${to} AND "boatId" = ANY(${boatIds})
        GROUP BY "boatId"`,

      this.prisma.$queryRaw<{ boatId: string; revenue: number }[]>`
        SELECT c."boatId", COALESCE(SUM(p.amount),0)::float as revenue
        FROM "payments" p JOIN "charges" c ON p."chargeId"=c.id
        WHERE p."paidAt" >= ${from} AND p."paidAt" <= ${to} AND c."boatId" = ANY(${boatIds}) AND c."boatId" IS NOT NULL
        GROUP BY c."boatId"`,

      this.prisma.share.groupBy({
        by: ['boatId'],
        where: { isActive: true },
        _count: true,
      }),
    ]);

    const resMap = Object.fromEntries(reservationsByBoat.map(r => [r.boatId, r]));
    const fuelMap = Object.fromEntries(fuelByBoat.map(r => [r.boatId, r]));
    const maintMap = Object.fromEntries(maintenanceByBoat.map(r => [r.boatId, r]));
    const revMap = Object.fromEntries(revenueByBoat.map(r => [r.boatId, r]));
    const shareMap = Object.fromEntries(sharesByBoat.map(r => [r.boatId, r._count]));

    const daysInRange = Math.max(1, Math.ceil((to.getTime() - from.getTime()) / 86400000));

    const result = boats.map(b => {
      const res = resMap[b.id] || { total: 0, confirmed: 0, cancelled: 0 };
      const fuel = fuelMap[b.id] || { liters: 0, cost: 0 };
      const maint = maintMap[b.id] || { count: 0, cost: 0 };
      const rev = revMap[b.id] || { revenue: 0 };
      const occupancy = Math.round((res.confirmed / daysInRange) * 100);
      return {
        ...b,
        activeShares: shareMap[b.id] || 0,
        reservations: res.total,
        confirmedReservations: res.confirmed,
        cancelledReservations: res.cancelled,
        fuelLiters: fuel.liters,
        fuelCost: fuel.cost,
        maintenanceCount: maint.count,
        maintenanceCost: maint.cost,
        revenue: rev.revenue,
        occupancyRate: Math.min(occupancy, 100),
      };
    });

    return { boats: result.sort((a, b) => b.revenue - a.revenue) };
  }

  /* ════════════════════════════════════════════════════
   *  5. MANUTENÇÃO
   * ════════════════════════════════════════════════════ */
  async getMaintenanceReport(from: Date, to: Date) {
    const [byStatus, byBoat, byPriority, monthlyCost, avgResolution, recentItems] = await Promise.all([
      this.prisma.$queryRaw<{ status: string; count: number }[]>`
        SELECT status, COUNT(*)::int as count FROM "maintenance"
        WHERE "createdAt" >= ${from} AND "createdAt" <= ${to}
        GROUP BY status ORDER BY count DESC`,

      this.prisma.$queryRaw<{ name: string; count: number; cost: number }[]>`
        SELECT b.name, COUNT(*)::int as count, COALESCE(SUM(m."actualCost"),0)::float as cost
        FROM "maintenance" m JOIN "boats" b ON m."boatId"=b.id
        WHERE m."createdAt" >= ${from} AND m."createdAt" <= ${to}
        GROUP BY b.name ORDER BY cost DESC`,

      this.prisma.$queryRaw<{ priority: string; count: number }[]>`
        SELECT priority, COUNT(*)::int as count FROM "maintenance"
        WHERE "createdAt" >= ${from} AND "createdAt" <= ${to}
        GROUP BY priority ORDER BY count DESC`,

      this.prisma.$queryRaw<{ month: string; cost: number; count: number }[]>`
        SELECT TO_CHAR("createdAt",'YYYY-MM') as month,
          COALESCE(SUM("actualCost"),0)::float as cost, COUNT(*)::int as count
        FROM "maintenance" WHERE "createdAt" >= ${from} AND "createdAt" <= ${to}
        GROUP BY TO_CHAR("createdAt",'YYYY-MM') ORDER BY month`,

      this.prisma.$queryRaw<{ avg_days: number }[]>`
        SELECT COALESCE(AVG(EXTRACT(EPOCH FROM ("updatedAt" - "createdAt"))/86400),0)::float as avg_days
        FROM "maintenance" WHERE status='COMPLETED' AND "createdAt" >= ${from} AND "createdAt" <= ${to}`,

      this.prisma.maintenance.findMany({
        where: { createdAt: { gte: from, lte: to } },
        take: 15,
        orderBy: { createdAt: 'desc' },
        select: { id: true, title: true, status: true, priority: true, actualCost: true, estimatedCost: true, createdAt: true, boat: { select: { name: true } } },
      }),
    ]);

    const totalCost = monthlyCost.reduce((s, r) => s + r.cost, 0);
    const totalCount = byStatus.reduce((s, r) => s + r.count, 0);
    const avgDays = Math.round((avgResolution[0]?.avg_days || 0) * 10) / 10;

    return {
      summary: { totalCount, totalCost, avgResolutionDays: avgDays },
      byStatus, byBoat, byPriority, monthlyCost, recentItems,
    };
  }

  /* ════════════════════════════════════════════════════
   *  6. OPERAÇÕES
   * ════════════════════════════════════════════════════ */
  async getOperationsReport(from: Date, to: Date) {
    const [dailyOps, byBoat, byOperator, checklistStats, damagesCount] = await Promise.all([
      this.prisma.$queryRaw<{ day: string; count: number }[]>`
        SELECT DATE("scheduledAt") as day, COUNT(*)::int as count FROM "operational_queue"
        WHERE "scheduledAt" >= ${from} AND "scheduledAt" <= ${to}
        GROUP BY DATE("scheduledAt") ORDER BY day`,

      this.prisma.$queryRaw<{ name: string; count: number }[]>`
        SELECT b.name, COUNT(*)::int as count FROM "operational_queue" q JOIN "boats" b ON q."boatId"=b.id
        WHERE q."scheduledAt" >= ${from} AND q."scheduledAt" <= ${to}
        GROUP BY b.name ORDER BY count DESC`,

      this.prisma.$queryRaw<{ name: string; count: number }[]>`
        SELECT u.name, COUNT(*)::int as count FROM "operational_queue" q JOIN "users" u ON q."operatorId"=u.id
        WHERE q."scheduledAt" >= ${from} AND q."scheduledAt" <= ${to} AND q."operatorId" IS NOT NULL
        GROUP BY u.name ORDER BY count DESC`,

      this.prisma.$queryRaw<{ status: string; count: number }[]>`
        SELECT status, COUNT(*)::int as count FROM "checklists"
        WHERE "createdAt" >= ${from} AND "createdAt" <= ${to}
        GROUP BY status ORDER BY count DESC`,

      this.prisma.$queryRaw<{ total: number; with_damage: number }[]>`
        SELECT COUNT(*)::int as total,
          SUM(CASE WHEN "hullSketchMarks" IS NOT NULL AND "hullSketchMarks" != '[]' AND "hullSketchMarks" != '' THEN 1 ELSE 0 END)::int as with_damage
        FROM "checklists" WHERE "createdAt" >= ${from} AND "createdAt" <= ${to}`,
    ]);

    const totalOps = dailyOps.reduce((s, r) => s + r.count, 0);
    const dmg = damagesCount[0] || { total: 0, with_damage: 0 };
    const damageRate = dmg.total > 0 ? Math.round((dmg.with_damage / dmg.total) * 100) : 0;

    return {
      summary: { totalOperations: totalOps, totalChecklists: dmg.total, damageRate },
      dailyOps, byBoat, byOperator, checklistStats, damages: { total: dmg.total, withDamage: dmg.with_damage, rate: damageRate },
    };
  }

  /* ════════════════════════════════════════════════════
   *  7. RESTAURANTE / BAR
   * ════════════════════════════════════════════════════ */
  async getRestaurantReport(from: Date, to: Date) {
    const [
      dailyRevenue,
      byStatus,
      topItems,
      byPaymentMethod,
      monthlyRevenue,
      hourlyDistribution,
    ] = await Promise.all([
      this.prisma.$queryRaw<{ day: string; total: number; count: number }[]>`
        SELECT DATE("createdAt") as day, COALESCE(SUM(total),0)::float as total, COUNT(*)::int as count
        FROM "orders" WHERE "createdAt" >= ${from} AND "createdAt" <= ${to} AND status != 'CANCELLED'
        GROUP BY DATE("createdAt") ORDER BY day`,

      this.prisma.$queryRaw<{ status: string; count: number; total: number }[]>`
        SELECT status, COUNT(*)::int as count, COALESCE(SUM(total),0)::float as total
        FROM "orders" WHERE "createdAt" >= ${from} AND "createdAt" <= ${to}
        GROUP BY status ORDER BY count DESC`,

      this.prisma.$queryRaw<{ name: string; quantity: number; revenue: number }[]>`
        SELECT mi.name, SUM(oi.quantity)::int as quantity, COALESCE(SUM(oi.quantity * oi."unitPrice"),0)::float as revenue
        FROM "order_items" oi JOIN "menu_items" mi ON oi."menuItemId"=mi.id
        JOIN "orders" o ON oi."orderId"=o.id
        WHERE o."createdAt" >= ${from} AND o."createdAt" <= ${to} AND o.status != 'CANCELLED'
        GROUP BY mi.name ORDER BY revenue DESC LIMIT 15`,

      this.prisma.$queryRaw<{ method: string; count: number; total: number }[]>`
        SELECT COALESCE("paymentMethod",'Não informado') as method, COUNT(*)::int as count, COALESCE(SUM(total),0)::float as total
        FROM "orders" WHERE "createdAt" >= ${from} AND "createdAt" <= ${to} AND status != 'CANCELLED'
        GROUP BY "paymentMethod" ORDER BY total DESC`,

      this.prisma.$queryRaw<{ month: string; total: number; count: number }[]>`
        SELECT TO_CHAR("createdAt",'YYYY-MM') as month, COALESCE(SUM(total),0)::float as total, COUNT(*)::int as count
        FROM "orders" WHERE "createdAt" >= ${from} AND "createdAt" <= ${to} AND status != 'CANCELLED'
        GROUP BY TO_CHAR("createdAt",'YYYY-MM') ORDER BY month`,

      this.prisma.$queryRaw<{ hour: number; count: number }[]>`
        SELECT EXTRACT(HOUR FROM "createdAt")::int as hour, COUNT(*)::int as count
        FROM "orders" WHERE "createdAt" >= ${from} AND "createdAt" <= ${to} AND status != 'CANCELLED'
        GROUP BY EXTRACT(HOUR FROM "createdAt") ORDER BY hour`,
    ]);

    const totalRevenue = dailyRevenue.reduce((s, r) => s + r.total, 0);
    const totalOrders = dailyRevenue.reduce((s, r) => s + r.count, 0);
    const avgTicket = totalOrders > 0 ? Math.round((totalRevenue / totalOrders) * 100) / 100 : 0;

    return {
      summary: { totalRevenue, totalOrders, avgTicket },
      dailyRevenue, byStatus, topItems, byPaymentMethod, monthlyRevenue, hourlyDistribution,
    };
  }

  /* ════════════════════════════════════════════════════
   *  8. CLIENTES
   * ════════════════════════════════════════════════════ */
  async getClientsReport(from: Date, to: Date) {
    const [
      clientActivity,
      newClients,
      paymentBehavior,
      topSpenders,
      engagementByMonth,
    ] = await Promise.all([
      this.prisma.$queryRaw<{ name: string; email: string; reservations: number; payments_total: number; last_reservation: string | null }[]>`
        SELECT u.name, u.email,
          (SELECT COUNT(*) FROM "reservations" r WHERE r."userId"=u.id AND r."startDate" >= ${from} AND r."startDate" <= ${to} AND r.status != 'CANCELLED')::int as reservations,
          (SELECT COALESCE(SUM(p.amount),0) FROM "payments" p WHERE p."userId"=u.id AND p."paidAt" >= ${from} AND p."paidAt" <= ${to})::float as payments_total,
          (SELECT MAX(r."startDate")::text FROM "reservations" r WHERE r."userId"=u.id AND r.status != 'CANCELLED') as last_reservation
        FROM "users" u WHERE u.role='CLIENT' AND u."isActive"=true
        ORDER BY reservations DESC LIMIT 20`,

      this.prisma.$queryRaw<{ month: string; count: number }[]>`
        SELECT TO_CHAR("createdAt",'YYYY-MM') as month, COUNT(*)::int as count
        FROM "users" WHERE role='CLIENT' AND "createdAt" >= ${from} AND "createdAt" <= ${to}
        GROUP BY TO_CHAR("createdAt",'YYYY-MM') ORDER BY month`,

      this.prisma.$queryRaw<{ on_time: number; late: number; defaulting: number }[]>`
        SELECT
          (SELECT COUNT(*) FROM "charges" WHERE status='PAID' AND "paidAt" <= "dueDate" AND "createdAt" >= ${from} AND "createdAt" <= ${to} AND "deletedAt" IS NULL)::int as on_time,
          (SELECT COUNT(*) FROM "charges" WHERE status='PAID' AND "paidAt" > "dueDate" AND "createdAt" >= ${from} AND "createdAt" <= ${to} AND "deletedAt" IS NULL)::int as late,
          (SELECT COUNT(*) FROM "charges" WHERE status IN ('OVERDUE') AND "createdAt" >= ${from} AND "createdAt" <= ${to} AND "deletedAt" IS NULL)::int as defaulting`,

      this.prisma.$queryRaw<{ name: string; total: number; count: number }[]>`
        SELECT u.name, COALESCE(SUM(p.amount),0)::float as total, COUNT(*)::int as count
        FROM "payments" p JOIN "users" u ON p."userId"=u.id
        WHERE p."paidAt" >= ${from} AND p."paidAt" <= ${to} AND u.role='CLIENT'
        GROUP BY u.name ORDER BY total DESC LIMIT 10`,

      this.prisma.$queryRaw<{ month: string; active_clients: number }[]>`
        SELECT TO_CHAR(r."startDate",'YYYY-MM') as month, COUNT(DISTINCT r."userId")::int as active_clients
        FROM "reservations" r WHERE r."startDate" >= ${from} AND r."startDate" <= ${to} AND r.status != 'CANCELLED'
        GROUP BY TO_CHAR(r."startDate",'YYYY-MM') ORDER BY month`,
    ]);

    const totalActive = clientActivity.length;
    const behavior = paymentBehavior[0] || { on_time: 0, late: 0, defaulting: 0 };
    const totalPayments = behavior.on_time + behavior.late + behavior.defaulting;
    const onTimeRate = totalPayments > 0 ? Math.round((behavior.on_time / totalPayments) * 100) : 0;

    return {
      summary: { totalActiveClients: totalActive, onTimePaymentRate: onTimeRate, ...behavior },
      clientActivity, newClients, paymentBehavior: behavior, topSpenders, engagementByMonth,
    };
  }
}
