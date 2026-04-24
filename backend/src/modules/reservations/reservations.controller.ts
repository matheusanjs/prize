import { Controller, Get, Post, Patch, Param, Body, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiQuery } from '@nestjs/swagger';
import { ReservationsService } from './reservations.service';
import { CreateReservationDto } from './dto/create-reservation.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@ApiTags('reservations')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('reservations')
export class ReservationsController {
  constructor(private reservationsService: ReservationsService) {}

  @Post()
  @ApiOperation({ summary: 'Criar reserva' })
  create(@CurrentUser() currentUser: any, @Body() dto: CreateReservationDto) {
    // Admin can create reservations on behalf of other users
    const userId = (currentUser.role === 'ADMIN' && dto.userId) ? dto.userId : currentUser.id;
    const isAdmin = currentUser.role === 'ADMIN';
    return this.reservationsService.create(userId, dto, isAdmin);
  }

  @Get()
  @Roles('ADMIN', 'OPERATOR')
  @ApiOperation({ summary: 'Listar todas as reservas (Admin/Operador)' })
  @ApiQuery({ name: 'status', required: false })
  @ApiQuery({ name: 'boatId', required: false })
  findAll(@Query('page') page?: number, @Query('status') status?: string, @Query('boatId') boatId?: string) {
    return this.reservationsService.findAll(page, undefined, status, boatId);
  }

  @Get('my-reservations')
  @ApiOperation({ summary: 'Minhas reservas' })
  @ApiQuery({ name: 'upcoming', required: false })
  getMyReservations(@CurrentUser('id') userId: string, @Query('upcoming') upcoming?: boolean) {
    return this.reservationsService.findByUser(userId, upcoming);
  }

  @Get('free-boats')
  @Roles('ADMIN', 'OPERATOR')
  @ApiOperation({ summary: 'Embarcações livres em uma data específica' })
  @ApiQuery({ name: 'date', required: true, description: 'Data no formato YYYY-MM-DD' })
  getFreeBoats(@Query('date') date: string) {
    return this.reservationsService.findFreeBoats(date);
  }

  @Get('boat/:boatId')
  @ApiOperation({ summary: 'Reservas de uma embarcação (para ver horários ocupados)' })
  getBoatReservations(@Param('boatId') boatId: string, @Query('date') date?: string) {
    return this.reservationsService.findByBoat(boatId, date);
  }

  @Get('calendar/:boatId')
  @ApiOperation({ summary: 'Calendário de reservas da embarcação' })
  @ApiQuery({ name: 'month', required: true })
  @ApiQuery({ name: 'year', required: true })
  getCalendar(
    @Param('boatId') boatId: string,
    @Query('month') month: number,
    @Query('year') year: number,
  ) {
    return this.reservationsService.getCalendar(boatId, month, year);
  }

  @Get('boat/:boatId/all')
  @ApiOperation({ summary: 'Todas as reservas futuras + 30d passado (snapshot completo)' })
  @ApiQuery({ name: 'pastDays', required: false })
  @ApiQuery({ name: 'futureMonths', required: false })
  getAllByBoat(
    @Param('boatId') boatId: string,
    @Query('pastDays') pastDays?: string,
    @Query('futureMonths') futureMonths?: string,
  ) {
    return this.reservationsService.getAllByBoat(boatId, {
      pastDays: pastDays ? Number(pastDays) : undefined,
      futureMonths: futureMonths ? Number(futureMonths) : undefined,
    });
  }

  @Patch(':id/cancel')
  @ApiOperation({ summary: 'Cancelar reserva' })
  cancel(
    @Param('id') id: string,
    @CurrentUser() currentUser: any,
    @Body('reason') reason?: string,
  ) {
    return this.reservationsService.cancel(id, currentUser.id, reason, currentUser.role);
  }

  // ─── Swap Requests ────────────────────────────────────────────────────

  @Post('swap')
  @ApiOperation({ summary: 'Solicitar troca de data' })
  createSwap(@CurrentUser('id') userId: string, @Body() body: { targetReservationId: string; offeredReservationId: string; message?: string }) {
    return this.reservationsService.createSwapRequest(userId, body);
  }

  @Get('swaps/my')
  @ApiOperation({ summary: 'Minhas solicitações de troca' })
  getMySwaps(@CurrentUser('id') userId: string) {
    return this.reservationsService.getMySwapRequests(userId);
  }

  @Get('swaps/pending')
  @ApiOperation({ summary: 'Trocas pendentes para mim' })
  getPendingSwaps(@CurrentUser('id') userId: string) {
    return this.reservationsService.getPendingSwapsForUser(userId);
  }

  @Patch('swaps/:id/respond')
  @ApiOperation({ summary: 'Aceitar ou recusar troca' })
  respondSwap(@Param('id') id: string, @CurrentUser('id') userId: string, @Body('accept') accept: boolean) {
    return this.reservationsService.respondToSwap(id, userId, accept);
  }

  @Patch(':id/confirm-arrival')
  @ApiOperation({ summary: 'Confirmar presença e informar horário de chegada' })
  confirmArrival(
    @Param('id') id: string,
    @CurrentUser('id') userId: string,
    @Body('expectedArrivalTime') expectedArrivalTime: string,
  ) {
    return this.reservationsService.confirmArrival(id, userId, expectedArrivalTime);
  }

  @Get('co-owners/:boatId')
  @ApiOperation({ summary: 'Cotistas da embarcação' })
  getCoOwners(@CurrentUser('id') userId: string, @Param('boatId') boatId: string) {
    return this.reservationsService.getCoOwners(userId, boatId);
  }

  // ─── Substitutes (Suplente de cota) ──────────────────────────────────

  @Post(':id/substitute')
  @ApiOperation({ summary: 'Inscrever-se como suplente de uma reserva' })
  registerSubstitute(
    @Param('id') reservationId: string,
    @CurrentUser('id') userId: string,
    @Body('message') message?: string,
  ) {
    return this.reservationsService.registerSubstitute(userId, reservationId, message);
  }

  @Patch('substitutes/:id/cancel')
  @ApiOperation({ summary: 'Cancelar inscrição de suplente (suplente, titular ou admin)' })
  cancelSubstitute(@Param('id') id: string, @CurrentUser() currentUser: any) {
    return this.reservationsService.cancelSubstitute(id, currentUser.id, currentUser.role);
  }

  @Get('substitutes/my')
  @ApiOperation({ summary: 'Minhas inscrições como suplente' })
  getMySubstituteRequests(@CurrentUser('id') userId: string) {
    return this.reservationsService.getMySubstituteRequests(userId);
  }

  @Get('substitutes/incoming')
  @ApiOperation({ summary: 'Suplentes inscritos nas minhas reservas' })
  getSubstitutesOnMyReservations(@CurrentUser('id') userId: string) {
    return this.reservationsService.getSubstitutesOnMyReservations(userId);
  }

  @Get('substitutes/available')
  @ApiOperation({ summary: 'Reservas onde posso me inscrever como suplente' })
  getSubstitutableReservations(@CurrentUser('id') userId: string) {
    return this.reservationsService.getSubstitutableReservations(userId);
  }

  @Get(':id/substitutes')
  @ApiOperation({ summary: 'Suplentes de uma reserva' })
  listSubstitutes(@Param('id') reservationId: string) {
    return this.reservationsService.getSubstitutesForReservation(reservationId);
  }

  @Patch('substitutes/:id/promote')
  @Roles('ADMIN', 'OPERATOR')
  @ApiOperation({ summary: 'Promover suplente manualmente (Admin)' })
  promoteSubstitute(@Param('id') id: string) {
    return this.reservationsService.promoteSubstitute(id);
  }

  @Post(':id/pass-to-substitute')
  @ApiOperation({ summary: 'Titular passa a vez para o próximo suplente em fila' })
  passToNextSubstitute(@Param('id') reservationId: string, @CurrentUser('id') userId: string) {
    return this.reservationsService.passToNextSubstitute(reservationId, userId);
  }
}
