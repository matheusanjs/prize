import { Injectable, NotFoundException, BadRequestException, ForbiddenException, Logger, Inject, Optional, forwardRef } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { CreateReservationDto } from './dto/create-reservation.dto';
import { Cron } from '@nestjs/schedule';
import { ReservationValidationService } from './reservation-validation.service';
import { WhatsAppAutomationService } from '../whatsapp/whatsapp-automation.service';
import { NotificationsService } from '../notifications/notifications.service';
import { ReservationsGateway } from './reservations.gateway';

const DOUBLE_BOOKING_MSG = 'Horario indisponivel. Esta embarcacao ja esta reservada no periodo solicitado.';

function isDbOverlapError(error: unknown): boolean {
  if (typeof error === 'object' && error !== null) {
    const e = error as Record<string, unknown>;
    if (e.code === 'P2002') return true;
    if ((e.code as string)?.includes('unique_violation') || (e.code as string) === '23505') return true;
    if (e.code === 'P2023') return true;
    if ((e.code as string)?.startsWith('23')) return true;
  }
  return false;
}

@Injectable()
export class ReservationsService {
  private readonly logger = new Logger(ReservationsService.name);

  constructor(
    private prisma: PrismaService,
    private validationService: ReservationValidationService,
    private notificationsService: NotificationsService,
    @Optional() @Inject(forwardRef(() => ReservationsGateway)) private gateway?: ReservationsGateway,
    @Optional() @Inject(WhatsAppAutomationService) private whatsapp?: WhatsAppAutomationService,
  ) {}

  // Every day at 17:00 BRT — mark all ended reservations as COMPLETED
  @Cron('0 17 * * *', { timeZone: 'America/Sao_Paulo' })
  async completeEndedReservations() {
    const now = new Date();
    const ended = await this.prisma.reservation.findMany({
      where: {
        status: { in: ['CONFIRMED', 'PENDING', 'IN_USE'] },
        endDate: { lt: now },
        deletedAt: null,
      },
      select: { id: true },
    });

    if (ended.length > 0) {
      const ids = ended.map(r => r.id);
      await Promise.all([
        this.prisma.reservation.updateMany({
          where: { id: { in: ids } },
          data: { status: 'COMPLETED' },
        }),
        this.prisma.operationalQueue.updateMany({
          where: {
            reservationId: { in: ids },
            status: { in: ['IN_WATER', 'WAITING', 'PREPARING'] },
          },
          data: { status: 'COMPLETED', completedAt: new Date() },
        }),
      ]);
      this.logger.log(`Auto-completed ${ended.length} ended reservation(s) and their queue items`);
    }
  }

  async create(userId: string, dto: CreateReservationDto, isAdmin = false) {
    // Check if user has active share for this boat (skip for admin)
    if (!isAdmin) {
      const share = await this.prisma.share.findFirst({
        where: { userId, boatId: dto.boatId, isActive: true },
      });

      if (!share) {
        throw new ForbiddenException('Você não possui cota nesta embarcação');
      }

      // Check max simultaneous reservations limit
      const maxRes = share.maxReservations ?? 3;
      const activeReservations = await this.prisma.reservation.count({
        where: {
          userId,
          boatId: dto.boatId,
          status: { in: ['CONFIRMED', 'PENDING'] },
          endDate: { gte: new Date() },
          deletedAt: null,
        },
      });
      if (activeReservations >= maxRes) {
        throw new BadRequestException(
          `Limite de ${maxRes} reserva${maxRes > 1 ? 's' : ''} simultânea${maxRes > 1 ? 's' : ''} atingido para esta embarcação. Cancele uma reserva existente ou aguarde.`,
        );
      }
    }

    // Check delinquency — block reservation if overdue (skip for admin)
    if (!isAdmin) {
      const delinquency = await this.prisma.delinquency.findFirst({
        where: { userId, status: 'ACTIVE' },
      });

      if (delinquency) {
        throw new ForbiddenException(
          `Reserva bloqueada por inadimplência de R$ ${delinquency.totalAmount.toFixed(2)}. Regularize seus pagamentos.`,
        );
      }

      // Also check for overdue charges directly
      const overdueCharge = await this.prisma.charge.findFirst({
        where: {
          userId,
          deletedAt: null,
          OR: [
            { status: 'OVERDUE' },
            { status: 'PENDING', dueDate: { lt: new Date() } },
          ],
        },
      });

      if (overdueCharge) {
        throw new ForbiddenException(
          `Reserva bloqueada. Você possui fatura(s) vencida(s). Regularize seus pagamentos.`,
        );
      }
    }

    // Check boat availability
    const boat = await this.prisma.boat.findUnique({ where: { id: dto.boatId } });
    if (!boat || boat.status !== 'AVAILABLE') {
      throw new BadRequestException('Embarcação não disponível');
    }

    // Check maintenance block
    const activeMaintenance = await this.prisma.maintenance.findFirst({
      where: {
        boatId: dto.boatId,
        status: { in: ['SCHEDULED', 'IN_PROGRESS'] },
        scheduledAt: { lte: new Date(dto.endDate) },
      },
    });

    if (activeMaintenance) {
      throw new BadRequestException('Embarcação em manutenção no período solicitado');
    }

    // Check max reservation days
    const maxDays = parseInt(process.env.MAX_RESERVATION_DAYS || '7');
    const start = new Date(dto.startDate);
    const end = new Date(dto.endDate);
    const diffDays = (end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24);

    if (diffDays > maxDays) {
      throw new BadRequestException(`Reserva máxima de ${maxDays} dias`);
    }

    // Conflict check + insert MUST be atomic to prevent race conditions.
    // The DB trigger (from migration 20260415000000) acts as the final guard.
    try {
      const reservation = await this.prisma.$transaction(async (tx) => {
        // Pre-flight validation (also catches edge cases not covered by app-level checks)
        await this.validationService.validateBeforeCreate(dto.boatId, start, end);

        const conflict = await tx.reservation.findFirst({
          where: {
            boatId: dto.boatId,
            status: { in: ['CONFIRMED', 'PENDING', 'IN_USE'] },
            deletedAt: null,
            startDate: { lt: end },
            endDate: { gt: start },
          },
          include: { user: { select: { name: true } } },
        });

        if (conflict) {
          const cStart = conflict.startDate.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' });
          const cEnd = conflict.endDate.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' });
          const who = conflict.user?.name || 'outro cotista';
          throw new BadRequestException(
            `Horário indisponível. ${who} já tem reserva de ${cStart} até ${cEnd}.`,
          );
        }

        return tx.reservation.create({
          data: {
            boatId: dto.boatId,
            userId,
            startDate: start,
            endDate: end,
            status: 'CONFIRMED',
            // NOTE: confirmedAt represents the user's ARRIVAL/presence confirmation,
            // not the booking status. It must remain null on creation so that the
            // substitute (suplente) flow, arrival reminders, and presence checks work.
            notes: dto.notes,
          },
          include: { boat: { select: { id: true, name: true, model: true, imageUrl: true } } },
        });
      });

      // Auto-create PRE_LAUNCH checklist for the reservation (admin/operator flow)
      try {
        const operatorId = userId;
        const checklistItems = [
          'Âncora e cabo presentes',
          'Documentação a bordo',
          'Motor de arranque funcionando',
          'Bateria carregada',
          'Nível de combustível verificado',
        ];
        await this.prisma.checklist.create({
          data: {
            boatId: dto.boatId,
            operatorId,
            reservationId: reservation.id,
            type: 'PRE_LAUNCH',
            status: 'PENDING',
            items: {
              create: checklistItems.map((label, i) => ({ label, order: i + 1 })),
            },
          },
        });
        this.logger.log(`Auto-created checklist for reservation ${reservation.id}`);
      } catch (checklistErr) {
        this.logger.error(`Failed to auto-create checklist for reservation ${reservation.id}: ${(checklistErr as Error).message}`);
      }

      // Send instant WhatsApp confirmation for same-day reservations
      if (this.whatsapp && reservation) {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const tomorrow = new Date(today);
        tomorrow.setDate(tomorrow.getDate() + 1);
        if (new Date(reservation.startDate) >= today && new Date(reservation.startDate) < tomorrow) {
          this.whatsapp.sendInstantReservationConfirmation(reservation.id).catch((err) => {
            this.logger.error(`Failed to send WhatsApp reservation confirmation ${reservation.id}: ${err.message}`);
          });
        }
      }

      // Send push notification for new reservation
      if (reservation) {
        this.notificationsService.send({
          userId: reservation.userId,
          type: 'RESERVATION_CREATED',
          title: '📅 Reserva confirmada',
          body: `Sua reserva em ${reservation.boat?.name || 'embarcação'} foi criada com sucesso!`,
          data: { reservationId: reservation.id, boatId: reservation.boatId, url: '/boats' },
          pushTag: `res-created-${reservation.id}`,
        }).catch((err) => this.logger.error(`Push reservation notification failed: ${err.message}`));
      }

      // Emit realtime event to all subscribers of this boat (for instant calendar updates)
      try {
        this.gateway?.emitCreated(reservation.boatId, reservation);
      } catch (e) {
        this.logger.warn(`Gateway emit failed: ${(e as Error).message}`);
      }

      return reservation;
    } catch (error) {
      if (isDbOverlapError(error)) {
        throw new BadRequestException(DOUBLE_BOOKING_MSG);
      }
      throw error;
    }
  }

  async findAll(p = 1, l = 20, status?: string, boatId?: string) {
    const page = Number(p) || 1;
    const limit = Number(l) || 20;
    const where: any = { deletedAt: null };
    if (status) where.status = status;
    if (boatId) where.boatId = boatId;

    const [reservations, total] = await Promise.all([
      this.prisma.reservation.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        include: {
          boat: { select: { id: true, name: true, model: true, imageUrl: true } },
          user: { select: { id: true, name: true, email: true, avatar: true } },
        },
        orderBy: { startDate: 'desc' },
      }),
      this.prisma.reservation.count({ where }),
    ]);

    return { data: reservations, total, page, pages: Math.ceil(total / limit) };
  }

  async findByUser(userId: string, upcoming = false) {
    const where: any = { userId, deletedAt: null };
    if (upcoming) {
      where.startDate = { gte: new Date() };
      where.status = { in: ['CONFIRMED', 'PENDING'] };
    }

    return this.prisma.reservation.findMany({
      where,
      include: { boat: { select: { id: true, name: true, model: true, imageUrl: true } } },
      orderBy: { startDate: 'asc' },
    });
  }

  async findByBoat(boatId: string, date?: string) {
    const where: any = {
      boatId,
      status: { in: ['CONFIRMED', 'PENDING', 'IN_USE'] },
      deletedAt: null,
    };
    if (date) {
      const dayStart = new Date(date + 'T00:00:00');
      const dayEnd = new Date(date + 'T23:59:59');
      where.startDate = { lte: dayEnd };
      where.endDate = { gte: dayStart };
      // Date-specific queries are also used for historical view in PWA.
      where.status = { in: ['CONFIRMED', 'PENDING', 'IN_USE', 'COMPLETED'] };
    }
    return this.prisma.reservation.findMany({
      where,
      include: { user: { select: { id: true, name: true, avatar: true } } },
      orderBy: { startDate: 'asc' },
    });
  }

  /**
   * Returns boats that are completely free (no active reservations) on a given date,
   * along with boats that have availability gaps on that date.
   * For partially-occupied boats, returns the next free slot.
   */
  async findFreeBoats(date: string) {
    const dayStart = new Date(date + 'T00:00:00');
    const dayEnd = new Date(date + 'T23:59:59');

    // Get all boats with AVAILABLE status
    const boats = await this.prisma.boat.findMany({
      where: {
        status: 'AVAILABLE',
        deletedAt: null,
      },
      include: {
        shares: {
          where: { isActive: true },
          include: { user: { select: { id: true, name: true } } },
        },
      },
      orderBy: { name: 'asc' },
    });

    // Get all active reservations for this date
    const reservations = await this.prisma.reservation.findMany({
      where: {
        status: { in: ['CONFIRMED', 'PENDING', 'IN_USE'] },
        deletedAt: null,
        startDate: { lte: dayEnd },
        endDate: { gte: dayStart },
      },
      include: { user: { select: { id: true, name: true } } },
      orderBy: { startDate: 'asc' },
    });

    // Group reservations by boat
    const reservationsByBoat: Record<string, typeof reservations> = {};
    for (const r of reservations) {
      if (!reservationsByBoat[r.boatId]) reservationsByBoat[r.boatId] = [];
      reservationsByBoat[r.boatId].push(r);
    }

    // Build result
    const result: Array<{
      boat: typeof boats[0];
      isFullyFree: boolean;
      reservations: typeof reservations;
      nextFreeSlot: { start: string; end: string } | null;
    }> = [];

    for (const boat of boats) {
      const boatReservations = reservationsByBoat[boat.id] || [];
      
      if (boatReservations.length === 0) {
        // Boat is completely free
        result.push({
          boat,
          isFullyFree: true,
          reservations: [],
          nextFreeSlot: { start: dayStart.toISOString(), end: dayEnd.toISOString() },
        });
      } else {
        // Check if there are gaps
        const firstResStart = new Date(boatReservations[0].startDate);
        if (firstResStart > dayStart) {
          // Free from day start until first reservation
          result.push({
            boat,
            isFullyFree: false,
            reservations: boatReservations,
            nextFreeSlot: { start: dayStart.toISOString(), end: firstResStart.toISOString() },
          });
        } else {
          // Check gaps between reservations
          let foundGap = false;
          for (let i = 0; i < boatReservations.length - 1; i++) {
            const currentEnd = new Date(boatReservations[i].endDate);
            const nextStart = new Date(boatReservations[i + 1].startDate);
            if (currentEnd < nextStart) {
              result.push({
                boat,
                isFullyFree: false,
                reservations: boatReservations,
                nextFreeSlot: { start: currentEnd.toISOString(), end: nextStart.toISOString() },
              });
              foundGap = true;
              break;
            }
          }
          if (!foundGap) {
            // Check if free after last reservation
            const lastEnd = new Date(boatReservations[boatReservations.length - 1].endDate);
            if (lastEnd < dayEnd) {
              result.push({
                boat,
                isFullyFree: false,
                reservations: boatReservations,
                nextFreeSlot: { start: lastEnd.toISOString(), end: dayEnd.toISOString() },
              });
            }
          }
        }
      }
    }

    return result;
  }

  async cancel(id: string, userId: string, reason?: string, role?: string) {
    const reservation = await this.prisma.reservation.findUnique({
      where: { id },
      include: { boat: { select: { name: true, model: true, imageUrl: true } } },
    });
    if (!reservation) throw new NotFoundException('Reserva não encontrada');
    if (role !== 'ADMIN' && reservation.userId !== userId) throw new ForbiddenException('Reserva não pertence a você');
    if (reservation.status === 'CANCELLED') throw new BadRequestException('Reserva já cancelada');

    const result = await this.prisma.reservation.update({
      where: { id },
      data: {
        status: 'CANCELLED',
        cancelledAt: new Date(),
        cancelReason: reason || 'Cancelado pelo cliente',
      },
    });

    // If there's a PENDING substitute, promote them immediately (cancel = vacancy)
    const pendingSub = await this.prisma.reservationSubstitute.findFirst({
      where: { reservationId: id, status: 'PENDING' },
    });
    if (pendingSub) {
      // Re-open the reservation by transferring it to the substitute (PROMOTE flow).
      // We undo the cancellation by promoting on the still-cancelled record;
      // promoteSubstitute resets userId + clears cancellation atomically.
      try {
        await this.prisma.reservation.update({
          where: { id },
          data: { status: 'CONFIRMED', cancelledAt: null, cancelReason: null },
        });
        await this.promoteSubstitute(pendingSub.id);
      } catch (e) {
        this.logger.error(`Auto-promote on cancel failed: ${(e as Error).message}`);
      }
    }

    // Send push notification for cancellation
    this.notificationsService.send({
      userId: reservation.userId,
      type: 'RESERVATION_CANCELLED',
      title: '❌ Reserva cancelada',
      body: `Sua reserva em ${(reservation as any).boat?.name || 'embarcação'} foi cancelada.`,
      data: { reservationId: id, url: '/boats' },
      pushTag: `res-cancelled-${id}`,
    }).catch((err) => this.logger.error(`Push cancel notification failed: ${err.message}`));

    // Emit realtime event
    try {
      this.gateway?.emitCancelled(reservation.boatId, result);
    } catch (e) {
      this.logger.warn(`Gateway emit failed: ${(e as Error).message}`);
    }

    return result;
  }

  async getCalendar(boatId: string, month: number, year: number) {
    const startOfMonth = new Date(year, month - 1, 1);
    const endOfMonth = new Date(year, month, 0, 23, 59, 59);

    return this.prisma.reservation.findMany({
      where: {
        boatId,
        status: { in: ['CONFIRMED', 'IN_USE', 'COMPLETED'] },
        startDate: { lte: endOfMonth },
        endDate: { gte: startOfMonth },
      },
      include: { user: { select: { id: true, name: true, avatar: true } } },
      orderBy: { startDate: 'asc' },
    });
  }

  /**
   * Returns all reservations for a boat in a wide window (default:
   * last 30 days → next 12 months). Intended for the PWA snapshot model
   * where the client loads once and derives per-day/per-month views in memory.
   */
  async getAllByBoat(boatId: string, opts?: { pastDays?: number; futureMonths?: number }) {
    const pastDays = opts?.pastDays ?? 30;
    const futureMonths = opts?.futureMonths ?? 12;

    const now = new Date();
    const from = new Date(now);
    from.setDate(from.getDate() - pastDays);
    from.setHours(0, 0, 0, 0);

    const to = new Date(now);
    to.setMonth(to.getMonth() + futureMonths);
    to.setHours(23, 59, 59, 999);

    return this.prisma.reservation.findMany({
      where: {
        boatId,
        deletedAt: null,
        status: { in: ['CONFIRMED', 'PENDING', 'IN_USE', 'COMPLETED'] },
        startDate: { lte: to },
        endDate: { gte: from },
      },
      include: { user: { select: { id: true, name: true, avatar: true } } },
      orderBy: { startDate: 'asc' },
    });
  }

  // ─── Swap Requests ────────────────────────────────────────────────────

  async createSwapRequest(requesterId: string, dto: { targetReservationId: string; offeredReservationId: string; message?: string }) {
    // Target reservation = the one the requester WANTS (belongs to another user)
    const targetReservation = await this.prisma.reservation.findUnique({
      where: { id: dto.targetReservationId },
      include: { boat: { select: { id: true, name: true, model: true, imageUrl: true } }, user: { select: { id: true, name: true, avatar: true } } },
    });
    if (!targetReservation) throw new NotFoundException('Reserva alvo não encontrada');
    if (targetReservation.userId === requesterId) throw new BadRequestException('Você não pode trocar com sua própria reserva');
    if (targetReservation.status !== 'CONFIRMED') throw new BadRequestException('A reserva alvo deve estar confirmada');

    const now = new Date();
    if (new Date(targetReservation.startDate) < now) throw new BadRequestException('Não é possível trocar reservas passadas');

    // Offered reservation = the one the requester is GIVING (must belong to requester)
    const offeredReservation = await this.prisma.reservation.findUnique({
      where: { id: dto.offeredReservationId },
      include: { boat: { select: { id: true, name: true, model: true, imageUrl: true } } },
    });
    if (!offeredReservation) throw new NotFoundException('Reserva oferecida não encontrada');
    if (offeredReservation.userId !== requesterId) throw new ForbiddenException('Você só pode oferecer suas próprias reservas');
    if (offeredReservation.status !== 'CONFIRMED') throw new BadRequestException('A reserva oferecida deve estar confirmada');
    if (new Date(offeredReservation.startDate) < now) throw new BadRequestException('Não é possível trocar reservas passadas');
    if (offeredReservation.boatId !== targetReservation.boatId) throw new BadRequestException('Ambas as reservas devem ser da mesma embarcação');

    // Check no pending swap already exists for either reservation
    const existing = await this.prisma.reservationSwap.findFirst({
      where: {
        status: 'PENDING',
        OR: [
          { reservationId: dto.targetReservationId },
          { offeredReservationId: dto.offeredReservationId },
          { reservationId: dto.offeredReservationId },
          { offeredReservationId: dto.targetReservationId },
        ],
      },
    });
    if (existing) throw new BadRequestException('Já existe uma solicitação de troca pendente envolvendo uma dessas reservas');

    const swap = await this.prisma.reservationSwap.create({
      data: {
        reservationId: dto.targetReservationId,
        offeredReservationId: dto.offeredReservationId,
        requesterId,
        targetUserId: targetReservation.userId,
        message: dto.message,
      },
      include: {
        reservation: { include: { boat: { select: { id: true, name: true, model: true, imageUrl: true } }, user: { select: { id: true, name: true, avatar: true } } } },
        offeredReservation: { include: { user: { select: { id: true, name: true, avatar: true } } } },
        requester: { select: { id: true, name: true, avatar: true } },
      },
    });

    // Send WhatsApp notifications
    if (this.whatsapp) {
      this.whatsapp.sendSwapRequestNotification(swap.id).catch((err) => {
        this.logger.error(`Failed to send swap request notification: ${err.message}`);
      });
    }

    // Send push notification to target user (owner of the wanted reservation)
    this.notificationsService.send({
      userId: swap.targetUserId,
      type: 'SWAP_REQUEST',
      title: '🔄 Solicitação de troca de data',
      body: `${swap.requester?.name || 'Um cotista'} quer trocar de data com você na ${swap.reservation?.boat?.name || 'embarcação'}.`,
      data: { swapId: swap.id, url: '/reservations' },
      pushTag: `swap-req-${swap.id}`,
      pushActions: [{ action: 'view', title: 'Ver detalhes' }],
    }).catch((err) => this.logger.error(`Push swap request notification failed: ${err.message}`));

    return swap;
  }

  async getMySwapRequests(userId: string) {
    return this.prisma.reservationSwap.findMany({
      where: {
        OR: [{ requesterId: userId }, { targetUserId: userId }],
      },
      include: {
        reservation: {
          include: {
            boat: { select: { id: true, name: true, model: true, imageUrl: true } },
            user: { select: { id: true, name: true, avatar: true } },
          },
        },
        offeredReservation: {
          include: {
            user: { select: { id: true, name: true, avatar: true } },
          },
        },
        requester: { select: { id: true, name: true, avatar: true } },
        targetUser: { select: { id: true, name: true, avatar: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getPendingSwapsForUser(userId: string) {
    return this.prisma.reservationSwap.findMany({
      where: { targetUserId: userId, status: 'PENDING' },
      include: {
        reservation: {
          include: {
            boat: { select: { id: true, name: true, model: true, imageUrl: true } },
            user: { select: { id: true, name: true, avatar: true } },
          },
        },
        offeredReservation: {
          include: {
            user: { select: { id: true, name: true, avatar: true } },
          },
        },
        requester: { select: { id: true, name: true, avatar: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async respondToSwap(swapId: string, userId: string, accept: boolean) {
    const swap = await this.prisma.reservationSwap.findUnique({
      where: { id: swapId },
      include: {
        reservation: true,
        offeredReservation: true,
      },
    });
    if (!swap) throw new NotFoundException('Solicitação de troca não encontrada');
    if (swap.targetUserId !== userId) throw new ForbiddenException('Apenas o cotista alvo pode responder');
    if (swap.status !== 'PENDING') throw new BadRequestException('Esta solicitação já foi respondida');

    if (accept) {
      // Swap dates between the two reservations.
      // Confirmation state (confirmedAt + expectedArrivalTime) FOLLOWS THE DATE,
      // because presence was confirmed for that specific time slot — the new
      // owner of the slot inherits that confirmation.
      const targetStart = swap.reservation.startDate;
      const targetEnd = swap.reservation.endDate;
      const targetConfirmedAt = swap.reservation.confirmedAt;
      const targetArrival = swap.reservation.expectedArrivalTime;
      const offeredStart = swap.offeredReservation.startDate;
      const offeredEnd = swap.offeredReservation.endDate;
      const offeredConfirmedAt = swap.offeredReservation.confirmedAt;
      const offeredArrival = swap.offeredReservation.expectedArrivalTime;

      try {
        await this.prisma.$transaction(async (tx) => {
          // Temporarily disable overlap trigger so the intermediate state doesn't conflict
          await tx.$executeRawUnsafe('ALTER TABLE reservations DISABLE TRIGGER trg_reservation_overlap_check');
          // Target reservation gets the offered reservation's dates + its confirmation state
          await tx.reservation.update({
            where: { id: swap.reservationId },
            data: {
              startDate: offeredStart,
              endDate: offeredEnd,
              confirmedAt: offeredConfirmedAt,
              expectedArrivalTime: offeredArrival,
            },
          });
          // Offered reservation gets the target reservation's dates + its confirmation state
          await tx.reservation.update({
            where: { id: swap.offeredReservationId },
            data: {
              startDate: targetStart,
              endDate: targetEnd,
              confirmedAt: targetConfirmedAt,
              expectedArrivalTime: targetArrival,
            },
          });
          // Re-enable overlap trigger
          await tx.$executeRawUnsafe('ALTER TABLE reservations ENABLE TRIGGER trg_reservation_overlap_check');
          // Also swap scheduledAt in OperationalQueue if entries exist
          await tx.operationalQueue.updateMany({
            where: { reservationId: swap.reservationId },
            data: { scheduledAt: offeredStart },
          });
          await tx.operationalQueue.updateMany({
            where: { reservationId: swap.offeredReservationId },
            data: { scheduledAt: targetStart },
          });
        });
      } catch (error) {
        if (isDbOverlapError(error)) {
          throw new BadRequestException('Troca nao pode ser concluida: ha conflito com outra reserva.');
        }
        throw error;
      }
    }

    const result = await this.prisma.reservationSwap.update({
      where: { id: swapId },
      data: {
        status: accept ? 'ACCEPTED' : 'REJECTED',
        respondedAt: new Date(),
      },
      include: {
        reservation: { include: { boat: { select: { id: true, name: true, model: true, imageUrl: true } }, user: { select: { id: true, name: true, avatar: true } } } },
        offeredReservation: { include: { user: { select: { id: true, name: true, avatar: true } } } },
        requester: { select: { id: true, name: true, avatar: true } },
        targetUser: { select: { id: true, name: true, avatar: true } },
      },
    });

    // Send WhatsApp notifications
    if (this.whatsapp) {
      this.whatsapp.sendSwapResponseNotification(result.id).catch((err) => {
        this.logger.error(`Failed to send swap response notification: ${err.message}`);
      });
    }

    // Send push notification to the requester about the response
    const notifType = accept ? 'SWAP_ACCEPTED' : 'SWAP_REJECTED';
    const emoji = accept ? '✅' : '❌';
    const statusText = accept ? 'aceita' : 'recusada';
    this.notificationsService.send({
      userId: result.requesterId,
      type: notifType,
      title: `${emoji} Troca de data ${statusText}`,
      body: `${result.targetUser?.name || 'O cotista'} ${statusText} sua solicitação de troca na ${result.reservation?.boat?.name || 'embarcação'}.`,
      data: { swapId: result.id, url: '/reservations' },
      pushTag: `swap-resp-${result.id}`,
    }).catch((err) => this.logger.error(`Push swap response notification failed: ${err.message}`));

    return result;
  }

  async getCoOwners(userId: string, boatId: string) {
    const shares = await this.prisma.share.findMany({
      where: { boatId, isActive: true, userId: { not: userId } },
      include: { user: { select: { id: true, name: true, avatar: true } } },
    });
    return shares.map(s => s.user);
  }

  // ─── Substitutes (Suplente de cota) ──────────────────────────────────
  //
  // Mechanism: when a co-owner has a CONFIRMED reservation but hasn't yet
  // confirmed presence, OTHER co-owners on the same boat may sign up as
  // substitute. A scheduled job runs near the cutoff (default 4h before
  // start). At cutoff:
  //   - if holder confirmed presence → substitute is REJECTED
  //   - else → substitute is PROMOTED: reservation transferred to substitute
  //            (userId swapped, transferredFromUserId set, status remains
  //             CONFIRMED, confirmedAt set, expectedArrivalTime defaulted)
  //
  // Constraints:
  //   - Substitute must hold an active share on the same boat
  //   - Substitute cannot be the reservation holder
  //   - One PENDING substitute per reservation (FIFO via @@unique)
  //   - Reservation must be future, CONFIRMED, not yet arrival-confirmed
  //   - Substitute must respect their maxReservations limit
  // ─────────────────────────────────────────────────────────────────────

  private get substituteCutoffHours(): number {
    return Number(process.env.SUBSTITUTE_CUTOFF_HOURS || 4);
  }

  async registerSubstitute(userId: string, reservationId: string, message?: string) {
    const reservation = await this.prisma.reservation.findUnique({
      where: { id: reservationId },
      include: {
        boat: { select: { id: true, name: true, model: true, imageUrl: true } },
        user: { select: { id: true, name: true, avatar: true } },
      },
    });
    if (!reservation || reservation.deletedAt) {
      throw new NotFoundException('Reserva não encontrada');
    }
    if (reservation.userId === userId) {
      throw new BadRequestException('Você não pode ser suplente da sua própria reserva');
    }
    if (reservation.status !== 'CONFIRMED') {
      throw new BadRequestException('Apenas reservas confirmadas aceitam suplente');
    }
    if (reservation.expectedArrivalTime) {
      throw new BadRequestException('O cotista já confirmou a presença — vaga não disponível para suplente');
    }
    const now = new Date();
    if (new Date(reservation.startDate) <= now) {
      throw new BadRequestException('Não é possível se inscrever como suplente de reserva já iniciada');
    }
    const cutoff = new Date(reservation.startDate.getTime() - this.substituteCutoffHours * 3_600_000);
    if (cutoff <= now) {
      throw new BadRequestException(`Inscrição encerrada. Suplentes são aceitos até ${this.substituteCutoffHours}h antes do início.`);
    }

    const share = await this.prisma.share.findFirst({
      where: { userId, boatId: reservation.boatId, isActive: true },
    });
    if (!share) {
      throw new ForbiddenException('Você precisa ser cotista desta embarcação para se inscrever como suplente');
    }

    // Substitute must have free reservation slot (so they can absorb)
    const maxRes = share.maxReservations ?? 3;
    const activeReservations = await this.prisma.reservation.count({
      where: {
        userId,
        boatId: reservation.boatId,
        status: { in: ['CONFIRMED', 'PENDING'] },
        endDate: { gte: now },
        deletedAt: null,
      },
    });
    if (activeReservations >= maxRes) {
      throw new BadRequestException(
        `Você já atingiu o limite de ${maxRes} reserva${maxRes > 1 ? 's' : ''} simultânea${maxRes > 1 ? 's' : ''} nesta embarcação. Cancele uma para se inscrever como suplente.`,
      );
    }

    // Check delinquency (same rule as creating reservation)
    const delinquency = await this.prisma.delinquency.findFirst({
      where: { userId, status: 'ACTIVE' },
    });
    if (delinquency) {
      throw new ForbiddenException('Inscrição bloqueada por inadimplência. Regularize seus pagamentos.');
    }

    // Also block on any overdue charge directly (mirror reservation create)
    const overdueCharge = await this.prisma.charge.findFirst({
      where: {
        userId,
        deletedAt: null,
        OR: [
          { status: 'OVERDUE' },
          { status: 'PENDING', dueDate: { lt: now } },
        ],
      },
    });
    if (overdueCharge) {
      throw new ForbiddenException('Inscrição como suplente bloqueada. Você possui fatura(s) vencida(s). Regularize seus pagamentos.');
    }

    // FIFO: only one PENDING substitute per reservation.
    const existing = await this.prisma.reservationSubstitute.findFirst({
      where: { reservationId, status: 'PENDING' },
    });
    if (existing) {
      if (existing.substituteId === userId) {
        throw new BadRequestException('Você já está inscrito como suplente desta reserva');
      }
      throw new BadRequestException('Já existe um suplente inscrito para esta reserva');
    }

    // Upsert (reservationId, substituteId) — re-activate any stale row
    // (PROMOTED/REJECTED/CANCELLED) instead of failing on the unique key.
    const substitute = await this.prisma.reservationSubstitute.upsert({
      where: { reservationId_substituteId: { reservationId, substituteId: userId } },
      create: {
        reservationId,
        substituteId: userId,
        message: message?.slice(0, 500),
      },
      update: {
        status: 'PENDING',
        message: message?.slice(0, 500),
        promotedAt: null,
        resolvedAt: null,
      },
      include: {
        substitute: { select: { id: true, name: true, avatar: true } },
        reservation: {
          include: {
            boat: { select: { id: true, name: true, model: true, imageUrl: true } },
            user: { select: { id: true, name: true, avatar: true } },
          },
        },
      },
    });

    // Notify holder so they have incentive to confirm presence
    this.notificationsService.send({
      userId: reservation.userId,
      type: 'SUBSTITUTE_REGISTERED',
      title: '⏳ Um suplente se inscreveu',
      body: `${substitute.substitute.name} se inscreveu como suplente da sua reserva em ${reservation.boat?.name}. Confirme sua presença para garantir a vaga.`,
      data: { reservationId, substituteId: substitute.id, url: '/reservations' },
      pushTag: `subst-reg-${substitute.id}`,
      pushUrgency: 'high',
    }).catch((err) => this.logger.error(`Push substitute registered failed: ${err.message}`));

    return substitute;
  }

  async cancelSubstitute(substituteRequestId: string, userId: string, role?: string) {
    const sub = await this.prisma.reservationSubstitute.findUnique({
      where: { id: substituteRequestId },
      include: { reservation: { select: { id: true, userId: true, boatId: true } } },
    });
    if (!sub) throw new NotFoundException('Inscrição não encontrada');
    if (sub.status !== 'PENDING') throw new BadRequestException('Inscrição já foi processada');
    const isHolder = sub.reservation.userId === userId;
    const isSubstitute = sub.substituteId === userId;
    const isAdmin = role === 'ADMIN' || role === 'OPERATOR';
    if (!isHolder && !isSubstitute && !isAdmin) {
      throw new ForbiddenException('Sem permissão');
    }

    const updated = await this.prisma.reservationSubstitute.update({
      where: { id: substituteRequestId },
      data: { status: 'CANCELLED', resolvedAt: new Date() },
    });

    // Notify the other party
    if (isSubstitute) {
      // Notify holder that the substitute backed out
      this.notificationsService.send({
        userId: sub.reservation.userId,
        type: 'SUBSTITUTE_REJECTED',
        title: 'ℹ️ Suplente cancelou inscrição',
        body: 'O suplente da sua reserva cancelou a inscrição.',
        data: { reservationId: sub.reservationId, url: '/reservations' },
        pushTag: `subst-cancel-${sub.id}`,
      }).catch(() => {/* ignore */});
    } else if (isHolder || isAdmin) {
      this.notificationsService.send({
        userId: sub.substituteId,
        type: 'SUBSTITUTE_REJECTED',
        title: 'ℹ️ Inscrição de suplente removida',
        body: 'Sua inscrição como suplente foi removida pelo titular ou administração.',
        data: { reservationId: sub.reservationId, url: '/reservations' },
        pushTag: `subst-cancel-${sub.id}`,
      }).catch(() => {/* ignore */});
    }
    return updated;
  }

  async getSubstitutesForReservation(reservationId: string) {
    return this.prisma.reservationSubstitute.findMany({
      where: { reservationId },
      include: { substitute: { select: { id: true, name: true, avatar: true } } },
      orderBy: { createdAt: 'asc' },
    });
  }

  async getMySubstituteRequests(userId: string) {
    // Where I am the substitute (subscribed to others' reservations)
    return this.prisma.reservationSubstitute.findMany({
      where: { substituteId: userId },
      include: {
        reservation: {
          include: {
            boat: { select: { id: true, name: true, model: true, imageUrl: true } },
            user: { select: { id: true, name: true, avatar: true } },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getSubstitutesOnMyReservations(userId: string) {
    // Where I am the holder and someone signed up as substitute
    return this.prisma.reservationSubstitute.findMany({
      where: { reservation: { userId, deletedAt: null }, status: 'PENDING' },
      include: {
        substitute: { select: { id: true, name: true, avatar: true } },
        reservation: {
          include: { boat: { select: { id: true, name: true, model: true, imageUrl: true } } },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Returns reservations on boats where the user is a co-owner that are
   * eligible for substitute signup (CONFIRMED, future, not arrival-confirmed,
   * holder ≠ user, no PENDING substitute, before cutoff).
   */
  async getSubstitutableReservations(userId: string) {
    const now = new Date();
    // boats where user has active share
    const shares = await this.prisma.share.findMany({
      where: { userId, isActive: true },
      select: { boatId: true },
    });
    if (shares.length === 0) return [];

    const cutoffMs = this.substituteCutoffHours * 3_600_000;
    const minStart = new Date(now.getTime() + cutoffMs);

    const reservations = await this.prisma.reservation.findMany({
      where: {
        boatId: { in: shares.map(s => s.boatId) },
        userId: { not: userId },
        status: 'CONFIRMED',
        expectedArrivalTime: null,
        startDate: { gt: minStart },
        deletedAt: null,
      },
      include: {
        boat: { select: { id: true, name: true, model: true, imageUrl: true } },
        user: { select: { id: true, name: true, avatar: true } },
        substitutes: {
          where: { status: 'PENDING' },
          select: { id: true, substituteId: true, substitute: { select: { id: true, name: true, avatar: true } } },
        },
      },
      orderBy: { startDate: 'asc' },
    });

    // Hide reservations that already have a substitute
    return reservations.filter(r => r.substitutes.length === 0);
  }

  /**
   * Cron job: every 5 minutes, process PENDING substitutes whose cutoff has
   * arrived (i.e. now >= startDate - SUBSTITUTE_CUTOFF_HOURS).
   *   - If holder has expectedArrivalTime → REJECT substitute
   *   - Else → PROMOTE substitute (transfer reservation atomically)
   */
  @Cron('*/5 * * * *', { timeZone: 'America/Sao_Paulo' })
  async processSubstituteCutoffs() {
    const now = new Date();
    const cutoffStartCeiling = new Date(now.getTime() + this.substituteCutoffHours * 3_600_000);

    const candidates = await this.prisma.reservationSubstitute.findMany({
      where: {
        status: 'PENDING',
        reservation: {
          deletedAt: null,
          status: { in: ['CONFIRMED', 'PENDING'] },
          startDate: { lte: cutoffStartCeiling, gt: now },
        },
      },
      include: {
        reservation: {
          include: { boat: { select: { id: true, name: true, model: true, imageUrl: true } } },
        },
        substitute: { select: { id: true, name: true, avatar: true } },
      },
    });

    for (const cand of candidates) {
      try {
        if (cand.reservation.expectedArrivalTime) {
          await this.rejectSubstitute(cand.id, cand.reservation, cand.substitute);
        } else {
          await this.promoteSubstitute(cand.id);
        }
      } catch (e) {
        this.logger.error(`Substitute cutoff processing failed for ${cand.id}: ${(e as Error).message}`);
      }
    }
    if (candidates.length > 0) {
      this.logger.log(`Processed ${candidates.length} substitute cutoff(s)`);
    }
  }

  private async rejectSubstitute(
    substituteId: string,
    reservation: { boat: { name: string } | null },
    substitute: { id: string; name: string },
  ) {
    await this.prisma.reservationSubstitute.update({
      where: { id: substituteId },
      data: { status: 'REJECTED', resolvedAt: new Date() },
    });
    this.notificationsService.send({
      userId: substitute.id,
      type: 'SUBSTITUTE_REJECTED',
      title: '😕 Vaga não liberada',
      body: `O cotista confirmou a presença na reserva da ${reservation.boat?.name}. Sua inscrição como suplente foi encerrada.`,
      data: { url: '/reservations' },
      pushTag: `subst-rej-${substituteId}`,
    }).catch(() => {/* ignore */});
  }

  /**
   * Promote a substitute manually (admin), via cron, or via "passar a vez" by holder.
   *
   * @param substituteId  The ReservationSubstitute row to promote.
   * @param opts.preserveQueue   If true, do NOT cancel sibling pending substitutes —
   *                             they remain available to the new holder so the chain
   *                             can continue ("passar a vez").
   * @param opts.autoConfirm     If true (legacy cron behavior), set confirmedAt + expectedArrivalTime
   *                             on the new holder's reservation. If false, the new holder
   *                             receives the reservation UNCONFIRMED so they can themselves
   *                             confirm or pass to the next substitute.
   */
  async promoteSubstitute(
    substituteId: string,
    opts: { preserveQueue?: boolean; autoConfirm?: boolean } = {},
  ) {
    const { preserveQueue = false, autoConfirm = true } = opts;
    const sub = await this.prisma.reservationSubstitute.findUnique({
      where: { id: substituteId },
      include: {
        reservation: {
          include: {
            boat: { select: { id: true, name: true, model: true, imageUrl: true } },
            user: { select: { id: true, name: true, avatar: true } },
          },
        },
        substitute: { select: { id: true, name: true, avatar: true } },
      },
    });
    if (!sub) throw new NotFoundException('Inscrição não encontrada');
    if (sub.status !== 'PENDING') throw new BadRequestException('Inscrição já processada');
    const reservation = sub.reservation;
    if (reservation.expectedArrivalTime) {
      throw new BadRequestException('Cotista já confirmou presença — não é possível promover suplente');
    }
    if (reservation.deletedAt) throw new BadRequestException('Reserva foi removida');
    if (new Date(reservation.startDate) <= new Date()) {
      throw new BadRequestException('Reserva já iniciada');
    }

    const previousHolderId = reservation.userId;
    const arrival = reservation.startDate.toISOString().slice(11, 16); // HH:mm
    const now = new Date();

    await this.prisma.$transaction(async (tx) => {
      // Transfer reservation
      await tx.reservation.update({
        where: { id: reservation.id },
        data: {
          userId: sub.substituteId,
          transferredFromUserId: previousHolderId,
          transferredAt: now,
          // When autoConfirm=false (e.g. holder voluntarily "passou a vez"),
          // the new holder receives the reservation UNCONFIRMED so they can
          // themselves confirm presence or pass to the next substitute.
          ...(autoConfirm
            ? { confirmedAt: now, expectedArrivalTime: arrival }
            : { confirmedAt: null, expectedArrivalTime: null }),
        },
      });
      // Mark this substitute as PROMOTED
      await tx.reservationSubstitute.update({
        where: { id: sub.id },
        data: { status: 'PROMOTED', resolvedAt: now, promotedAt: now },
      });
      // Cancel sibling pending substitutes UNLESS we want to preserve the queue
      // for the new holder (chain "passar a vez").
      if (!preserveQueue) {
        await tx.reservationSubstitute.updateMany({
          where: { reservationId: reservation.id, status: 'PENDING', id: { not: sub.id } },
          data: { status: 'CANCELLED', resolvedAt: now },
        });
      } else {
        // The new holder can no longer be his own substitute — drop any of their entries.
        await tx.reservationSubstitute.updateMany({
          where: { reservationId: reservation.id, status: 'PENDING', substituteId: sub.substituteId },
          data: { status: 'CANCELLED', resolvedAt: now },
        });
      }
    });

    // Notify the new holder (substitute)
    this.notificationsService.send({
      userId: sub.substituteId,
      type: 'SUBSTITUTE_PROMOTED',
      title: '🎉 Vaga liberada para você!',
      body: `Você assumiu a reserva de ${reservation.boat?.name} em ${reservation.startDate.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' })}.`,
      data: { reservationId: reservation.id, url: '/reservations' },
      pushTag: `subst-prom-${sub.id}`,
      pushUrgency: 'high',
    }).catch(() => {/* ignore */});

    // Notify the original holder
    this.notificationsService.send({
      userId: previousHolderId,
      type: 'SUBSTITUTE_PROMOTED',
      title: '🔁 Reserva transferida ao suplente',
      body: `Como você não confirmou presença em tempo, sua reserva da ${reservation.boat?.name} foi transferida para ${sub.substitute.name}.`,
      data: { reservationId: reservation.id, url: '/reservations' },
      pushTag: `subst-prom-out-${sub.id}`,
      pushUrgency: 'high',
    }).catch(() => {/* ignore */});

    // Realtime broadcast
    try {
      const updated = await this.prisma.reservation.findUnique({
        where: { id: reservation.id },
        include: { user: { select: { id: true, name: true, avatar: true } } },
      });
      if (updated) this.gateway?.emitUpdated(reservation.boatId, updated);
    } catch {/* ignore */}

    return this.prisma.reservationSubstitute.findUnique({
      where: { id: sub.id },
      include: {
        reservation: { include: { boat: { select: { id: true, name: true, model: true, imageUrl: true } }, user: { select: { id: true, name: true, avatar: true } } } },
        substitute: { select: { id: true, name: true, avatar: true } },
      },
    });
  }

  /**
   * Holder voluntarily passes the slot to the NEXT substitute in queue
   * (oldest pending substitute by createdAt). The new holder receives the
   * reservation UNCONFIRMED and the remaining substitutes stay in queue,
   * so the chain can continue until someone confirms.
   */
  async passToNextSubstitute(reservationId: string, holderUserId: string) {
    const reservation = await this.prisma.reservation.findUnique({
      where: { id: reservationId },
      select: { id: true, userId: true, status: true, deletedAt: true, expectedArrivalTime: true, startDate: true },
    });
    if (!reservation) throw new NotFoundException('Reserva não encontrada');
    if (reservation.userId !== holderUserId) {
      throw new ForbiddenException('Apenas o titular pode passar a vez');
    }
    if (reservation.deletedAt) throw new BadRequestException('Reserva foi removida');
    if (reservation.expectedArrivalTime) {
      throw new BadRequestException('Presença já confirmada — não é possível passar a vez');
    }
    if (new Date(reservation.startDate) <= new Date()) {
      throw new BadRequestException('Reserva já iniciada');
    }
    const nextSub = await this.prisma.reservationSubstitute.findFirst({
      where: { reservationId, status: 'PENDING' },
      orderBy: { createdAt: 'asc' },
    });
    if (!nextSub) {
      throw new BadRequestException('Não há suplentes inscritos para receber esta reserva');
    }
    return this.promoteSubstitute(nextSub.id, { preserveQueue: true, autoConfirm: false });
  }

  async confirmArrival(reservationId: string, userId: string, expectedArrivalTime: string) {
    const reservation = await this.prisma.reservation.findUnique({
      where: { id: reservationId },
      include: { boat: true },
    });
    if (!reservation) throw new NotFoundException('Reserva não encontrada');
    if (reservation.userId !== userId) throw new ForbiddenException('Reserva não pertence a este usuário');
    if (!['CONFIRMED', 'PENDING'].includes(reservation.status)) {
      throw new BadRequestException('Reserva não pode ser confirmada neste status');
    }
    if (reservation.expectedArrivalTime) {
      throw new BadRequestException('Presença já foi confirmada');
    }

    // Update reservation with confirmation data
    const updated = await this.prisma.reservation.update({
      where: { id: reservationId },
      data: {
        confirmedAt: reservation.confirmedAt ?? new Date(),
        expectedArrivalTime,
      },
      include: { boat: { select: { id: true, name: true, model: true, imageUrl: true } } },
    });

    // Reject any pending substitute — vaga não liberada
    const pendingSubs = await this.prisma.reservationSubstitute.findMany({
      where: { reservationId, status: 'PENDING' },
      include: { substitute: { select: { id: true, name: true, avatar: true } } },
    });
    if (pendingSubs.length > 0) {
      await this.prisma.reservationSubstitute.updateMany({
        where: { id: { in: pendingSubs.map(s => s.id) } },
        data: { status: 'REJECTED', resolvedAt: new Date() },
      });
      for (const ps of pendingSubs) {
        this.notificationsService.send({
          userId: ps.substituteId,
          type: 'SUBSTITUTE_REJECTED',
          title: '😕 Vaga não liberada',
          body: `O cotista confirmou a presença na reserva da ${reservation.boat?.name || 'embarcação'}. Sua inscrição como suplente foi encerrada.`,
          data: { reservationId, url: '/reservations' },
          pushTag: `subst-rej-${ps.id}`,
        }).catch(() => {/* ignore */});
      }
    }

    // Create queue entry in WAITING status
    const maxPos = await this.prisma.operationalQueue.aggregate({
      _max: { position: true },
      where: { status: { in: ['WAITING', 'IN_WATER', 'PREPARING', 'LAUNCHING'] } },
    });
    await this.prisma.operationalQueue.create({
      data: {
        boatId: reservation.boatId,
        reservationId,
        clientId: userId,
        position: (maxPos._max.position ?? 0) + 1,
        status: 'WAITING',
        scheduledAt: reservation.startDate,
      },
    });

    return updated;
  }
}
