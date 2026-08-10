import { Controller, Get, Headers, Logger, Post, Query } from '@nestjs/common';
import { timingSafeEqual } from 'node:crypto';
import { Public } from '../rbac/decorators';
import { AppError } from '../common/http-exception.filter';
import { isDeployed } from '../common/deployment';
import { BillingSchedulerService } from './billing-scheduler.service';

/**
 * Scheduled work, as HTTP.
 *
 * §5.3 needs a daily pass: mark instalments due and overdue, send the
 * FR-PAY-019 notice cadence, then freeze anything past its grace period. On a
 * long-running host `BillingSchedulerService` does that on a timer. A serverless
 * function has no timer — it exists only while a request is in flight — so on
 * Vercel the same pass is driven by Vercel Cron calling this endpoint.
 *
 * The work itself is unchanged and lives in one place. This is a trigger, not a
 * second implementation.
 *
 * ## Authentication
 *
 * `@Public` opts out of the JWT guard, because Vercel Cron has no user session.
 * It does not opt out of authentication: the request must carry `CRON_SECRET`,
 * compared in constant time. Without that this endpoint would let anyone on the
 * internet freeze learner accounts.
 *
 * Vercel sends the secret as `Authorization: Bearer $CRON_SECRET` automatically
 * when `CRON_SECRET` is set on the project.
 */
@Controller('jobs')
export class JobsController {
  private readonly logger = new Logger(JobsController.name);

  constructor(private readonly scheduler: BillingSchedulerService) {}

  /**
   * Constant-time comparison. A `===` here leaks the secret one character at a
   * time to anyone willing to measure, and the endpoint is unauthenticated by
   * every other measure.
   */
  private assertAuthorised(authorization: string | undefined): void {
    const expected = process.env.CRON_SECRET;

    if (!expected) {
      // Deployed boot refuses without this (see create-app.ts), so reaching here
      // means a local run. Refuse anyway rather than defaulting to open.
      throw AppError.forbidden();
    }

    const supplied = (authorization ?? '').replace(/^Bearer\s+/i, '');
    const a = Buffer.from(supplied);
    const b = Buffer.from(expected);

    // timingSafeEqual throws on a length mismatch, which is itself a leak of the
    // secret's length — so the lengths are compared first and the result folded
    // in, keeping the answer uniform.
    const equal = a.length === b.length && timingSafeEqual(a, b);
    if (!equal) throw AppError.forbidden();
  }

  /**
   * §5.3: the daily billing pass.
   *
   * Idempotent by construction — notices carry a per-instalment key and the
   * freeze is guarded by a partial unique index — so an accidental double
   * trigger, or a retry after a timeout, sends nothing twice and freezes nobody
   * twice. That matters here more than on a timer: cron delivery is at-least-once.
   *
   * `asOf` exists for operators replaying a day the schedule missed, and for
   * end-to-end tests that need to stand at a specific date. It is inert unless
   * supplied.
   */
  @Post('billing-pass')
  @Public()
  async billingPass(
    @Headers('authorization') authorization?: string,
    @Query('asOf') asOf?: string,
  ) {
    this.assertAuthorised(authorization);

    if (asOf && !/^\d{4}-\d{2}-\d{2}$/.test(asOf)) {
      throw AppError.badRequest('errors.validation');
    }

    const started = Date.now();
    const result = await this.scheduler.runOnce(asOf);

    this.logger.log({
      msg: 'Scheduled billing pass complete',
      asOf: asOf ?? 'today',
      durationMs: Date.now() - started,
      ...result,
    });

    return { ok: true, ...result };
  }

  /**
   * Vercel Cron issues GET, not POST.
   *
   * Kept as an explicit alias rather than by loosening the method on the handler
   * above, so that the destructive job is never reachable by an accidental
   * browser navigation to a path someone guessed — it still needs the secret.
   */
  @Get('billing-pass')
  @Public()
  async billingPassCron(
    @Headers('authorization') authorization?: string,
    @Query('asOf') asOf?: string,
  ) {
    return this.billingPass(authorization, asOf);
  }

  /**
   * A liveness probe for the scheduled work itself.
   *
   * Answers "is the cron wired up at all", which is the failure nobody notices:
   * a billing pass that silently stops running produces no error, just learners
   * who are never reminded and never frozen.
   */
  @Get('health')
  @Public()
  health() {
    return {
      ok: true,
      mode: isDeployed() ? 'scheduled' : 'in_process',
      // Present without revealing it: the operator needs to know whether the
      // secret is configured, not what it is.
      cronSecretConfigured: Boolean(process.env.CRON_SECRET),
    };
  }
}
