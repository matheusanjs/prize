import { Controller, Get, Post, Patch, Delete, Body, Query, Param, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiQuery } from '@nestjs/swagger';
import { FinanceService } from './finance.service';
import { CreateChargeDto } from './dto/create-charge.dto';
import { RegisterPaymentDto } from './dto/register-payment.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@ApiTags('finance')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('finance')
export class FinanceController {
  constructor(private financeService: FinanceService) {}

  @Post('charges')
  @Roles('ADMIN', 'OPERATOR')
  @ApiOperation({ summary: 'Criar cobrança manual' })
  createCharge(@Body() dto: CreateChargeDto) {
    return this.financeService.createCharge(dto);
  }

  @Post('charges/generate-monthly')
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Gerar cobranças mensais automáticas' })
  generateMonthly() {
    return this.financeService.generateMonthlyCharges();
  }

  @Get('charges')
  @Roles('ADMIN', 'OPERATOR')
  @ApiOperation({ summary: 'Listar todas as cobranças' })
  @ApiQuery({ name: 'status', required: false })
  @ApiQuery({ name: 'userId', required: false })
  @ApiQuery({ name: 'boatId', required: false })
  getAllCharges(@Query('page') page?: number, @Query('status') status?: string, @Query('userId') userId?: string, @Query('boatId') boatId?: string) {
    return this.financeService.getAllCharges(page, undefined, status, userId, boatId);
  }

  @Get('my-charges')
  @ApiOperation({ summary: 'Minhas cobranças' })
  @ApiQuery({ name: 'status', required: false })
  getMyCharges(@CurrentUser('id') userId: string, @Query('status') status?: string) {
    return this.financeService.getUserCharges(userId, status);
  }

  @Post('payments')
  @Roles('ADMIN', 'OPERATOR')
  @ApiOperation({ summary: 'Registrar pagamento' })
  registerPayment(@Body() dto: RegisterPaymentDto) {
    return this.financeService.registerPayment(dto);
  }

  @Patch('charges/:id')
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Editar cobrança' })
  updateCharge(@Param('id') id: string, @Body() dto: Partial<CreateChargeDto>) {
    return this.financeService.updateCharge(id, dto);
  }

  @Delete('charges/:id')
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Remover cobrança (soft delete)' })
  deleteCharge(@Param('id') id: string) {
    return this.financeService.deleteCharge(id);
  }

  @Get('delinquents')
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Listar inadimplentes' })
  getDelinquents(@Query('page') page?: number) {
    return this.financeService.getDelinquents(page);
  }

  @Get('dashboard')
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Dashboard financeiro' })
  getDashboard() {
    return this.financeService.getDashboard();
  }

  @Post('delinquency/process')
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Processar inadimplências' })
  processDelinquencies() {
    return this.financeService.processDelinquencies();
  }

  @Post('charges/:id/woovi')
  @ApiOperation({ summary: 'Gerar cobrança Woovi Pix para uma cobrança' })
  generateWooviCharge(@Param('id') chargeId: string) {
    return this.financeService.generateWooviForCharge(chargeId);
  }
}
