import { Controller, Get, Post, Patch, Delete, Param, Body, Query, UseGuards, Res } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { Response } from 'express';
import { OperationsService } from './operations.service';
import { CreateChecklistDto } from './dto/create-checklist.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@ApiTags('operations')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('operations')
export class OperationsController {
  constructor(private operationsService: OperationsService) {}

  // ─── Pre-launch checklist (CLIENT) ──────────────────────────────────────

  @Post('pre-launch/:reservationId/start')
  @Roles('ADMIN', 'OPERATOR', 'CLIENT')
  @ApiOperation({ summary: 'Iniciar checklist pré-descida para uma reserva' })
  startPreLaunch(
    @CurrentUser('id') userId: string,
    @Param('reservationId') reservationId: string,
  ) {
    return this.operationsService.startPreLaunchChecklist(userId, reservationId);
  }

  @Post('pre-launch/:checklistId/submit')
  @Roles('ADMIN', 'OPERATOR', 'CLIENT')
  @ApiOperation({ summary: 'Enviar checklist pré-descida preenchido' })
  submitPreLaunch(
    @CurrentUser('id') userId: string,
    @Param('checklistId') checklistId: string,
    @Body() body: {
      items: { id: string; checked: boolean; notes?: string }[];
      hullSketchUrl?: string;
      hullSketchMarks?: string;
      videoUrl?: string;
      fuelPhotoUrl?: string;
      additionalObservations?: string;
    },
  ) {
    return this.operationsService.submitPreLaunchChecklist(checklistId, userId, body);
  }

  @Get('pre-launch/my-reservations')
  @Roles('ADMIN', 'OPERATOR', 'CLIENT')
  @ApiOperation({ summary: 'Reservas ativas do usuário (para checklist)' })
  getMyReservations(@CurrentUser('id') userId: string) {
    return this.operationsService.getMyActiveReservations(userId);
  }

  @Get('pre-launch/today-reservations')
  @Roles('ADMIN', 'OPERATOR')
  @ApiOperation({ summary: 'Todas as reservas de hoje (admin/operador)' })
  getTodayReservations(@Query('date') date?: string) {
    return this.operationsService.getTodayReservationsAll(date);
  }

  @Post('pre-launch/start-adhoc')
  @Roles('ADMIN', 'OPERATOR')
  @ApiOperation({ summary: 'Iniciar checklist ad-hoc (sem verificação de dono)' })
  startAdHoc(
    @CurrentUser('id') userId: string,
    @Body() body: { boatId: string; reservationId?: string },
  ) {
    return this.operationsService.startAdHocChecklist(userId, body.boatId, body.reservationId);
  }

  @Get('pre-launch/checklist/:id')
  @Roles('ADMIN', 'OPERATOR', 'CLIENT')
  @ApiOperation({ summary: 'Buscar checklist por ID' })
  getChecklist(@Param('id') id: string) {
    return this.operationsService.getChecklistById(id);
  }

  // ─── Lift boats (admin) ──────────────────────────────────────────────────

  @Patch('queue/:id/lift')
  @Roles('ADMIN', 'OPERATOR')
  @ApiOperation({ summary: 'Subir um jet ski (marcar como concluído)' })
  liftBoat(@Param('id') id: string, @Body() body?: {
    returnFuelPhotoUrl?: string;
    returnSketchMarks?: string;
    returnObservations?: string;
    returnDamageVideoUrl?: string;
    checklistItems?: { id: string; label: string; checked: boolean }[];
  }) {
    return this.operationsService.liftBoat(id, body);
  }

  @Post('queue/lift-all')
  @Roles('ADMIN', 'OPERATOR')
  @ApiOperation({ summary: 'Subir todos os jets na água' })
  liftAllBoats() {
    return this.operationsService.liftAllBoats();
  }

  @Patch('queue/:id/launch')
  @Roles('ADMIN', 'OPERATOR')
  @ApiOperation({ summary: 'Colocar jet na água (reserva confirmada aguardando cliente)' })
  launchToWater(@Param('id') id: string) {
    return this.operationsService.launchToWater(id);
  }

  @Get('return-inspection/:boatId')
  @Roles('ADMIN', 'OPERATOR')
  @ApiOperation({ summary: 'Última inspeção de retorno de uma embarcação' })
  getLastReturnInspection(@Param('boatId') boatId: string) {
    return this.operationsService.getLastReturnInspection(boatId);
  }

  @Get('boat/:boatId/last-marks')
  @Roles('ADMIN', 'OPERATOR')
  @ApiOperation({ summary: 'Últimas marcas de avaria de uma embarcação' })
  getLastMarks(@Param('boatId') boatId: string) {
    return this.operationsService.getLastMarksForBoat(boatId);
  }

  // ─── Usages ─────────────────────────────────────────────────────────────

  @Get('usages')
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Histórico de usos (admin)' })
  getUsages(
    @Query('boatId') boatId?: string,
    @Query('userId') userId?: string,
    @Query('status') status?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.operationsService.getUsages({ boatId, userId, status, from, to });
  }

  @Get('usages/my')
  @Roles('ADMIN', 'OPERATOR', 'CLIENT')
  @ApiOperation({ summary: 'Meus usos (cliente)' })
  getMyUsages(@CurrentUser('id') userId: string) {
    return this.operationsService.getMyUsages(userId);
  }

  @Get('usages/:id/pdf')
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Gerar PDF completo de um uso' })
  async getUsagePdf(@Param('id') id: string, @Res() res: Response) {
    const buffer = await this.operationsService.generateUsagePdf(id);
    res.set({ 'Content-Type': 'application/pdf', 'Content-Disposition': 'attachment; filename=uso-completo.pdf' });
    res.send(buffer);
  }

  // ─── Queue ───────────────────────────────────────────────────────────────

  @Get('queue')
  @Roles('ADMIN', 'OPERATOR')
  @ApiOperation({ summary: 'Fila operacional' })
  getQueue(@Query('status') status?: string, @Query('date') date?: string) {
    return this.operationsService.getQueue({ status, date });
  }

  @Patch('queue/:id/status')
  @Roles('ADMIN', 'OPERATOR')
  @ApiOperation({ summary: 'Atualizar status da fila' })
  updateQueueStatus(@Param('id') id: string, @Body() body: { status: string }) {
    // Keep legacy support
    return this.operationsService.getQueue({ status: id });
  }

  // ─── Checklists (legacy) ─────────────────────────────────────────────────

  @Post('checklists')
  @Roles('ADMIN', 'OPERATOR')
  @ApiOperation({ summary: 'Criar checklist para embarcação' })
  createChecklist(@CurrentUser('id') operatorId: string, @Body() dto: CreateChecklistDto) {
    return this.operationsService.createChecklist(operatorId, dto);
  }

  @Patch('checklists/item/:itemId')
  @Roles('ADMIN', 'OPERATOR')
  @ApiOperation({ summary: 'Marcar/desmarcar item do checklist' })
  updateItem(
    @Param('itemId') itemId: string,
    @Body() body: { checked: boolean; notes?: string; photoUrl?: string },
  ) {
    return this.operationsService.updateChecklistItem(itemId, body.checked, body.notes, body.photoUrl);
  }

  @Post('checklists/:id/complete')
  @Roles('ADMIN', 'OPERATOR')
  @ApiOperation({ summary: 'Finalizar checklist' })
  completeChecklist(@Param('id') id: string) {
    return this.operationsService.completeChecklist(id);
  }

  @Get('checklists')
  @Roles('ADMIN', 'OPERATOR')
  @ApiOperation({ summary: 'Listar todos os checklists' })
  findAllChecklists(@Query('status') status?: string, @Query('boatId') boatId?: string, @Query('date') date?: string) {
    return this.operationsService.findAllChecklists({ status, boatId, date });
  }

  @Get('checklists/boat/:boatId')
  @ApiOperation({ summary: 'Checklists de uma embarcação' })
  getByBoat(@Param('boatId') boatId: string) {
    return this.operationsService.getChecklistsByBoat(boatId);
  }

  @Delete('checklists/:id')
  @Roles('ADMIN', 'OPERATOR')
  @ApiOperation({ summary: 'Excluir checklist' })
  deleteChecklist(@Param('id') id: string) {
    return this.operationsService.deleteChecklist(id);
  }

  @Get('checklists/templates/:type')
  @ApiOperation({ summary: 'Template de checklist por tipo' })
  getTemplate(@Param('type') type: string) {
    return this.operationsService.getChecklistTemplateItems(type);
  }

  @Get('damages')
  @Roles('ADMIN', 'OPERATOR')
  @ApiOperation({ summary: 'Relatório de avarias' })
  getDamagesReport(
    @Query('boatId') boatId?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.operationsService.getDamagesReport({ boatId, from, to });
  }
}
