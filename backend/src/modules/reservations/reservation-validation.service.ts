import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { Cron } from '@nestjs/schedule';

export interface ValidationAnomaly {
  type: 'OVERLAP' | 'ORPHANED' | 'STALE';
  severity: 'CRITICAL' | 'WARNING';
  reservationIds: string[];
  boatId?: string;
  description: string;
  detectedAt: Date;
}

@Injectable()
export class ReservationValidationService {
  private readonly logger = new Logger(ReservationValidationService.name);

  constructor(private prisma: PrismaService) {}

  /**
   * Runs every 5 minutes. Validates all active reservations for anomalies.
   */
  @Cron('*/5 * * * *', { timeZone: 'America/Sao_Paulo' })
  async validateAllReservations() {
    this.logger.debug('Starting reservation validation cycle');
    const anomalies: ValidationAnomaly[] = [];

    anomalies.push(...await this.detectOverlaps());
    anomalies.push(...await this.detectOrphanedReservations());
    anomalies.push(...await this.detectStaleInUseReservations());

    if (anomalies.length > 0) {
      this.logger.warn(
        `Validation found ${anomalies.length} anomaly(ies): ` +
        anomalies.map(a => `[${a.severity}] ${a.type} - ${a.description}`).join('; ')
      );
    } else {
      this.logger.debug('Validation cycle complete: no anomalies');
    }

    return anomalies;
  }

  /**
   * Pre-creation validation: run before creating a new reservation.
   */
  async validateBeforeCreate(boatId: string, startDate: Date, endDate: Date) {
    const conflict = await this.prisma.reservation.findFirst({
      where: {
        boatId,
        status: { in: ['CONFIRMED', 'PENDING', 'IN_USE'] },
        deletedAt: null,
        startDate: { lt: endDate },
        endDate: { gt: startDate },
      },
    });
    if (conflict) {
      throw new Error(`Conflict with reservation ${conflict.id}`);
    }
  }

  private async detectOverlaps(): Promise<ValidationAnomaly[]> {
    const overlaps = await this.prisma.$queryRaw<Array<{id1: string; id2: string; boatId: string}>>`
      SELECT
        a.id AS id1,
        b.id AS id2,
        a."boatId"
      FROM "reservations" a
      JOIN "reservations" b ON a."boatId" = b."boatId"
        AND a.id < b.id
        AND a.status IN ('CONFIRMED', 'PENDING', 'IN_USE')
        AND b.status IN ('CONFIRMED', 'PENDING', 'IN_USE')
        AND a."deletedAt" IS NULL
        AND b."deletedAt" IS NULL
        AND a."startDate" < b."endDate"
        AND a."endDate" > b."startDate"
    `;

    return overlaps.map(o => ({
      type: 'OVERLAP' as const,
      severity: 'CRITICAL' as const,
      reservationIds: [o.id1, o.id2],
      boatId: o.boatId,
      description: `Overlapping reservations ${o.id1} and ${o.id2} on boat ${o.boatId}`,
      detectedAt: new Date(),
    }));
  }

  private async detectOrphanedReservations(): Promise<ValidationAnomaly[]> {
    const orphaned = await this.prisma.reservation.findMany({
      where: {
        status: { in: ['CONFIRMED', 'PENDING'] },
        deletedAt: null,
        boat: {
          OR: [
            { status: { not: 'AVAILABLE' } },
            { deletedAt: { not: null } },
          ],
        },
      },
      select: { id: true, boatId: true },
    });

    return orphaned.map(r => ({
      type: 'ORPHANED' as const,
      severity: 'WARNING' as const,
      reservationIds: [r.id],
      boatId: r.boatId,
      description: `Reservation ${r.id} references unavailable boat ${r.boatId}`,
      detectedAt: new Date(),
    }));
  }

  private async detectStaleInUseReservations(): Promise<ValidationAnomaly[]> {
    const stale = await this.prisma.reservation.findMany({
      where: {
        status: 'IN_USE',
        endDate: { lt: new Date() },
        deletedAt: null,
      },
      select: { id: true, boatId: true, endDate: true },
    });

    if (stale.length > 0) {
      await this.prisma.reservation.updateMany({
        where: { id: { in: stale.map(r => r.id) } },
        data: { status: 'COMPLETED' },
      });
      this.logger.log(`Auto-completed ${stale.length} stale IN_USE reservation(s)`);
    }

    return stale.map(r => ({
      type: 'STALE' as const,
      severity: 'WARNING' as const,
      reservationIds: [r.id],
      boatId: r.boatId,
      description: `Stale IN_USE reservation ${r.id} ended at ${r.endDate}`,
      detectedAt: new Date(),
    }));
  }
}
