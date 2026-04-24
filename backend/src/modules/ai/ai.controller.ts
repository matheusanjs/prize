import { Controller, Post, Get, Param, Body, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { AiService } from './ai.service';
import { ChatDto } from './dto/chat.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@ApiTags('ai')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('ai')
export class AiController {
  constructor(private aiService: AiService) {}

  @Post('chat')
  @ApiOperation({ summary: 'Chat com IA — disponível para todos os perfis' })
  chat(
    @CurrentUser('id') userId: string,
    @CurrentUser('role') role: string,
    @Body() dto: ChatDto,
  ) {
    return this.aiService.chat(userId, role, dto);
  }

  @Get('insights')
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Buscar último insight salvo (Admin)' })
  getLatestInsight() {
    return this.aiService.getLatestInsight();
  }

  @Post('insights/generate')
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Gerar novo insight com IA (Admin)' })
  generateInsights(@CurrentUser('id') userId: string) {
    return this.aiService.generateInsights(userId);
  }

  @Get('explain-charge/:chargeId')
  @ApiOperation({ summary: 'IA explica uma cobrança para o cliente' })
  explainCharge(@CurrentUser('id') userId: string, @Param('chargeId') chargeId: string) {
    return this.aiService.explainCharge(userId, chargeId);
  }

  @Get('predict-delinquency/:userId')
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Prever inadimplência de um usuário (Admin)' })
  predictDelinquency(@Param('userId') targetUserId: string) {
    return this.aiService.predictDelinquency(targetUserId);
  }

  @Get('usage')
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Estatísticas de uso da IA' })
  getUsage() {
    return this.aiService.getUsageStats();
  }
}
