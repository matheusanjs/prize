import { Injectable, Logger, OnModuleInit, Optional, Inject } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { WhatsAppConnectionService } from './whatsapp-connection.service';
import { WhatsAppMessagingService } from './whatsapp-messaging.service';
import { WhatsAppChatService } from './whatsapp-chat.service';
import { WhatsAppGroupService } from './whatsapp-group.service';
import { proto } from '@whiskeysockets/baileys';

/**
 * Incoming message handler.
 *
 * Flow:
 * 1. Extract phone from JID
 * 2. Log inbound message
 * 3. Authenticate: does the phone match a registered user?
 *    - YES → delegate to WhatsAppChatService (AI + actions)
 *    - NO  → send unauthenticated reply
 */
@Injectable()
export class WhatsAppIncomingService implements OnModuleInit {
  private readonly logger = new Logger(WhatsAppIncomingService.name);

  constructor(
    private prisma: PrismaService,
    private connection: WhatsAppConnectionService,
    private messaging: WhatsAppMessagingService,
    private chatService: WhatsAppChatService,
    @Optional() @Inject(WhatsAppGroupService) private groupService?: WhatsAppGroupService,
  ) {}

  onModuleInit() {
    this.connection.setMessageHandler(this.handleMessage.bind(this));
  }

  private async handleMessage(msg: proto.IWebMessageInfo) {
    const remoteJid = msg.key?.remoteJid || '';

    // Status broadcasts — always ignore
    if (remoteJid.includes('status@')) {
      return;
    }

    // Group messages — route to group service (before text filter since groups handle media too)
    if (remoteJid.endsWith('@g.us')) {
      this.logger.debug(`Group message received from ${remoteJid}, participant: ${(msg.key as any).participant || 'unknown'}`);
      if (this.groupService) {
        await this.groupService.handleGroupMessage(msg, remoteJid);
      } else {
        this.logger.warn('Group message received but groupService not available');
      }
      return;
    }

    const text =
      msg.message?.conversation ||
      msg.message?.extendedTextMessage?.text ||
      '';

    if (!text.trim()) return; // Ignore non-text messages for DMs

    // Extract phone number from JID
    // Baileys v7 may use @lid (Linked ID) format instead of @s.whatsapp.net
    let phone = '';

    if (remoteJid.endsWith('@s.whatsapp.net')) {
      phone = remoteJid.replace('@s.whatsapp.net', '');
    } else if (remoteJid.endsWith('@lid')) {
      // LID format — try to get phone from notify/verifiedBizName or participant
      // The actual phone may be in msg.key.participant or we use the pushName context
      const participant = (msg.key as any).participant || '';
      if (participant.endsWith('@s.whatsapp.net')) {
        phone = participant.replace('@s.whatsapp.net', '');
      } else {
        // Use the connection service to resolve the LID to a phone
        const resolved = await this.connection.resolvePhoneFromLid(remoteJid);
        if (resolved) {
          phone = resolved;
        } else {
          this.logger.warn(`Cannot resolve phone for LID: ${remoteJid}, pushName: ${msg.pushName || 'unknown'}`);
          return;
        }
      }
    } else {
      // Unknown JID format — skip
      this.logger.debug(`Ignoring unknown JID format: ${remoteJid}`);
      return;
    }

    if (!phone) return;

    this.logger.log(
      `Incoming from ${phone}: "${text.trim().substring(0, 50)}"`,
    );

    // Log the raw inbound message (find user loosely for linking)
    const cleanPhone = phone.startsWith('55') ? phone.substring(2) : phone;
    const userForLog = await this.prisma.user.findFirst({
      where: {
        OR: [
          { phone: cleanPhone },
          { phone },
          { phone: { endsWith: cleanPhone.slice(-8) } },
        ],
      },
      select: { id: true },
    });

    await this.messaging.logIncoming({
      phone,
      body: text.trim(),
      userId: userForLog?.id,
    });

    // Delegate to the chat service — it authenticates by exact phone match
    const handled = await this.chatService.processAuthenticatedMessage(
      phone,
      text.trim(),
    );

    if (!handled) {
      // Phone NOT registered — unauthenticated flow
      await this.handleUnauthenticated(phone, text.trim());
    }
  }

  /**
   * Reply to messages from unregistered phone numbers.
   */
  private async handleUnauthenticated(phone: string, text: string) {
    this.logger.log(`Unauthenticated message from ${phone}`);

    const body = await this.messaging.resolveTemplate('unauthenticated', {})
      || 'Olá! Este é o WhatsApp da Marina Prize Club. Para utilizar nosso atendimento, seu número precisa estar cadastrado no sistema.';

    await this.messaging.send({
      phone,
      body,
      category: 'RESPONSE',
    });
  }
}
