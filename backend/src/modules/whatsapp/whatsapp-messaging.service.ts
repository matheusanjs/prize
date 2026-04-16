import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { WhatsAppConnectionService } from './whatsapp-connection.service';

@Injectable()
export class WhatsAppMessagingService {
  private readonly logger = new Logger(WhatsAppMessagingService.name);

  constructor(
    private prisma: PrismaService,
    private connection: WhatsAppConnectionService,
  ) {}

  /**
   * Send a WhatsApp message and log it in DB.
   */
  async send(opts: {
    phone: string;
    body: string;
    category?: string;
    referenceId?: string;
    referenceType?: string;
    userId?: string;
  }): Promise<{ id: string; sent: boolean }> {
    // Create message record
    const msg = await this.prisma.whatsAppMessage.create({
      data: {
        direction: 'OUTBOUND',
        phone: opts.phone,
        body: opts.body,
        category: opts.category,
        referenceId: opts.referenceId,
        referenceType: opts.referenceType,
        userId: opts.userId,
        status: 'QUEUED',
      },
    });

    if (!this.connection.isConnected()) {
      await this.prisma.whatsAppMessage.update({
        where: { id: msg.id },
        data: { status: 'FAILED', errorMessage: 'WhatsApp not connected' },
      });
      return { id: msg.id, sent: false };
    }

    try {
      await this.connection.sendTextMessage(opts.phone, opts.body);

      await this.prisma.whatsAppMessage.update({
        where: { id: msg.id },
        data: { status: 'SENT', sentAt: new Date() },
      });

      return { id: msg.id, sent: true };
    } catch (err: any) {
      await this.prisma.whatsAppMessage.update({
        where: { id: msg.id },
        data: {
          status: 'FAILED',
          errorMessage: err?.message || 'Unknown error',
        },
      });
      return { id: msg.id, sent: false };
    }
  }

  /**
   * Log an incoming message.
   */
  async logIncoming(opts: {
    phone: string;
    body: string;
    userId?: string;
    category?: string;
    referenceId?: string;
    referenceType?: string;
  }) {
    return this.prisma.whatsAppMessage.create({
      data: {
        direction: 'INBOUND',
        phone: opts.phone,
        body: opts.body,
        userId: opts.userId,
        category: opts.category || 'RESPONSE',
        referenceId: opts.referenceId,
        referenceType: opts.referenceType,
        status: 'DELIVERED',
        deliveredAt: new Date(),
      },
    });
  }

  /**
   * Resolve a template with variables.
   */
  async resolveTemplate(slug: string, vars: Record<string, string>): Promise<string | null> {
    const template = await this.prisma.whatsAppTemplate.findUnique({ where: { slug } });
    if (!template || !template.isActive) return null;

    let body = template.body;
    for (const [key, value] of Object.entries(vars)) {
      body = body.replace(new RegExp(`{{${key}}}`, 'g'), value);
    }
    return body;
  }

  /**
   * Get message history for admin panel.
   */
  async getMessages(filters: {
    phone?: string;
    category?: string;
    direction?: string;
    userId?: string;
    page?: number;
    limit?: number;
  }) {
    const page = filters.page || 1;
    const limit = filters.limit || 50;
    const where: any = {};

    if (filters.phone) where.phone = { contains: filters.phone };
    if (filters.category) where.category = filters.category;
    if (filters.direction) where.direction = filters.direction;
    if (filters.userId) where.userId = filters.userId;

    const [data, total] = await Promise.all([
      this.prisma.whatsAppMessage.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        include: { user: { select: { id: true, name: true } } },
      }),
      this.prisma.whatsAppMessage.count({ where }),
    ]);

    return { data, total, page, pages: Math.ceil(total / limit) };
  }

  /**
   * Get conversation with a specific phone.
   */
  async getConversation(phone: string, limit = 100) {
    const cleaned = phone.replace(/\D/g, '');
    return this.prisma.whatsAppMessage.findMany({
      where: {
        phone: { contains: cleaned },
      },
      orderBy: { createdAt: 'asc' },
      take: limit,
      include: { user: { select: { id: true, name: true } } },
    });
  }

  /**
   * Get list of unique conversations (grouped by phone) with last message preview.
   */
  async getConversations() {
    // Get distinct phones with their most recent message
    const phones = await this.prisma.whatsAppMessage.findMany({
      distinct: ['phone'],
      orderBy: { createdAt: 'desc' },
      select: { phone: true },
    });

    const conversations = await Promise.all(
      phones.map(async ({ phone }) => {
        const lastMsg = await this.prisma.whatsAppMessage.findFirst({
          where: { phone },
          orderBy: { createdAt: 'desc' },
          include: { user: { select: { id: true, name: true } } },
        });
        const unreadCount = await this.prisma.whatsAppMessage.count({
          where: { phone, direction: 'INBOUND', status: { not: 'READ' } },
        });
        const totalMessages = await this.prisma.whatsAppMessage.count({
          where: { phone },
        });
        return {
          phone,
          userName: lastMsg?.user?.name || null,
          userId: lastMsg?.user?.id || lastMsg?.userId || null,
          lastMessage: lastMsg?.body || '',
          lastMessageAt: lastMsg?.createdAt,
          lastDirection: lastMsg?.direction,
          unreadCount,
          totalMessages,
        };
      }),
    );

    return conversations.sort((a, b) => {
      const da = a.lastMessageAt ? new Date(a.lastMessageAt).getTime() : 0;
      const db = b.lastMessageAt ? new Date(b.lastMessageAt).getTime() : 0;
      return db - da;
    });
  }
}
