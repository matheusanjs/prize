import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../database/prisma.service';
import { WhatsAppConnectionService } from './whatsapp-connection.service';
import { OperationsService } from '../operations/operations.service';
import { FuelService } from '../fuel/fuel.service';
import { proto } from '@whiskeysockets/baileys';
import * as fs from 'fs';
import * as path from 'path';

// ─── Group aliases (matched against group name or JID) ──────────────────
const CHECKLIST_GROUP_KEYWORDS = ['check list', 'checklist'];
const INSPECTION_GROUP_KEYWORDS = ['inspeção', 'inspecao', 'inspeccao'];

const UPLOADS_DIR = path.join(process.cwd(), 'uploads', 'whatsapp');

// ─── Flow step definitions ──────────────────────────────────────────────
interface FlowState {
  flow: string;       // e.g. 'CHECKLIST_SCHEDULED', 'CHECKLIST_MANUAL', 'FUEL', 'INSPECTION'
  step: string;       // current step name
  groupJid: string;
  operatorId: string;
  data: Record<string, any>;
  createdAt: Date;
}

@Injectable()
export class WhatsAppGroupService {
  private readonly logger = new Logger(WhatsAppGroupService.name);

  /** Active flows: participantPhone → FlowState */
  private activeFlows = new Map<string, FlowState>();

  /** Group JID → type mapping (cached after first detection) */
  private groupTypes = new Map<string, 'CHECKLIST' | 'INSPECTION'>();

  constructor(
    private prisma: PrismaService,
    private connection: WhatsAppConnectionService,
    private operations: OperationsService,
    private fuel: FuelService,
    private config: ConfigService,
  ) {
    // Ensure uploads directory exists
    if (!fs.existsSync(UPLOADS_DIR)) {
      fs.mkdirSync(UPLOADS_DIR, { recursive: true });
    }
  }

  // ════════════════════════════════════════════════════════════════════════
  // MAIN ENTRY — called by incoming service for all @g.us messages
  // ════════════════════════════════════════════════════════════════════════

  async handleGroupMessage(msg: proto.IWebMessageInfo, groupJid: string) {
    // Extract sender info
    const participant = (msg.key as any).participant || '';
    let senderPhone = '';
    if (participant.endsWith('@s.whatsapp.net')) {
      senderPhone = participant.replace('@s.whatsapp.net', '');
    } else if (participant.endsWith('@lid')) {
      const resolved = await this.connection.resolvePhoneFromLid(participant);
      if (resolved) senderPhone = resolved;
    }
    
    // For fromMe messages (bot owner in group), use the connected phone
    if (!senderPhone && msg.key?.fromMe) {
      const status = this.connection.getStatus();
      if (status?.phone) {
        senderPhone = status.phone;
      }
    }
    
    if (!senderPhone) {
      this.logger.warn(`Could not resolve sender phone for group message in ${groupJid}, participant: ${participant}`);
      return;
    }

    this.logger.debug(`Group handler: sender=${senderPhone}, groupJid=${groupJid}`);

    // Detect group type
    const groupType = await this.detectGroupType(groupJid, msg);
    this.logger.debug(`Group type detected: ${groupType || 'NONE'} for ${groupJid}`);
    if (!groupType) return; // Not a recognized group

    // Find user by phone (any role allowed in group)
    const cleanPhone = senderPhone.startsWith('55') ? senderPhone.substring(2) : senderPhone;
    const dbUser = await this.prisma.user.findFirst({
      where: {
        OR: [
          { phone: cleanPhone },
          { phone: senderPhone },
          { phone: { endsWith: cleanPhone.slice(-8) } },
        ],
        isActive: true,
      },
      select: { id: true, name: true, role: true },
    });

    const user: { id: string; name: string; role: string } = dbUser
      ? { id: dbUser.id, name: dbUser.name, role: dbUser.role }
      : { id: 'unknown', name: msg.pushName || senderPhone, role: 'CLIENT' };

    // Extract text content
    const text = (
      msg.message?.conversation ||
      msg.message?.extendedTextMessage?.text ||
      msg.message?.imageMessage?.caption ||
      msg.message?.videoMessage?.caption ||
      ''
    ).trim();

    // Check if user has an active flow
    const existingFlow = this.activeFlows.get(senderPhone);
    if (existingFlow && existingFlow.groupJid === groupJid) {
      // Check expiry (30 min)
      if (Date.now() - existingFlow.createdAt.getTime() > 30 * 60 * 1000) {
        this.activeFlows.delete(senderPhone);
      } else {
        await this.handleFlowStep(senderPhone, user, msg, text, groupJid, groupType);
        return;
      }
    }

    // Handle menu commands
    const lower = text.toLowerCase().trim();
    if (lower === '0' || lower === 'menu' || lower === 'ajuda') {
      if (groupType === 'CHECKLIST') {
        await this.sendChecklistMenu(groupJid, user.name);
      } else {
        await this.sendInspectionMenu(groupJid, user.name);
      }
      return;
    }

    if (lower === 'cancelar' || lower === 'sair') {
      if (this.activeFlows.has(senderPhone)) {
        this.activeFlows.delete(senderPhone);
        await this.sendGroup(groupJid, '❌ Fluxo cancelado.');
      }
      return;
    }

    if (groupType === 'CHECKLIST') {
      await this.handleChecklistCommand(senderPhone, user, text, groupJid);
    } else {
      await this.handleInspectionCommand(senderPhone, user, text, groupJid);
    }
  }

  // ════════════════════════════════════════════════════════════════════════
  // GROUP TYPE DETECTION
  // ════════════════════════════════════════════════════════════════════════

  private async detectGroupType(groupJid: string, msg: proto.IWebMessageInfo): Promise<'CHECKLIST' | 'INSPECTION' | null> {
    if (this.groupTypes.has(groupJid)) return this.groupTypes.get(groupJid)!;

    // Try to get group name from socket metadata
    try {
      const sock = this.connection.getSocket();
      if (sock) {
        const metadata = await sock.groupMetadata(groupJid);
        const name = (metadata?.subject || '').toLowerCase();
        for (const kw of CHECKLIST_GROUP_KEYWORDS) {
          if (name.includes(kw)) {
            this.groupTypes.set(groupJid, 'CHECKLIST');
            this.logger.log(`Group ${groupJid} detected as CHECKLIST (name: ${metadata?.subject})`);
            return 'CHECKLIST';
          }
        }
        for (const kw of INSPECTION_GROUP_KEYWORDS) {
          if (name.includes(kw)) {
            this.groupTypes.set(groupJid, 'INSPECTION');
            this.logger.log(`Group ${groupJid} detected as INSPECTION (name: ${metadata?.subject})`);
            return 'INSPECTION';
          }
        }
      }
    } catch (err) {
      this.logger.warn(`Cannot get group metadata for ${groupJid}: ${err}`);
    }

    return null;
  }

  // ════════════════════════════════════════════════════════════════════════
  // MENUS
  // ════════════════════════════════════════════════════════════════════════

  private async sendChecklistMenu(groupJid: string, operatorName: string) {
    await this.sendGroup(groupJid,
      `📋 *Menu Check List — Prize*\n\n` +
      `Olá, *${operatorName.split(' ')[0]}*!\n\n` +
      `*1* — 📅 Novo checklist agendado (reservas do dia)\n` +
      `*2* — ✏️ Novo checklist manual\n` +
      `*3* — ⛽ Novo abastecimento\n` +
      `*4* — 📊 Informações de hoje\n\n` +
      `*0* — Menu | *cancelar* — Sair do fluxo`,
    );
  }

  private async sendInspectionMenu(groupJid: string, operatorName: string) {
    await this.sendGroup(groupJid,
      `🔍 *Menu Inspeção — Prize*\n\n` +
      `Olá, *${operatorName.split(' ')[0]}*!\n\n` +
      `*1* — 🔍 Nova inspeção (checklist completo)\n` +
      `*2* — ⛽ Cadastrar combustível\n\n` +
      `*0* — Menu | *cancelar* — Sair do fluxo`,
    );
  }

  // ════════════════════════════════════════════════════════════════════════
  // CHECKLIST GROUP — COMMAND ROUTER
  // ════════════════════════════════════════════════════════════════════════

  private async handleChecklistCommand(
    phone: string,
    user: { id: string; name: string; role: string },
    text: string,
    groupJid: string,
  ) {
    const num = text.trim();

    switch (num) {
      case '1':
        return this.startChecklistScheduled(phone, user, groupJid);
      case '2':
        return this.startChecklistManual(phone, user, groupJid);
      case '3':
        return this.startFuelFlow(phone, user, groupJid);
      case '4':
        return this.showTodayInfo(user, groupJid);
      default:
        await this.sendChecklistMenu(groupJid, user.name);
    }
  }

  // ════════════════════════════════════════════════════════════════════════
  // INSPECTION GROUP — COMMAND ROUTER
  // ════════════════════════════════════════════════════════════════════════

  private async handleInspectionCommand(
    phone: string,
    user: { id: string; name: string; role: string },
    text: string,
    groupJid: string,
  ) {
    const num = text.trim();

    switch (num) {
      case '1':
        return this.startInspectionFlow(phone, user, groupJid);
      case '2':
        return this.startFuelFlow(phone, user, groupJid);
      default:
        await this.sendInspectionMenu(groupJid, user.name);
    }
  }

  // ════════════════════════════════════════════════════════════════════════
  // FLOW 1: CHECKLIST AGENDADO (scheduled — today's reservations)
  // ════════════════════════════════════════════════════════════════════════

  private async startChecklistScheduled(
    phone: string,
    user: { id: string; name: string },
    groupJid: string,
  ) {
    const reservations = await this.operations.getTodayReservationsAll();

    if (reservations.length === 0) {
      await this.sendGroup(groupJid, '📅 Nenhuma reserva agendada para hoje.');
      return;
    }

    // Filter only those without completed checklist
    const pending = reservations.filter(
      (r) => !r.checklist || r.checklist.status === 'PENDING' || !r.checklist.status,
    );

    if (pending.length === 0) {
      await this.sendGroup(groupJid, '✅ Todos os checklists do dia já foram preenchidos!');
      return;
    }

    let msg = `📅 *Reservas do dia — Checklist pendente:*\n\n`;
    pending.forEach((r, i) => {
      const time = r.startDate.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' });
      const endTime = r.endDate.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' });
      msg += `*${i + 1}* — 🚤 ${(r as any).boat?.name} | ${time}-${endTime} | ${(r as any).user?.name?.split(' ')[0]}\n`;
    });
    msg += `\nDigite o *número* da reserva para iniciar o checklist.`;

    this.activeFlows.set(phone, {
      flow: 'CHECKLIST_SCHEDULED',
      step: 'SELECT_RESERVATION',
      groupJid,
      operatorId: user.id,
      data: { reservations: pending.map((r) => ({ id: r.id, boatId: (r as any).boat?.id, boatName: (r as any).boat?.name, userName: (r as any).user?.name, userId: (r as any).user?.id })) },
      createdAt: new Date(),
    });

    await this.sendGroup(groupJid, msg);
  }

  // ════════════════════════════════════════════════════════════════════════
  // FLOW 2: CHECKLIST MANUAL (select boat, cotista, full flow)
  // ════════════════════════════════════════════════════════════════════════

  private async startChecklistManual(
    phone: string,
    user: { id: string; name: string },
    groupJid: string,
  ) {
    const boats = await this.prisma.boat.findMany({
      where: { status: { not: 'BLOCKED' }, deletedAt: null },
      select: { id: true, name: true, model: true },
      orderBy: { name: 'asc' },
    });

    if (boats.length === 0) {
      await this.sendGroup(groupJid, '⚠️ Nenhuma embarcação disponível.');
      return;
    }

    let msg = `✏️ *Novo Checklist Manual*\n\nSelecione a embarcação:\n\n`;
    boats.forEach((b, i) => {
      msg += `*${i + 1}* — 🚤 ${b.name} (${b.model})\n`;
    });

    this.activeFlows.set(phone, {
      flow: 'CHECKLIST_MANUAL',
      step: 'SELECT_BOAT',
      groupJid,
      operatorId: user.id,
      data: { boats },
      createdAt: new Date(),
    });

    await this.sendGroup(groupJid, msg);
  }

  // ════════════════════════════════════════════════════════════════════════
  // FLOW 3: FUEL (abastecimento)
  // ════════════════════════════════════════════════════════════════════════

  private async startFuelFlow(
    phone: string,
    user: { id: string; name: string },
    groupJid: string,
  ) {
    const boats = await this.prisma.boat.findMany({
      where: { status: { not: 'BLOCKED' }, deletedAt: null },
      select: { id: true, name: true, model: true, fuelType: true, currentFuel: true, fuelCapacity: true },
      orderBy: { name: 'asc' },
    });

    if (boats.length === 0) {
      await this.sendGroup(groupJid, '⚠️ Nenhuma embarcação disponível.');
      return;
    }

    let msg = `⛽ *Novo Abastecimento*\n\nSelecione a embarcação:\n\n`;
    boats.forEach((b, i) => {
      const pct = b.fuelCapacity > 0 ? Math.round((b.currentFuel / b.fuelCapacity) * 100) : 0;
      msg += `*${i + 1}* — 🚤 ${b.name} | ⛽ ${b.currentFuel.toFixed(0)}/${b.fuelCapacity}L (${pct}%)\n`;
    });

    this.activeFlows.set(phone, {
      flow: 'FUEL',
      step: 'SELECT_BOAT',
      groupJid,
      operatorId: user.id,
      data: { boats },
      createdAt: new Date(),
    });

    await this.sendGroup(groupJid, msg);
  }

  // ════════════════════════════════════════════════════════════════════════
  // FLOW 4: TODAY INFO
  // ════════════════════════════════════════════════════════════════════════

  private async showTodayInfo(user: { id: string; name: string }, groupJid: string) {
    const reservations = await this.operations.getTodayReservationsAll();
    const queue = await this.prisma.operationalQueue.findMany({
      where: {
        scheduledAt: {
          gte: new Date(new Date().setHours(0, 0, 0, 0)),
          lt: new Date(new Date().setHours(24, 0, 0, 0)),
        },
        status: { in: ['WAITING', 'PREPARING', 'LAUNCHING', 'IN_WATER'] },
      },
      include: {
        boat: { select: { name: true } },
        client: { select: { name: true } },
      },
    });

    const total = reservations.length;
    const inWater = queue.filter((q) => q.status === 'IN_WATER').length;
    const waiting = queue.filter((q) => q.status === 'WAITING').length;
    const withChecklist = reservations.filter((r) => r.checklist?.status === 'APPROVED').length;
    const pending = total - withChecklist;

    let msg = `📊 *Informações de Hoje*\n\n`;
    msg += `🚤 *Total agendados:* ${total}\n`;
    msg += `🌊 *Na água:* ${inWater}\n`;
    msg += `⏳ *Aguardando:* ${waiting}\n`;
    msg += `📋 *Checklist feito:* ${withChecklist}\n`;
    msg += `📝 *Checklist pendente:* ${pending}\n`;

    if (queue.length > 0) {
      msg += `\n*Fila de hoje:*\n`;
      for (const q of queue) {
        const icon = q.status === 'IN_WATER' ? '🌊' : '⏳';
        msg += `${icon} ${q.boat?.name} — ${q.client?.name?.split(' ')[0]} — ${q.status}\n`;
      }
    }

    if (reservations.length > 0) {
      msg += `\n*Reservas:*\n`;
      for (const r of reservations) {
        const time = r.startDate.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' });
        const checkIcon = r.checklist?.status === 'APPROVED' ? '✅' : '📝';
        const queueIcon = (r as any).queue?.status === 'IN_WATER' ? '🌊' : '';
        msg += `${checkIcon} ${(r as any).boat?.name} | ${time} | ${(r as any).user?.name?.split(' ')[0]} ${queueIcon}\n`;
      }
    }

    await this.sendGroup(groupJid, msg);
  }

  // ════════════════════════════════════════════════════════════════════════
  // FLOW: INSPECTION (same as checklist but from inspection group)
  // ════════════════════════════════════════════════════════════════════════

  private async startInspectionFlow(
    phone: string,
    user: { id: string; name: string },
    groupJid: string,
  ) {
    // Same as checklist scheduled — list today's reservations
    const reservations = await this.operations.getTodayReservationsAll();
    const boats = await this.prisma.boat.findMany({
      where: { status: { not: 'BLOCKED' }, deletedAt: null },
      select: { id: true, name: true, model: true },
      orderBy: { name: 'asc' },
    });

    let msg = `🔍 *Nova Inspeção*\n\n`;

    // Show today's reservations first
    if (reservations.length > 0) {
      const pending = reservations.filter(
        (r) => !r.checklist || r.checklist.status !== 'APPROVED',
      );
      if (pending.length > 0) {
        msg += `*Reservas do dia (checklist pendente):*\n`;
        pending.forEach((r, i) => {
          const time = r.startDate.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' });
          msg += `*${i + 1}* — 🚤 ${(r as any).boat?.name} | ${time} | ${(r as any).user?.name?.split(' ')[0]}\n`;
        });
        msg += `\nOu selecione embarcação manualmente:\n`;
        boats.forEach((b, i) => {
          msg += `*${pending.length + i + 1}* — 🚤 ${b.name}\n`;
        });
      } else {
        msg += `Todos os agendados já foram inspecionados.\nSelecione embarcação:\n\n`;
        boats.forEach((b, i) => {
          msg += `*${i + 1}* — 🚤 ${b.name}\n`;
        });
      }
    } else {
      msg += `Nenhuma reserva hoje. Selecione embarcação:\n\n`;
      boats.forEach((b, i) => {
        msg += `*${i + 1}* — 🚤 ${b.name}\n`;
      });
    }

    const pendingRes = reservations.filter(
      (r) => !r.checklist || r.checklist.status !== 'APPROVED',
    );

    this.activeFlows.set(phone, {
      flow: 'INSPECTION',
      step: 'SELECT_TARGET',
      groupJid,
      operatorId: user.id,
      data: {
        reservations: pendingRes.map((r) => ({
          id: r.id,
          boatId: (r as any).boat?.id,
          boatName: (r as any).boat?.name,
          userName: (r as any).user?.name,
          userId: (r as any).user?.id,
        })),
        boats,
        reservationCount: pendingRes.length,
      },
      createdAt: new Date(),
    });

    await this.sendGroup(groupJid, msg);
  }

  // ════════════════════════════════════════════════════════════════════════
  // FLOW STEP HANDLER (state machine)
  // ════════════════════════════════════════════════════════════════════════

  private async handleFlowStep(
    phone: string,
    user: { id: string; name: string; role: string },
    msg: proto.IWebMessageInfo,
    text: string,
    groupJid: string,
    groupType: 'CHECKLIST' | 'INSPECTION',
  ) {
    const flow = this.activeFlows.get(phone)!;
    const lower = text.toLowerCase().trim();

    if (lower === 'cancelar' || lower === 'sair') {
      this.activeFlows.delete(phone);
      await this.sendGroup(groupJid, '❌ Fluxo cancelado.');
      return;
    }

    switch (flow.flow) {
      case 'CHECKLIST_SCHEDULED':
        return this.stepChecklistScheduled(phone, user, msg, text, flow);
      case 'CHECKLIST_MANUAL':
        return this.stepChecklistManual(phone, user, msg, text, flow);
      case 'FUEL':
        return this.stepFuel(phone, user, msg, text, flow);
      case 'INSPECTION':
        return this.stepInspection(phone, user, msg, text, flow);
      default:
        this.activeFlows.delete(phone);
    }
  }

  // ════════════════════════════════════════════════════════════════════════
  // CHECKLIST SCHEDULED STEPS
  // ════════════════════════════════════════════════════════════════════════

  private async stepChecklistScheduled(
    phone: string,
    user: { id: string; name: string },
    msg: proto.IWebMessageInfo,
    text: string,
    flow: FlowState,
  ) {
    switch (flow.step) {
      case 'SELECT_RESERVATION': {
        const idx = parseInt(text) - 1;
        if (isNaN(idx) || idx < 0 || idx >= flow.data.reservations.length) {
          await this.sendGroup(flow.groupJid, '⚠️ Número inválido. Tente novamente.');
          return;
        }
        const res = flow.data.reservations[idx];

        const checklist = await this.operations.startPreLaunchChecklist(user.id, res.id);
        flow.data.checklist = checklist;
        flow.data.reservationId = res.id;
        flow.data.boatId = res.boatId;
        flow.data.boatName = res.boatName;
        flow.data.userId = res.userId;
        flow.data.userName = res.userName;

        await this.showChecklistSummary(flow);
        break;
      }

      case 'REVIEW_SUMMARY':
        return this.handleReviewSummary(phone, msg, text, flow);

      case 'VIDEO_FAST':
        return this.handleVideoFast(phone, msg, text, flow);
    }
  }

  // ════════════════════════════════════════════════════════════════════════
  // CHECKLIST MANUAL STEPS
  // ════════════════════════════════════════════════════════════════════════

  private async stepChecklistManual(
    phone: string,
    user: { id: string; name: string },
    msg: proto.IWebMessageInfo,
    text: string,
    flow: FlowState,
  ) {
    switch (flow.step) {
      case 'SELECT_BOAT': {
        const idx = parseInt(text) - 1;
        if (isNaN(idx) || idx < 0 || idx >= flow.data.boats.length) {
          await this.sendGroup(flow.groupJid, '⚠️ Número inválido. Tente novamente.');
          return;
        }
        const boat = flow.data.boats[idx];
        flow.data.boatId = boat.id;
        flow.data.boatName = boat.name;

        const shares = await this.prisma.share.findMany({
          where: { boatId: boat.id, isActive: true },
          include: { user: { select: { id: true, name: true } } },
        });

        if (shares.length === 0) {
          await this.sendGroup(flow.groupJid, '⚠️ Nenhum cotista ativo nesta embarcação.');
          this.activeFlows.delete(phone);
          return;
        }

        flow.data.shares = shares.map((s) => ({ userId: s.userId, userName: s.user.name }));
        let msg2 = `🚤 *${boat.name}* selecionado.\n\nSelecione o cotista:\n\n`;
        shares.forEach((s, i) => {
          msg2 += `*${i + 1}* — ${s.user.name}\n`;
        });
        flow.step = 'SELECT_COTISTA_MANUAL';
        await this.sendGroup(flow.groupJid, msg2);
        break;
      }

      case 'SELECT_COTISTA_MANUAL': {
        const idx = parseInt(text) - 1;
        if (isNaN(idx) || idx < 0 || idx >= flow.data.shares.length) {
          await this.sendGroup(flow.groupJid, '⚠️ Número inválido.');
          return;
        }
        const cotista = flow.data.shares[idx];
        flow.data.userId = cotista.userId;
        flow.data.userName = cotista.userName;

        const checklist = await this.operations.startAdHocChecklist(user.id, flow.data.boatId);
        flow.data.checklist = checklist;

        await this.showChecklistSummary(flow);
        break;
      }

      case 'REVIEW_SUMMARY':
        return this.handleReviewSummary(phone, msg, text, flow);

      case 'VIDEO_FAST':
        return this.handleVideoFast(phone, msg, text, flow);
    }
  }

  // ════════════════════════════════════════════════════════════════════════
  // INSPECTION FLOW STEPS
  // ════════════════════════════════════════════════════════════════════════

  private async stepInspection(
    phone: string,
    user: { id: string; name: string },
    msg: proto.IWebMessageInfo,
    text: string,
    flow: FlowState,
  ) {
    switch (flow.step) {
      case 'SELECT_TARGET': {
        const idx = parseInt(text) - 1;
        if (isNaN(idx)) {
          await this.sendGroup(flow.groupJid, '⚠️ Número inválido.');
          return;
        }
        const resCount = flow.data.reservationCount || 0;

        if (idx < resCount) {
          const res = flow.data.reservations[idx];
          const checklist = await this.operations.startPreLaunchChecklist(user.id, res.id);
          flow.data.checklist = checklist;
          flow.data.reservationId = res.id;
          flow.data.boatId = res.boatId;
          flow.data.boatName = res.boatName;
          flow.data.userId = res.userId;
          flow.data.userName = res.userName;

          await this.showChecklistSummary(flow);
        } else {
          const boatIdx = idx - resCount;
          if (boatIdx >= flow.data.boats.length) {
            await this.sendGroup(flow.groupJid, '⚠️ Número inválido.');
            return;
          }
          const boat = flow.data.boats[boatIdx];
          flow.data.boatId = boat.id;
          flow.data.boatName = boat.name;

          const shares = await this.prisma.share.findMany({
            where: { boatId: boat.id, isActive: true },
            include: { user: { select: { id: true, name: true } } },
          });
          if (shares.length === 0) {
            await this.sendGroup(flow.groupJid, '⚠️ Nenhum cotista ativo.');
            this.activeFlows.delete(phone);
            return;
          }
          flow.data.shares = shares.map((s) => ({ userId: s.userId, userName: s.user.name }));
          let smsg = `🚤 *${boat.name}*\n\nSelecione o cotista:\n\n`;
          shares.forEach((s, i) => { smsg += `*${i + 1}* — ${s.user.name}\n`; });
          flow.step = 'SELECT_COTISTA_MANUAL';
          await this.sendGroup(flow.groupJid, smsg);
        }
        break;
      }

      case 'SELECT_COTISTA_MANUAL': {
        const idx = parseInt(text) - 1;
        if (isNaN(idx) || idx < 0 || idx >= flow.data.shares.length) {
          await this.sendGroup(flow.groupJid, '⚠️ Número inválido.');
          return;
        }
        const cotista = flow.data.shares[idx];
        flow.data.userId = cotista.userId;
        flow.data.userName = cotista.userName;

        const checklist = await this.operations.startAdHocChecklist(user.id, flow.data.boatId);
        flow.data.checklist = checklist;

        await this.showChecklistSummary(flow);
        break;
      }

      case 'REVIEW_SUMMARY':
        return this.handleReviewSummary(phone, msg, text, flow);

      case 'VIDEO_FAST':
        return this.handleVideoFast(phone, msg, text, flow);
    }
  }

  // ════════════════════════════════════════════════════════════════════════
  // FUEL FLOW STEPS
  // ════════════════════════════════════════════════════════════════════════

  private async stepFuel(
    phone: string,
    user: { id: string; name: string },
    msg: proto.IWebMessageInfo,
    text: string,
    flow: FlowState,
  ) {
    switch (flow.step) {
      case 'SELECT_BOAT': {
        const idx = parseInt(text) - 1;
        if (isNaN(idx) || idx < 0 || idx >= flow.data.boats.length) {
          await this.sendGroup(flow.groupJid, '⚠️ Número inválido.');
          return;
        }
        const boat = flow.data.boats[idx];
        flow.data.boatId = boat.id;
        flow.data.boatName = boat.name;
        flow.data.fuelType = boat.fuelType;
        flow.data.currentFuel = boat.currentFuel;
        flow.data.fuelCapacity = boat.fuelCapacity;

        // Get current price
        const priceData = await this.fuel.getCurrentPrice(boat.fuelType);
        flow.data.pricePerLiter = priceData.price;

        // Get last cotista (most recent queue entry)
        const lastQueue = await this.prisma.operationalQueue.findFirst({
          where: { boatId: boat.id },
          orderBy: { createdAt: 'desc' },
          include: { client: { select: { id: true, name: true } } },
        });

        // Get all shareholders
        const shares = await this.prisma.share.findMany({
          where: { boatId: boat.id, isActive: true },
          include: { user: { select: { id: true, name: true } } },
        });

        flow.data.shares = shares.map((s) => ({ userId: s.userId, userName: s.user.name }));
        flow.data.lastCotista = lastQueue?.client ? { userId: lastQueue.clientId, userName: lastQueue.client.name } : null;

        const pct = boat.fuelCapacity > 0 ? Math.round((boat.currentFuel / boat.fuelCapacity) * 100) : 0;
        await this.sendGroup(flow.groupJid,
          `⛽ *Abastecimento — ${boat.name}*\n\n` +
          `Combustível: ${boat.fuelType}\n` +
          `Nível atual: ${boat.currentFuel.toFixed(1)}/${boat.fuelCapacity}L (${pct}%)\n` +
          `Preço/litro: R$ ${priceData.price.toFixed(2)}\n\n` +
          `Quantos *litros* foram abastecidos?`,
        );
        flow.step = 'FUEL_LITERS';
        break;
      }

      case 'FUEL_LITERS': {
        const liters = parseFloat(text.replace(',', '.'));
        if (isNaN(liters) || liters <= 0) {
          await this.sendGroup(flow.groupJid, '⚠️ Informe um valor numérico válido (ex: 50 ou 50.5).');
          return;
        }
        flow.data.liters = liters;
        const totalCost = liters * flow.data.pricePerLiter;
        flow.data.totalCost = totalCost;

        // Ask who to charge
        if (flow.data.lastCotista) {
          await this.sendGroup(flow.groupJid,
            `📊 *${liters}L* × R$ ${flow.data.pricePerLiter.toFixed(2)} = *R$ ${totalCost.toFixed(2)}*\n\n` +
            `Último cotista: *${flow.data.lastCotista.userName}*\n\n` +
            `*1* — Cobrar do último cotista (${flow.data.lastCotista.userName.split(' ')[0]})\n` +
            `*2* — Ratear entre todos os cotistas\n` +
            `*3* — Selecionar cotista específico`,
          );
        } else {
          await this.sendGroup(flow.groupJid,
            `📊 *${liters}L* × R$ ${flow.data.pricePerLiter.toFixed(2)} = *R$ ${totalCost.toFixed(2)}*\n\n` +
            `*1* — Ratear entre todos os cotistas\n` +
            `*2* — Selecionar cotista específico`,
          );
          flow.data.noLastCotista = true;
        }
        flow.step = 'FUEL_CHARGE_TYPE';
        break;
      }

      case 'FUEL_CHARGE_TYPE': {
        const choice = parseInt(text);
        if (flow.data.noLastCotista) {
          if (choice === 1) {
            flow.data.targetUserId = null; // Split among all
          } else if (choice === 2) {
            return this.showCotistaSelection(flow);
          } else {
            await this.sendGroup(flow.groupJid, '⚠️ Opção inválida.');
            return;
          }
        } else {
          if (choice === 1) {
            flow.data.targetUserId = flow.data.lastCotista.userId;
          } else if (choice === 2) {
            flow.data.targetUserId = null;
          } else if (choice === 3) {
            return this.showCotistaSelection(flow);
          } else {
            await this.sendGroup(flow.groupJid, '⚠️ Opção inválida.');
            return;
          }
        }

        // Ask for optional photo
        await this.sendGroup(flow.groupJid,
          `📸 Envie uma *foto* do abastecimento (comprovante/bomba)\n\n` +
          `Ou digite *pular* para continuar sem foto.`,
        );
        flow.step = 'FUEL_PHOTO_RECEIPT';
        break;
      }

      case 'FUEL_SELECT_COTISTA': {
        const idx = parseInt(text) - 1;
        if (isNaN(idx) || idx < 0 || idx >= flow.data.shares.length) {
          await this.sendGroup(flow.groupJid, '⚠️ Número inválido.');
          return;
        }
        flow.data.targetUserId = flow.data.shares[idx].userId;

        await this.sendGroup(flow.groupJid,
          `📸 Envie uma *foto* do abastecimento (comprovante/bomba)\n\n` +
          `Ou digite *pular* para continuar sem foto.`,
        );
        flow.step = 'FUEL_PHOTO_RECEIPT';
        break;
      }

      case 'FUEL_PHOTO_RECEIPT': {
        if (text.toLowerCase() === 'pular') {
          flow.data.imageUrl = null;
        } else if (msg.message?.imageMessage) {
          const buffer = await this.connection.downloadMedia(msg);
          if (buffer) {
            const filename = `fuel_${Date.now()}.jpg`;
            const filepath = path.join(UPLOADS_DIR, filename);
            fs.writeFileSync(filepath, buffer);
            flow.data.imageUrl = `/uploads/whatsapp/${filename}`;
          }
        } else {
          await this.sendGroup(flow.groupJid, '⚠️ Envie uma *foto* ou digite *pular*.');
          return;
        }

        // Confirm and execute
        const target = flow.data.targetUserId
          ? flow.data.shares.find((s: any) => s.userId === flow.data.targetUserId)?.userName || 'Cotista'
          : 'Todos (rateio)';

        await this.sendGroup(flow.groupJid,
          `✅ *Confirmar Abastecimento:*\n\n` +
          `🚤 ${flow.data.boatName}\n` +
          `⛽ ${flow.data.liters}L\n` +
          `💰 R$ ${flow.data.totalCost.toFixed(2)}\n` +
          `👤 Cobrar: ${target}\n` +
          `📸 Foto: ${flow.data.imageUrl ? 'Sim' : 'Não'}\n\n` +
          `*1* — ✅ Confirmar\n` +
          `*2* — ❌ Cancelar`,
        );
        flow.step = 'FUEL_CONFIRM';
        break;
      }

      case 'FUEL_CONFIRM': {
        if (text === '1') {
          try {
            const result = await this.fuel.logFuel(flow.operatorId, {
              boatId: flow.data.boatId,
              liters: flow.data.liters,
              pricePerLiter: flow.data.pricePerLiter,
              targetUserId: flow.data.targetUserId || undefined,
              imageUrl: flow.data.imageUrl || undefined,
            });
            await this.sendGroup(flow.groupJid,
              `✅ *Abastecimento registrado com sucesso!*\n\n` +
              `🚤 ${flow.data.boatName}\n` +
              `⛽ ${flow.data.liters}L | R$ ${flow.data.totalCost.toFixed(2)}\n` +
              `👥 Cobranças geradas: ${(result as any).chargedShareholders}`,
            );
          } catch (err: any) {
            await this.sendGroup(flow.groupJid, `❌ Erro ao registrar: ${err.message}`);
          }
          this.activeFlows.delete(phone);
        } else {
          await this.sendGroup(flow.groupJid, '❌ Abastecimento cancelado.');
          this.activeFlows.delete(phone);
        }
        break;
      }
    }
  }

  private async showCotistaSelection(flow: FlowState) {
    let msg = `👤 Selecione o cotista:\n\n`;
    flow.data.shares.forEach((s: any, i: number) => {
      msg += `*${i + 1}* — ${s.userName}\n`;
    });
    flow.step = 'FUEL_SELECT_COTISTA';
    await this.sendGroup(flow.groupJid, msg);
  }

  // ════════════════════════════════════════════════════════════════════════
  // SIMPLIFIED CHECKLIST HANDLERS (summary → photo → video → done)
  // ════════════════════════════════════════════════════════════════════════

  private async showChecklistSummary(flow: FlowState) {
    const items = flow.data.checklist.items;

    // Initialize all items as checked (pre-verified)
    if (!flow.data.itemResults) {
      flow.data.itemResults = items.map((item: any) => ({
        id: item.id,
        label: item.label,
        checked: true,
      }));
    }

    let msg = `📋 *Checklist — ${flow.data.boatName}*\n`;
    msg += `👤 Cotista: *${flow.data.userName || 'N/A'}*\n\n`;

    flow.data.itemResults.forEach((item: any, i: number) => {
      const icon = item.checked ? '✅' : '❌';
      msg += `*${i + 1}* — ${icon} ${item.label}\n`;
    });

    msg += `\n📸 Envie a *foto do combustível* para continuar.`;
    msg += `\nOu digite o *número* de um item para alterar.`;

    flow.step = 'REVIEW_SUMMARY';
    await this.sendGroup(flow.groupJid, msg);
  }

  private async handleReviewSummary(
    phone: string,
    msg: proto.IWebMessageInfo,
    text: string,
    flow: FlowState,
  ) {
    // Photo sent → save and move to video
    if (msg.message?.imageMessage) {
      const buffer = await this.connection.downloadMedia(msg);
      if (buffer) {
        const filename = `fuel_${Date.now()}.jpg`;
        const filepath = path.join(UPLOADS_DIR, filename);
        fs.writeFileSync(filepath, buffer);
        flow.data.fuelPhotoUrl = `/uploads/whatsapp/${filename}`;
      }

      await this.sendGroup(flow.groupJid,
        `📸 Foto recebida!\n\n🎥 Agora envie o *vídeo* de inspeção.\n_(ou digite *pular*)_`,
      );
      flow.step = 'VIDEO_FAST';
      return;
    }

    // Number typed → toggle item
    const num = parseInt(text);
    if (!isNaN(num) && num >= 1 && num <= flow.data.itemResults.length) {
      const item = flow.data.itemResults[num - 1];
      item.checked = !item.checked;
      await this.showChecklistSummary(flow);
      return;
    }

    // "pular" → skip photo, go to video
    if (text.toLowerCase() === 'pular') {
      flow.data.fuelPhotoUrl = null;
      await this.sendGroup(flow.groupJid,
        `🎥 Envie o *vídeo* de inspeção.\n_(ou digite *pular*)_`,
      );
      flow.step = 'VIDEO_FAST';
      return;
    }

    await this.sendGroup(flow.groupJid,
      `⚠️ Envie uma *foto*, digite o *número* de um item para alterar, ou *pular*.`,
    );
  }

  private async handleVideoFast(
    phone: string,
    msg: proto.IWebMessageInfo,
    text: string,
    flow: FlowState,
  ) {
    if (msg.message?.videoMessage) {
      const buffer = await this.connection.downloadMedia(msg);
      if (buffer) {
        const filename = `video_${Date.now()}.mp4`;
        const filepath = path.join(UPLOADS_DIR, filename);
        fs.writeFileSync(filepath, buffer);
        flow.data.videoUrl = `/uploads/whatsapp/${filename}`;
      }
    } else if (text.toLowerCase() === 'pular') {
      flow.data.videoUrl = null;
    } else {
      await this.sendGroup(flow.groupJid, `🎥 Envie um *vídeo* ou digite *pular*.`);
      return;
    }

    // Auto-finalize
    await this.autoFinalizeChecklist(phone, flow);
  }

  private async autoFinalizeChecklist(phone: string, flow: FlowState) {
    try {
      const result = await this.operations.submitPreLaunchChecklist(
        flow.data.checklist.id,
        flow.operatorId,
        {
          items: flow.data.itemResults.map((i: any) => ({ id: i.id, checked: i.checked })),
          fuelPhotoUrl: flow.data.fuelPhotoUrl || undefined,
          videoUrl: flow.data.videoUrl || undefined,
          lifeVestsLoaned: 0,
        },
      );

      const allChecked = (result as any).allChecked;
      const items = flow.data.itemResults;
      const okCount = items.filter((i: any) => i.checked).length;
      const problemCount = items.filter((i: any) => !i.checked).length;

      await this.sendGroup(flow.groupJid,
        allChecked
          ? `✅ *Checklist finalizado!*\n\n` +
            `🚤 ${flow.data.boatName}\n` +
            `👤 ${flow.data.userName}\n` +
            `📋 ${okCount}/${items.length} itens OK\n` +
            `📸 Foto: ${flow.data.fuelPhotoUrl ? '✅' : '—'}\n` +
            `🎥 Vídeo: ${flow.data.videoUrl ? '✅' : '—'}\n\n` +
            `_Embarcação liberada para operação._`
          : `⚠️ *Checklist finalizado com pendências.*\n\n` +
            `🚤 ${flow.data.boatName}\n` +
            `👤 ${flow.data.userName}\n` +
            `📋 ${okCount}/${items.length} itens OK | ${problemCount} problemas\n` +
            `📸 Foto: ${flow.data.fuelPhotoUrl ? '✅' : '—'}\n` +
            `🎥 Vídeo: ${flow.data.videoUrl ? '✅' : '—'}\n\n` +
            `_Há itens reprovados. Verifique antes de liberar._`,
      );
    } catch (err: any) {
      await this.sendGroup(flow.groupJid, `❌ Erro ao finalizar checklist: ${err.message}`);
    }

    this.activeFlows.delete(phone);
  }

  // ════════════════════════════════════════════════════════════════════════
  // HELPERS
  // ════════════════════════════════════════════════════════════════════════

  private async sendGroup(groupJid: string, text: string) {
    try {
      await this.connection.sendGroupMessage(groupJid, text);
    } catch (err) {
      this.logger.error(`Failed to send group message: ${err}`);
    }
  }
}
