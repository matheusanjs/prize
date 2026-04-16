import { Controller, Get, Post, Patch, Param, Body, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { MaintenanceService } from './maintenance.service';
import { CreateMaintenanceDto } from './dto/create-maintenance.dto';
import { UpdateMaintenanceDto } from './dto/update-maintenance.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@ApiTags('maintenance')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('maintenance')
export class MaintenanceController {
  constructor(private maintenanceService: MaintenanceService) {}

  @Post()
  @Roles('ADMIN', 'OPERATOR')
  @ApiOperation({ summary: 'Registrar manutenção' })
  create(@CurrentUser('id') reportedById: string, @Body() dto: CreateMaintenanceDto) {
    return this.maintenanceService.create(reportedById, dto);
  }

  @Get()
  @Roles('ADMIN', 'OPERATOR')
  @ApiOperation({ summary: 'Listar manutenções' })
  findAll(
    @Query('page') page?: number,
    @Query('status') status?: string,
    @Query('boatId') boatId?: string,
  ) {
    return this.maintenanceService.findAll(page, undefined, status, boatId);
  }

  @Patch(':id')
  @Roles('ADMIN', 'OPERATOR')
  @ApiOperation({ summary: 'Atualizar manutenção' })
  update(@Param('id') id: string, @Body() dto: UpdateMaintenanceDto) {
    return this.maintenanceService.update(id, dto);
  }

  @Patch(':id/resolve')
  @Roles('ADMIN', 'OPERATOR')
  @ApiOperation({ summary: 'Resolver manutenção — marcar como concluída e liberar embarcação' })
  resolve(@Param('id') id: string) {
    return this.maintenanceService.resolve(id);
  }
}
