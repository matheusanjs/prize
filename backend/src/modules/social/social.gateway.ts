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
import { ConfigService } from '@nestjs/config';
import * as jwt from 'jsonwebtoken';

@WebSocketGateway({
  cors: {
    origin: [
      'http://localhost:3002',
      'http://173.212.227.106:3002',
      'https://app.marinaprizeclub.com',
      'https://admin.marinaprizeclub.com',
      'http://localhost:3001',
    ],
    credentials: true,
  },
  namespace: '/social',
})
export class SocialGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer() server: Server;
  private readonly logger = new Logger(SocialGateway.name);

  constructor(
    private readonly socialService: SocialService,
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
      this.logger.log(`Client connected: ${payload.sub}`);
    } catch {
      client.disconnect();
    }
  }

  handleDisconnect(client: Socket) {
    this.logger.log(`Client disconnected: ${(client as any).userId || 'unknown'}`);
  }

  @SubscribeMessage('joinTrip')
  handleJoinTrip(@ConnectedSocket() client: Socket, @MessageBody() data: { tripId: string }) {
    client.join(`trip:${data.tripId}`);
    this.logger.log(`User ${(client as any).userId} joined room trip:${data.tripId}`);
  }

  @SubscribeMessage('leaveTrip')
  handleLeaveTrip(@ConnectedSocket() client: Socket, @MessageBody() data: { tripId: string }) {
    client.leave(`trip:${data.tripId}`);
  }

  @SubscribeMessage('sendMessage')
  async handleSendMessage(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { tripId: string; content?: string; type?: string; mediaBase64?: string },
  ) {
    const userId = (client as any).userId;
    if (!userId) return;

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
  handleTyping(@ConnectedSocket() client: Socket, @MessageBody() data: { tripId: string }) {
    const userId = (client as any).userId;
    const userName = (client as any).userName;
    client.to(`trip:${data.tripId}`).emit('userTyping', { userId, userName });
  }
}
