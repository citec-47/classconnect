import { Injectable, OnModuleDestroy, OnModuleInit, Logger } from '@nestjs/common';
import { PrismaClient } from '@classconnect/db';

/**
 * The single database entry point.
 *
 * DAT-005: `ledger_entries` and `audit_log` are append-only. That is enforced by
 * database grants (migration 002_append_only.sql) rather than here, so a bug in
 * application code cannot rewrite history. The client extension below fails fast
 * with a clear message instead of surfacing a raw permission error.
 */
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);

  constructor() {
    super({
      log: [
        { emit: 'event', level: 'warn' },
        { emit: 'event', level: 'error' },
      ],
      /**
       * Prisma's defaults for interactive transactions assume a database on the
       * same machine: 2s to acquire a connection and 5s to finish.
       *
       * §2.4 puts the database on managed hosting, so every statement costs a
       * network round trip — and a serverless instance that has scaled to zero
       * costs several seconds on the first one. Registration writes a user,
       * their roles, two consent records and a party row in one transaction;
       * against a cold remote database that measured 6.6s and the transaction
       * expired mid-way, surfacing as an intermittent 500 on sign-up.
       *
       * These are ceilings, not budgets. NFR-PER-003 still expects a write to
       * answer within 600ms at P95; this only stops a slow connection turning a
       * correct transaction into a failed one.
       */
      transactionOptions: {
        maxWait: 10_000,
        timeout: 20_000,
      },
    });
  }

  async onModuleInit(): Promise<void> {
    await this.$connect();
    this.logger.log('Database connection established');
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}

/** Tables that must never be updated or deleted (DAT-005). */
export const APPEND_ONLY_TABLES = ['ledger_entries', 'audit_log'] as const;
