import { Injectable, Logger, NotFoundException, ForbiddenException, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../database/prisma.service';
import * as fs from 'fs';
import * as path from 'path';
import { randomUUID } from 'crypto';

@Injectable()
export class SocialService {
  private readonly logger = new Logger(SocialService.name);

  constructor(
    private prisma: PrismaService,
    private config: ConfigService,
  ) {}

  // ═══════════════════════════════════════════════════════════════
  // Helpers
  // ═══════════════════════════════════════════════════════════════

  private async saveBase64File(base64: string, folder: string): Promise<string> {
    const match = base64.match(/^data:([\w\/+.-]+);base64,(.+)$/);
    if (!match) throw new BadRequestException('Formato base64 inválido');
    const mimeType = match[1];
    const buffer = Buffer.from(match[2], 'base64');
    const ext = mimeType.includes('png') ? 'png'
      : mimeType.includes('webp') ? 'webp'
      : mimeType.includes('audio') ? 'webm'
      : mimeType.includes('mp4') ? 'mp4'
      : 'jpg';
    const filename = `${randomUUID()}.${ext}`;
    const dir = path.join(process.cwd(), 'uploads', folder);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    const filePath = path.join(dir, filename);
    fs.writeFileSync(filePath, buffer);
    return `/uploads/${folder}/${filename}`;
  }

  private async checkUserHasShare(userId: string): Promise<boolean> {
    const share = await this.prisma.share.findFirst({
      where: {
        userId,
        OR: [
          { endDate: null },         // perpetual / no expiry
          { endDate: { gte: new Date() } }, // not yet expired
        ],
      },
    });
    return !!share;
  }

  // ═══════════════════════════════════════════════════════════════
  // TRIPS — List / Detail
  // ═══════════════════════════════════════════════════════════════

  async listTrips(userId: string) {
    const hasShare = await this.checkUserHasShare(userId);

    const trips = await this.prisma.trip.findMany({
      where: {
        OR: [
          { status: 'APPROVED' },
          { creatorId: userId },
        ],
      },
      include: {
        creator: { select: { id: true, name: true, avatar: true } },
        photos: { orderBy: { order: 'asc' } },
        participants: { include: { user: { select: { id: true, name: true, avatar: true } } } },
        _count: { select: { messages: true, likes: true, participants: true } },
        likes: { where: { userId }, select: { id: true } },
      },
      orderBy: [{ isHighlighted: 'desc' }, { date: 'asc' }],
    });

    return {
      hasShare,
      trips: trips.map(t => ({
        ...t,
        isLiked: t.likes.length > 0,
        likes: undefined,
      })),
    };
  }

  async getTrip(id: string, userId: string) {
    const trip = await this.prisma.trip.findUnique({
      where: { id },
      include: {
        creator: { select: { id: true, name: true, avatar: true, phone: true } },
        photos: { orderBy: { order: 'asc' } },
        participants: {
          include: { user: { select: { id: true, name: true, avatar: true } } },
          orderBy: { joinedAt: 'asc' },
        },
        _count: { select: { messages: true, likes: true, participants: true } },
        likes: { where: { userId }, select: { id: true } },
      },
    });
    if (!trip) throw new NotFoundException('Trip não encontrada');

    return {
      ...trip,
      isLiked: trip.likes.length > 0,
      isParticipant: trip.participants.some(p => p.userId === userId),
      likes: undefined,
    };
  }

  async getTripByShareToken(token: string) {
    const trip = await this.prisma.trip.findUnique({
      where: { shareToken: token },
      include: {
        creator: { select: { name: true, avatar: true } },
        photos: { orderBy: { order: 'asc' } },
        _count: { select: { participants: true, likes: true } },
      },
    });
    if (!trip) throw new NotFoundException('Trip não encontrada');
    return trip;
  }

  // ═══════════════════════════════════════════════════════════════
  // TRIPS — Create
  // ═══════════════════════════════════════════════════════════════

  async createTrip(userId: string, body: any) {
    const hasShare = await this.checkUserHasShare(userId);
    if (!hasShare) throw new ForbiddenException('Apenas cotistas podem criar trips');

    const { title, meetingPoint, destination, stops, date, time, maxParticipants, photos } = body;

    if (!title || !meetingPoint || !destination || !date) {
      throw new BadRequestException('Campos obrigatórios: title, meetingPoint, destination, date');
    }
    if (!photos || !Array.isArray(photos) || photos.length < 1) {
      throw new BadRequestException('Mínimo 1 foto obrigatória');
    }

    // Save photos
    const savedPhotos: { url: string; order: number }[] = [];
    for (let i = 0; i < photos.length; i++) {
      const url = await this.saveBase64File(photos[i], 'social/trips');
      savedPhotos.push({ url, order: i });
    }

    const trip = await this.prisma.trip.create({
      data: {
        title,
        meetingPoint,
        destination,
        stops: stops || [],
        date: new Date(date),
        time: time || null,
        maxParticipants: maxParticipants ? parseInt(maxParticipants) : null,
        creatorId: userId,
        photos: { create: savedPhotos },
        participants: { create: { userId } }, // Creator auto-joins
      },
      include: {
        creator: { select: { id: true, name: true, avatar: true } },
        photos: { orderBy: { order: 'asc' } },
        participants: { include: { user: { select: { id: true, name: true, avatar: true } } } },
        _count: { select: { messages: true, likes: true, participants: true } },
      },
    });

    // Generate AI invite asynchronously (non-blocking)
    this.generateAiInvite(trip.id, title, destination, meetingPoint).catch(e =>
      this.logger.error(`AI invite generation failed for trip ${trip.id}: ${e.message}`),
    );

    return trip;
  }

  // ═══════════════════════════════════════════════════════════════
  // TRIPS — Join / Leave / Like
  // ═══════════════════════════════════════════════════════════════

  async joinTrip(tripId: string, userId: string) {
    const trip = await this.prisma.trip.findUnique({
      where: { id: tripId },
      include: { _count: { select: { participants: true } } },
    });
    if (!trip) throw new NotFoundException('Trip não encontrada');
    if (trip.status !== 'APPROVED') throw new BadRequestException('Trip ainda não aprovada');
    if (trip.maxParticipants && trip._count.participants >= trip.maxParticipants) {
      throw new BadRequestException('Trip lotada');
    }

    const hasShare = await this.checkUserHasShare(userId);
    if (!hasShare) throw new ForbiddenException('Apenas cotistas podem participar');

    const existing = await this.prisma.tripParticipant.findUnique({
      where: { tripId_userId: { tripId, userId } },
    });
    if (existing) throw new BadRequestException('Você já está nesta trip');

    await this.prisma.tripParticipant.create({ data: { tripId, userId } });
    return { message: 'Você entrou na trip!' };
  }

  async leaveTrip(tripId: string, userId: string) {
    await this.prisma.tripParticipant.deleteMany({ where: { tripId, userId } });
    return { message: 'Você saiu da trip' };
  }

  async toggleLike(tripId: string, userId: string) {
    const existing = await this.prisma.tripLike.findUnique({
      where: { tripId_userId: { tripId, userId } },
    });
    if (existing) {
      await this.prisma.tripLike.delete({ where: { id: existing.id } });
      return { liked: false };
    }
    await this.prisma.tripLike.create({ data: { tripId, userId } });
    return { liked: true };
  }

  // ═══════════════════════════════════════════════════════════════
  // CHAT — Messages
  // ═══════════════════════════════════════════════════════════════

  async getMessages(tripId: string, cursor?: string, limit = 50) {
    const messages = await this.prisma.tripMessage.findMany({
      where: { tripId },
      take: limit,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      orderBy: { createdAt: 'desc' },
      include: {
        user: { select: { id: true, name: true, avatar: true } },
      },
    });
    return {
      messages: messages.reverse(),
      nextCursor: messages.length === limit ? messages[0]?.id : null,
    };
  }

  async sendMessage(tripId: string, userId: string, body: { content?: string; type?: string; mediaBase64?: string }) {
    const type = body.type || 'TEXT';
    let mediaUrl: string | null = null;

    if (body.mediaBase64) {
      const folder = type === 'AUDIO' ? 'social/audio' : 'social/media';
      mediaUrl = await this.saveBase64File(body.mediaBase64, folder);
    }

    if (type === 'TEXT' && !body.content) throw new BadRequestException('Conteúdo obrigatório');

    const message = await this.prisma.tripMessage.create({
      data: {
        tripId,
        userId,
        content: body.content || null,
        type,
        mediaUrl,
      },
      include: {
        user: { select: { id: true, name: true, avatar: true } },
      },
    });

    return message;
  }

  // ═══════════════════════════════════════════════════════════════
  // ADMIN
  // ═══════════════════════════════════════════════════════════════

  async adminListTrips(status?: string) {
    const where: any = {};
    if (status) where.status = status;

    const trips = await this.prisma.trip.findMany({
      where,
      include: {
        creator: { select: { id: true, name: true, avatar: true, phone: true } },
        photos: { orderBy: { order: 'asc' }, take: 1 },
        _count: { select: { participants: true, messages: true, likes: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
    return trips;
  }

  async adminGetTrip(id: string) {
    const trip = await this.prisma.trip.findUnique({
      where: { id },
      include: {
        creator: { select: { id: true, name: true, avatar: true, phone: true, email: true } },
        photos: { orderBy: { order: 'asc' } },
        participants: {
          include: { user: { select: { id: true, name: true, avatar: true, phone: true } } },
          orderBy: { joinedAt: 'asc' },
        },
        messages: {
          include: { user: { select: { id: true, name: true, avatar: true } } },
          orderBy: { createdAt: 'desc' },
          take: 100,
        },
        _count: { select: { participants: true, messages: true, likes: true } },
      },
    });
    if (!trip) throw new NotFoundException('Trip não encontrada');
    return trip;
  }

  async updateTripStatus(id: string, status: 'APPROVED' | 'REJECTED') {
    const trip = await this.prisma.trip.update({
      where: { id },
      data: { status },
      include: { creator: { select: { name: true } } },
    });
    return trip;
  }

  async toggleHighlight(id: string) {
    const trip = await this.prisma.trip.findUnique({ where: { id } });
    if (!trip) throw new NotFoundException('Trip não encontrada');
    return this.prisma.trip.update({
      where: { id },
      data: { isHighlighted: !trip.isHighlighted },
    });
  }

  async toggleOfficial(id: string) {
    const trip = await this.prisma.trip.findUnique({ where: { id } });
    if (!trip) throw new NotFoundException('Trip não encontrada');
    return this.prisma.trip.update({
      where: { id },
      data: { isOfficial: !trip.isOfficial },
    });
  }

  async deleteTrip(id: string) {
    await this.prisma.trip.delete({ where: { id } });
    return { message: 'Trip removida' };
  }

  async adminUpdateTrip(id: string, body: any) {
    const { title, meetingPoint, destination, date, time, maxParticipants, description, stops, newPhotos, removePhotoIds } = body;

    // Remove photos if requested
    if (removePhotoIds && Array.isArray(removePhotoIds) && removePhotoIds.length > 0) {
      await this.prisma.tripPhoto.deleteMany({ where: { id: { in: removePhotoIds }, tripId: id } });
    }

    // Add new photos (base64)
    if (newPhotos && Array.isArray(newPhotos) && newPhotos.length > 0) {
      const existingCount = await this.prisma.tripPhoto.count({ where: { tripId: id } });
      const savedPhotos: { url: string; order: number; tripId: string }[] = [];
      for (let i = 0; i < newPhotos.length; i++) {
        const url = await this.saveBase64File(newPhotos[i], 'social/trips');
        savedPhotos.push({ url, order: existingCount + i, tripId: id });
      }
      await this.prisma.tripPhoto.createMany({ data: savedPhotos });
    }

    const data: any = {};
    if (title !== undefined) data.title = title;
    if (meetingPoint !== undefined) data.meetingPoint = meetingPoint;
    if (destination !== undefined) data.destination = destination;
    if (date !== undefined) data.date = new Date(date);
    if (time !== undefined) data.time = time || null;
    if (maxParticipants !== undefined) data.maxParticipants = maxParticipants ? parseInt(maxParticipants) : null;
    if (description !== undefined) data.description = description || null;
    if (stops !== undefined) data.stops = stops;

    const trip = await this.prisma.trip.update({
      where: { id },
      data,
      include: {
        creator: { select: { id: true, name: true, avatar: true, phone: true, email: true } },
        photos: { orderBy: { order: 'asc' } },
        participants: { include: { user: { select: { id: true, name: true, avatar: true, phone: true } } } },
        messages: { include: { user: { select: { id: true, name: true, avatar: true } } }, orderBy: { createdAt: 'asc' } },
        _count: { select: { messages: true, likes: true, participants: true } },
      },
    });

    return trip;
  }

  async deleteMessage(id: string) {
    await this.prisma.tripMessage.update({
      where: { id },
      data: { isDeleted: true, content: null, mediaUrl: null },
    });
    return { message: 'Mensagem removida' };
  }

  // ═══════════════════════════════════════════════════════════════
  // AI — Invite Generation
  // ═══════════════════════════════════════════════════════════════

  private async generateAiInvite(tripId: string, title: string, destination: string, meetingPoint: string) {
    try {
      const { GoogleGenerativeAI } = await import('@google/generative-ai');
      const genAI = new GoogleGenerativeAI(this.config.get<string>('GEMINI_API_KEY')!);
      const model = genAI.getGenerativeModel({ model: this.config.get<string>('GEMINI_MODEL', 'gemini-2.0-flash') });

      const prompt = `Crie uma descrição convidativa e emocionante em português do Brasil para um passeio de jet ski / lancha chamado "${title}".
Saída do ponto: ${meetingPoint}
Destino: ${destination}

Escreva um texto de convite curto (max 3 parágrafos) que transmita aventura, liberdade no mar, e a experiência premium Prize Social Club.
Use um tom luxuoso mas descontraído. Mencione o destino e o ponto de encontro de forma natural.
Não use hashtags. Responda APENAS com o texto do convite, sem títulos ou formatação markdown.`;

      const result = await model.generateContent(prompt);
      const description = result.response.text();

      await this.prisma.trip.update({
        where: { id: tripId },
        data: { description },
      });

      this.logger.log(`AI invite generated for trip ${tripId}`);
    } catch (error) {
      this.logger.error(`Failed to generate AI invite: ${error.message}`);
    }
  }
}
