import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { CreateOrderDto } from './dto/create-order.dto';
import { UpdateOrderDto } from './dto/update-order.dto';
import { WooviService } from '../payments/woovi.service';

@Injectable()
export class OrdersService {
  constructor(
    private prisma: PrismaService,
    private wooviService: WooviService,
  ) {}

  async findAll(status?: string, date?: string, restaurantTableId?: string) {
    const where: any = {};
    if (status) where.status = status;
    if (restaurantTableId) where.restaurantTableId = restaurantTableId;
    if (date) {
      const start = new Date(date);
      const end = new Date(date);
      end.setDate(end.getDate() + 1);
      where.createdAt = { gte: start, lt: end };
    }

    return this.prisma.order.findMany({
      where,
      include: { items: true, waiter: true, restaurantTable: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(id: string) {
    const order = await this.prisma.order.findUnique({
      where: { id },
      include: { items: { include: { menuItem: true } }, waiter: true, restaurantTable: true },
    });
    if (!order) throw new NotFoundException('Pedido não encontrado');
    return order;
  }

  async create(dto: CreateOrderDto) {
    const total = dto.items.reduce((sum, i) => sum + i.unitPrice * i.quantity, 0);

    return this.prisma.order.create({
      data: {
        type: (dto.type as any) || 'TABLE',
        status: 'PREPARING',
        tableNumber: dto.tableNumber,
        customerName: dto.customerName,
        notes: dto.notes,
        total,
        items: {
          create: dto.items.map(i => ({
            menuItemId: i.menuItemId || undefined,
            name: i.name,
            quantity: i.quantity,
            unitPrice: i.unitPrice,
            notes: i.notes,
          })),
        },
      },
      include: { items: true },
    });
  }

  async update(id: string, dto: UpdateOrderDto) {
    await this.findOne(id);
    return this.prisma.order.update({
      where: { id },
      data: {
        status: dto.status as any,
        tableNumber: dto.tableNumber,
        customerName: dto.customerName,
        notes: dto.notes,
      },
      include: { items: true },
    });
  }

  async advanceStatus(id: string) {
    const order = await this.findOne(id);
    const flow: Record<string, string> = {
      ANALYSIS: 'PREPARING',
      PREPARING: 'READY',
      READY: 'SERVED',
      SERVED: 'DONE',
      DELIVERING: 'DONE',
    };
    const next = flow[order.status];
    if (!next) throw new NotFoundException('Pedido já finalizado ou cancelado');
    return this.prisma.order.update({
      where: { id },
      data: { status: next as any },
      include: { items: true },
    });
  }

  async cancel(id: string) {
    await this.findOne(id);
    return this.prisma.order.update({
      where: { id },
      data: { status: 'CANCELLED' as any },
      include: { items: true },
    });
  }

  async remove(id: string) {
    await this.findOne(id);
    return this.prisma.order.delete({ where: { id } });
  }

  async createConvenienceOrder(userId: string, dto: {
    items: { menuItemId: string; quantity: number; notes?: string }[];
    notes?: string;
    paymentMethod: 'PIX' | 'PICKUP';
  }) {
    // Fetch menu items to get current prices
    const menuItemIds = dto.items.map(i => i.menuItemId);
    const menuItems = await this.prisma.menuItem.findMany({
      where: { id: { in: menuItemIds }, isConvenience: true, isAvailable: true },
    });

    if (menuItems.length !== dto.items.length) {
      throw new BadRequestException('Um ou mais itens não estão disponíveis na conveniência');
    }

    // Fetch user profile for customerName
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('Usuário não encontrado');

    const itemsWithPrice = dto.items.map(i => {
      const mi = menuItems.find(m => m.id === i.menuItemId)!;
      return { menuItemId: i.menuItemId, name: mi.name, quantity: i.quantity, unitPrice: mi.price, notes: i.notes };
    });

    const total = itemsWithPrice.reduce((sum, i) => sum + i.unitPrice * i.quantity, 0);

    const order = await this.prisma.order.create({
      data: {
        type: 'TAKEAWAY' as any,
        status: 'ANALYSIS' as any,
        tableNumber: 'APP COTISTA',
        customerName: user.name,
        notes: dto.notes,
        total,
        paymentMethod: dto.paymentMethod,
        items: {
          create: itemsWithPrice.map(i => ({
            menuItemId: i.menuItemId,
            name: i.name,
            quantity: i.quantity,
            unitPrice: i.unitPrice,
            notes: i.notes,
          })),
        },
      },
      include: { items: true },
    });

    // If PIX, create Woovi charge
    if (dto.paymentMethod === 'PIX') {
      try {
        const valueCents = Math.round(total * 100);
        const commentItems = itemsWithPrice.map(i => `${i.quantity}x ${i.name}`).join(', ');
        const comment = `Convenience #${order.number} - ${commentItems}`;
        const cpf = (user as any).cpf || '';
        const pix = await this.wooviService.createCharge({
          value: valueCents,
          comment,
          correlationID: `appco-${order.id}`,
          customerName: user.name,
          customerTaxId: cpf || undefined,
        });
        return { order, pix: { qrCode: pix.charge.qrCodeImage, brCode: pix.charge.brCode, expiresAt: pix.charge.expiresDate } };
      } catch {
        // PIX creation failed — return order without PIX (fallback to pickup)
        return { order, pix: null };
      }
    }

    return { order, pix: null };
  }

  async getStats() {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const [counts, todayTotal] = await Promise.all([
      this.prisma.order.groupBy({
        by: ['status'],
        _count: true,
        where: { createdAt: { gte: today, lt: tomorrow } },
      }),
      this.prisma.order.aggregate({
        _sum: { total: true },
        where: { createdAt: { gte: today, lt: tomorrow }, status: { not: 'CANCELLED' } },
      }),
    ]);

    return {
      byStatus: counts.reduce((acc: Record<string, number>, c: any) => ({ ...acc, [c.status]: c._count }), {} as Record<string, number>),
      todayRevenue: todayTotal._sum.total || 0,
    };
  }
}
