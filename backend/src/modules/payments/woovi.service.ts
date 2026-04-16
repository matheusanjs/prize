import { Injectable, BadRequestException, Logger, Optional, Inject } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../database/prisma.service';
import { WhatsAppAutomationService } from '../whatsapp/whatsapp-automation.service';
import * as crypto from 'crypto';
import axios from 'axios';

interface WooviChargeResponse {
  charge: {
    value: number;
    comment: string;
    identifier: string;
    correlationID: string;
    transactionID: string;
    status: string;
    brCode: string;
    pixKey: string;
    expiresIn: number;
    expiresDate: string;
    paymentLinkUrl: string;
    qrCodeImage: string;
    fee: number;
    valueWithDiscount: number;
    paidAt?: string;
    customer?: {
      name: string;
      taxID?: {
        taxID: string;
        type: string;
      };
    };
  };
  correlationID: string;
  brCode: string;
}

interface WooviWebhookPayload {
  event: string;
  charge: {
    transactionID: string;
    value: number;
    status: string;
    comment?: string;
    correlationID?: string;
    paidAt?: string;
    pix: {
      transactionID: string;
    };
  };
}

@Injectable()
export class WooviService {
  private readonly logger = new Logger(WooviService.name);
  private readonly appId: string;
  private readonly webhookSecret: string;
  private readonly webhookPublicKeyBase64: string;
  private readonly baseUrl = 'https://api.woovi.com/api/v1';

  constructor(
    private prisma: PrismaService,
    private configService: ConfigService,
    @Optional() @Inject(WhatsAppAutomationService) private whatsapp?: WhatsAppAutomationService,
  ) {
    this.appId = this.configService.get<string>('WOVI_APPID') || '';
    this.webhookSecret = this.configService.get<string>('WOVI_WEBHOOK_SECRET') || '';
    this.webhookPublicKeyBase64 = this.configService.get<string>('WOVI_WEBHOOK_PUBLIC_KEY_BASE64') || '';
  }

  private getHeaders() {
    return {
      Authorization: this.appId,
      'Content-Type': 'application/json',
    };
  }

  /**
   * Create a new PIX charge via Woovi API
   */
  async createCharge(dto: {
    value: number;
    comment?: string;
    correlationID?: string;
    customerName?: string;
    customerTaxId?: string;
  }): Promise<WooviChargeResponse> {
    const correlationID = dto.correlationID || `prizeclub-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    // Sanitize comment: replace common non-ASCII chars, then strip anything remaining
    const sanitizedComment = (dto.comment || '')
      .replace(/—/g, '-')  // em-dash
      .replace(/–/g, '-')  // en-dash
      .replace(/[\u201C\u201D]/g, '"') // smart double quotes
      .replace(/[\u2018\u2019]/g, "'") // smart single quotes
      .replace(/…/g, '...') // ellipsis
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '') // remove combining diacritics (accents)
      .replace(/[^\x20-\x7E]/g, '')     // strip any remaining non-ASCII
      .trim()
      .replace(/\s+/g, ' ');

    const body: Record<string, any> = {
      value: dto.value,
      comment: sanitizedComment,
      correlationID,
    };

    if (dto.customerName) {
      body.customer = { name: dto.customerName };
      if (dto.customerTaxId) {
        body.customer.taxID = dto.customerTaxId;
      }
    }

    try {
      const response = await axios.post(`${this.baseUrl}/charge`, body, {
        headers: this.getHeaders(),
      });

      this.logger.log(`Woovi charge created: ${correlationID} (txId: ${response.data.charge.transactionID})`);
      return response.data;
    } catch (error) {
      const err = error as any;
      const message = err?.response?.data?.error || err?.message;
      this.logger.error(`Failed to create Woovi charge: ${message}`);
      throw new BadRequestException(`Erro ao gerar cobrança Pix: ${message}`);
    }
  }

  /**
   * Get charge details from Woovi by correlation ID
   */
  async getChargeByCorrelationID(correlationID: string) {
    try {
      const response = await axios.get(`${this.baseUrl}/charge/correlationID/${correlationID}`, {
        headers: this.getHeaders(),
      });
      return response.data;
    } catch (error) {
      const err = error as any;
      const message = err?.response?.data?.error || err?.message;
      this.logger.error(`Failed to get Woovi charge: ${message}`);
      throw new BadRequestException(`Erro ao buscar cobrança: ${message}`);
    }
  }

  private normalizeSignature(value: string): string {
    return value
      .trim()
      .replace(/^sha256=/i, '')
      .replace(/^v1=/i, '')
      .replace(/^"|"$/g, '');
  }

  private safeEquals(a: string, b: string): boolean {
    const aBuf = Buffer.from(a);
    const bBuf = Buffer.from(b);
    if (aBuf.length !== bBuf.length) return false;
    return crypto.timingSafeEqual(aBuf, bBuf);
  }

  /**
   * Validate x-webhook-signature (recommended by Woovi) using RSA public key
   */
  verifyWooviPublicSignature(payload: string, signature: string): boolean {
    if (!this.webhookPublicKeyBase64) {
      return false;
    }

    const provided = this.normalizeSignature(signature);
    if (!provided) return false;

    try {
      const pem = Buffer.from(this.webhookPublicKeyBase64, 'base64').toString('utf8');
      const verifier = crypto.createVerify('RSA-SHA256');
      verifier.update(payload);
      verifier.end();
      return verifier.verify(pem, Buffer.from(provided, 'base64'));
    } catch {
      return false;
    }
  }

  /**
   * Verify webhook HMAC signature (deprecated but still supported by Woovi)
   */
  verifyHmac(payload: string, signature: string): boolean {
    if (!this.webhookSecret) {
      return false;
    }

    const provided = this.normalizeSignature(signature);
    if (!provided) return false;

    const secrets = [this.webhookSecret];
    if (this.webhookSecret.startsWith('openpix_')) {
      secrets.push(this.webhookSecret.replace(/^openpix_/, ''));
    }

    for (const secret of secrets) {
      const hmacSha1 = crypto.createHmac('sha1', secret).update(payload).digest('base64');
      const hmacBase64 = crypto.createHmac('sha256', secret).update(payload).digest('base64');
      const hmacHex = crypto.createHmac('sha256', secret).update(payload).digest('hex');
      if (this.safeEquals(hmacSha1, provided) || this.safeEquals(hmacBase64, provided) || this.safeEquals(hmacHex, provided)) {
        return true;
      }
    }

    return false;
  }

  /**
   * Handle incoming webhook from Woovi
   */
  async handleWebhook(
    payload: WooviWebhookPayload,
    signatures?: { openpix?: string; woovi?: string },
    rawBody?: string,
  ) {
    const body = rawBody || JSON.stringify(payload);

    // Prefer x-webhook-signature (recommended by Woovi), fallback to X-OpenPix-Signature (HMAC)
    const wooviSignature = signatures?.woovi;
    const openpixSignature = signatures?.openpix;

    if (wooviSignature) {
      const ok = this.verifyWooviPublicSignature(body, wooviSignature);
      if (!ok) {
        this.logger.error('Invalid x-webhook-signature');
        throw new BadRequestException('Invalid signature');
      }
    } else if (openpixSignature) {
      const ok = this.verifyHmac(body, openpixSignature);
      if (!ok) {
        this.logger.error('Invalid X-OpenPix-Signature');
        throw new BadRequestException('Invalid signature');
      }
    } else if (this.webhookSecret || this.webhookPublicKeyBase64) {
      // If verification is configured, signature is mandatory
      this.logger.error('Missing webhook signature header');
      throw new BadRequestException('Missing signature');
    } else {
      this.logger.warn('No webhook signature configured; request accepted without validation');
    }

    const event = payload?.event;
    const charge = payload?.charge;

    if (!event) {
      this.logger.warn('Webhook payload without event received');
      return { received: true, status: 'invalid_payload' };
    }

    this.logger.log(`Woovi webhook received: event=${event}, txId=${charge?.transactionID || 'n/a'}`);

    // Handle both regular and alternative payer scenarios
    const isChargeCompleted =
      event === 'OPENPIX:CHARGE_COMPLETED' ||
      event === 'OPENPIX:CHARGE_COMPLETED_NOT_SAME_CUSTOMER_PAYER' ||
      charge?.status === 'COMPLETED';

    if (isChargeCompleted) {
      if (!charge?.transactionID) {
        this.logger.warn(`Charge completion event without transactionID: ${event}`);
        return { received: true, status: 'missing_transaction' };
      }
      return this.handleChargeCompleted(charge);
    }

    this.logger.log(`Unhandled Woovi event: ${event}`);
    return { received: true, event };
  }

  /**
   * Handle CHARGE_COMPLETED event - register payment
   */
  private async handleChargeCompleted(charge: WooviWebhookPayload['charge']) {
    const transactionID = charge.transactionID;

    // Primary: find payment by wooviTransactionId
    const existingPayment = await this.prisma.payment.findFirst({
      where: { wooviTransactionId: transactionID },
      include: { charge: true },
    });

    if (existingPayment) {
      if (existingPayment.charge.status === 'PAID') {
        this.logger.log(`Payment already processed for txId: ${transactionID}`);
        return { received: true, status: 'already_processed' };
      }
      return this.processPayment(existingPayment.charge, charge);
    }

    // Fallback: find by correlationID on payment
    if (charge.correlationID) {
      const byCorrelation = await this.prisma.payment.findFirst({
        where: { wooviCorrelationID: charge.correlationID },
        include: { charge: true },
      });

      if (byCorrelation) {
        return this.processPayment(byCorrelation.charge, charge);
      }
    }

    // Last fallback: find charge by correlationID (handles both old and new formats)
    if (charge.correlationID) {
      // Extract chargeId from correlationID: prizeclub-charge-{chargeId}-{timestamp} or prizeclub-charge-{chargeId}
      // Prisma CUIDs contain uppercase letters (e.g. ckzp9Q8xN...), so pattern must include A-Z
      const match = charge.correlationID.match(/^prizeclub-charge-([a-zA-Z0-9]+)(?:-\d+)?$/);
      const chargeId = match ? match[1] : charge.correlationID.replace(/^charge-/, '');
      const directCharge = await this.prisma.charge.findUnique({
        where: { id: chargeId, wooviCorrelationID: { not: null } },
      });

      if (directCharge) {
        const paidAt = charge.paidAt ? new Date(charge.paidAt) : new Date();
        await this.prisma.$transaction(async (tx) => {
          await tx.charge.update({
            where: { id: directCharge.id },
            data: { status: 'PAID', paidAt },
          });
          await tx.payment.create({
            data: {
              chargeId: directCharge.id,
              userId: directCharge.userId,
              amount: directCharge.amount,
              method: 'PIX',
              transactionId: transactionID,
              wooviTransactionId: transactionID,
              wooviCorrelationID: charge.correlationID,
              wooviStatus: charge.status,
              paidAt,
            },
          });
        });
        await this.resolveDelinquency(directCharge.userId);
        this.logger.log(`Payment processed for charge ${directCharge.id} (fallback)`);
        return { received: true, status: 'payment_processed', chargeId: directCharge.id };
      }
    }

    this.logger.warn(`No matching payment/charge for Woovi txId: ${transactionID}`);
    return { received: true, status: 'no_matching_payment' };
  }

  /**
   * Process the payment: update charge status and create/update payment record
   */
  private async processPayment(
    chargeRecord: any,
    wooviCharge: WooviWebhookPayload['charge'],
  ) {
    const paidAt = wooviCharge.paidAt ? new Date(wooviCharge.paidAt) : new Date();

    await this.prisma.$transaction(async (tx) => {
      // Update charge status
      await tx.charge.update({
        where: { id: chargeRecord.id },
        data: { status: 'PAID', paidAt },
      });

      // Update or create payment record
      await tx.payment.updateMany({
        where: { chargeId: chargeRecord.id },
        data: {
          wooviTransactionId: wooviCharge.transactionID,
          wooviStatus: wooviCharge.status,
          paidAt,
        },
      });
    });

    // Resolve delinquency
    await this.resolveDelinquency(chargeRecord.userId);

    // Send WhatsApp payment confirmation
    if (this.whatsapp) {
      this.whatsapp.sendPaymentConfirmedNotification(chargeRecord.id).catch((err) => {
        this.logger.error(`Failed to send payment notification: ${err.message}`);
      });
    }

    this.logger.log(`Payment processed for charge ${chargeRecord.id}`);
    return { received: true, status: 'payment_processed', chargeId: chargeRecord.id };
  }

  /**
   * Reconciliate pending charges with Woovi API
   * Finds charges stuck in PENDING/ACTIVE state and checks their real status with Woovi
   * If completed in Woovi but not in local DB, processes the payment automatically
   */
  async reconciliatePendingCharges(opts: { chargeId?: string; limit?: number } = {}) {
    const limit = opts.limit || 50;
    this.logger.log(`Starting reconciliation of pending charges (limit: ${limit})...`);

    const pendingCharges = await this.prisma.charge.findMany({
      where: {
        id: opts.chargeId ? opts.chargeId : undefined,
        status: { in: ['PENDING', 'OVERDUE'] },
        payments: {
          some: {
            wooviStatus: { in: ['ACTIVE', 'PENDING'] },
            wooviTransactionId: { not: null },
          },
        },
      },
      include: { payments: true },
      take: limit,
    });

    this.logger.log(`Found ${pendingCharges.length} pending charges with Woovi transactions`);

    for (const charge of pendingCharges) {
      const payment = charge.payments?.[0];
      if (!payment?.wooviTransactionId) continue;

      try {
        // Check charge status on Woovi API
        const response = await axios.get(
          `https://api.woovi.com/api/v1/charge/${payment.wooviTransactionId}`,
          {
            headers: {
              Authorization: this.configService.get('WOVI_APPID'),
              'Content-Type': 'application/json',
            },
          },
        );

        const wooviCharge = response.data?.charge;

        if (!wooviCharge) {
          this.logger.warn(`Woovi charge not found: ${payment.wooviTransactionId}`);
          continue;
        }

        // If charge is completed in Woovi but not locally, process it
        if (
          wooviCharge.status === 'COMPLETED' &&
          charge.status !== 'PAID' &&
          wooviCharge.paidAt
        ) {
          this.logger.log(
            `Reconciliating charge ${charge.id}: ${wooviCharge.txid} is COMPLETED in Woovi`,
          );

          const paidAt = new Date(wooviCharge.paidAt);

          await this.prisma.$transaction(async (tx) => {
            await tx.charge.update({
              where: { id: charge.id },
              data: { status: 'PAID', paidAt },
            });

            await tx.payment.update({
              where: { id: payment.id },
              data: {
                wooviStatus: wooviCharge.status,
                paidAt,
              },
            });
          });

          await this.resolveDelinquency(charge.userId);
          this.logger.log(`✅ Reconciliation SUCCESS for charge ${charge.id}`);
        } else {
          this.logger.log(
            `Charge ${charge.id} status: ${wooviCharge.status} (no action needed)`,
          );
        }
      } catch (error) {
        this.logger.error(
          `Reconciliation error for charge ${charge.id}: ${error.message}`,
        );
      }
    }

    this.logger.log(`Reconciliation completed`);
    return { processed: pendingCharges.length };
  }

  /**
   * Resolve delinquency when charges are paid
   */
  private async resolveDelinquency(userId: string) {
    const overdueCount = await this.prisma.charge.count({
      where: { userId, status: 'OVERDUE' },
    });

    if (overdueCount === 0) {
      await this.prisma.delinquency.updateMany({
        where: { userId, status: 'ACTIVE' },
        data: { status: 'RESOLVED', resolvedAt: new Date() },
      });
      this.logger.log(`Delinquency resolved for user ${userId}`);
    }
  }
}
