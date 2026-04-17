import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private transporter: nodemailer.Transporter;

  constructor(private config: ConfigService) {
    const user = this.config.get('SMTP_USER', '');
    const pass = this.config.get('SMTP_PASS', '');
    this.transporter = nodemailer.createTransport({
      host: this.config.get('SMTP_HOST', '127.0.0.1'),
      port: parseInt(this.config.get('SMTP_PORT', '25')),
      secure: this.config.get('SMTP_SECURE', 'false') === 'true',
      ...(user ? { auth: { user, pass } } : {}),
      tls: { rejectUnauthorized: false },
    });
  }

  private get from(): string {
    return this.config.get('MAIL_FROM', 'Marina Prize Club <noreply@marinaprizeclub.com>');
  }

  private baseTemplate(title: string, body: string): string {
    return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<style>
  body { margin:0; padding:0; background:#f4f4f7; font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif; }
  .container { max-width:580px; margin:0 auto; padding:20px; }
  .card { background:#fff; border-radius:16px; padding:40px 32px; box-shadow:0 2px 8px rgba(0,0,0,0.06); }
  .header { text-align:center; margin-bottom:32px; }
  .header img { height:48px; width:auto; }
  .header h2 { color:#0D1B2A; font-size:22px; margin:16px 0 0; }
  .btn { display:inline-block; padding:14px 32px; background:linear-gradient(135deg,#007577,#33AEB2); color:#fff!important; text-decoration:none; border-radius:12px; font-weight:700; font-size:15px; }
  .footer { text-align:center; padding:24px 0 0; color:#999; font-size:12px; }
  .amount { font-size:28px; font-weight:800; color:#007577; }
  .detail { color:#555; font-size:14px; line-height:1.7; }
  .divider { border:none; border-top:1px solid #eee; margin:24px 0; }
</style>
</head>
<body>
<div class="container">
  <div class="card">
    <div class="header">
      <h2>${title}</h2>
    </div>
    ${body}
  </div>
  <div class="footer">
    <p>Marina Prize Club &copy; ${new Date().getFullYear()}</p>
    <p>Este é um e-mail automático, não responda.</p>
  </div>
</div>
</body>
</html>`;
  }

  // ─── Password Reset ───────────────────────────────────────
  async sendPasswordReset(to: string, name: string, resetUrl: string): Promise<void> {
    const body = `
      <p class="detail">Olá <strong>${name}</strong>,</p>
      <p class="detail">Recebemos uma solicitação para redefinir sua senha. Clique no botão abaixo para criar uma nova senha:</p>
      <div style="text-align:center;margin:28px 0">
        <a href="${resetUrl}" class="btn">Redefinir Senha</a>
      </div>
      <p class="detail">Este link expira em <strong>1 hora</strong>.</p>
      <p class="detail">Se você não solicitou a redefinição, ignore este e-mail.</p>
      <hr class="divider">
      <p style="color:#999;font-size:12px;">Ou copie e cole: ${resetUrl}</p>`;

    await this.send(to, 'Redefinição de Senha — Marina Prize Club', this.baseTemplate('Redefinir Senha', body));
  }

  // ─── Invoice Created ──────────────────────────────────────
  async sendInvoice(to: string, name: string, charge: {
    description: string;
    amount: number;
    dueDate: Date;
    wooviBrCode?: string | null;
  }): Promise<void> {
    const dueDateStr = charge.dueDate.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' });
    const amountStr = charge.amount.toFixed(2).replace('.', ',');

    const pixSection = charge.wooviBrCode
      ? `<hr class="divider">
         <p class="detail" style="text-align:center"><strong>PIX Copia e Cola:</strong></p>
         <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:12px;padding:12px 16px;word-break:break-all;font-size:12px;color:#333;margin-top:8px">
           ${charge.wooviBrCode}
         </div>`
      : '';

    const body = `
      <p class="detail">Olá <strong>${name}</strong>,</p>
      <p class="detail">Uma nova fatura foi gerada para você:</p>
      <div style="text-align:center;margin:20px 0">
        <p class="amount">R$ ${amountStr}</p>
        <p class="detail"><strong>${charge.description}</strong></p>
        <p class="detail">Vencimento: <strong>${dueDateStr}</strong></p>
      </div>
      ${pixSection}
      <hr class="divider">
      <div style="text-align:center">
        <a href="${this.config.get('APP_URL', 'https://app.marinaprizeclub.com')}/faturas" class="btn">Ver Fatura no App</a>
      </div>`;

    await this.send(to, `Fatura R$ ${amountStr} — ${charge.description}`, this.baseTemplate('Nova Fatura', body));
  }

  // ─── Invoice Reminder ─────────────────────────────────────
  async sendInvoiceReminder(to: string, name: string, charge: {
    description: string;
    amount: number;
    dueDate: Date;
  }): Promise<void> {
    const dueDateStr = charge.dueDate.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' });
    const amountStr = charge.amount.toFixed(2).replace('.', ',');

    const body = `
      <p class="detail">Olá <strong>${name}</strong>,</p>
      <p class="detail">Este é um lembrete de que sua fatura está próxima do vencimento:</p>
      <div style="text-align:center;margin:20px 0">
        <p class="amount">R$ ${amountStr}</p>
        <p class="detail"><strong>${charge.description}</strong></p>
        <p class="detail">Vencimento: <strong>${dueDateStr}</strong></p>
      </div>
      <div style="text-align:center;margin:28px 0">
        <a href="${this.config.get('APP_URL', 'https://app.marinaprizeclub.com')}/faturas" class="btn">Pagar Agora</a>
      </div>`;

    await this.send(to, `Lembrete: Fatura R$ ${amountStr} vence ${dueDateStr}`, this.baseTemplate('Lembrete de Pagamento', body));
  }

  // ─── Overdue Invoice ──────────────────────────────────────
  async sendOverdueNotice(to: string, name: string, charge: {
    description: string;
    amount: number;
    dueDate: Date;
  }): Promise<void> {
    const dueDateStr = charge.dueDate.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' });
    const amountStr = charge.amount.toFixed(2).replace('.', ',');

    const body = `
      <p class="detail">Olá <strong>${name}</strong>,</p>
      <p class="detail" style="color:#dc2626">Sua fatura está <strong>vencida</strong>. Por favor, regularize o pagamento:</p>
      <div style="text-align:center;margin:20px 0">
        <p class="amount" style="color:#dc2626">R$ ${amountStr}</p>
        <p class="detail"><strong>${charge.description}</strong></p>
        <p class="detail">Venceu em: <strong>${dueDateStr}</strong></p>
      </div>
      <div style="text-align:center;margin:28px 0">
        <a href="${this.config.get('APP_URL', 'https://app.marinaprizeclub.com')}/faturas" class="btn" style="background:linear-gradient(135deg,#dc2626,#ef4444)">Regularizar Pagamento</a>
      </div>`;

    await this.send(to, `URGENTE: Fatura R$ ${amountStr} vencida — ${charge.description}`, this.baseTemplate('Fatura Vencida', body));
  }

  // ─── Core send method ─────────────────────────────────────
  private async send(to: string, subject: string, html: string): Promise<void> {
    try {
      await this.transporter.sendMail({
        from: this.from,
        to,
        subject,
        html,
      });
      this.logger.log(`Email sent to ${to}: ${subject}`);
    } catch (error) {
      this.logger.error(`Failed to send email to ${to}: ${error}`);
    }
  }
}
