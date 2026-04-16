import { Injectable, NotFoundException, BadRequestException, Optional, Inject, Logger } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { WhatsAppAutomationService } from '../whatsapp/whatsapp-automation.service';
import { CreateShareSaleDto } from './dto/create-share-sale.dto';

@Injectable()
export class ShareSaleService {
  private readonly logger = new Logger(ShareSaleService.name);

  constructor(
    private prisma: PrismaService,
    @Optional() @Inject(WhatsAppAutomationService) private whatsapp?: WhatsAppAutomationService,
  ) {}

  async create(dto: CreateShareSaleDto) {
    const boat = await this.prisma.boat.findUnique({ where: { id: dto.boatId } });
    if (!boat) throw new NotFoundException('Embarcação não encontrada');

    const user = await this.prisma.user.findUnique({ where: { id: dto.userId } });
    if (!user) throw new NotFoundException('Cliente não encontrado');

    // Check if share number is already taken
    const existingShare = await this.prisma.share.findFirst({
      where: { boatId: dto.boatId, shareNumber: dto.shareNumber, isActive: true },
    });
    if (existingShare) {
      throw new BadRequestException(`Cota nº ${dto.shareNumber} já está ocupada nesta embarcação`);
    }

    const activeShares = await this.prisma.share.count({
      where: { boatId: dto.boatId, isActive: true },
    });
    if (activeShares >= boat.totalShares) {
      throw new BadRequestException(`Embarcação já atingiu o limite de ${boat.totalShares} cotas`);
    }

    const downPayment = dto.downPayment || 0;
    const financedAmount = dto.totalValue - downPayment;
    const installmentValue = dto.installments === 1
      ? financedAmount
      : Math.round((financedAmount / dto.installments) * 100) / 100;

    const startDate = new Date(dto.startDate);

    // 1. Create or reactivate the Share (vincular cota ao cliente)
    const inactiveShare = await this.prisma.share.findFirst({
      where: { boatId: dto.boatId, shareNumber: dto.shareNumber, isActive: false },
    });

    const share = inactiveShare
      ? await this.prisma.share.update({
          where: { id: inactiveShare.id },
          data: {
            userId: dto.userId,
            sharePercentage: 100 / boat.totalShares,
            monthlyValue: Number(boat.monthlyFee),
            startDate,
            endDate: null,
            isActive: true,
            deletedAt: null,
          },
        })
      : await this.prisma.share.create({
          data: {
            boatId: dto.boatId,
            userId: dto.userId,
            shareNumber: dto.shareNumber,
            sharePercentage: 100 / boat.totalShares,
            monthlyValue: Number(boat.monthlyFee),
            startDate,
          },
        });

    // 2. Create ShareSale record
    const sale = await this.prisma.shareSale.create({
      data: {
        boatId: dto.boatId,
        userId: dto.userId,
        shareNumber: dto.shareNumber,
        shareId: share.id,
        paymentType: dto.paymentType,
        totalValue: dto.totalValue,
        downPayment,
        installments: dto.installments,
        installmentValue,
        dueDay: dto.dueDay,
        startDate,
        notes: dto.notes,
      },
    });

    // 3. Generate installment charges (parcelas da cota)
    const installmentCharges = [];
    const today = new Date();
    today.setHours(23, 59, 59, 999);

    for (let i = 0; i < dto.installments; i++) {
      const isDownPayment = i === 0 && downPayment > 0;

      let dueDate: Date;
      if (i === 0) {
        // Entrada: must be paid today
        dueDate = new Date(today);
      } else {
        // Subsequent installments: start from next month
        dueDate = new Date(startDate.getFullYear(), startDate.getMonth() + i, dto.dueDay);
        // Ensure it's at least next month from today
        if (dueDate <= today) {
          dueDate = new Date(today.getFullYear(), today.getMonth() + i, dto.dueDay);
        }
      }
      dueDate.setHours(23, 59, 59, 999);

      const amount = isDownPayment ? downPayment : installmentValue;
      const description = dto.paymentType === 'AVISTA'
        ? `Venda de Cota — ${boat.name} (à vista)`
        : isDownPayment
          ? `Entrada — Venda de Cota ${boat.name} (1/${dto.installments})`
          : `Parcela ${i + 1}/${dto.installments} — Cota ${boat.name}`;

      installmentCharges.push(
        this.prisma.charge.create({
          data: {
            userId: dto.userId,
            description,
            amount,
            dueDate,
            category: 'QUOTA_SALE',
            reference: `share-sale-${sale.id}-${i + 1}`,
            boatId: dto.boatId,
          },
        }),
      );
    }

    // 4. Generate first mensalidade charge for next month
    const monthlyDueDay = dto.monthlyFeeDueDay || dto.dueDay;
    const nextMonth = today.getMonth() + 1;
    const nextMonthYear = nextMonth > 11 ? today.getFullYear() + 1 : today.getFullYear();
    const nextMonthIndex = nextMonth > 11 ? 0 : nextMonth;
    const mensalidadeDue = new Date(nextMonthYear, nextMonthIndex, monthlyDueDay, 23, 59, 59, 999);

    const mensalidadeCharge = this.prisma.charge.create({
      data: {
        userId: dto.userId,
        description: `Mensalidade — ${boat.name} (${String(nextMonthIndex + 1).padStart(2, '0')}/${nextMonthYear})`,
        amount: Number(boat.monthlyFee),
        dueDate: mensalidadeDue,
        category: 'MONTHLY_FEE',
        reference: `monthly-${share.id}-${nextMonthYear}-${nextMonthIndex + 1}`,
        boatId: dto.boatId,
      },
    });

    await this.prisma.$transaction([...installmentCharges, mensalidadeCharge]);

    // Send WhatsApp notification
    if (this.whatsapp) {
      this.whatsapp.sendSharePurchaseNotification(
        dto.userId, boat.name, dto.shareNumber, dto.totalValue, dto.installments,
      ).catch((err) => {
        this.logger.error(`Failed to send share purchase notification: ${err.message}`);
      });
    }

    return {
      sale,
      share,
      installments: dto.installments,
      installmentValue,
      monthlyFee: boat.monthlyFee,
      message: `Venda criada: ${dto.installments} parcela(s) de R$ ${installmentValue.toFixed(2)} + mensalidade gerada`,
    };
  }

  async findAll(p = 1, l = 20) {
    const page = Number(p) || 1;
    const limit = Number(l) || 20;
    const [data, total] = await Promise.all([
      this.prisma.shareSale.findMany({
        where: { status: 'ACTIVE' },
        include: {
          boat: { select: { id: true, name: true, model: true, monthlyFee: true } },
          user: { select: { id: true, name: true, email: true, phone: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.shareSale.count({ where: { status: 'ACTIVE' } }),
    ]);
    return { data, total, page, pages: Math.ceil(total / limit) };
  }

  async findOne(id: string) {
    const sale = await this.prisma.shareSale.findUnique({
      where: { id },
      include: {
        boat: { select: { id: true, name: true, model: true, monthlyFee: true } },
        user: { select: { id: true, name: true, email: true, phone: true } },
      },
    });
    if (!sale) throw new NotFoundException('Venda não encontrada');

    // Get associated charges (quota sale installments + monthly fees for this user+boat)
    const charges = await this.prisma.charge.findMany({
      where: {
        userId: sale.userId,
        boatId: sale.boatId,
        category: { in: ['QUOTA_SALE', 'MONTHLY_FEE'] },
      },
      orderBy: { dueDate: 'asc' },
    });

    return { ...sale, charges };
  }

  async cancel(id: string) {
    const sale = await this.prisma.shareSale.findUnique({ where: { id } });
    if (!sale) throw new NotFoundException('Venda não encontrada');
    if (sale.status === 'CANCELLED') throw new BadRequestException('Venda já cancelada');

    // 1. Cancel all pending/overdue charges for this user+boat (QUOTA_SALE + MONTHLY_FEE)
    await this.prisma.charge.updateMany({
      where: {
        userId: sale.userId,
        boatId: sale.boatId,
        status: { in: ['PENDING', 'OVERDUE'] },
        category: { in: ['QUOTA_SALE', 'MONTHLY_FEE'] },
      },
      data: { status: 'CANCELLED' },
    });

    // 2. Deactivate the share (remove user from cota)
    if (sale.shareId) {
      await this.prisma.share.update({
        where: { id: sale.shareId },
        data: { isActive: false, endDate: new Date() },
      });
    }

    // 3. Mark sale as cancelled
    return this.prisma.shareSale.update({
      where: { id },
      data: { status: 'CANCELLED' },
    });
  }
}
