import { Controller, Get } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';

@Controller('health')
export class HealthController {
  constructor(
    private prisma: PrismaService,
    @InjectQueue('push') private pushQueue: Queue,
  ) {}

  @Get()
  async health() {
    const checks: Record<string, { ok: boolean; ms?: number; error?: string }> = {};
    const start = Date.now();

    // Prisma
    const t0 = Date.now();
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      checks.db = { ok: true, ms: Date.now() - t0 };
    } catch (e: any) {
      checks.db = { ok: false, ms: Date.now() - t0, error: e.message };
    }

    // Redis via BullMQ client
    const t1 = Date.now();
    try {
      const client = await this.pushQueue.client;
      const pong = await client.ping();
      checks.redis = { ok: pong === 'PONG', ms: Date.now() - t1 };
    } catch (e: any) {
      checks.redis = { ok: false, ms: Date.now() - t1, error: e.message };
    }

    const ok = Object.values(checks).every((c) => c.ok);
    return {
      ok,
      uptime: Math.round(process.uptime()),
      pid: process.pid,
      ms: Date.now() - start,
      checks,
      timestamp: new Date().toISOString(),
    };
  }

  @Get('live')
  live() {
    return { ok: true, timestamp: new Date().toISOString() };
  }
}
