import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { CreateChecklistDto } from './dto/create-checklist.dto';
import { NotificationsService } from '../notifications/notifications.service';

const PRE_LAUNCH_ITEMS = [
  'Âncora e cabo presentes',
  'Documentação a bordo',
  'Motor de arranque funcionando',
  'Bateria carregada',
  'Nível de combustível verificado',
];

@Injectable()
export class OperationsService {
  constructor(
    private prisma: PrismaService,
    private notificationsService: NotificationsService,
  ) {}

  // ─── Pre-launch checklist (CLIENT flow) ───────────────────────────────────

  async startPreLaunchChecklist(userId: string, reservationId: string) {
    const reservation = await this.prisma.reservation.findUnique({
      where: { id: reservationId },
      include: { boat: true },
    });
    if (!reservation) throw new NotFoundException('Reserva não encontrada');
    // Allow reservation owner OR admin/operator
    const currentUser = await this.prisma.user.findUnique({ where: { id: userId }, select: { role: true } });
    const isStaff = currentUser?.role === 'ADMIN' || currentUser?.role === 'OPERATOR';
    if (reservation.userId !== userId && !isStaff) throw new BadRequestException('Reserva não pertence a este usuário');
    if (!['CONFIRMED', 'PENDING'].includes(reservation.status)) {
      throw new BadRequestException(`Reserva está com status inválido para checklist: ${reservation.status}`);
    }

    // Create or return existing checklist for this reservation
    const existing = await this.prisma.checklist.findUnique({ where: { reservationId }, include: { items: { orderBy: { order: 'asc' } } } });
    if (existing) return existing;

    return this.prisma.checklist.create({
      data: {
        boatId: reservation.boatId,
        operatorId: userId,
        reservationId,
        type: 'PRE_LAUNCH',
        items: {
          create: PRE_LAUNCH_ITEMS.map((label, i) => ({ label, order: i + 1 })),
        },
      },
      include: { items: { orderBy: { order: 'asc' } }, boat: { select: { id: true, name: true, model: true } } },
    });
  }

  async submitPreLaunchChecklist(checklistId: string, userId: string, data: {
    items: { id: string; checked: boolean; notes?: string }[];
    hullSketchUrl?: string;
    hullSketchMarks?: string;
    videoUrl?: string;
    fuelPhotoUrl?: string;
    additionalObservations?: string;
    lifeVestsLoaned?: number;
  }) {
    const checklist = await this.prisma.checklist.findUnique({
      where: { id: checklistId },
      include: { reservation: true },
    });
    if (!checklist) throw new NotFoundException('Checklist não encontrado');
    // Allow operator who created it OR any admin/operator
    const currentUser = await this.prisma.user.findUnique({ where: { id: userId }, select: { role: true } });
    const isAdminOrOperator = currentUser?.role === 'ADMIN' || currentUser?.role === 'OPERATOR';
    if (checklist.operatorId !== userId && !isAdminOrOperator) throw new BadRequestException('Sem permissão para este checklist');
    if (checklist.status === 'APPROVED') throw new BadRequestException('Checklist já foi concluído');

    const allChecked = data.items.every((i) => i.checked);

    // Update all items
    await Promise.all(
      data.items.map((item) =>
        this.prisma.checklistItem.update({
          where: { id: item.id },
          data: { checked: item.checked, notes: item.notes },
        }),
      ),
    );

    // Mark checklist complete
    await this.prisma.checklist.update({
      where: { id: checklistId },
      data: {
        status: allChecked ? 'APPROVED' : 'REJECTED',
        completedAt: new Date(),
        hullSketchUrl: data.hullSketchUrl,
        hullSketchMarks: data.hullSketchMarks,
        videoUrl: data.videoUrl,
        fuelPhotoUrl: data.fuelPhotoUrl,
        additionalObservations: data.additionalObservations,
        lifeVestsLoaned: data.lifeVestsLoaned ?? 0,
      },
    });

    // Put boat in water if all items checked
    if (allChecked) {
      if (checklist.reservationId) {
        const reservation = await this.prisma.reservation.findUnique({ where: { id: checklist.reservationId } });
        const isUserConfirmed = !!(reservation?.expectedArrivalTime);

        if (isUserConfirmed) {
          // User-confirmed reservation: keep queue at WAITING, don't put in water yet
          let queue = await this.prisma.operationalQueue.findUnique({ where: { reservationId: checklist.reservationId } });
          if (!queue) {
            const maxPos = await this.prisma.operationalQueue.aggregate({ _max: { position: true }, where: { status: { in: ['WAITING', 'IN_WATER', 'PREPARING', 'LAUNCHING'] } } });
            await this.prisma.operationalQueue.create({
              data: {
                boatId: checklist.boatId,
                reservationId: checklist.reservationId,
                clientId: reservation?.userId ?? userId,
                position: (maxPos._max.position ?? 0) + 1,
                status: 'WAITING',
                scheduledAt: reservation?.endDate ?? new Date(),
              },
            });
          }
          // Don't change reservation to IN_USE — keep it CONFIRMED until launched
        } else {
          // Normal flow: put in water — but only if NOT already in queue
          // (if already queued at WAITING, operator will manually choose via "Ir para Água")
          const existingQueue = await this.prisma.operationalQueue.findUnique({ where: { reservationId: checklist.reservationId } });
          if (!existingQueue) {
            await this.prisma.reservation.update({
              where: { id: checklist.reservationId },
              data: { status: 'IN_USE' },
            });
            const maxPos = await this.prisma.operationalQueue.aggregate({ _max: { position: true }, where: { status: { in: ['WAITING', 'IN_WATER', 'PREPARING', 'LAUNCHING'] } } });
            await this.prisma.operationalQueue.create({
              data: {
                boatId: checklist.boatId,
                reservationId: checklist.reservationId,
                clientId: reservation?.userId ?? userId,
                position: (maxPos._max.position ?? 0) + 1,
                status: 'IN_WATER',
                scheduledAt: reservation?.endDate ?? new Date(),
                startedAt: new Date(),
              },
            });
          }
          // If queue already exists (item was already in Confirmados), keep it at WAITING
          // — operator must manually push to water via launchToWater
        }
      } else {
        // Ad-hoc checklist (no reservation) — also create queue entry
        const maxPos = await this.prisma.operationalQueue.aggregate({ _max: { position: true }, where: { status: { in: ['WAITING', 'IN_WATER', 'PREPARING', 'LAUNCHING'] } } });
        await this.prisma.operationalQueue.create({
          data: {
            boatId: checklist.boatId,
            clientId: userId,
            position: (maxPos._max.position ?? 0) + 1,
            status: 'IN_WATER',
            scheduledAt: new Date(),
            startedAt: new Date(),
          },
        });
      }
    }

    // Notify client that checklist is complete and boat is ready
    if (allChecked) {
      this.notifyChecklistReady(checklist).catch(() => {});
    }

    return { success: true, allChecked };
  }

  private async notifyChecklistReady(checklist: any) {
    if (!checklist.reservationId) return;
    const reservation = await this.prisma.reservation.findUnique({
      where: { id: checklist.reservationId },
      include: { boat: { select: { name: true } } },
    });
    if (!reservation) return;
    // Only notify the client whose reservation it is
    this.notificationsService.send({
      userId: reservation.userId,
      type: 'CHECKLIST_READY',
      title: '✅ Embarcação pronta!',
      body: `O checklist da ${reservation.boat?.name || 'embarcação'} foi concluído. Sua embarcação está disponível!`,
      data: { reservationId: reservation.id, boatId: reservation.boatId, url: '/boats' },
      pushTag: `checklist-ready-${checklist.id}`,
    }).catch(() => {});
  }

  async getMyActiveReservations(userId: string) {
    return this.prisma.reservation.findMany({
      where: {
        userId,
        status: { in: ['CONFIRMED', 'PENDING', 'IN_USE', 'COMPLETED'] },
        startDate: { gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) },
      },
      include: {
        boat: { select: { id: true, name: true, model: true } },
        checklist: {
          include: {
            items: { orderBy: { order: 'asc' } },
            operator: { select: { id: true, name: true } },
          },
        },
      },
      orderBy: { startDate: 'desc' },
    });
  }

  async getChecklistById(id: string) {
    return this.prisma.checklist.findUnique({
      where: { id },
      include: {
        items: { orderBy: { order: 'asc' } },
        boat: { select: { id: true, name: true, model: true } },
        operator: { select: { id: true, name: true } },
        reservation: { select: { id: true, startDate: true, endDate: true, status: true } },
      },
    });
  }

  // ─── Lift boats (admin) ───────────────────────────────────────────────────

  async liftBoat(queueId: string, returnData?: {
    returnFuelPhotoUrl?: string;
    returnSketchMarks?: string;
    returnObservations?: string;
    returnDamageVideoUrl?: string;
    checklistItems?: { id: string; label: string; checked: boolean }[];
  }) {
    const queue = await this.prisma.operationalQueue.findUnique({
      where: { id: queueId },
      include: { reservation: { include: { checklist: true } } },
    });
    if (!queue) throw new NotFoundException('Fila não encontrada');

    // Save return inspection data on the checklist
    if (returnData) {
      let checklist = queue.reservation?.checklist
        || await this.prisma.checklist.findFirst({
          where: { boatId: queue.boatId, status: 'APPROVED' },
          orderBy: { createdAt: 'desc' },
        });
      // If no checklist exists, create a minimal one to hold the return data
      if (!checklist) {
        checklist = await this.prisma.checklist.create({
          data: {
            boatId: queue.boatId,
            operatorId: queue.operatorId || queue.clientId,
            type: 'PRE_LAUNCH',
            status: 'APPROVED',
            completedAt: new Date(),
            ...(queue.reservationId ? { reservationId: queue.reservationId } : {}),
          },
        });
      }
      await this.prisma.checklist.update({
        where: { id: checklist.id },
        data: {
          returnFuelPhotoUrl: returnData.returnFuelPhotoUrl,
          returnSketchMarks: returnData.returnSketchMarks,
          returnObservations: returnData.returnObservations,
          returnDamageVideoUrl: returnData.returnDamageVideoUrl,
          returnCompletedAt: new Date(),
        },
      });
    }

    await this.prisma.operationalQueue.update({
      where: { id: queueId },
      data: { status: 'COMPLETED', completedAt: new Date() },
    });

    if (queue.reservationId) {
      await this.prisma.reservation.update({
        where: { id: queue.reservationId },
        data: { status: 'COMPLETED' },
      });
    }

    return { success: true };
  }

  /** Return merged marks from the last return inspection (priority) or last checklist for a boat. */
  async getLastMarksForBoat(boatId: string): Promise<{ id: number; pos: [number, number, number] }[]> {
    // 1. Try last return inspection with returnSketchMarks
    const withReturn = await this.prisma.checklist.findFirst({
      where: { boatId, returnSketchMarks: { not: null } },
      orderBy: { returnCompletedAt: 'desc' },
      select: { hullSketchMarks: true, returnSketchMarks: true },
    });
    if (withReturn) {
      const launch = this.parseMarks(withReturn.hullSketchMarks);
      const ret = this.parseMarks(withReturn.returnSketchMarks);
      // Merge and re-index
      return [...launch, ...ret].map((m, i) => ({ id: i + 1, pos: m.pos }));
    }
    // 2. Fallback: last completed checklist with hullSketchMarks
    const withLaunch = await this.prisma.checklist.findFirst({
      where: { boatId, hullSketchMarks: { not: null } },
      orderBy: { createdAt: 'desc' },
      select: { hullSketchMarks: true },
    });
    if (withLaunch) {
      return this.parseMarks(withLaunch.hullSketchMarks);
    }
    return [];
  }

  private parseMarks(json: string | null): { id: number; pos: [number, number, number] }[] {
    if (!json) return [];
    try {
      const arr = JSON.parse(json);
      return Array.isArray(arr) ? arr.filter((m: any) => m && Array.isArray(m.pos) && m.pos.length === 3) : [];
    } catch { return []; }
  }

  async getLastReturnInspection(boatId: string) {
    // 1. Try to find a checklist with return inspection data
    let checklist = await this.prisma.checklist.findFirst({
      where: { boatId, returnFuelPhotoUrl: { not: null } },
      orderBy: { returnCompletedAt: 'desc' },
      include: {
        reservation: { include: { user: { select: { id: true, name: true, email: true } } } },
      },
    });
    // 2. Fallback: latest APPROVED checklist (has launch fuelPhotoUrl)
    if (!checklist) {
      checklist = await this.prisma.checklist.findFirst({
        where: { boatId, status: 'APPROVED' },
        orderBy: { createdAt: 'desc' },
        include: {
          reservation: { include: { user: { select: { id: true, name: true, email: true } } } },
        },
      });
    }
    if (!checklist) return null;

    // Find cotista: from reservation, or from the latest queue entry for this boat
    let cotistaUserId = checklist.reservation?.userId || null;
    let cotistaName = checklist.reservation?.user?.name || null;
    if (!cotistaUserId) {
      const queue = await this.prisma.operationalQueue.findFirst({
        where: { boatId },
        orderBy: { createdAt: 'desc' },
        include: { client: { select: { id: true, name: true } } },
      });
      if (queue) {
        cotistaUserId = queue.clientId;
        cotistaName = queue.client?.name || null;
      }
    }

    const shares = await this.prisma.share.findMany({
      where: { boatId, isActive: true },
      include: { user: { select: { id: true, name: true, email: true } } },
    });
    return {
      checklistId: checklist.id,
      boatId,
      fuelPhotoUrl: checklist.fuelPhotoUrl || null,
      returnFuelPhotoUrl: checklist.returnFuelPhotoUrl || null,
      returnSketchMarks: checklist.returnSketchMarks || null,
      returnObservations: checklist.returnObservations || null,
      returnCompletedAt: checklist.returnCompletedAt || null,
      cotistaUserId,
      cotistaName,
      shares: shares.map(s => ({ userId: s.userId, userName: s.user.name, shareNumber: s.shareNumber })),
    };
  }

  async liftAllBoats() {
    const inWater = await this.prisma.operationalQueue.findMany({
      where: { status: 'IN_WATER' },
    });

    await Promise.all(inWater.map((q) => this.liftBoat(q.id)));
    return { count: inWater.length };
  }

  async launchToWater(queueId: string) {
    const queue = await this.prisma.operationalQueue.findUnique({
      where: { id: queueId },
      include: { reservation: true },
    });
    if (!queue) throw new NotFoundException('Fila não encontrada');
    if (queue.status !== 'WAITING') throw new BadRequestException('Item não está no status Aguardando');

    await this.prisma.operationalQueue.update({
      where: { id: queueId },
      data: { status: 'IN_WATER', startedAt: new Date() },
    });

    if (queue.reservationId) {
      await this.prisma.reservation.update({
        where: { id: queue.reservationId },
        data: { status: 'IN_USE' },
      });
    }

    return { success: true };
  }

  // ─── Usages (admin + client) ──────────────────────────────────────────────

  async getUsages(filters: { boatId?: string; userId?: string; status?: string; from?: string; to?: string } = {}) {
    const where: Record<string, unknown> = {};
    if (filters.boatId) where.boatId = filters.boatId;
    if (filters.userId) where.userId = filters.userId;
    if (filters.status) where.status = filters.status;
    else where.status = { in: ['IN_USE', 'COMPLETED'] };

    if (filters.from || filters.to) {
      where.startDate = {};
      if (filters.from) (where.startDate as Record<string, unknown>).gte = new Date(filters.from);
      if (filters.to) (where.startDate as Record<string, unknown>).lte = new Date(filters.to);
    }

    const reservations = await this.prisma.reservation.findMany({
      where,
      include: {
        boat: { select: { id: true, name: true, model: true } },
        user: { select: { id: true, name: true, email: true, phone: true } },
        checklist: {
          include: { items: { orderBy: { order: 'asc' } } },
        },
        queue: true,
      },
      orderBy: { startDate: 'desc' },
      take: 100,
    });

    // Get fuel logs for each reservation (by boat + date range)
    const result = await Promise.all(
      reservations.map(async (r) => {
        const fuelLogs = await this.prisma.fuelLog.findMany({
          where: {
            boatId: r.boatId,
            loggedAt: { gte: r.startDate, lte: r.endDate },
          },
          orderBy: { loggedAt: 'asc' },
        });
        const totalFuel = fuelLogs.reduce((s, l) => s + l.liters, 0);
        const fuelCost = fuelLogs.reduce((s, l) => s + l.totalCost, 0);
        return { ...r, fuelLogs, totalFuel, fuelCost };
      }),
    );

    return result;
  }

  async getMyUsages(userId: string) {
    return this.getUsages({ userId, status: undefined });
  }

  // ─── Original methods (keep for backward compat) ──────────────────────────

  async createChecklist(operatorId: string, dto: CreateChecklistDto) {
    return this.prisma.checklist.create({
      data: {
        boatId: dto.boatId,
        operatorId,
        type: dto.type,
        items: {
          create: dto.items.map((item, index) => ({
            label: item.label,
            order: index + 1,
          })),
        },
      },
      include: { items: { orderBy: { order: 'asc' } } },
    });
  }

  async updateChecklistItem(itemId: string, checked: boolean, notes?: string, photoUrl?: string) {
    return this.prisma.checklistItem.update({
      where: { id: itemId },
      data: { checked, notes, photoUrl },
    });
  }

  async completeChecklist(checklistId: string) {
    const checklist = await this.prisma.checklist.findUnique({
      where: { id: checklistId },
      include: { items: true },
    });

    if (!checklist) throw new NotFoundException('Checklist não encontrado');

    const allChecked = checklist.items.every((item) => item.checked);

    return this.prisma.checklist.update({
      where: { id: checklistId },
      data: {
        status: allChecked ? 'APPROVED' : 'REJECTED',
        completedAt: new Date(),
      },
      include: { items: { orderBy: { order: 'asc' } } },
    });
  }

  async getTodayReservationsAll(date?: string) {
    const day = date ? new Date(date + 'T00:00:00') : new Date();
    day.setHours(0, 0, 0, 0);
    const nextDay = new Date(day);
    nextDay.setDate(nextDay.getDate() + 1);
    return this.prisma.reservation.findMany({
      where: {
        status: { in: ['CONFIRMED', 'PENDING', 'IN_USE'] },
        startDate: { gte: day, lt: nextDay },
      },
      include: {
        boat: { select: { id: true, name: true, model: true } },
        user: { select: { id: true, name: true, phone: true } },
        checklist: { select: { id: true, status: true } },
        queue: { select: { id: true, status: true } },
      },
      orderBy: { startDate: 'asc' },
    });
  }

  async getConfirmedReservations(date?: string) {
    const day = date ? new Date(date + 'T00:00:00') : new Date();
    day.setHours(0, 0, 0, 0);
    const nextDay = new Date(day);
    nextDay.setDate(nextDay.getDate() + 1);
    return this.prisma.reservation.findMany({
      where: {
        confirmedAt: { not: null },
        status: { in: ['CONFIRMED', 'PENDING', 'IN_USE'] },
        startDate: { gte: day, lt: nextDay },
      },
      include: {
        boat: { select: { id: true, name: true, model: true } },
        user: { select: { id: true, name: true, phone: true } },
        checklist: { select: { id: true, status: true } },
        queue: { select: { id: true, status: true } },
      },
      orderBy: { startDate: 'asc' },
    });
  }

  async startAdHocChecklist(operatorId: string, boatId: string, reservationId?: string) {
    const boat = await this.prisma.boat.findUnique({ where: { id: boatId } });
    if (!boat) throw new NotFoundException('Embarcação não encontrada');

    // Block if boat is already IN_WATER
    const alreadyInWater = await this.prisma.operationalQueue.findFirst({
      where: { boatId, status: 'IN_WATER' },
    });
    if (alreadyInWater) throw new BadRequestException('Esta embarcação já está na água');

    if (reservationId) {
      const existing = await this.prisma.checklist.findUnique({
        where: { reservationId },
        include: { items: { orderBy: { order: 'asc' } } },
      });
      if (existing) return existing;
    }

    return this.prisma.checklist.create({
      data: {
        boatId,
        operatorId,
        reservationId: reservationId ?? null,
        type: 'PRE_LAUNCH',
        items: { create: PRE_LAUNCH_ITEMS.map((label, i) => ({ label, order: i + 1 })) },
      },
      include: {
        items: { orderBy: { order: 'asc' } },
        boat: { select: { id: true, name: true, model: true } },
      },
    });
  }

  async findAllChecklists(filters: { status?: string; boatId?: string; date?: string } = {}) {
    const where: Record<string, unknown> = {};
    if (filters.status) where.status = filters.status;
    if (filters.boatId) where.boatId = filters.boatId;
    if (filters.date) {
      const dayStart = new Date(filters.date + 'T00:00:00-03:00');
      const dayEnd = new Date(filters.date + 'T23:59:59.999-03:00');
      where.createdAt = { gte: dayStart, lte: dayEnd };
    }

    const rows = await this.prisma.checklist.findMany({
      where,
      take: 100,
      select: {
        id: true, boatId: true, operatorId: true, reservationId: true,
        status: true, type: true, completedAt: true, createdAt: true,
        additionalObservations: true, lifeVestsLoaned: true,
        hullSketchMarks: true, returnSketchMarks: true,
        returnObservations: true, returnCompletedAt: true,
        // Booleans for media — avoid sending large base64 blobs
        videoUrl: true, fuelPhotoUrl: true, hullSketchUrl: true, returnFuelPhotoUrl: true,
        boat: { select: { id: true, name: true } },
        operator: { select: { id: true, name: true } },
        reservation: { select: { id: true, startDate: true, endDate: true, status: true } },
        items: { orderBy: { order: 'asc' } },
      },
      orderBy: { createdAt: 'desc' },
    });
    // Replace blob fields with boolean flags to keep payload small
    return rows.map(r => ({
      ...r,
      hasVideo: !!r.videoUrl,
      hasFuelPhoto: !!r.fuelPhotoUrl,
      hasSketchUrl: !!r.hullSketchUrl,
      hasReturnFuelPhoto: !!r.returnFuelPhotoUrl,
      videoUrl: undefined,
      fuelPhotoUrl: undefined,
      hullSketchUrl: undefined,
      returnFuelPhotoUrl: undefined,
    }));
  }

  async getChecklistsByBoat(boatId: string, limit = 10) {
    return this.prisma.checklist.findMany({
      where: { boatId },
      take: limit,
      include: {
        items: { orderBy: { order: 'asc' } },
        operator: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getQueue(filters: { status?: string; date?: string } = {}) {
    const where: Record<string, unknown> = {};
    if (filters.status) where.status = filters.status;
    if (filters.date) {
      const dayStart = new Date(filters.date + 'T00:00:00-03:00');
      const dayEnd = new Date(filters.date + 'T23:59:59.999-03:00');
      where.scheduledAt = { gte: dayStart, lte: dayEnd };
    }

    return this.prisma.operationalQueue.findMany({
      where: Object.keys(where).length ? where : undefined,
      include: {
        boat: { select: { id: true, name: true, model: true } },
        client: { select: { id: true, name: true, phone: true } },
        reservation: {
          select: {
            id: true, startDate: true, endDate: true, status: true,
            confirmedAt: true, expectedArrivalTime: true,
            user: { select: { id: true, name: true } },
            checklist: {
              select: {
                id: true, status: true, lifeVestsLoaned: true,
                hullSketchMarks: true,
                additionalObservations: true,
                returnSketchMarks: true,
                returnObservations: true, returnCompletedAt: true,
                returnDamageVideoUrl: true,
                items: { orderBy: { order: 'asc' } },
              },
            },
          },
        },
        operator: { select: { id: true, name: true } },
      },
      orderBy: [{ status: 'asc' }, { scheduledAt: 'asc' }],
    });
  }

  async getChecklistTemplateItems(type: string) {
    const templates: Record<string, string[]> = {
      'PRE_LAUNCH': PRE_LAUNCH_ITEMS,
      'POST_USE': [
        'Embarcação lavada',
        'Combustível registrado',
        'Horímetro anotado',
        'Avarias reportadas',
        'Equipamentos guardados',
        'Amarração feita corretamente',
      ],
      'WEEKLY': [
        'Inspeção visual do casco',
        'Nível de fluidos',
        'Estado das baterias',
        'Teste de motor',
        'Limpeza geral',
        'Verificação de bombas de porão',
      ],
    };

    return templates[type] || templates['PRE_LAUNCH'];
  }

  async deleteChecklist(id: string) {
    // Delete items first, then the checklist
    await this.prisma.checklistItem.deleteMany({ where: { checklistId: id } });
    return this.prisma.checklist.delete({ where: { id } });
  }

  // ─── Damages report ────────────────────────────────────────────────────────────

  async getDamagesReport(filters: { boatId?: string; from?: string; to?: string } = {}) {
    const where: Record<string, unknown> = {
      returnSketchMarks: { not: null },
    };
    if (filters.boatId) where.boatId = filters.boatId;
    if (filters.from || filters.to) {
      const dateFilter: Record<string, Date> = {};
      if (filters.from) dateFilter.gte = new Date(filters.from + 'T00:00:00-03:00');
      if (filters.to) dateFilter.lte = new Date(filters.to + 'T23:59:59.999-03:00');
      where.returnCompletedAt = dateFilter;
    }

    const checklists = await this.prisma.checklist.findMany({
      where,
      include: {
        boat: { select: { id: true, name: true, model: true } },
        operator: { select: { id: true, name: true } },
        reservation: {
          select: {
            id: true,
            startDate: true,
            endDate: true,
            status: true,
            user: { select: { id: true, name: true, email: true, phone: true } },
          },
        },
        items: { orderBy: { order: 'asc' } },
      },
      orderBy: { returnCompletedAt: 'desc' },
      take: 200,
    });

    return checklists.map(cl => {
      const launchMarks = cl.hullSketchMarks ? JSON.parse(cl.hullSketchMarks) : [];
      const returnMarks = cl.returnSketchMarks ? JSON.parse(cl.returnSketchMarks) : [];
      const startTime = cl.completedAt || cl.createdAt;
      const endTime = cl.returnCompletedAt;
      const durationMinutes = endTime && startTime
        ? Math.round((endTime.getTime() - startTime.getTime()) / 60000)
        : null;

      return {
        id: cl.id,
        boat: cl.boat,
        client: cl.reservation?.user || cl.operator,
        operator: cl.operator,
        reservation: cl.reservation ? { id: cl.reservation.id, startDate: cl.reservation.startDate, endDate: cl.reservation.endDate } : null,
        launchDate: cl.completedAt || cl.createdAt,
        returnDate: cl.returnCompletedAt,
        durationMinutes,
        items: cl.items,
        launchObservations: cl.additionalObservations,
        returnObservations: cl.returnObservations,
        launchMarksCount: launchMarks.length,
        returnMarksCount: returnMarks.length,
        newDamagesCount: returnMarks.length,
        hullSketchMarks: cl.hullSketchMarks,
        returnSketchMarks: cl.returnSketchMarks,
        fuelPhotoUrl: cl.fuelPhotoUrl,
        returnFuelPhotoUrl: cl.returnFuelPhotoUrl,
        videoUrl: cl.videoUrl,
        returnDamageVideoUrl: cl.returnDamageVideoUrl,
        lifeVestsLoaned: cl.lifeVestsLoaned,
      };
    });
  }
}

