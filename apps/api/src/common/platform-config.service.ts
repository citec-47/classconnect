import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { PrismaService } from './prisma.service';
import { CONFIG_DEFAULTS, type ConfigKey } from '@classconnect/shared';

/**
 * Runtime configuration.
 *
 * CON-07: the platform is run by a small team, so everything the SRS calls
 * "configurable" is a database row, not a redeploy. Values are cached in
 * process and refreshed on write, keeping reads off the hot path.
 */
@Injectable()
export class PlatformConfigService implements OnModuleInit {
  private readonly logger = new Logger(PlatformConfigService.name);
  private cache = new Map<string, unknown>();

  constructor(private readonly prisma: PrismaService) {}

  async onModuleInit(): Promise<void> {
    try {
      await this.refresh();
    } catch (error) {
      // Prisma connects in the background. A temporarily unavailable database
      // must not prevent the HTTP process (and /health) from starting.
      this.logger.warn(
        `Platform configuration unavailable during startup: ${
          error instanceof Error ? error.message : String(error)
        }. Using defaults until the database is available.`,
      );
    }
  }

  async refresh(): Promise<void> {
    const rows = await this.prisma.platformConfig.findMany();
    this.cache = new Map(rows.map((row) => [row.key, row.value as unknown]));
    this.logger.log(`Loaded ${rows.length} configuration values`);
  }

  /**
   * Falls back to the SRS default when a key has not been overridden, so a
   * missing row degrades to the specified behaviour rather than to undefined.
   */
  get<T>(key: ConfigKey): T {
    if (this.cache.has(key)) return this.cache.get(key) as T;
    return CONFIG_DEFAULTS[key] as T;
  }

  getNumber(key: ConfigKey): number {
    const value = this.get<unknown>(key);
    const parsed = typeof value === 'number' ? value : Number(value);
    if (!Number.isFinite(parsed)) {
      throw new Error(`Configuration ${key} is not numeric: ${JSON.stringify(value)}`);
    }
    return parsed;
  }

  getBoolean(key: ConfigKey): boolean {
    return this.get<boolean>(key) === true;
  }

  getString(key: ConfigKey): string {
    return String(this.get<unknown>(key));
  }

  /** config:write permission is enforced at the controller; this records the actor. */
  async set(key: ConfigKey, value: unknown, updatedBy?: string): Promise<void> {
    await this.prisma.platformConfig.upsert({
      where: { key },
      create: { key, value: value as never, updatedBy: updatedBy ?? null },
      update: { value: value as never, updatedBy: updatedBy ?? null },
    });
    this.cache.set(key, value);
  }
}
