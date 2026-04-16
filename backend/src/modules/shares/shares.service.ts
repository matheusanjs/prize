import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { CreateShareDto } from './dto/create-share.dto';

@Injectable()
export class SharesService {
  constructor(private prisma: PrismaService) {}

  async create(dto: CreateShareDto) {
    const boat = await this.prisma.boat.findUnique({ where: { id: dto.boatId } });
    if (!boat) throw new NotFoundException('Embarcação não encontrada');

    const activeShares = await this.prisma.share.count({
      where: { boatId: dto.boatId, isActive: true },
    });

    if (activeShares >= boat.totalShares) {
      throw new BadRequestException(`Embarcação já atingiu o limite de ${boat.totalShares} cotas`);
    }

    const existingShareNumber = await this.prisma.share.findUnique({
      where: { boatId_shareNumber: { boatId: dto.boatId, shareNumber: dto.shareNumber } },
    });

    if (existingShareNumber && existingShareNumber.isActive) {
      throw new BadRequestException(`Cota nº ${dto.shareNumber} já está ocupada`);
    }

    // If share number exists but is deactivated, reactivate it with new data
    if (existingShareNumber && !existingShareNumber.isActive) {
      return this.prisma.share.update({
        where: { id: existingShareNumber.id },
        data: {
          userId: dto.userId,
          sharePercentage: 100 / boat.totalShares,
          monthlyValue: Number(boat.monthlyFee),
          startDate: new Date(dto.startDate),
          endDate: null,
          isActive: true,
          deletedAt: null,
        },
        include: { boat: true, user: { select: { id: true, name: true, email: true } } },
      });
    }

    return this.prisma.share.create({
      data: {
        ...dto,
        sharePercentage: 100 / boat.totalShares,
        monthlyValue: Number(boat.monthlyFee),
        startDate: new Date(dto.startDate),
      },
      include: { boat: true, user: { select: { id: true, name: true, email: true } } },
    });
  }

  async findAll(filters?: { boatId?: string; userId?: string }) {
    const where: any = { isActive: true, deletedAt: null };
    if (filters?.boatId) where.boatId = filters.boatId;
    if (filters?.userId) where.userId = filters.userId;
    return this.prisma.share.findMany({
      where,
      include: {
        boat: { select: { id: true, name: true, model: true, status: true, totalShares: true, monthlyFee: true, imageUrl: true } },
        user: { select: { id: true, name: true, email: true, phone: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findByBoat(boatId: string) {
    return this.prisma.share.findMany({
      where: { boatId, isActive: true, deletedAt: null },
      include: { user: { select: { id: true, name: true, email: true, phone: true } } },
      orderBy: { shareNumber: 'asc' },
    });
  }

  async findByUser(userId: string) {
    return this.prisma.share.findMany({
      where: { userId, isActive: true, deletedAt: null },
      include: { boat: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  async deactivate(id: string) {
    const share = await this.prisma.share.findUnique({ where: { id } });
    if (!share) throw new NotFoundException('Cota não encontrada');

    // Cancel all pending/overdue monthly fee and financing charges for this user+boat
    await this.prisma.charge.updateMany({
      where: {
        userId: share.userId,
        boatId: share.boatId,
        status: { in: ['PENDING', 'OVERDUE'] },
        category: { in: ['MONTHLY_FEE', 'QUOTA_SALE'] },
      },
      data: { status: 'CANCELLED' },
    });

    return this.prisma.share.update({
      where: { id },
      data: { isActive: false, endDate: new Date() },
    });
  }

  async update(id: string, data: { maxReservations?: number }) {
    const share = await this.prisma.share.findUnique({ where: { id } });
    if (!share) throw new NotFoundException('Cota não encontrada');

    const updateData: any = {};
    if (data.maxReservations !== undefined) updateData.maxReservations = data.maxReservations;

    return this.prisma.share.update({
      where: { id },
      data: updateData,
      include: {
        boat: { select: { id: true, name: true, model: true, totalShares: true, monthlyFee: true } },
        user: { select: { id: true, name: true, email: true, phone: true } },
      },
    });
  }
}
