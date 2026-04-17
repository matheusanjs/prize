import { Controller, Post, Body, Get, UseGuards, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { MailService } from './mail.service';
import { ConfigService } from '@nestjs/config';
import * as dns from 'dns';
import { promisify } from 'util';

const resolveMx = promisify(dns.resolveMx);
const resolveTxt = promisify(dns.resolveTxt);

@ApiTags('mail')
@Controller('mail')
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiBearerAuth()
export class MailController {
  constructor(
    private mailService: MailService,
    private config: ConfigService,
  ) {}

  @Get('settings')
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Get current email settings (masked)' })
  async getSettings() {
    const host = this.config.get('SMTP_HOST', '');
    const port = this.config.get('SMTP_PORT', '587');
    const user = this.config.get('SMTP_USER', '');
    const from = this.config.get('MAIL_FROM', '');
    const secure = this.config.get('SMTP_SECURE', 'false');

    return {
      host,
      port,
      user: user ? user.substring(0, 3) + '***' : '(local)',
      from,
      secure: secure === 'true',
      configured: !!host || host === '127.0.0.1',
    };
  }

  @Post('test')
  @Roles('ADMIN')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Send a test email' })
  async sendTestEmail(@Body() body: { to: string }) {
    try {
      await this.mailService.sendPasswordReset(
        body.to,
        'Administrador',
        'https://admin.marinaprizeclub.com/login',
      );
      return { success: true, message: `E-mail de teste enviado para ${body.to}` };
    } catch (error) {
      return { success: false, message: `Falha ao enviar: ${error}` };
    }
  }

  @Get('dns')
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Check DNS email records' })
  async checkDns() {
    const domain = 'marinaprizeclub.com';
    const results: { name: string; status: 'ok' | 'warning' | 'error'; value: string; detail: string }[] = [];

    // MX
    try {
      const mx = await resolveMx(domain);
      const sorted = mx.sort((a, b) => a.priority - b.priority);
      results.push({ name: 'MX', status: 'ok', value: sorted.map(r => `${r.priority} ${r.exchange}`).join(', '), detail: 'Registro MX encontrado' });
    } catch { results.push({ name: 'MX', status: 'error', value: '', detail: 'Nenhum registro MX encontrado' }); }

    // SPF
    try {
      const txt = await resolveTxt(domain);
      const spf = txt.flat().find(r => r.startsWith('v=spf1'));
      if (spf) results.push({ name: 'SPF', status: 'ok', value: spf, detail: 'SPF configurado' });
      else results.push({ name: 'SPF', status: 'warning', value: '', detail: 'Nenhum registro SPF encontrado' });
    } catch { results.push({ name: 'SPF', status: 'warning', value: '', detail: 'Erro ao consultar SPF' }); }

    // DKIM
    try {
      const txt = await resolveTxt(`default._domainkey.${domain}`);
      const dkim = txt.flat().find(r => r.includes('DKIM'));
      results.push({ name: 'DKIM', status: dkim ? 'ok' : 'warning', value: dkim ? 'Configurado' : '', detail: dkim ? 'DKIM ativo' : 'Registro DKIM não encontrado no DNS (pode estar configurado localmente)' });
    } catch { results.push({ name: 'DKIM', status: 'warning', value: '', detail: 'DKIM não publicado no DNS' }); }

    // DMARC
    try {
      const txt = await resolveTxt(`_dmarc.${domain}`);
      const dmarc = txt.flat().find(r => r.startsWith('v=DMARC1'));
      if (dmarc) results.push({ name: 'DMARC', status: 'ok', value: dmarc, detail: 'DMARC configurado' });
      else results.push({ name: 'DMARC', status: 'warning', value: '', detail: 'Nenhum DMARC encontrado' });
    } catch { results.push({ name: 'DMARC', status: 'warning', value: '', detail: 'Erro ao consultar DMARC' }); }

    return results;
  }
}
