import {
  CallHandler,
  ExecutionContext,
  Injectable,
  Logger,
  NestInterceptor,
} from '@nestjs/common';
import { Observable, tap } from 'rxjs';
import { PrismaService } from '../database/prisma.service';

const IGNORE_PATHS = ['/health', '/health/live', '/api/v1/health', '/api/v1/health/live'];

@Injectable()
export class AuditLogInterceptor implements NestInterceptor {
  private readonly logger = new Logger('Audit');

  constructor(private prisma: PrismaService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const http = context.switchToHttp();
    const req = http.getRequest();
    const res = http.getResponse();
    const start = Date.now();

    const method: string = req.method;
    const route: string = req.originalUrl || req.url || '';

    // Skip non-HTTP contexts (e.g., WebSocket) & noisy paths
    if (!method || !route || IGNORE_PATHS.some((p) => route.startsWith(p))) {
      return next.handle();
    }

    // Only audit write operations and auth endpoints; ignore GETs (too noisy)
    const isWrite = method !== 'GET' && method !== 'HEAD' && method !== 'OPTIONS';
    const isAuth = route.includes('/auth/');
    if (!isWrite && !isAuth) {
      return next.handle();
    }

    return next.handle().pipe(
      tap({
        next: () => this.log(req, res.statusCode ?? 200, Date.now() - start),
        error: (err) => this.log(req, err?.status ?? 500, Date.now() - start, err?.message),
      }),
    );
  }

  private log(req: any, statusCode: number, durationMs: number, errorMessage?: string) {
    try {
      const userId: string | null = req.user?.id || req.user?.userId || null;
      const ip: string =
        (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ||
        req.ip ||
        req.connection?.remoteAddress ||
        '';
      const ua: string = req.headers['user-agent'] || '';
      const route: string = req.route?.path || req.originalUrl || req.url || '';
      const method: string = req.method;

      // Fire-and-forget; don't block request
      this.prisma.auditLog
        .create({
          data: {
            userId,
            method,
            route: route.slice(0, 500),
            statusCode,
            durationMs,
            ip: ip.slice(0, 64),
            userAgent: ua.slice(0, 500),
            error: errorMessage ? errorMessage.slice(0, 500) : null,
          },
        })
        .catch((err) => this.logger.warn(`audit persist failed: ${err.message}`));
    } catch (err: any) {
      this.logger.warn(`audit log threw: ${err?.message}`);
    }
  }
}
