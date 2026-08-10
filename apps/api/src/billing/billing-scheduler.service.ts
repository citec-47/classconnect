import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import {
  CONFIG_KEYS,
  PLATFORM_TIMEZONE,
  noticeSchedule,
  shouldFreezeFor,
} from '@classconnect/shared';
import { PrismaService } from '../common/prisma.service';
import { PlatformConfigService } from '../common/platform-config.service';
import { NotificationsService } from '../notifications/notifications.service';
import { FreezeService } from './freeze.service';

/**
 * The daily billing pass (§5.3).
 *
 * Runs the notice cadence and the freeze rule in that order, so that on the
 * freeze date the payer is told before the freeze lands rather than after it.
 * FR-PAY-019 is not decoration here: "A freeze must never be the first the payer
 * hears of it" is a hard ordering requirement, and this is the only place it can
 * be honoured.
 *
 * Idempotent by construction. Notices carry a per-instalment key so a re-run
 * sends nothing twice, and the freeze itself is guarded by a partial unique
 * index. That matters because this runs on a timer rather than a queue, and a
 * restart mid-pass is normal rather than exceptional.
 */
@Injectable()
export class BillingSchedulerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(BillingSchedulerService.name);
  private timer?: NodeJS.Timeout;
  private running = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: PlatformConfigService,
    private readonly notifications: NotificationsService,
    private readonly freeze: FreezeService,
  ) {}

  onModuleInit(): void {
    // Off in tests: a background timer that touches the database makes every
    // other test non-deterministic.
    if (process.env.NODE_ENV === 'test' || process.env.CC_DISABLE_SCHEDULERS === 'true') return;

    /**
     * Off on serverless, unconditionally.
     *
     * A Vercel function is frozen the moment its response is sent, so a timer
     * set here either never fires or fires unpredictably against a half-thawed
     * instance. Worse, it would fire in *every* concurrent instance at once.
     * There the pass is driven by Vercel Cron against `JobsController`.
     *
     * Checked separately from `CC_DISABLE_SCHEDULERS` rather than relying on it:
     * that variable is set in `vercel.json`, and a project configured by hand in
     * the dashboard would otherwise silently start timers.
     */
    if (process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME) {
      this.logger.log('Serverless runtime detected: the billing pass runs from Cron, not a timer');
      return;
    }

    // Hourly rather than daily. A due date is a calendar day in Africa/Douala,
    // and an hourly pass means a deploy at the wrong moment cannot skip one.
    this.timer = setInterval(() => this.runSafely(), 60 * 60 * 1000);
    this.timer.unref();
    this.runSafely();
  }

  /**
   * Runs the pass and swallows any failure.
   *
   * `runOnce` re-throws so that the Cron endpoint answers with a non-200 and the
   * platform records a failed job. A background timer has nobody to answer, so
   * an unhandled rejection here becomes an unhandled rejection in the process —
   * and Node terminates on those. That is how a transient database blip, or an
   * unapplied migration, takes the whole API down: not because a learner's
   * instalment mattered that much, but because nothing caught the promise.
   *
   * The failure is already logged with its cause by `runOnce`.
   */
  private runSafely(): void {
    void this.runOnce().catch(() => {
      // Deliberately empty: `runOnce` has logged it. Re-raising would restore
      // exactly the crash this exists to prevent.
    });
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  /** Today's date in Africa/Douala. Due dates are calendar facts, not instants. */
  private today(): string {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: PLATFORM_TIMEZONE,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date());
  }

  async runOnce(asOfDate = this.today()): Promise<{
    noticesSent: number;
    frozen: number;
    marked: number;
  }> {
    if (this.running) {
      this.logger.warn('Billing pass already running; skipping this tick');
      return { noticesSent: 0, frozen: 0, marked: 0 };
    }
    this.running = true;

    try {
      const marked = await this.markDueAndOverdue(asOfDate);
      const noticesSent = await this.sendNotices(asOfDate);
      const frozen = await this.applyFreezes(asOfDate);

      this.logger.log({ msg: 'Billing pass complete', asOfDate, marked, noticesSent, frozen });
      return { noticesSent, frozen, marked };
    } catch (error) {
      this.logger.error({
        msg: 'Billing pass failed',
        asOfDate,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    } finally {
      this.running = false;
    }
  }

  /** §5.2: scheduled -> due on the day, due -> overdue the day after. */
  private async markDueAndOverdue(asOfDate: string): Promise<number> {
    const today = new Date(`${asOfDate}T00:00:00.000Z`);

    const toDue = await this.prisma.instalment.updateMany({
      where: { state: 'scheduled', dueOn: { lte: today } },
      data: { state: 'due' },
    });

    const toOverdue = await this.prisma.instalment.updateMany({
      where: { state: 'due', dueOn: { lt: today } },
      data: { state: 'overdue' },
    });

    return toDue.count + toOverdue.count;
  }

  /**
   * FR-PAY-019 / §5.3: 7, 3 and 1 days before, on the due date, and on the
   * freeze date, over the payer's preferred channel plus in-app (FR-NOT-006).
   */
  private async sendNotices(asOfDate: string): Promise<number> {
    const graceDays = this.config.getNumber(CONFIG_KEYS.INSTALMENT_GRACE_DAYS);
    const daysBefore = this.config.get<number[]>(CONFIG_KEYS.INSTALMENT_NOTICE_DAYS_BEFORE);

    const outstanding = await this.prisma.instalment.findMany({
      where: { state: { in: ['scheduled', 'due', 'overdue'] } },
      include: {
        schedule: {
          include: { subscription: { include: { learner: true } } },
        },
      },
    });

    let sent = 0;

    for (const instalment of outstanding) {
      const dueOn = instalment.dueOn.toISOString().slice(0, 10);
      const already = (instalment.noticesSentJson as Record<string, string> | null) ?? {};

      const due = noticeSchedule(dueOn, graceDays, daysBefore).filter(
        (notice) => notice.sendOn <= asOfDate && !already[notice.key],
      );
      if (due.length === 0) continue;

      const payerId = instalment.schedule.subscription.payerUserId;
      const learner = instalment.schedule.subscription.learner;

      for (const notice of due) {
        await this.notifications.notifyUser(
          payerId,
          notice.kind === 'freeze'
            ? 'instalmentFreezeWarning'
            : notice.kind === 'due'
              ? 'instalmentDueToday'
              : 'instalmentDueSoon',
          {
            learner: learner.fullName,
            instalment: instalment.sequence,
            amount: instalment.amountXaf.toString(),
            dueOn,
            days: notice.daysBefore ?? 0,
          },
          {
            // FR-NOT-006: preferred channel plus in-app.
            channels: ['in_app', 'sms'],
            // FR-NOT-005: the key is the notice, so a re-run is a no-op.
            dedupeKey: `instalment:${instalment.id}:${notice.key}`,
          },
        );
        already[notice.key] = new Date().toISOString();
        sent += 1;
      }

      await this.prisma.instalment.update({
        where: { id: instalment.id },
        data: { noticesSentJson: already as never },
      });
    }

    return sent;
  }

  /**
   * §5.3: freeze once due date + grace has passed, independently at instalments
   * 1, 2 and 3.
   *
   * A learner with two overdue instalments is frozen once, not twice — the
   * freeze service is idempotent on the live automatic freeze, so the earliest
   * unpaid instalment is the one recorded as the trigger.
   */
  private async applyFreezes(asOfDate: string): Promise<number> {
    const graceDays = this.config.getNumber(CONFIG_KEYS.INSTALMENT_GRACE_DAYS);

    const candidates = await this.prisma.instalment.findMany({
      where: { state: { in: ['due', 'overdue'] } },
      orderBy: [{ dueOn: 'asc' }, { sequence: 'asc' }],
    });

    let frozen = 0;

    for (const instalment of candidates) {
      const dueOn = instalment.dueOn.toISOString().slice(0, 10);
      if (!shouldFreezeFor({ dueOn, paidAt: instalment.paidAt }, asOfDate, graceDays)) continue;

      // FR-PAY-019 again: never freeze without having sent the freeze-day
      // notice first. If the notice pass has not reached it — a first run on an
      // already-overdue account, say — the freeze waits for the next tick.
      const notices = (instalment.noticesSentJson as Record<string, string> | null) ?? {};
      if (!notices.freeze) {
        this.logger.warn({
          msg: 'Freeze deferred: the freeze notice has not gone out yet',
          instalmentId: instalment.id,
        });
        continue;
      }

      const result = await this.freeze.freezeForMissedInstalment(instalment.id);
      if (result) frozen += 1;
    }

    return frozen;
  }
}
