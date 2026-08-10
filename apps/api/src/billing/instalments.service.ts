import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { Prisma } from '@prisma/client';
import {
  CONFIG_KEYS,
  buildSchedule,
  freezeDateFor,
  noticeSchedule,
  type InstalmentPlanType,
} from '@classconnect/shared';
import { PrismaService } from '../common/prisma.service';
import { PlatformConfigService } from '../common/platform-config.service';
import { AppError } from '../common/http-exception.filter';
import { AuditService } from '../audit/audit.service';
import { LedgerService } from './ledger.service';

/**
 * Instalment schedules (§5.1/§5.2 of the admin brief).
 *
 * A schedule hangs off a subscription and reuses the FR-PAY-007 lifecycle. The
 * arithmetic lives in `@classconnect/shared/instalments` so it can be tested
 * without a database; this service is the part that persists it, applies
 * payments to it, and keeps the ledger in step.
 */
@Injectable()
export class InstalmentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: PlatformConfigService,
    private readonly audit: AuditService,
    private readonly ledger: LedgerService,
  ) {}

  /** The configuration the schedule builder reads, in one place. */
  private scheduleConfig() {
    return {
      count: this.config.getNumber(CONFIG_KEYS.INSTALMENT_COUNT),
      intervalDays: this.config.getNumber(CONFIG_KEYS.INSTALMENT_INTERVAL_DAYS),
      weights: this.config.get<number[]>(CONFIG_KEYS.INSTALMENT_WEIGHTS),
      graceDays: this.config.getNumber(CONFIG_KEYS.INSTALMENT_GRACE_DAYS),
      noticeDaysBefore: this.config.get<number[]>(CONFIG_KEYS.INSTALMENT_NOTICE_DAYS_BEFORE),
      discountPercent: this.config.getNumber(CONFIG_KEYS.PAY_IN_FULL_DISCOUNT_PERCENT),
    };
  }

  /**
   * §5.1: what the payer is shown *before* they commit (UI-007).
   *
   * A preview writes nothing, so both options can be priced side by side and the
   * pay-in-full saving is visible rather than asserted.
   */
  previewOptions(totalXaf: bigint, startOn: string) {
    const cfg = this.scheduleConfig();

    const full = buildSchedule({
      totalXaf,
      planType: 'full',
      startOn,
      payInFullDiscountPercent: cfg.discountPercent,
    });

    const instalments = buildSchedule({
      totalXaf,
      planType: 'three_instalments',
      startOn,
      count: cfg.count,
      intervalDays: cfg.intervalDays,
      weights: cfg.weights,
    });

    return {
      full: this.serialiseSchedule(full, cfg.graceDays),
      instalments: this.serialiseSchedule(instalments, cfg.graceDays),
      graceDays: cfg.graceDays,
      noticeDaysBefore: cfg.noticeDaysBefore,
    };
  }

  private serialiseSchedule(
    schedule: ReturnType<typeof buildSchedule>,
    graceDays: number,
  ) {
    return {
      planType: schedule.planType,
      totalXaf: schedule.totalXaf.toString(),
      discountXaf: schedule.discountXaf.toString(),
      payableXaf: schedule.payableXaf.toString(),
      instalments: schedule.instalments.map((part) => ({
        sequence: part.sequence,
        amountXaf: part.amountXaf.toString(),
        dueOn: part.dueOn,
        // §5.3: the payer sees the freeze date at the moment they commit, not
        // for the first time on the day it happens.
        freezesOn: freezeDateFor(part.dueOn, graceDays),
      })),
    };
  }

  /**
   * Creates the schedule for a subscription.
   *
   * The database asserts that the parts sum to the total (`instalments_sum_to_total`),
   * so a drift fails the transaction rather than under-billing quietly.
   */
  async createSchedule(input: {
    subscriptionId: string;
    totalXaf: bigint;
    planType: InstalmentPlanType;
    startOn: string;
    actorId?: string;
  }) {
    const existing = await this.prisma.paymentSchedule.findUnique({
      where: { subscriptionId: input.subscriptionId },
    });
    if (existing) throw AppError.conflict('errors.instalment.schedule_exists');

    const cfg = this.scheduleConfig();
    const built = buildSchedule({
      totalXaf: input.totalXaf,
      planType: input.planType,
      startOn: input.startOn,
      count: cfg.count,
      intervalDays: cfg.intervalDays,
      weights: cfg.weights,
      payInFullDiscountPercent: cfg.discountPercent,
    });

    const schedule = await this.prisma.$transaction(async (tx) => {
      const created = await tx.paymentSchedule.create({
        data: {
          id: randomUUID(),
          subscriptionId: input.subscriptionId,
          planType: built.planType,
          totalXaf: built.totalXaf,
          discountXaf: built.discountXaf,
          instalments: {
            create: built.instalments.map((part) => ({
              id: randomUUID(),
              sequence: part.sequence,
              amountXaf: part.amountXaf,
              dueOn: new Date(`${part.dueOn}T00:00:00.000Z`),
              // The first part is payable the moment the schedule exists.
              state: part.sequence === 1 ? 'due' : 'scheduled',
            })),
          },
        },
        include: { instalments: { orderBy: { sequence: 'asc' } } },
      });

      // The learner now owes the whole payable amount; each collection clears
      // part of it. Raising it up front is what makes §4.7.2's "outstanding"
      // column a ledger fact rather than a subtraction done in the UI.
      await this.ledger.post(
        {
          legs: [
            {
              account: 'asset:learner_receivable',
              direction: 'debit',
              amountXaf: built.payableXaf,
            },
            {
              account: 'liability:deferred_revenue',
              direction: 'credit',
              amountXaf: built.payableXaf,
            },
          ],
          occurredAt: new Date(),
          metadata: {
            event: 'schedule_created',
            subscriptionId: input.subscriptionId,
            planType: built.planType,
          },
        },
        tx,
      );

      return created;
    });

    await this.audit.record({
      action: 'billing.schedule_created',
      entity: 'payment_schedule',
      entityId: schedule.id,
      actorId: input.actorId ?? null,
      after: {
        planType: schedule.planType,
        totalXaf: schedule.totalXaf.toString(),
        instalments: schedule.instalments.map((i) => ({
          sequence: i.sequence,
          amountXaf: i.amountXaf.toString(),
          dueOn: i.dueOn.toISOString().slice(0, 10),
        })),
      },
    });

    return schedule;
  }

  /**
   * Applies a successful payment to the earliest unpaid instalment.
   *
   * §5.3: "On payment, the account unfreezes immediately and automatically."
   * The unfreeze is not done here — it belongs to the freeze service, which the
   * caller invokes with the instalment this returns. Keeping the two apart
   * stops a payment path from ever lifting a *manual* freeze by accident.
   */
  async applyPayment(input: {
    subscriptionId: string;
    paymentId: string;
    amountXaf: bigint;
    paidAt: Date;
    tx?: Prisma.TransactionClient;
  }): Promise<{ instalmentIds: string[]; scheduleSettled: boolean }> {
    const client = input.tx ?? this.prisma;

    const schedule = await client.paymentSchedule.findUnique({
      where: { subscriptionId: input.subscriptionId },
      include: { instalments: { orderBy: { sequence: 'asc' } } },
    });
    if (!schedule) return { instalmentIds: [], scheduleSettled: false };

    const unpaid = schedule.instalments.filter(
      (i) => i.state !== 'paid' && i.state !== 'cancelled',
    );
    if (unpaid.length === 0) throw AppError.conflict('errors.instalment.already_paid');

    // Payments land on instalments oldest first, and one payment may clear more
    // than one part. Anything left over is a settle-in-full.
    let remaining = input.amountXaf;
    const settled: string[] = [];

    for (const instalment of unpaid) {
      if (remaining < instalment.amountXaf) break;
      remaining -= instalment.amountXaf;
      settled.push(instalment.id);
    }

    if (settled.length > 0) {
      await client.instalment.updateMany({
        where: { id: { in: settled } },
        data: { state: 'paid', paidAt: input.paidAt, paymentId: input.paymentId },
      });
    }

    // §5.1: "A learner on instalments may pay off the remaining balance in full
    // at any time, which clears all future instalments." A payment that covers
    // everything still outstanding does exactly that.
    const stillOwing = unpaid.filter((i) => !settled.includes(i.id));
    const scheduleSettled = stillOwing.length === 0;

    if (scheduleSettled) {
      await client.paymentSchedule.update({
        where: { id: schedule.id },
        data: { settledInFullAt: input.paidAt },
      });
    }

    return { instalmentIds: settled, scheduleSettled };
  }

  /**
   * §5.1: settle the whole remaining balance in one payment.
   *
   * Cancels the future parts rather than marking them paid, because they were
   * never collected individually and a receipt against them would be a fiction.
   */
  async settleInFull(input: {
    subscriptionId: string;
    paymentId: string;
    paidAt: Date;
    actorId?: string;
  }) {
    const schedule = await this.prisma.paymentSchedule.findUnique({
      where: { subscriptionId: input.subscriptionId },
      include: { instalments: { orderBy: { sequence: 'asc' } } },
    });
    if (!schedule) throw AppError.notFound();

    const outstanding = schedule.instalments.filter(
      (i) => i.state !== 'paid' && i.state !== 'cancelled',
    );
    if (outstanding.length === 0) throw AppError.conflict('errors.instalment.already_paid');

    const [first, ...rest] = outstanding;

    await this.prisma.$transaction(async (tx) => {
      await tx.instalment.update({
        where: { id: first!.id },
        data: { state: 'paid', paidAt: input.paidAt, paymentId: input.paymentId },
      });
      if (rest.length > 0) {
        await tx.instalment.updateMany({
          where: { id: { in: rest.map((i) => i.id) } },
          data: { state: 'cancelled' },
        });
      }
      await tx.paymentSchedule.update({
        where: { id: schedule.id },
        data: { settledInFullAt: input.paidAt },
      });
    });

    await this.audit.record({
      action: 'billing.schedule_settled',
      entity: 'payment_schedule',
      entityId: schedule.id,
      actorId: input.actorId ?? null,
      after: { settledInFullAt: input.paidAt, clearedInstalments: rest.length },
    });

    return { clearedInstalments: rest.length };
  }

  /** §4.7.2: the collections view of one learner's schedule. */
  async scheduleFor(subscriptionId: string) {
    const graceDays = this.config.getNumber(CONFIG_KEYS.INSTALMENT_GRACE_DAYS);
    const noticeDays = this.config.get<number[]>(CONFIG_KEYS.INSTALMENT_NOTICE_DAYS_BEFORE);

    const schedule = await this.prisma.paymentSchedule.findUnique({
      where: { subscriptionId },
      include: { instalments: { orderBy: { sequence: 'asc' } } },
    });
    if (!schedule) return null;

    return {
      id: schedule.id,
      planType: schedule.planType,
      totalXaf: schedule.totalXaf.toString(),
      discountXaf: schedule.discountXaf.toString(),
      settledInFullAt: schedule.settledInFullAt,
      instalments: schedule.instalments.map((instalment) => {
        const dueOn = instalment.dueOn.toISOString().slice(0, 10);
        return {
          id: instalment.id,
          sequence: instalment.sequence,
          amountXaf: instalment.amountXaf.toString(),
          dueOn,
          freezesOn: freezeDateFor(dueOn, graceDays),
          state: instalment.state,
          paidAt: instalment.paidAt,
          // FR-PAY-019: the trail that must precede any freeze.
          notices: noticeSchedule(dueOn, graceDays, noticeDays).map((notice) => ({
            ...notice,
            sent: Boolean(
              (instalment.noticesSentJson as Record<string, string> | null)?.[notice.key],
            ),
          })),
        };
      }),
    };
  }
}
