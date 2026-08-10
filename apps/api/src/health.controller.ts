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
    let database: 'up' | 'down' | 'connecting' = 'down';

    /*
     * Answer immediately while the connection is still coming up.
     *
     * The database connects in the background now, so a probe arriving during
     * a Neon cold start would otherwise sit on `SELECT 1` until it timed out —
     * and a health check that hangs is read as a dead process, which is the
     * opposite of the truth. `connecting` says the process is fine and the data
     * layer is not ready yet.
     */
    if (!this.prisma.databaseReady) {
      return {
        status: 'degraded',
        database: 'connecting',
        latencyMs: Date.now() - startedAt,
        timestamp: new Date().toISOString(),
      };
    }

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
