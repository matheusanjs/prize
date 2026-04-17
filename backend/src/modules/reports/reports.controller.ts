import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { ReportsService } from './reports.service';

@ApiTags('reports')
@Controller('reports')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN')
@ApiBearerAuth()
export class ReportsController {
  constructor(private reports: ReportsService) {}

  private parseDates(from?: string, to?: string): { from: Date; to: Date } {
    const now = new Date();
    const toDate = to ? new Date(to) : now;
    const fromDate = from ? new Date(from) : new Date(now.getFullYear(), now.getMonth() - 5, 1); // default 6 months
    return { from: fromDate, to: toDate };
  }

  @Get('finance')
  @ApiOperation({ summary: 'Relatório financeiro' })
  @ApiQuery({ name: 'from', required: false }) @ApiQuery({ name: 'to', required: false })
  finance(@Query('from') from?: string, @Query('to') to?: string) {
    const d = this.parseDates(from, to);
    return this.reports.getFinanceReport(d.from, d.to);
  }

  @Get('reservations')
  @ApiOperation({ summary: 'Relatório de reservas' })
  @ApiQuery({ name: 'from', required: false }) @ApiQuery({ name: 'to', required: false })
  reservations(@Query('from') from?: string, @Query('to') to?: string) {
    const d = this.parseDates(from, to);
    return this.reports.getReservationsReport(d.from, d.to);
  }

  @Get('fuel')
  @ApiOperation({ summary: 'Relatório de combustível' })
  @ApiQuery({ name: 'from', required: false }) @ApiQuery({ name: 'to', required: false })
  fuel(@Query('from') from?: string, @Query('to') to?: string) {
    const d = this.parseDates(from, to);
    return this.reports.getFuelReport(d.from, d.to);
  }

  @Get('boats')
  @ApiOperation({ summary: 'Relatório de embarcações' })
  @ApiQuery({ name: 'from', required: false }) @ApiQuery({ name: 'to', required: false })
  boats(@Query('from') from?: string, @Query('to') to?: string) {
    const d = this.parseDates(from, to);
    return this.reports.getBoatsReport(d.from, d.to);
  }

  @Get('maintenance')
  @ApiOperation({ summary: 'Relatório de manutenção' })
  @ApiQuery({ name: 'from', required: false }) @ApiQuery({ name: 'to', required: false })
  maintenance(@Query('from') from?: string, @Query('to') to?: string) {
    const d = this.parseDates(from, to);
    return this.reports.getMaintenanceReport(d.from, d.to);
  }

  @Get('operations')
  @ApiOperation({ summary: 'Relatório operacional' })
  @ApiQuery({ name: 'from', required: false }) @ApiQuery({ name: 'to', required: false })
  operations(@Query('from') from?: string, @Query('to') to?: string) {
    const d = this.parseDates(from, to);
    return this.reports.getOperationsReport(d.from, d.to);
  }

  @Get('restaurant')
  @ApiOperation({ summary: 'Relatório do restaurante/bar' })
  @ApiQuery({ name: 'from', required: false }) @ApiQuery({ name: 'to', required: false })
  restaurant(@Query('from') from?: string, @Query('to') to?: string) {
    const d = this.parseDates(from, to);
    return this.reports.getRestaurantReport(d.from, d.to);
  }

  @Get('clients')
  @ApiOperation({ summary: 'Relatório de clientes' })
  @ApiQuery({ name: 'from', required: false }) @ApiQuery({ name: 'to', required: false })
  clients(@Query('from') from?: string, @Query('to') to?: string) {
    const d = this.parseDates(from, to);
    return this.reports.getClientsReport(d.from, d.to);
  }
}
