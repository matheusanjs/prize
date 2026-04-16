import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { CreateMaintenanceDto } from './dto/create-maintenance.dto';
import { UpdateMaintenanceDto } from './dto/update-maintenance.dto';

@Injectable()
export class MaintenanceService {
  constructor(private prisma: PrismaService) {}

  async create(reportedById: string, dto: CreateMaintenanceDto) {
    const maintenance = await this.prisma.maintenance.create({
      data: {
        boatId: dto.boatId,
        reportedById,
        title: dto.title,
        description: dto.description,
        priority: dto.priority as any || 'MEDIUM',
        estimatedCost: dto.estimatedCost,
        scheduledAt: dto.scheduledAt ? new Date(dto.scheduledAt) : null,
      },
    });

    // Block boat if requested (explicit flag or CRITICAL priority for backwards compat)
    if (dto.blockBoat || dto.priority === 'CRITICAL') {
      await this.prisma.boat.update({
        where: { id: dto.boatId },
        data: { status: 'MAINTENANCE' },
      });
    }

    return maintenance;
  }

  async findAll(p = 1, l = 20, status?: string, boatId?: string) {
    const page = Number(p) || 1;
    const limit = Number(l) || 20;
    const where: any = { deletedAt: null };
    if (status) where.status = status;
    if (boatId) where.boatId = boatId;

    const [data, total] = await Promise.all([
      this.prisma.maintenance.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        include: {
          boat: { select: { id: true, name: true } },
          reportedBy: { select: { id: true, name: true } },
        },
        orderBy: [{ priority: 'desc' }, { createdAt: 'desc' }],
      }),
      this.prisma.maintenance.count({ where }),
    ]);

    return { data, total, page, pages: Math.ceil(total / limit) };
  }

  async update(id: string, dto: UpdateMaintenanceDto) {
    const maintenance = await this.prisma.maintenance.findUnique({ where: { id } });
    if (!maintenance) throw new NotFoundException('Manutenção não encontrada');

    const updated = await this.prisma.maintenance.update({
      where: { id },
      data: {
        ...(dto as any),
        startedAt: dto.status === 'IN_PROGRESS' ? new Date() : undefined,
        completedAt: dto.status === 'COMPLETED' ? new Date() : undefined,
      },
    });

    // If completed, release boat
    if (dto.status === 'COMPLETED') {
      const otherActive = await this.prisma.maintenance.count({
        where: {
          boatId: maintenance.boatId,
          status: { in: ['SCHEDULED', 'IN_PROGRESS'] },
          id: { not: id },
        },
      });

      if (otherActive === 0) {
        await this.prisma.boat.update({
          where: { id: maintenance.boatId },
          data: { status: 'AVAILABLE' },
        });
      }
    }

    // If started, block boat
    if (dto.status === 'IN_PROGRESS') {
      await this.prisma.boat.update({
        where: { id: maintenance.boatId },
        data: { status: 'MAINTENANCE' },
      });
    }

    return updated;
  }

  /** Resolve a maintenance — mark as COMPLETED and release boat if no other active maintenances */
  async resolve(id: string) {
    const maintenance = await this.prisma.maintenance.findUnique({ where: { id } });
    if (!maintenance) throw new NotFoundException('Manutenção não encontrada');
    if (maintenance.status === 'COMPLETED' || maintenance.status === 'CANCELLED') return maintenance;

    const updated = await this.prisma.maintenance.update({
      where: { id },
      data: { status: 'COMPLETED', completedAt: new Date() },
    });

    // Release boat if no other active maintenances
    const otherActive = await this.prisma.maintenance.count({
      where: {
        boatId: maintenance.boatId,
        status: { in: ['SCHEDULED', 'IN_PROGRESS'] },
        id: { not: id },
      },
    });

    if (otherActive === 0) {
      await this.prisma.boat.update({
        where: { id: maintenance.boatId },
        data: { status: 'AVAILABLE' },
      });
    }

    return updated;
  }
}
