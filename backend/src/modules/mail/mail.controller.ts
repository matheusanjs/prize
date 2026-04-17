import { Controller, Post, Body, Get, UseGuards, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { MailService } from './mail.service';
import { ConfigService } from '@nestjs/config';

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
      user: user ? user.substring(0, 3) + '***' : '',
      from,
      secure: secure === 'true',
      configured: !!host && !!user,
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
}
