import { Controller, Post, Get, Body, Param, Req, UseGuards, HttpCode, ValidationPipe, UsePipes, RawBodyRequest, Headers } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { WooviService } from './woovi.service';
import { PrismaService } from '../../database/prisma.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@ApiTags('payments')
@Controller('payments')
export class WooviController {
  constructor(
    private wooviService: WooviService,
    private prisma: PrismaService,
  ) {}

  // ── Webhook (no auth) ──

  @Get('webhook')
  @ApiOperation({ summary: 'Validação do webhook Woovi' })
  async webhookHealth() {
    return { status: 'ok', message: 'Webhook ativo' };
  }

  @Post('webhook')
  @HttpCode(200)
  @UsePipes(new ValidationPipe({ whitelist: false, transform: false }))
  @ApiOperation({ summary: 'Receber webhook da Woovi' })
  async handleWebhook(
    @Req() req: RawBodyRequest<any>,
    @Body() payload: any,
    @Headers('x-openpix-signature') openpixSignature?: string,
    @Headers('x-webhook-signature') wooviSignature?: string,
    @Headers('x-woovi-signature') wooviSignatureAlt?: string,
  ) {
    const resolvedWooviSignature = wooviSignature || wooviSignatureAlt;
    const signatureHeader = resolvedWooviSignature || openpixSignature;
    const rawBody = req.rawBody?.toString('utf-8');
    this.wooviService['logger'].log(`Webhook received: rawBody present=${!!rawBody}, signature=${signatureHeader?.slice(0, 20)}..., body keys=${Object.keys(payload || {})}`);
    if (rawBody) {
      this.wooviService['logger'].log(`Raw body (first 300): ${rawBody.slice(0, 300)}`);
    }
    return this.wooviService.handleWebhook(
      payload,
      { openpix: openpixSignature, woovi: resolvedWooviSignature },
      rawBody || JSON.stringify(payload),
    );
  }

  // ── Create PIX charge for a specific finance charge ──

  @Post('woovi/charge/:chargeId')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Gerar PIX para uma cobrança existente' })
  async createChargeForExisting(
    @Param('chargeId') chargeId: string,
    @CurrentUser('id') userId: string,
  ) {
    const charge = await this.prisma.charge.findFirst({
      where: { id: chargeId, userId, deletedAt: null },
    });

    if (!charge) {
      throw new Error('Cobrança não encontrada');
    }

    if (charge.status === 'PAID') {
      throw new Error('Cobrança já está paga');
    }

    // Check if there's an existing non-expired payment with Woovi data
    const existingPayment = await this.prisma.payment.findFirst({
      where: {
        chargeId,
        method: 'PIX',
        wooviCorrelationID: { not: null },
        wooviStatus: { in: ['ACTIVE', 'PENDING'] },
      },
      orderBy: { createdAt: 'desc' },
    });

    if (existingPayment && existingPayment.wooviExpiresDate) {
      // If QR code hasn't expired, return existing data
      if (existingPayment.wooviExpiresDate > new Date()) {
        return {
          paymentId: existingPayment.id,
          status: existingPayment.wooviStatus || 'pending',
          brCode: existingPayment.wooviBrCode,
          qrCodeImage: existingPayment.wooviQrCodeUrl,
          pixKey: existingPayment.wooviPixKey,
          paymentLinkUrl: existingPayment.wooviPaymentLinkUrl,
          expiresIn: Math.max(0, Math.floor((existingPayment.wooviExpiresDate.getTime() - Date.now()) / 1000)),
          expiresDate: existingPayment.wooviExpiresDate,
          value: charge.amount,
        };
      }

      // Expired: remove old payment record so we can create a new one
      await this.prisma.payment.delete({ where: { id: existingPayment.id } });
    }

    // Create new Woovi charge with unique correlationID (timestamp-based to avoid duplicates)
    const amountInCents = Math.round(charge.amount * 100);
    const correlationID = `prizeclub-charge-${charge.id}-${Date.now()}`;

    const wooviResponse = await this.wooviService.createCharge({
      value: amountInCents,
      comment: charge.description,
      correlationID,
    });

    // Create new payment record with Woovi details
    const payment = await this.prisma.payment.create({
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

    // Also update charge with latest correlationID for frontend check
    await this.prisma.charge.update({
      where: { id: chargeId },
      data: { wooviBrCode: wooviResponse.charge.brCode, wooviCorrelationID: correlationID },
    });

    return {
      paymentId: payment.id,
      status: 'pending',
      brCode: wooviResponse.brCode,
      qrCodeImage: wooviResponse.charge.qrCodeImage,
      pixKey: wooviResponse.charge.pixKey,
      paymentLinkUrl: wooviResponse.charge.paymentLinkUrl,
      expiresIn: wooviResponse.charge.expiresIn,
      expiresDate: wooviResponse.charge.expiresDate,
      value: wooviResponse.charge.value,
    };
  }

  // ── Create standalone PIX charge ──

  @Post('woovi/charge')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN', 'OPERATOR')
  @ApiOperation({ summary: 'Criar cobrança PIX via Woovi (admin)' })
  async createCharge(
    @Body() dto: { value: number; comment?: string; customerName?: string; customerTaxId?: string },
  ): Promise<any> {
    return this.wooviService.createCharge(dto);
  }

  // ── Check charge status ──

  @Get('woovi/charge/:correlationID')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Consultar status de cobrança Woovi' })
  async checkCharge(@Param('correlationID') correlationID: string) {
    return this.wooviService.getChargeByCorrelationID(correlationID);
  }

  // ── Reconciliation: fix stuck pending charges ──

  @Post('woovi/reconciliate')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @ApiOperation({
    summary: 'Reconciliar cargas pendentes com Woovi',
    description: 'Busca cargas em status PENDING/AWAITING no banco mas COMPLETED na Woovi e faz a baixa automática',
  })
  async reconciliatePending(
    @Body() dto: { chargeId?: string; limit?: number },
  ) {
    return this.wooviService.reconciliatePendingCharges(dto);
  }
}
