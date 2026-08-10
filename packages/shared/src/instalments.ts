/**
 * Instalment billing and the automatic freeze rule (§5 of the admin brief).
 *
 * Kept pure and free of database and clock access so the acceptance criterion
 * — "the instalment freeze rule is proven end-to-end by test" — can be checked
 * against the arithmetic itself rather than against a running system.
 *
 * §5.1 extends the SRS rather than replacing it: an instalment schedule hangs
 * off a subscription and reuses the FR-PAY-007 state machine. Nothing here
 * invents a parallel subscription lifecycle.
 */

import { MoneyError, applyPercent, roundHalfUpDiv, toXaf } from './money';

export type InstalmentPlanType = 'full' | 'three_instalments';

export interface PlannedInstalment {
  /** 1-based. §5.3 applies the freeze rule independently at each. */
  sequence: number;
  amountXaf: bigint;
  /** Calendar date in Africa/Douala, as `YYYY-MM-DD`. */
  dueOn: string;
}

export interface ScheduleInput {
  /** The plan's price for the period, before any pay-in-full discount. */
  totalXaf: bigint | number | string;
  planType: InstalmentPlanType;
  /** First due date — normally the enrolment date. `YYYY-MM-DD`. */
  startOn: string;
  /** CONFIG_KEYS.INSTALMENT_COUNT. Ignored for `full`. */
  count?: number;
  /** CONFIG_KEYS.INSTALMENT_INTERVAL_DAYS. */
  intervalDays?: number;
  /** CONFIG_KEYS.INSTALMENT_WEIGHTS — relative, so [2,1,1] front-loads. */
  weights?: readonly number[];
  /** CONFIG_KEYS.PAY_IN_FULL_DISCOUNT_PERCENT. Applies to `full` only. */
  payInFullDiscountPercent?: number;
}

export interface BuiltSchedule {
  planType: InstalmentPlanType;
  totalXaf: bigint;
  /** Q3: zero unless a pay-in-full discount has been configured. */
  discountXaf: bigint;
  /** What the payer actually owes across the schedule. */
  payableXaf: bigint;
  instalments: PlannedInstalment[];
}

/**
 * §5.1: "Instalment amounts sum exactly to the total fee. Rounding remainders
 * are allocated to the first instalment so the three always add up."
 *
 * Deliberately not `splitProportionally`, which spreads remainders by largest
 * remainder. Here the brief names the destination, and a payer reading their
 * schedule should see the odd franc in a predictable place.
 */
export function splitWithRemainderOnFirst(
  total: bigint,
  weights: readonly number[],
): bigint[] {
  if (weights.length === 0) return [];
  if (weights.some((w) => !Number.isFinite(w) || w < 0)) {
    throw new MoneyError('instalment weights must be finite and non-negative');
  }

  // Scale to integers so the division never touches a float.
  const scaled = weights.map((w) => BigInt(Math.round(w * 1_000_000)));
  const weightSum = scaled.reduce((a, b) => a + b, 0n);
  if (weightSum <= 0n) throw new MoneyError('instalment weights must not all be zero');

  // Every part but the first is rounded on its own; the first absorbs whatever
  // is left, which is what makes the sum exact by construction.
  const parts: bigint[] = new Array(weights.length).fill(0n);
  let allocatedAfterFirst = 0n;
  for (let i = 1; i < weights.length; i++) {
    const share = roundHalfUpDiv(total * (scaled[i] ?? 0n), weightSum);
    parts[i] = share;
    allocatedAfterFirst += share;
  }
  parts[0] = total - allocatedAfterFirst;

  if (parts[0] < 0n) {
    throw new MoneyError('instalment weights produced a negative first instalment');
  }

  const check = parts.reduce((a, b) => a + b, 0n);
  if (check !== total) {
    throw new MoneyError(`instalments did not reconcile: ${check} != ${total}`);
  }
  return parts;
}

/** Adds whole days to a `YYYY-MM-DD` calendar date, staying on calendar days. */
export function addDays(dateIso: string, days: number): string {
  const date = new Date(`${dateIso}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) throw new MoneyError(`invalid date: ${dateIso}`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function daysBetween(fromIso: string, toIso: string): number {
  const from = new Date(`${fromIso}T00:00:00.000Z`).getTime();
  const to = new Date(`${toIso}T00:00:00.000Z`).getTime();
  return Math.round((to - from) / 86_400_000);
}

/**
 * §5.1: builds the schedule the payer sees *before* they commit (UI-007).
 *
 * Pay-in-full is one instalment due immediately, not a special case elsewhere —
 * that keeps collections, freezing and reconciliation on a single code path.
 */
export function buildSchedule(input: ScheduleInput): BuiltSchedule {
  const total = toXaf(input.totalXaf);
  if (total < 0n) throw new MoneyError('a schedule total cannot be negative');

  if (input.planType === 'full') {
    const discount = applyPercent(total, input.payInFullDiscountPercent ?? 0);
    const payable = total - discount;
    return {
      planType: 'full',
      totalXaf: total,
      discountXaf: discount,
      payableXaf: payable,
      instalments: [{ sequence: 1, amountXaf: payable, dueOn: input.startOn }],
    };
  }

  const count = input.count ?? 3;
  if (!Number.isInteger(count) || count < 1) {
    throw new MoneyError(`instalment count must be a positive integer, got ${count}`);
  }

  const intervalDays = input.intervalDays ?? 30;
  const weights =
    input.weights && input.weights.length === count
      ? input.weights
      : new Array<number>(count).fill(1);

  const amounts = splitWithRemainderOnFirst(total, weights);

  return {
    planType: 'three_instalments',
    totalXaf: total,
    // §5.1: the discount is the reward for paying in full, so instalments do
    // not get it. Making that explicit here stops it drifting into the split.
    discountXaf: 0n,
    payableXaf: total,
    instalments: amounts.map((amountXaf, index) => ({
      sequence: index + 1,
      amountXaf,
      dueOn: addDays(input.startOn, index * intervalDays),
    })),
  };
}

// ---------------------------------------------------------------------------
// §5.3 — the automatic freeze rule
// ---------------------------------------------------------------------------

/**
 * §5.3: "if payment has not been received by due date + grace period ... the
 * system automatically sets the learner's account to frozen."
 */
export function freezeDateFor(dueOn: string, graceDays: number): string {
  if (!Number.isInteger(graceDays) || graceDays < 0) {
    throw new MoneyError(`grace days must be a non-negative integer, got ${graceDays}`);
  }
  return addDays(dueOn, graceDays);
}

export type NoticeKind = 'before' | 'due' | 'freeze';

export interface ScheduledNotice {
  kind: NoticeKind;
  /** Days before the due date, for a `before` notice. */
  daysBefore?: number;
  sendOn: string;
  /** Stable key, so a re-run of the job never sends the same notice twice. */
  key: string;
}

/**
 * FR-PAY-019 / §5.3: 7, 3 and 1 days before the due date, on the due date, and
 * on the freeze date. "A freeze must never be the first the payer hears of it."
 *
 * Returned in send order with a stable key per notice, because the sending job
 * is expected to run more than once for the same instalment.
 */
export function noticeSchedule(
  dueOn: string,
  graceDays: number,
  daysBefore: readonly number[] = [7, 3, 1],
): ScheduledNotice[] {
  const before = [...daysBefore]
    .filter((d) => Number.isInteger(d) && d > 0)
    .sort((a, b) => b - a)
    .map<ScheduledNotice>((days) => ({
      kind: 'before',
      daysBefore: days,
      sendOn: addDays(dueOn, -days),
      key: `before_${days}`,
    }));

  return [
    ...before,
    { kind: 'due', sendOn: dueOn, key: 'due' },
    { kind: 'freeze', sendOn: freezeDateFor(dueOn, graceDays), key: 'freeze' },
  ];
}

export type DerivedInstalmentState = 'scheduled' | 'due' | 'overdue' | 'paid' | 'cancelled';

/**
 * §5.2: scheduled -> due -> paid, or scheduled -> due -> overdue -> paid.
 *
 * `paid` and `cancelled` are facts, not derivations, so they short-circuit —
 * an instalment settled late does not fall back to overdue when re-evaluated.
 */
export function deriveInstalmentState(
  instalment: { dueOn: string; paidAt?: Date | null; cancelledAt?: Date | null },
  asOfDate: string,
): DerivedInstalmentState {
  if (instalment.paidAt) return 'paid';
  if (instalment.cancelledAt) return 'cancelled';
  const delta = daysBetween(instalment.dueOn, asOfDate);
  if (delta < 0) return 'scheduled';
  if (delta === 0) return 'due';
  return 'overdue';
}

/**
 * §5.3: the freeze decision for one instalment, on one day.
 *
 * The rule is deterministic and reversible by the payer in one tap, which is
 * what places it on the permitted side of the FR-AI-005 boundary. Anything
 * discretionary — waiving, extending, writing off — is not decided here.
 */
export function shouldFreezeFor(
  instalment: { dueOn: string; paidAt?: Date | null; cancelledAt?: Date | null },
  asOfDate: string,
  graceDays: number,
): boolean {
  if (instalment.paidAt || instalment.cancelledAt) return false;
  return daysBetween(freezeDateFor(instalment.dueOn, graceDays), asOfDate) >= 0;
}

/**
 * §5.4: what a frozen learner may still do.
 *
 * Held as data because it is enforced in three places — the API's entitlement
 * checks, the learner PWA's affordances, and the admin's confirmation dialog
 * that must state the consequence in plain language (UI-007).
 */
export const FROZEN_ALLOWED = [
  'auth.sign_in',
  'billing.view_balance',
  'billing.pay',
  'schedule.view',
  'invoice.view',
  'feedback.view_past',
  'support.contact',
] as const;

export const FROZEN_BLOCKED = [
  'session.join',
  'session.book',
  'assessment.start',
  'material.open',
  'homework.submit',
] as const;

export type FrozenCapability = (typeof FROZEN_ALLOWED)[number] | (typeof FROZEN_BLOCKED)[number];

export function isBlockedWhileFrozen(capability: string): boolean {
  return (FROZEN_BLOCKED as readonly string[]).includes(capability);
}
