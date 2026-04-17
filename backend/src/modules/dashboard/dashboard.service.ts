import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';

@Injectable()
export class DashboardService {
  private readonly logger = new Logger(DashboardService.name);

  constructor(private prisma: PrismaService) {}

  async getFullStats() {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const startOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const endOfLastMonth = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59);
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const todayEnd = new Date(todayStart.getTime() + 86400000);
    const weekAgo = new Date(now.getTime() - 7 * 86400000);

    const [
      // Finance
      totalRevenue,
      monthlyRevenue,
      lastMonthRevenue,
      pendingCharges,
      pendingChargesAmount,
      overdueCharges,
      overdueChargesAmount,
      activeDelinquents,
      delinquencyDebt,
      todayPayments,
      // Users
      totalUsers,
      totalClients,
      totalOperators,
      newClientsThisMonth,
      // Boats
      totalBoats,
      boatsInUse,
      boatsInMaintenance,
      // Reservations
      todayReservations,
      monthReservations,
      lastMonthReservations,
      cancelledThisMonth,
      confirmedToday,
      // Fuel
      monthFuel,
      lastMonthFuel,
      // Maintenance
      activeMaintenance,
      criticalMaintenance,
      completedMaintenanceMonth,
      // Orders (food)
      todayOrders,
      monthOrders,
      todayOrderRevenue,
      monthOrderRevenue,
      // Push
      reachableDevices,
      notificationsLastWeek,
      // Operations
      todayUsages,
    ] = await Promise.all([
      // Finance
      this.prisma.payment.aggregate({ _sum: { amount: true } }),
      this.prisma.payment.aggregate({ where: { paidAt: { gte: startOfMonth } }, _sum: { amount: true } }),
      this.prisma.payment.aggregate({ where: { paidAt: { gte: startOfLastMonth, lte: endOfLastMonth } }, _sum: { amount: true } }),
      this.prisma.charge.count({ where: { status: 'PENDING' } }),
      this.prisma.charge.aggregate({ where: { status: 'PENDING' }, _sum: { amount: true } }),
      this.prisma.charge.count({ where: { status: 'OVERDUE' } }),
      this.prisma.charge.aggregate({ where: { status: 'OVERDUE' }, _sum: { amount: true } }),
      this.prisma.delinquency.count({ where: { status: 'ACTIVE' } }),
      this.prisma.delinquency.aggregate({ where: { status: 'ACTIVE' }, _sum: { totalAmount: true } }),
      this.prisma.payment.aggregate({ where: { paidAt: { gte: todayStart, lt: todayEnd } }, _sum: { amount: true }, _count: true }),
      // Users
      this.prisma.user.count({ where: { isActive: true } }),
      this.prisma.user.count({ where: { isActive: true, role: 'CLIENT' } }),
      this.prisma.user.count({ where: { isActive: true, role: 'OPERATOR' } }),
      this.prisma.user.count({ where: { role: 'CLIENT', createdAt: { gte: startOfMonth } } }),
      // Boats
      this.prisma.boat.count({ where: { deletedAt: null } }),
      this.prisma.boat.count({ where: { status: 'IN_USE', deletedAt: null } }),
      this.prisma.boat.count({ where: { status: 'MAINTENANCE', deletedAt: null } }),
      // Reservations
      this.prisma.reservation.count({ where: { startDate: { gte: todayStart, lt: todayEnd } } }),
      this.prisma.reservation.count({ where: { createdAt: { gte: startOfMonth } } }),
      this.prisma.reservation.count({ where: { createdAt: { gte: startOfLastMonth, lte: endOfLastMonth } } }),
      this.prisma.reservation.count({ where: { status: 'CANCELLED', createdAt: { gte: startOfMonth } } }),
      this.prisma.reservation.count({ where: { status: 'CONFIRMED', startDate: { gte: todayStart, lt: todayEnd } } }),
      // Fuel
      this.prisma.fuelLog.aggregate({ where: { loggedAt: { gte: startOfMonth } }, _sum: { liters: true, totalCost: true }, _count: true }),
      this.prisma.fuelLog.aggregate({ where: { loggedAt: { gte: startOfLastMonth, lte: endOfLastMonth } }, _sum: { liters: true, totalCost: true } }),
      // Maintenance
      this.prisma.maintenance.count({ where: { status: { in: ['SCHEDULED', 'IN_PROGRESS'] } } }),
      this.prisma.maintenance.count({ where: { priority: 'CRITICAL', status: { not: 'COMPLETED' } } }),
      this.prisma.maintenance.count({ where: { status: 'COMPLETED', updatedAt: { gte: startOfMonth } } }),
      // Orders
      this.prisma.order.count({ where: { createdAt: { gte: todayStart, lt: todayEnd } } }),
      this.prisma.order.count({ where: { createdAt: { gte: startOfMonth } } }),
      this.prisma.order.aggregate({ where: { createdAt: { gte: todayStart, lt: todayEnd }, status: { not: 'CANCELLED' } }, _sum: { total: true } }),
      this.prisma.order.aggregate({ where: { createdAt: { gte: startOfMonth }, status: { not: 'CANCELLED' } }, _sum: { total: true } }),
      // Push
      this.prisma.deviceToken.count({ where: { enabled: true } }).then(async (d) => d + await this.prisma.pushSubscription.count()),
      this.prisma.notification.count({ where: { sentAt: { gte: weekAgo } } }),
      // Operations
      this.prisma.operationalQueue.count({ where: { startedAt: { gte: todayStart, lt: todayEnd } } }).catch(() => 0),
    ]);

    // Revenue per day (last 30 days) for chart
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 86400000);
    const revenueByDay = await this.prisma.$queryRaw<
      { day: string; total: number }[]
    >`SELECT DATE("paidAt") as day, COALESCE(SUM(amount), 0)::float as total FROM "payments" WHERE "paidAt" >= ${thirtyDaysAgo} GROUP BY DATE("paidAt") ORDER BY day`;

    // Reservations per day (last 14 days)
    const fourteenDaysAgo = new Date(now.getTime() - 14 * 86400000);
    const reservationsByDay = await this.prisma.$queryRaw<
      { day: string; count: bigint }[]
    >`SELECT DATE("startDate") as day, COUNT(*) as count FROM "reservations" WHERE "startDate" >= ${fourteenDaysAgo} AND "startDate" <= ${new Date(now.getTime() + 7 * 86400000)} GROUP BY DATE("startDate") ORDER BY day`;

    // Recent charges by status
    const chargesByStatus = await this.prisma.charge.groupBy({
      by: ['status'],
      _count: true,
    });

    // Top boats by reservations this month
    const topBoats = await this.prisma.$queryRaw<
      { boatId: string; name: string; count: bigint }[]
    >`SELECT r."boatId", b.name, COUNT(*) as count FROM "reservations" r JOIN "boats" b ON r."boatId" = b.id WHERE r."createdAt" >= ${startOfMonth} GROUP BY r."boatId", b.name ORDER BY count DESC LIMIT 5`;

    // Recent activity (latest 8 events)
    const [recentReservations, recentPayments] = await Promise.all([
      this.prisma.reservation.findMany({
        take: 5,
        orderBy: { createdAt: 'desc' },
        select: { id: true, status: true, startDate: true, createdAt: true, user: { select: { name: true } }, boat: { select: { name: true } } },
      }),
      this.prisma.payment.findMany({
        take: 5,
        orderBy: { paidAt: 'desc' },
        select: { id: true, amount: true, method: true, paidAt: true, charge: { select: { description: true, user: { select: { name: true } } } } },
      }),
    ]);

    const monthlyRev = monthlyRevenue._sum.amount || 0;
    const lastMonthRev = lastMonthRevenue._sum.amount || 0;
    const revenueGrowth = lastMonthRev > 0 ? Math.round(((monthlyRev - lastMonthRev) / lastMonthRev) * 100) : 0;

    const monthRes = monthReservations;
    const lastMonthRes = lastMonthReservations;
    const reservationGrowth = lastMonthRes > 0 ? Math.round(((monthRes - lastMonthRes) / lastMonthRes) * 100) : 0;

    const occupancyRate = totalBoats > 0 ? Math.round((boatsInUse / totalBoats) * 100) : 0;

    return {
      finance: {
        totalRevenue: totalRevenue._sum.amount || 0,
        monthlyRevenue: monthlyRev,
        lastMonthRevenue: lastMonthRev,
        revenueGrowth,
        pendingCharges,
        pendingAmount: pendingChargesAmount._sum.amount || 0,
        overdueCharges,
        overdueAmount: overdueChargesAmount._sum.amount || 0,
        activeDelinquents,
        delinquencyDebt: delinquencyDebt._sum.totalAmount || 0,
        todayPayments: todayPayments._count || 0,
        todayPaymentsAmount: todayPayments._sum.amount || 0,
        revenueByDay: revenueByDay.map((r) => ({ day: r.day, total: Number(r.total) })),
      },
      users: {
        total: totalUsers,
        clients: totalClients,
        operators: totalOperators,
        newThisMonth: newClientsThisMonth,
      },
      boats: {
        total: totalBoats,
        inUse: boatsInUse,
        inMaintenance: boatsInMaintenance,
        available: totalBoats - boatsInUse - boatsInMaintenance,
        occupancyRate,
      },
      reservations: {
        today: todayReservations,
        confirmedToday,
        monthTotal: monthReservations,
        lastMonthTotal: lastMonthReservations,
        growth: reservationGrowth,
        cancelledThisMonth,
        reservationsByDay: reservationsByDay.map((r) => ({ day: r.day, count: Number(r.count) })),
        topBoats: topBoats.map((b) => ({ name: b.name, count: Number(b.count) })),
      },
      fuel: {
        monthLiters: monthFuel._sum.liters || 0,
        monthCost: monthFuel._sum.totalCost || 0,
        refuelCount: monthFuel._count || 0,
        lastMonthLiters: lastMonthFuel._sum.liters || 0,
        lastMonthCost: lastMonthFuel._sum.totalCost || 0,
      },
      maintenance: {
        active: activeMaintenance,
        critical: criticalMaintenance,
        completedThisMonth: completedMaintenanceMonth,
      },
      orders: {
        today: todayOrders,
        monthTotal: monthOrders,
        todayRevenue: todayOrderRevenue._sum.total || 0,
        monthRevenue: monthOrderRevenue._sum.total || 0,
      },
      operations: {
        todayUsages,
      },
      engagement: {
        reachableDevices,
        notificationsLastWeek,
      },
      chargesByStatus: chargesByStatus.map((c) => ({ status: c.status, count: c._count })),
      recentActivity: {
        reservations: recentReservations,
        payments: recentPayments,
      },
    };
  }
}
