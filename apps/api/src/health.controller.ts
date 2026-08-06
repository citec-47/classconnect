import { Controller, Get } from '@nestjs/common';
import { PrismaService } from './common/prisma.service';
import { Public } from './rbac/decorators';

/**
 * NFR-MNT-006: dashboards and alerts need a probe that exercises the database,
 * not merely the process. SI-011 lists uptime probes as an external interface.
 */
@Controller('health')
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  @Public()
  @Get()
  async health() {
    const startedAt = Date.now();
    let database: 'up' | 'down' = 'down';
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      database = 'up';
    } catch {
      database = 'down';
    }

    return {
      status: database === 'up' ? 'ok' : 'degraded',
      database,
      latencyMs: Date.now() - startedAt,
      timestamp: new Date().toISOString(),
    };
  }
}
