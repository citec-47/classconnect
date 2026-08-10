import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../common/prisma.service';
import { AppError } from '../common/http-exception.filter';

/**
 * The double-entry ledger (FR-LDG-001/002).
 *
 * Append-only: there is no update and no delete on this service, and the
 * database refuses both to the application role regardless (DAT-005, migration
 * `20260805234522_append_only`). A correction is a compensating transaction,
 * which is why `reverse()` posts new legs rather than touching old ones.
 *
 * Every amount is a whole-franc bigint (CON-02). Direction is carried by the
 * `direction` column, never by the sign of the amount — the database has a
 * non-negative check that will reject the alternative.
 */

/**
 * The chart of accounts.
 *
 * Held as a closed union so a typo becomes a compile error rather than a
 * silently orphaned balance that nobody reconciles.
 */
export const LEDGER_ACCOUNTS = {
  /** Money actually held at a provider. One per method, so §4.7.6 can compare
   *  each against that provider's settlement report. */
  CASH_MTN_MOMO: 'cash:mtn_momo',
  CASH_ORANGE_MONEY: 'cash:orange_money',
  CASH_VISA: 'cash:visa',
  CASH_MASTERCARD: 'cash:mastercard',

  /** FR-ERN-001: collected but not yet earned. Revenue is recognised rateably
   *  across the billing period, so collection credits here, not to revenue. */
  DEFERRED_REVENUE: 'liability:deferred_revenue',
  RECOGNISED_REVENUE: 'revenue:recognised',

  /** What a learner owes: raised when a schedule is created, cleared on payment. */
  LEARNER_RECEIVABLE: 'asset:learner_receivable',

  PROVIDER_FEES: 'expense:provider_fees',
  TAX_PAYABLE: 'liability:tax_payable',

  /** FR-ERN-002: the teacher share of recognised revenue, accrued monthly. */
  TEACHER_POOL: 'liability:teacher_pool',
  TEACHER_PAYABLE: 'liability:teacher_payable',
  /** FR-ERN-004: never swept into platform revenue without a human decision. */
  UNALLOCATED_POOL: 'liability:unallocated_pool',

  PLATFORM_REVENUE: 'revenue:platform_share',
  REFUNDS: 'contra_revenue:refunds',
} as const;

export type LedgerAccount = (typeof LEDGER_ACCOUNTS)[keyof typeof LEDGER_ACCOUNTS];

export interface LedgerLeg {
  account: LedgerAccount;
  direction: 'debit' | 'credit';
  amountXaf: bigint;
}

export interface LedgerPosting {
  legs: LedgerLeg[];
  occurredAt: Date;
  /** Free-form provenance: payment id, payout id, period, learner id. */
  metadata?: Record<string, unknown>;
  /** Supply to make a posting idempotent across retries (CON-04). */
  txnId?: string;
}

@Injectable()
export class LedgerService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Posts one balanced transaction.
   *
   * The database has a deferred constraint trigger asserting the same identity,
   * so a caller that skips this method still cannot write an unbalanced
   * transaction. The check here exists to fail with a message that names the
   * imbalance rather than with a Postgres exception.
   */
  async post(posting: LedgerPosting, tx?: Prisma.TransactionClient): Promise<string> {
    const client = tx ?? this.prisma;
    const txnId = posting.txnId ?? randomUUID();

    if (posting.legs.length < 2) {
      throw new Error('a ledger transaction needs at least two legs (FR-LDG-002)');
    }

    const imbalance = posting.legs.reduce(
      (sum, leg) => sum + (leg.direction === 'debit' ? leg.amountXaf : -leg.amountXaf),
      0n,
    );
    if (imbalance !== 0n) {
      throw new Error(
        `ledger transaction does not balance: debits minus credits = ${imbalance} XAF (FR-LDG-002)`,
      );
    }
    if (posting.legs.some((leg) => leg.amountXaf < 0n)) {
      throw new Error('a ledger leg amount is never negative; use `direction` (CON-02)');
    }
    // A transaction of nothing balances trivially and records nothing useful,
    // so it is almost always a caller computing zero by accident.
    if (posting.legs.every((leg) => leg.amountXaf === 0n)) {
      throw new Error('a ledger transaction with only zero legs records nothing');
    }

    await client.ledgerEntry.createMany({
      data: posting.legs
        .filter((leg) => leg.amountXaf > 0n)
        .map((leg) => ({
          txnId,
          account: leg.account,
          direction: leg.direction,
          amountXaf: leg.amountXaf,
          occurredAt: posting.occurredAt,
          metadata: (posting.metadata ?? null) as never,
        })),
    });

    return txnId;
  }

  /**
   * FR-LDG-001: "Corrections are compensating entries, never edits."
   *
   * Reads the original transaction and posts its mirror image. The original
   * stays exactly as it was written, which is the whole point.
   */
  async reverse(
    originalTxnId: string,
    occurredAt: Date,
    reason: string,
    tx?: Prisma.TransactionClient,
  ): Promise<string> {
    const client = tx ?? this.prisma;
    const original = await client.ledgerEntry.findMany({ where: { txnId: originalTxnId } });
    if (original.length === 0) {
      throw AppError.notFound();
    }

    return this.post(
      {
        legs: original.map((entry) => ({
          account: entry.account as LedgerAccount,
          direction: entry.direction === 'debit' ? 'credit' : 'debit',
          amountXaf: entry.amountXaf,
        })),
        occurredAt,
        metadata: { reverses: originalTxnId, reason },
      },
      tx,
    );
  }

  /**
   * Signed balance of an account. Debits add, credits subtract, which is right
   * for asset and expense accounts; liability and revenue balances read as
   * negative and are negated by the caller that displays them.
   */
  async balance(account: LedgerAccount, upTo?: Date): Promise<bigint> {
    const rows = await this.prisma.ledgerEntry.groupBy({
      by: ['direction'],
      where: { account, ...(upTo ? { occurredAt: { lte: upTo } } : {}) },
      _sum: { amountXaf: true },
    });

    return rows.reduce((sum, row) => {
      const amount = row._sum.amountXaf ?? 0n;
      return row.direction === 'debit' ? sum + amount : sum - amount;
    }, 0n);
  }

  // -------------------------------------------------------------------------
  // The postings the admin surface produces. Each is named for the business
  // event rather than for its legs, so a reader can check the accounting
  // against the requirement without reconstructing the intent.
  // -------------------------------------------------------------------------

  private cashAccount(method: string): LedgerAccount {
    switch (method) {
      case 'mtn_momo':
        return LEDGER_ACCOUNTS.CASH_MTN_MOMO;
      case 'orange_money':
        return LEDGER_ACCOUNTS.CASH_ORANGE_MONEY;
      case 'visa':
        return LEDGER_ACCOUNTS.CASH_VISA;
      case 'mastercard':
        return LEDGER_ACCOUNTS.CASH_MASTERCARD;
      default:
        throw new Error(`no cash account for payment method ${method}`);
    }
  }

  /**
   * A learner payment succeeded.
   *
   * FR-ERN-001: the credit goes to deferred revenue. It becomes recognised
   * revenue rateably over the billing period, which is what the earnings
   * calculation reads — so a learner paying a year up front does not hand the
   * teachers who taught them in January the whole year's pool.
   */
  async recordCollection(
    input: {
      paymentId: string;
      method: string;
      amountXaf: bigint;
      feeXaf: bigint;
      taxXaf: bigint;
      occurredAt: Date;
      learnerId?: string;
      instalmentId?: string;
    },
    tx?: Prisma.TransactionClient,
  ): Promise<string> {
    const net = input.amountXaf - input.feeXaf;
    const legs: LedgerLeg[] = [
      // What actually landed at the provider, after they took their cut.
      { account: this.cashAccount(input.method), direction: 'debit', amountXaf: net },
      { account: LEDGER_ACCOUNTS.PROVIDER_FEES, direction: 'debit', amountXaf: input.feeXaf },
      { account: LEDGER_ACCOUNTS.DEFERRED_REVENUE, direction: 'credit', amountXaf: input.amountXaf },
    ];

    if (input.taxXaf > 0n) {
      // Tax collected on the payer's behalf is a liability, not revenue.
      legs.push(
        { account: LEDGER_ACCOUNTS.DEFERRED_REVENUE, direction: 'debit', amountXaf: input.taxXaf },
        { account: LEDGER_ACCOUNTS.TAX_PAYABLE, direction: 'credit', amountXaf: input.taxXaf },
      );
    }

    return this.post(
      {
        legs,
        occurredAt: input.occurredAt,
        metadata: {
          event: 'collection',
          paymentId: input.paymentId,
          learnerId: input.learnerId,
          instalmentId: input.instalmentId,
        },
      },
      tx,
    );
  }

  /** FR-ERN-001: deferred revenue earned in a period becomes recognised. */
  async recogniseRevenue(
    input: { amountXaf: bigint; period: string; occurredAt: Date },
    tx?: Prisma.TransactionClient,
  ): Promise<string> {
    return this.post(
      {
        legs: [
          {
            account: LEDGER_ACCOUNTS.DEFERRED_REVENUE,
            direction: 'debit',
            amountXaf: input.amountXaf,
          },
          {
            account: LEDGER_ACCOUNTS.RECOGNISED_REVENUE,
            direction: 'credit',
            amountXaf: input.amountXaf,
          },
        ],
        occurredAt: input.occurredAt,
        metadata: { event: 'revenue_recognised', period: input.period },
      },
      tx,
    );
  }

  /**
   * FR-ERN-002/004: the monthly pool is accrued and immediately apportioned.
   *
   * The teacher-payable and unallocated legs must sum to the pool, which is the
   * ledger's own statement of the acceptance criterion that "the sum of all
   * teacher shares plus the unallocated account equals the pool exactly".
   */
  async accruePool(
    input: {
      period: string;
      poolXaf: bigint;
      teacherPayableXaf: bigint;
      unallocatedXaf: bigint;
      occurredAt: Date;
    },
    tx?: Prisma.TransactionClient,
  ): Promise<string> {
    if (input.teacherPayableXaf + input.unallocatedXaf !== input.poolXaf) {
      throw new Error(
        `pool accrual does not reconcile: teachers ${input.teacherPayableXaf} + ` +
          `unallocated ${input.unallocatedXaf} != pool ${input.poolXaf} (FR-ERN-004)`,
      );
    }

    return this.post(
      {
        legs: [
          { account: LEDGER_ACCOUNTS.TEACHER_POOL, direction: 'debit', amountXaf: input.poolXaf },
          {
            account: LEDGER_ACCOUNTS.TEACHER_PAYABLE,
            direction: 'credit',
            amountXaf: input.teacherPayableXaf,
          },
          {
            account: LEDGER_ACCOUNTS.UNALLOCATED_POOL,
            direction: 'credit',
            amountXaf: input.unallocatedXaf,
          },
        ],
        occurredAt: input.occurredAt,
        metadata: { event: 'pool_accrued', period: input.period },
      },
      tx,
    );
  }

  /** FR-ERN-008: money out to a teacher, net of withholding. */
  async recordPayout(
    input: {
      payoutId: string;
      teacherId: string;
      method: string;
      grossXaf: bigint;
      taxWithheldXaf: bigint;
      providerFeeXaf: bigint;
      occurredAt: Date;
    },
    tx?: Prisma.TransactionClient,
  ): Promise<string> {
    const cashOut = input.grossXaf - input.taxWithheldXaf;
    const legs: LedgerLeg[] = [
      { account: LEDGER_ACCOUNTS.TEACHER_PAYABLE, direction: 'debit', amountXaf: input.grossXaf },
      { account: this.cashAccount(input.method), direction: 'credit', amountXaf: cashOut },
    ];

    if (input.taxWithheldXaf > 0n) {
      legs.push({
        account: LEDGER_ACCOUNTS.TAX_PAYABLE,
        direction: 'credit',
        amountXaf: input.taxWithheldXaf,
      });
    }
    if (input.providerFeeXaf > 0n) {
      // The fee for sending the money is the platform's cost, not the teacher's,
      // so it does not reduce what the teacher receives.
      legs.push(
        {
          account: LEDGER_ACCOUNTS.PROVIDER_FEES,
          direction: 'debit',
          amountXaf: input.providerFeeXaf,
        },
        {
          account: this.cashAccount(input.method),
          direction: 'credit',
          amountXaf: input.providerFeeXaf,
        },
      );
    }

    return this.post(
      {
        legs,
        occurredAt: input.occurredAt,
        metadata: {
          event: 'payout',
          payoutId: input.payoutId,
          teacherId: input.teacherId,
        },
      },
      tx,
    );
  }

  /**
   * FR-PAY-017: a refund reverses the collection correctly.
   *
   * Not `reverse()` of the original transaction: a partial refund is legitimate,
   * and the provider fee on the original collection is generally not returned.
   * It is posted as its own event against a contra-revenue account so gross
   * revenue and refunds both stay visible on the §4.1 money row.
   */
  async recordRefund(
    input: {
      refundPaymentId: string;
      originalPaymentId: string;
      method: string;
      amountXaf: bigint;
      occurredAt: Date;
      reason: string;
    },
    tx?: Prisma.TransactionClient,
  ): Promise<string> {
    return this.post(
      {
        legs: [
          { account: LEDGER_ACCOUNTS.REFUNDS, direction: 'debit', amountXaf: input.amountXaf },
          {
            account: this.cashAccount(input.method),
            direction: 'credit',
            amountXaf: input.amountXaf,
          },
        ],
        occurredAt: input.occurredAt,
        metadata: {
          event: 'refund',
          refundPaymentId: input.refundPaymentId,
          originalPaymentId: input.originalPaymentId,
          reason: input.reason,
        },
      },
      tx,
    );
  }

  /** FR-ERN-004: an Admin decided what becomes of an unallocated balance. */
  async settleUnallocated(
    input: {
      period: string;
      amountXaf: bigint;
      decision: 'released_to_teachers' | 'retained_by_platform' | 'carried_forward';
      decidedBy: string;
      reason: string;
      occurredAt: Date;
    },
    tx?: Prisma.TransactionClient,
  ): Promise<string | null> {
    // Carrying forward leaves the balance where it is; there is no movement to
    // record, only the decision, which the audit log already holds.
    if (input.decision === 'carried_forward') return null;

    const destination =
      input.decision === 'released_to_teachers'
        ? LEDGER_ACCOUNTS.TEACHER_PAYABLE
        : LEDGER_ACCOUNTS.PLATFORM_REVENUE;

    return this.post(
      {
        legs: [
          {
            account: LEDGER_ACCOUNTS.UNALLOCATED_POOL,
            direction: 'debit',
            amountXaf: input.amountXaf,
          },
          { account: destination, direction: 'credit', amountXaf: input.amountXaf },
        ],
        occurredAt: input.occurredAt,
        metadata: {
          event: 'unallocated_settled',
          period: input.period,
          decision: input.decision,
          decidedBy: input.decidedBy,
          reason: input.reason,
        },
      },
      tx,
    );
  }
}
