import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
  ConnectedSocket,
  MessageBody,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../database/prisma.service';
import * as jwt from 'jsonwebtoken';

const isProd = process.env.NODE_ENV === 'production';
const corsOrigins = isProd
  ? [
      'https://app.marinaprizeclub.com',
      'https://admin.marinaprizeclub.com',
      'https://marinaprizeclub.com',
      'https://garcom.marinaprizeclub.com',
      'capacitor://localhost',
      'ionic://localhost',
      'http://localhost',
    ]
  : [
      'http://localhost:3001',
      'http://localhost:3002',
      'http://localhost:3003',
      'http://localhost:3004',
      'https://app.marinaprizeclub.com',
      'https://admin.marinaprizeclub.com',
      'capacitor://localhost',
      'ionic://localhost',
    ];

/**
 * ReservationsGateway - realtime sync for the reservations calendar.
 * Clients subscribe to `boat:<id>` rooms; the service emits events
 * when reservations are created/cancelled/swapped/arrival-confirmed.
 *
 * All events include minimal payload so the PWA can update its cache
 * instantly without refetching.
 */
@Injectable()
@WebSocketGateway({
  cors: { origin: corsOrigins, credentials: true },
  namespace: '/reservations',
  transports: ['websocket', 'polling'],
})
export class ReservationsGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer() server: Server;
  private readonly logger = new Logger(ReservationsGateway.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  async handleConnection(client: Socket) {
    try {
      const token = client.handshake.auth?.token || client.handshake.headers?.authorization?.replace('Bearer ', '');
      if (!token) {
        client.disconnect();
        return;
      }
      const secret = this.config.get<string>('JWT_SECRET') || process.env.JWT_SECRET!;
      const payload = jwt.verify(token, secret) as any;
      (client as any).userId = payload.sub;
      (client as any).role = payload.role;
    } catch {
      client.disconnect();
    }
  }

  handleDisconnect(_client: Socket) {
    /* no-op */
  }

  private async userCanAccessBoat(userId: string, boatId: string, role?: string): Promise<boolean> {
    if (role === 'ADMIN' || role === 'CAPTAIN') return true;
    const share = await this.prisma.share.findFirst({
      where: { userId, boatId, isActive: true },
      select: { id: true },
    });
    return !!share;
  }

  @SubscribeMessage('subscribeBoat')
  async subscribeBoat(@ConnectedSocket() client: Socket, @MessageBody() data: { boatId: string }) {
    const userId = (client as any).userId;
    const role = (client as any).role;
    if (!userId || !data?.boatId) return { ok: false };
    const ok = await this.userCanAccessBoat(userId, data.boatId, role);
    if (!ok) {
      client.emit('subscribeError', { boatId: data.boatId, error: 'forbidden' });
      return { ok: false };
    }
    client.join(`boat:${data.boatId}`);
    return { ok: true };
  }

  @SubscribeMessage('unsubscribeBoat')
  unsubscribeBoat(@ConnectedSocket() client: Socket, @MessageBody() data: { boatId: string }) {
    if (data?.boatId) client.leave(`boat:${data.boatId}`);
    return { ok: true };
  }

  // ── Emitters (called from ReservationsService) ────────────────────────

  emitCreated(boatId: string, reservation: any) {
    this.server.to(`boat:${boatId}`).emit('reservation:created', { boatId, reservation });
  }

  emitCancelled(boatId: string, reservation: any) {
    this.server.to(`boat:${boatId}`).emit('reservation:cancelled', { boatId, reservation });
  }

  emitUpdated(boatId: string, reservation: any) {
    this.server.to(`boat:${boatId}`).emit('reservation:updated', { boatId, reservation });
  }

  emitSwapAccepted(boatId: string, swap: any) {
    this.server.to(`boat:${boatId}`).emit('reservation:swap:accepted', { boatId, swap });
  }
}
