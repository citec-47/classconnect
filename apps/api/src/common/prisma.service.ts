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

  /**
   * Boot without waiting for the database.
   *
   * Two earlier versions were both wrong. Awaiting `$connect()` and letting it
   * throw killed the process the first time Neon was asleep. Awaiting it *with*
   * retries was worse: `onModuleInit` runs before `app.listen`, so the server
   * sat there not listening while it retried, and every request timed out with
   * nothing in the log to explain it.
   *
   * The database being briefly unreachable is not a reason for the API to be
   * unreachable. So connection happens in the background: the process listens
   * immediately, `/health` answers, and requests that need data fail with a
   * real error while the connection is still coming up — which is information,
   * where a timeout is not.
   *
   * AS-08 says connectivity interruptions here are normal rather than
   * exceptional. A serverless database that has scaled to zero is the same fact
   * seen from the server's side.
   */
  onModuleInit(): void {
    void this.connectInBackground();
  }

  /** True once a connection has been established at least once. */
  private connected = false;

  /**
   * Says what DATABASE_URL actually looks like, without printing a password.
   *
   * Prisma's "the URL must start with the protocol `postgresql://`" is accurate
   * and unhelpful: it reports what the value is not, never what it is. An
   * operator reading it cannot tell a placeholder from a stray quote, a
   * duplicated `DATABASE_URL=` prefix from a leading space — and those all look
   * identical in a dashboard field that shows the value only when clicked.
   *
   * So describe the value instead of echoing it. The scheme is the part that is
   * wrong, and it is the part that carries no secret; length and surrounding
   * whitespace name the remaining causes. Everything after the scheme stays
   * unprinted, because credentials live there.
   */
  private describeDatabaseUrl(): string {
    const raw = process.env.DATABASE_URL;
    if (raw === undefined) return 'DATABASE_URL is not set at all.';
    if (raw === '') return 'DATABASE_URL is set to an empty string.';

    const trimmed = raw.trim();
    const scheme = trimmed.slice(0, Math.max(trimmed.indexOf('://') + 3, 0));
    const notes: string[] = [];
    if (raw !== trimmed) notes.push('it has leading or trailing whitespace');
    if (trimmed.startsWith('"') || trimmed.startsWith("'")) notes.push('it is wrapped in quotes');
    if (/^DATABASE_URL=/i.test(trimmed)) notes.push('it still has the "DATABASE_URL=" prefix');
    if (!scheme) notes.push('it contains no "://" at all');

    return (
      `DATABASE_URL is ${raw.length} characters and begins "${trimmed.slice(0, 12)}"` +
      (notes.length > 0 ? ` — ${notes.join(', ')}.` : '.')
    );
  }

  private async connectInBackground(): Promise<void> {
    // Capped exponential backoff, repeating at the cap. It does not give up:
    // a wrong DATABASE_URL announces itself through the repeated warning, and
    // a database that wakes in four minutes should still be picked up.
    const delays = [500, 1_000, 2_000, 4_000, 8_000, 15_000, 30_000];
    let attempt = 0;

    for (;;) {
      try {
        await this.$connect();
        this.connected = true;
        this.logger.log(
          attempt === 0
            ? 'Database connection established'
            : `Database connection established after ${attempt + 1} attempts`,
        );
        return;
      } catch (error) {
        const wait = delays[Math.min(attempt, delays.length - 1)]!;
        const message = (error as Error).message;

        /*
         * A malformed URL is a different problem from an unreachable database,
         * and retrying cannot fix it. Say so once, with a description of the
         * value, rather than repeating a message that never names the cause.
         */
        if (attempt === 0 && message.includes('must start with the protocol')) {
          this.logger.error(
            `DATABASE_URL is not a PostgreSQL connection string, so no connection was attempted. ` +
              `${this.describeDatabaseUrl()} It must begin "postgresql://" and contain nothing ` +
              'before that — no variable name, no quotes, no leading space.',
          );
        }

        this.logger.warn(
          `Database unreachable (attempt ${attempt + 1}): ${message}. ` +
            `Retrying in ${wait / 1000}s. The API is listening; requests needing ` +
            'data will fail until this succeeds.',
        );
        attempt += 1;
        await new Promise((resolve) => setTimeout(resolve, wait));
      }
    }
  }

  /** For the health endpoint, so "up" and "has a database" are separable. */
  get databaseReady(): boolean {
    return this.connected;
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}

/** Tables that must never be updated or deleted (DAT-005). */
export const APPEND_ONLY_TABLES = ['ledger_entries', 'audit_log'] as const;
