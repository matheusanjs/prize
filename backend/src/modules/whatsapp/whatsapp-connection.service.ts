import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import makeWASocket, {
  DisconnectReason,
  useMultiFileAuthState,
  WASocket,
  fetchLatestBaileysVersion,
  makeCacheableSignalKeyStore,
  proto,
  downloadMediaMessage,
} from '@whiskeysockets/baileys';
import * as QRCode from 'qrcode';
import { Boom } from '@hapi/boom';
import pino from 'pino';
import * as fs from 'fs';
import * as path from 'path';

const AUTH_DIR = path.join(process.cwd(), 'whatsapp-auth');

@Injectable()
export class WhatsAppConnectionService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(WhatsAppConnectionService.name);
  private sock: WASocket | null = null;
  private qrDataUrl: string | null = null;
  private status: 'DISCONNECTED' | 'QR_READY' | 'CONNECTING' | 'CONNECTED' = 'DISCONNECTED';
  private connectedPhone: string | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private messageHandler: ((msg: proto.IWebMessageInfo) => void) | null = null;
  private lidPhoneMap: Map<string, string> = new Map();

  constructor(private prisma: PrismaService) {}

  async onModuleInit() {
    // Auto-connect if we had a previous session
    if (fs.existsSync(path.join(AUTH_DIR, 'creds.json'))) {
      this.logger.log('Found existing WhatsApp session, auto-connecting...');
      await this.connect();
    }
  }

  onModuleDestroy() {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.sock?.end(undefined);
  }

  setMessageHandler(handler: (msg: proto.IWebMessageInfo) => void) {
    this.messageHandler = handler;
  }

  getStatus() {
    return {
      status: this.status,
      phone: this.connectedPhone,
      qrCode: this.qrDataUrl,
    };
  }

  isConnected(): boolean {
    return this.status === 'CONNECTED' && this.sock !== null;
  }

  async connect(): Promise<{ status: string; qrCode?: string }> {
    if (this.status === 'CONNECTED') {
      return { status: 'CONNECTED' };
    }

    if (!fs.existsSync(AUTH_DIR)) {
      fs.mkdirSync(AUTH_DIR, { recursive: true });
    }

    const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR);
    const { version } = await fetchLatestBaileysVersion();

    this.status = 'CONNECTING';
    this.qrDataUrl = null;

    const logger = pino({ level: 'silent' }) as any;

    this.sock = makeWASocket({
      version,
      auth: {
        creds: state.creds,
        keys: makeCacheableSignalKeyStore(state.keys, logger),
      },
      logger,
      printQRInTerminal: false,
      generateHighQualityLinkPreview: false,
      markOnlineOnConnect: true,
      fireInitQueries: false,
      shouldSyncHistoryMessage: () => false,
      syncFullHistory: false,
      // Ensure group messages are NOT ignored
      shouldIgnoreJid: (jid: string) => {
        // Only ignore status broadcasts
        return jid?.includes('status@broadcast') || false;
      },
      // Required for group message decryption retries
      getMessage: async (key) => {
        return undefined;
      },
    });

    this.sock.ev.on('creds.update', saveCreds);

    this.sock.ev.on('connection.update', async (update) => {
      const { connection, lastDisconnect, qr } = update;

      if (qr) {
        try {
          this.qrDataUrl = await QRCode.toDataURL(qr, { width: 300, margin: 2 });
          this.status = 'QR_READY';
          this.logger.log('QR code generated, waiting for scan...');

          await this.prisma.whatsAppSession.upsert({
            where: { id: 'main' },
            update: { qrCode: this.qrDataUrl, status: 'QR_READY' },
            create: { id: 'main', qrCode: this.qrDataUrl, status: 'QR_READY' },
          });
        } catch (err) {
          this.logger.error('Error generating QR code', err);
        }
      }

      if (connection === 'close') {
        const statusCode = (lastDisconnect?.error as Boom)?.output?.statusCode;
        const shouldReconnect = statusCode !== DisconnectReason.loggedOut;

        this.logger.warn(`Connection closed. Status: ${statusCode}. Reconnect: ${shouldReconnect}`);

        if (shouldReconnect) {
          this.status = 'DISCONNECTED';
          this.reconnectTimer = setTimeout(() => this.connect(), 5000);
        } else {
          this.status = 'DISCONNECTED';
          this.connectedPhone = null;
          this.qrDataUrl = null;
          // Clean auth to force new QR
          if (fs.existsSync(AUTH_DIR)) {
            fs.rmSync(AUTH_DIR, { recursive: true, force: true });
          }
          await this.prisma.whatsAppSession.upsert({
            where: { id: 'main' },
            update: { status: 'DISCONNECTED', qrCode: null, phone: null, connectedAt: null },
            create: { id: 'main', status: 'DISCONNECTED' },
          });
        }
      }

      if (connection === 'open') {
        this.status = 'CONNECTED';
        this.qrDataUrl = null;
        const me = this.sock?.user;
        this.connectedPhone = me?.id?.split(':')[0] || me?.id || null;

        this.logger.log(`WhatsApp connected as ${this.connectedPhone}`);

        await this.prisma.whatsAppSession.upsert({
          where: { id: 'main' },
          update: {
            status: 'CONNECTED',
            phone: this.connectedPhone,
            qrCode: null,
            connectedAt: new Date(),
          },
          create: {
            id: 'main',
            status: 'CONNECTED',
            phone: this.connectedPhone,
            connectedAt: new Date(),
          },
        });

        // Log group count on connection
        setTimeout(async () => {
          try {
            const groups = await this.sock?.groupFetchAllParticipating();
            if (groups) {
              const groupList = Object.values(groups);
              this.logger.log(`Bot is in ${groupList.length} group(s)`);
            }
          } catch (err) {
            this.logger.warn(`Failed to fetch groups: ${err}`);
          }
        }, 5000);

      }
    });

    // Listen for incoming messages
    this.sock.ev.on('messages.upsert', async ({ messages, type }) => {
      this.logger.log(`messages.upsert event: type=${type}, count=${messages.length}`);
      if (type !== 'notify') return;
      for (const msg of messages) {
        const remoteJid = msg.key.remoteJid || '';
        const isGroup = remoteJid.endsWith('@g.us');
        
        // Log group messages for debugging
        if (isGroup) {
          this.logger.log(`Group msg: jid=${remoteJid}, fromMe=${msg.key.fromMe}, participant=${(msg.key as any).participant || ''}, pushName=${msg.pushName || ''}`);
        }
        
        // Skip our own messages for DMs only; allow fromMe in groups so the bot owner can trigger flows
        if (msg.key.fromMe && !isGroup) continue;

        // Build LID→phone mapping from message metadata
        const participant = (msg.key as any).participant || '';

        // Direct message: LID → phone
        if (remoteJid.endsWith('@lid') && participant.endsWith('@s.whatsapp.net')) {
          const phone = participant.replace('@s.whatsapp.net', '');
          this.lidPhoneMap.set(remoteJid, phone);
          this.logger.debug(`LID mapping: ${remoteJid} → ${phone}`);
        }

        // Group message with LID participant: resolve via signalRepository
        if (remoteJid.endsWith('@g.us') && participant.endsWith('@lid')) {
          const resolved = await this.resolvePhoneFromLid(participant);
          if (resolved) {
            this.logger.debug(`LID resolved from signalRepository: ${participant} → ${resolved} (raw: ${resolved})`);
          }
        }

        this.logger.debug(`Raw message JID: ${remoteJid}, participant: ${participant}, pushName: ${msg.pushName || ''}`);

        if (this.messageHandler) {
          try {
            await this.messageHandler(msg);
          } catch (err) {
            this.logger.error('Error in message handler', err);
          }
        }
      }
    });

    // Listen for contacts to build LID→phone mapping
    this.sock.ev.on('contacts.upsert', (contacts) => {
      for (const contact of contacts) {
        const lid = contact.lid || (contact.id?.endsWith('@lid') ? contact.id : null);
        const pn = contact.phoneNumber || (contact.id?.endsWith('@s.whatsapp.net') ? contact.id : null);
        if (lid && pn) {
          const phone = pn.replace('@s.whatsapp.net', '');
          this.lidPhoneMap.set(lid, phone);
          this.logger.debug(`Contact LID mapping: ${lid} → ${phone}`);
        }
      }
      this.logger.log(`Contacts synced: ${contacts.length} contacts, ${this.lidPhoneMap.size} LID mappings`);
    });

    this.sock.ev.on('contacts.update', (updates) => {
      for (const contact of updates) {
        const lid = contact.lid || (contact.id?.endsWith('@lid') ? contact.id : null);
        const pn = contact.phoneNumber || (contact.id?.endsWith('@s.whatsapp.net') ? contact.id : null);
        if (lid && pn) {
          const phone = pn.replace('@s.whatsapp.net', '');
          this.lidPhoneMap.set(lid, phone);
          this.logger.debug(`Contact update LID mapping: ${lid} → ${phone}`);
        }
      }
    });

    // Wait a moment to see if QR appears or we auto-connect
    await new Promise((resolve) => setTimeout(resolve, 3000));

    return {
      status: this.status,
      qrCode: this.qrDataUrl || undefined,
    };
  }

  async disconnect(): Promise<void> {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.sock?.end(undefined);
    this.sock = null;
    this.status = 'DISCONNECTED';
    this.connectedPhone = null;
    this.qrDataUrl = null;

    // Clean auth folder
    if (fs.existsSync(AUTH_DIR)) {
      fs.rmSync(AUTH_DIR, { recursive: true, force: true });
    }

    await this.prisma.whatsAppSession.upsert({
      where: { id: 'main' },
      update: { status: 'DISCONNECTED', qrCode: null, phone: null, connectedAt: null },
      create: { id: 'main', status: 'DISCONNECTED' },
    });
  }

  async sendTextMessage(phone: string, text: string): Promise<proto.WebMessageInfo | null> {
    if (!this.isConnected() || !this.sock) {
      this.logger.warn(`Cannot send message: WhatsApp not connected (status=${this.status})`);
      return null;
    }

    // Normalize phone: remove + and non-digits, add @s.whatsapp.net
    const jid = this.normalizeJid(phone);

    try {
      const result = await this.sock.sendMessage(jid, { text });
      return result as proto.WebMessageInfo;
    } catch (err) {
      this.logger.error(`Failed to send message to ${phone}: ${err}`);
      throw err;
    }
  }

  private normalizeJid(phone: string): string {
    // Remove everything except digits
    let cleaned = phone.replace(/\D/g, '');
    // Ensure Brazil country code
    if (cleaned.length <= 11) {
      cleaned = '55' + cleaned;
    }
    return cleaned + '@s.whatsapp.net';
  }

  /**
   * Resolve a LID JID to a phone number.
   * Baileys v7 uses @lid (Linked ID) format internally.
   * Priority: 1) in-memory cache  2) Baileys signalRepository  3) null
   */
  async resolvePhoneFromLid(lidJid: string): Promise<string | null> {
    // 1. Check our in-memory map (from contacts.upsert + message participant)
    const cached = this.lidPhoneMap.get(lidJid);
    if (cached) {
      this.logger.debug(`LID resolved from cache: ${lidJid} → ${cached}`);
      return cached;
    }

    // 2. Use Baileys' built-in signalRepository LID mapping
    if (this.sock) {
      try {
        const repo = (this.sock as any).signalRepository;
        if (repo?.lidMapping?.getPNForLID) {
          const pn = await repo.lidMapping.getPNForLID(lidJid);
          if (pn) {
            // getPNForLID returns e.g. "5522997799864:0@s.whatsapp.net"
            // Remove @domain and :device suffix to get pure phone number
            const phone = pn.replace(/@.*$/, '').replace(/:\d+$/, '');
            this.lidPhoneMap.set(lidJid, phone); // cache it
            this.logger.debug(`LID resolved from signalRepository: ${lidJid} → ${phone} (raw: ${pn})`);
            return phone;
          }
        }
      } catch (err: any) {
        this.logger.warn(`signalRepository LID resolution failed for ${lidJid}: ${err.message}`);
      }
    }

    this.logger.warn(`Cannot resolve LID to phone: ${lidJid}`);
    return null;
  }

  /**
   * Send a text message to a group JID (e.g., 120363xxxxx@g.us).
   */
  async sendGroupMessage(groupJid: string, text: string): Promise<proto.WebMessageInfo | null> {
    if (!this.isConnected() || !this.sock) {
      this.logger.warn(`Cannot send group message: WhatsApp not connected`);
      return null;
    }
    try {
      const result = await this.sock.sendMessage(groupJid, { text });
      return result as proto.WebMessageInfo;
    } catch (err) {
      this.logger.error(`Failed to send group message to ${groupJid}: ${err}`);
      throw err;
    }
  }

  /**
   * Send an image to a group or individual JID.
   */
  async sendImage(jid: string, imageBuffer: Buffer, caption?: string): Promise<proto.WebMessageInfo | null> {
    if (!this.isConnected() || !this.sock) return null;
    try {
      const result = await this.sock.sendMessage(jid, {
        image: imageBuffer,
        caption: caption || undefined,
      });
      return result as proto.WebMessageInfo;
    } catch (err) {
      this.logger.error(`Failed to send image to ${jid}: ${err}`);
      throw err;
    }
  }

  /**
   * Download media (image/video/audio/document) from a received message.
   * Returns a Buffer of the media content.
   */
  async downloadMedia(msg: proto.IWebMessageInfo): Promise<Buffer | null> {
    try {
      const buffer = await downloadMediaMessage(msg as any, 'buffer', {});
      return buffer as Buffer;
    } catch (err) {
      this.logger.error(`Failed to download media: ${err}`);
      return null;
    }
  }

  /**
   * Get the raw socket for advanced operations.
   */
  getSocket(): WASocket | null {
    return this.sock;
  }
}
