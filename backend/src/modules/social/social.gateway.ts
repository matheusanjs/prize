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
import { Logger } from '@nestjs/common';
import { SocialService } from './social.service';
import { PrismaService } from '../../database/prisma.service';
import { ConfigService } from '@nestjs/config';
import * as jwt from 'jsonwebtoken';

const isProd = process.env.NODE_ENV === 'production';
const corsOrigins = isProd
  ? [
      'https://app.marinaprizeclub.com',
      'https://admin.marinaprizeclub.com',
      'https://marinaprizeclub.com',
      'capacitor://localhost',
      'ionic://localhost',
    ]
  : [
      'http://localhost:3001',
      'http://localhost:3002',
      'https://app.marinaprizeclub.com',
      'https://admin.marinaprizeclub.com',
      'capacitor://localhost',
      'ionic://localhost',
    ];

@WebSocketGateway({
  cors: { origin: corsOrigins, credentials: true },
  namespace: '/social',
  // Rate-limit per-socket message flood
  maxHttpBufferSize: 10e6, // 10MB max message (for base64 media)
})
export class SocialGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer() server: Server;
  private readonly logger = new Logger(SocialGateway.name);

  // Per-socket rate limit (message bursts)
  private msgBuckets = new Map<string, { count: number; resetAt: number }>();

  constructor(
    private readonly socialService: SocialService,
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
      const secret = this.config.get<string>('JWT_SECRET')!;
      const payload = jwt.verify(token, secret) as any;
      (client as any).userId = payload.sub;
      (client as any).userName = payload.name;
    } catch {
      client.disconnect();
    }
  }

  handleDisconnect(client: Socket) {
    this.msgBuckets.delete(client.id);
  }

  private async userCanAccessTrip(userId: string, tripId: string): Promise<boolean> {
    const trip = await this.prisma.trip.findUnique({
      where: { id: tripId },
      select: {
        status: true,
        creatorId: true,
        participants: { where: { userId }, select: { id: true } },
      },
    });
    if (!trip) return false;
    // Creator always allowed. Participants allowed. Approved public trips viewable
    // by any authenticated user (read-only join into the feed room).
    return (
      trip.creatorId === userId ||
      trip.participants.length > 0 ||
      trip.status === 'APPROVED'
    );
  }

  private checkRateLimit(socketId: string, limit = 60): boolean {
    const now = Date.now();
    const bucket = this.msgBuckets.get(socketId);
    if (!bucket || bucket.resetAt < now) {
      this.msgBuckets.set(socketId, { count: 1, resetAt: now + 60_000 });
      return true;
    }
    if (bucket.count >= limit) return false;
    bucket.count++;
    return true;
  }

  @SubscribeMessage('joinTrip')
  async handleJoinTrip(@ConnectedSocket() client: Socket, @MessageBody() data: { tripId: string }) {
    const userId = (client as any).userId;
    if (!userId || !data?.tripId) return;
    const allowed = await this.userCanAccessTrip(userId, data.tripId);
    if (!allowed) {
      client.emit('joinError', { tripId: data.tripId, error: 'forbidden' });
      return;
    }
    client.join(`trip:${data.tripId}`);
  }

  @SubscribeMessage('leaveTrip')
  handleLeaveTrip(@ConnectedSocket() client: Socket, @MessageBody() data: { tripId: string }) {
    if (!data?.tripId) return;
    client.leave(`trip:${data.tripId}`);
  }

  @SubscribeMessage('sendMessage')
  async handleSendMessage(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { tripId: string; content?: string; type?: string; mediaBase64?: string },
  ) {
    const userId = (client as any).userId;
    if (!userId || !data?.tripId) return;

    if (!this.checkRateLimit(client.id)) {
      client.emit('messageError', { error: 'rate_limited' });
      return;
    }

    const allowed = await this.userCanAccessTrip(userId, data.tripId);
    if (!allowed) {
      client.emit('messageError', { error: 'forbidden' });
      return;
    }

    try {
      const message = await this.socialService.sendMessage(data.tripId, userId, {
        content: data.content,
        type: data.type,
        mediaBase64: data.mediaBase64,
      });
      this.server.to(`trip:${data.tripId}`).emit('newMessage', message);
    } catch (error) {
      client.emit('messageError', { error: error.message });
    }
  }

  @SubscribeMessage('typing')
  async handleTyping(@ConnectedSocket() client: Socket, @MessageBody() data: { tripId: string }) {
    const userId = (client as any).userId;
    const userName = (client as any).userName;
    if (!userId || !data?.tripId) return;
    const allowed = await this.userCanAccessTrip(userId, data.tripId);
    if (!allowed) return;
    client.to(`trip:${data.tripId}`).emit('userTyping', { userId, userName });
  }
}
