/**
 * Teacher earnings (§4.7.5 of the admin brief, FR-ERN-001..006).
 *
 * The acceptance criterion this module exists to satisfy:
 *
 *   "Teacher earnings reconcile: pool = 60% of recognised revenue, distributed
 *    by attended minutes, and the sum of all teacher shares plus the unallocated
 *    account equals the pool exactly, to the franc, with no rounding drift."
 *
 * OI-02 leaves the 60/40 split, its basis, and the session-type weights
 * commercially unresolved. Every one of them is therefore an argument here, and
 * `configVersion` stamps the values actually used onto the result so a
 * historical calculation stays reproducible after the configuration moves.
 *
 * Pure by design: no clock, no database, no configuration lookup. Everything it
 * needs is passed in, so the reconciliation can be tested directly.
 */

import { MoneyError, applyPercent, splitProportionally } from './money';

/** FR-ERN-002: the split is taken on gross revenue, or net of fees and tax. */
export type PoolBasis = 'gross' | 'net_of_fees_and_tax';

export interface PoolConfig {
  /** FR-ERN-002 — 60 by default, unresolved by OI-02. */
  teacherPoolPercent: number;
  /** FR-ERN-002 requires this to be one explicit, auditable value. */
  basis: PoolBasis;
  /** FR-ERN-003 — one-to-one and group session weights. */
  oneToOneFactor: number;
  groupFactor: number;
  /** FR-ERN-005 — teacher presence threshold for a session to count. */
  minPresencePercent: number;
}

/**
 * A human-readable fingerprint of the configuration a calculation used.
 *
 * Deliberately readable rather than a hash: when Finance asks in eighteen months
 * why a 2026-03 payout differs from a 2026-09 one, the answer should be legible
 * in the earnings row itself without a lookup table.
 */
export function configVersion(config: PoolConfig): string {
  return [
    `pool=${config.teacherPoolPercent}`,
    `basis=${config.basis}`,
    `o2o=${config.oneToOneFactor}`,
    `grp=${config.groupFactor}`,
    `presence=${config.minPresencePercent}`,
  ].join(';');
}

// ---------------------------------------------------------------------------
// Step 1 — the pool
// ---------------------------------------------------------------------------

export interface RevenueInput {
  /**
   * FR-ERN-001: revenue *recognised* in the period, not revenue collected in it.
   * A learner who pays a year up front recognises one twelfth each month.
   */
  recognisedRevenueXaf: bigint;
  /** Payment-provider fees attributable to that revenue. */
  providerFeesXaf: bigint;
  /** Tax attributable to that revenue (OI-07). */
  taxXaf: bigint;
}

/**
 * FR-ERN-002: the teacher pool for one calendar month.
 *
 * The remaining percentage is retained by the platform. Both are configurable
 * and neither is written into this code.
 */
export function computePool(revenue: RevenueInput, config: PoolConfig): bigint {
  if (revenue.recognisedRevenueXaf < 0n) {
    throw new MoneyError('recognised revenue cannot be negative');
  }
  if (config.teacherPoolPercent < 0 || config.teacherPoolPercent > 100) {
    throw new MoneyError(
      `teacher pool percent must be between 0 and 100, got ${config.teacherPoolPercent}`,
    );
  }

  const base =
    config.basis === 'gross'
      ? revenue.recognisedRevenueXaf
      : revenue.recognisedRevenueXaf - revenue.providerFeesXaf - revenue.taxXaf;

  // Fees exceeding the revenue they came from would make the pool negative,
  // which is a data fault rather than a business outcome worth modelling.
  if (base < 0n) {
    throw new MoneyError(
      `pool basis is negative: revenue ${revenue.recognisedRevenueXaf} less fees ` +
        `${revenue.providerFeesXaf} and tax ${revenue.taxXaf}`,
    );
  }

  return applyPercent(base, config.teacherPoolPercent);
}

// ---------------------------------------------------------------------------
// Step 2 — distribution
// ---------------------------------------------------------------------------

export type SessionType = 'one_to_one' | 'group';

/** One teacher's verified attendance against one learner, in one period. */
export interface AttributedMinutes {
  teacherId: string;
  sessionType: SessionType;
  /**
   * FR-LIV-014 / SI-005: verified against the media server's join/leave events.
   * Never a teacher's self-report.
   */
  attendedMinutes: number;
}

export interface LearnerContribution {
  learnerId: string;
  /** What this learner recognised in the period — their weight in the pool. */
  recognisedRevenueXaf: bigint;
  /** Empty where the learner attended nothing (FR-ERN-004). */
  attribution: AttributedMinutes[];
}

export interface TeacherShare {
  teacherId: string;
  amountXaf: bigint;
  attendedMinutes: number;
  oneToOneMinutes: number;
  groupMinutes: number;
  /** FR-ERN-006: which learners produced this figure. */
  fromLearners: { learnerId: string; amountXaf: bigint; attendedMinutes: number }[];
}

export interface UnallocatedShare {
  learnerId: string;
  amountXaf: bigint;
  reason: 'no_attendance';
}

export interface Distribution {
  poolXaf: bigint;
  teacherShares: TeacherShare[];
  /** FR-ERN-004: never silently swept into platform revenue. */
  unallocatedXaf: bigint;
  unallocated: UnallocatedShare[];
  configVersion: string;
}

/**
 * FR-ERN-005 / FR-SCH-012: does this session count toward earnings at all?
 *
 * Either the teacher was present for at least the configured share of the
 * scheduled duration, or the learner failed to appear after the teacher waited
 * the required period — a teacher who turned up is paid for turning up.
 */
export function sessionCountsTowardEarnings(
  session: {
    scheduledMinutes: number;
    teacherPresentMinutes: number;
    status: string;
  },
  minPresencePercent: number,
): boolean {
  if (session.status === 'no_show_learner') return true;
  if (session.scheduledMinutes <= 0) return false;
  const presence = (session.teacherPresentMinutes / session.scheduledMinutes) * 100;
  return presence >= minPresencePercent;
}

/** Scaled to an integer so no weight arithmetic ever touches a float. */
function weightOf(entry: AttributedMinutes, config: PoolConfig): bigint {
  const factor = entry.sessionType === 'one_to_one' ? config.oneToOneFactor : config.groupFactor;
  if (!Number.isFinite(factor) || factor < 0) {
    throw new MoneyError(`session type factor must be finite and non-negative, got ${factor}`);
  }
  if (!Number.isInteger(entry.attendedMinutes) || entry.attendedMinutes < 0) {
    throw new MoneyError(`attended minutes must be a non-negative integer`);
  }
  return BigInt(entry.attendedMinutes) * BigInt(Math.round(factor * 1_000_000));
}

/**
 * FR-ERN-003/004: distributes the pool.
 *
 * Two nested proportional splits, each using the largest-remainder allocation in
 * `money.ts` so that every level sums exactly:
 *
 *   1. the pool across learners, by the revenue each learner recognised;
 *   2. each learner's share across the teachers who taught them, by verified
 *      attended minutes weighted by session type.
 *
 * A learner with no attendance keeps their share intact and it goes to the
 * unallocated account for an Admin decision. The function asserts the identity
 * `sum(teacher shares) + unallocated == pool` before returning, so a rounding
 * drift is an exception rather than a slow leak.
 */
export function distributePool(
  poolXaf: bigint,
  learners: readonly LearnerContribution[],
  config: PoolConfig,
): Distribution {
  const version = configVersion(config);

  if (poolXaf < 0n) throw new MoneyError('the teacher pool cannot be negative');
  if (learners.length === 0) {
    // Nothing was recognised, so there is nothing to apportion. A non-zero pool
    // with no learners would mean the caller mismatched the two inputs.
    if (poolXaf !== 0n) {
      throw new MoneyError(`pool of ${poolXaf} XAF has no learners to apportion against`);
    }
    return {
      poolXaf: 0n,
      teacherShares: [],
      unallocatedXaf: 0n,
      unallocated: [],
      configVersion: version,
    };
  }

  const learnerShares = splitProportionally(
    poolXaf,
    learners.map((l) => l.recognisedRevenueXaf),
  );

  const byTeacher = new Map<string, TeacherShare>();
  const unallocated: UnallocatedShare[] = [];
  let unallocatedXaf = 0n;

  learners.forEach((learner, index) => {
    const learnerShare = learnerShares[index] ?? 0n;

    const eligible = learner.attribution.filter((a) => a.attendedMinutes > 0);
    const weights = eligible.map((entry) => weightOf(entry, config));
    const totalWeight = weights.reduce((a, b) => a + b, 0n);

    // FR-ERN-004: no attendance means the share is held, not redistributed and
    // not retained. Zero-weight configuration lands here too, deliberately —
    // silently keeping the money would be the one outcome the requirement bars.
    if (eligible.length === 0 || totalWeight === 0n) {
      if (learnerShare > 0n) {
        unallocated.push({
          learnerId: learner.learnerId,
          amountXaf: learnerShare,
          reason: 'no_attendance',
        });
        unallocatedXaf += learnerShare;
      }
      return;
    }

    const teacherAmounts = splitProportionally(learnerShare, weights);

    eligible.forEach((entry, entryIndex) => {
      const amount = teacherAmounts[entryIndex] ?? 0n;
      const existing = byTeacher.get(entry.teacherId) ?? {
        teacherId: entry.teacherId,
        amountXaf: 0n,
        attendedMinutes: 0,
        oneToOneMinutes: 0,
        groupMinutes: 0,
        fromLearners: [],
      };

      existing.amountXaf += amount;
      existing.attendedMinutes += entry.attendedMinutes;
      if (entry.sessionType === 'one_to_one') {
        existing.oneToOneMinutes += entry.attendedMinutes;
      } else {
        existing.groupMinutes += entry.attendedMinutes;
      }

      // FR-ERN-006: a teacher must be able to ask "why this number?", so the
      // per-learner contribution is kept rather than only the total.
      const from = existing.fromLearners.find((f) => f.learnerId === learner.learnerId);
      if (from) {
        from.amountXaf += amount;
        from.attendedMinutes += entry.attendedMinutes;
      } else {
        existing.fromLearners.push({
          learnerId: learner.learnerId,
          amountXaf: amount,
          attendedMinutes: entry.attendedMinutes,
        });
      }

      byTeacher.set(entry.teacherId, existing);
    });
  });

  const teacherShares = [...byTeacher.values()].sort((a, b) =>
    a.teacherId < b.teacherId ? -1 : a.teacherId > b.teacherId ? 1 : 0,
  );

  const distributed = teacherShares.reduce((sum, share) => sum + share.amountXaf, 0n);
  if (distributed + unallocatedXaf !== poolXaf) {
    throw new MoneyError(
      `earnings did not reconcile: teachers ${distributed} + unallocated ` +
        `${unallocatedXaf} != pool ${poolXaf}`,
    );
  }

  return {
    poolXaf,
    teacherShares,
    unallocatedXaf,
    unallocated,
    configVersion: version,
  };
}

// ---------------------------------------------------------------------------
// Step 3 — deductions
// ---------------------------------------------------------------------------

export interface Deductions {
  providerFeeXaf: bigint;
  taxWithheldXaf: bigint;
  totalXaf: bigint;
}

/**
 * §4.7.3: gross earnings, less provider fee and tax withholding, gives net paid.
 * OI-07 leaves the withholding rate open, so it defaults to zero rather than to
 * a guess that would silently short a teacher.
 */
export function computeDeductions(
  grossXaf: bigint,
  options: { taxWithholdingPercent: number; providerFeeXaf?: bigint },
): Deductions {
  const providerFeeXaf = options.providerFeeXaf ?? 0n;
  const taxWithheldXaf = applyPercent(grossXaf, options.taxWithholdingPercent);
  const totalXaf = providerFeeXaf + taxWithheldXaf;

  if (totalXaf > grossXaf) {
    throw new MoneyError(
      `deductions of ${totalXaf} XAF exceed gross earnings of ${grossXaf} XAF`,
    );
  }

  return { providerFeeXaf, taxWithheldXaf, totalXaf };
}

export function netPayable(grossXaf: bigint, deductions: Deductions): bigint {
  return grossXaf - deductions.totalXaf;
}

// ---------------------------------------------------------------------------
// Payout eligibility — §4.7.4, FR-ERN-010
// ---------------------------------------------------------------------------

export type PayoutBlockReason =
  | 'wallet_unverified'
  | 'kyc_incomplete'
  | 'teacher_suspended'
  | 'below_minimum'
  | 'nothing_payable';

export interface PayoutCandidate {
  walletVerified: boolean;
  kycComplete: boolean;
  suspended: boolean;
  netPayableXaf: bigint;
  minimumXaf: bigint;
}

/**
 * FR-ERN-010: "a payout must not execute to an unverified wallet, to a suspended
 * teacher, or where KYC is incomplete."
 *
 * Returns every reason rather than the first, because §4.7.4 requires the row to
 * "show the specific blocking reason ... do not just grey out the button" — and
 * an admin fixing one blocker should not discover the next one at the next click.
 */
export function payoutBlockers(candidate: PayoutCandidate): PayoutBlockReason[] {
  const blockers: PayoutBlockReason[] = [];
  if (!candidate.walletVerified) blockers.push('wallet_unverified');
  if (!candidate.kycComplete) blockers.push('kyc_incomplete');
  if (candidate.suspended) blockers.push('teacher_suspended');
  if (candidate.netPayableXaf <= 0n) blockers.push('nothing_payable');
  else if (candidate.netPayableXaf < candidate.minimumXaf) blockers.push('below_minimum');
  return blockers;
}

export function payoutAllowed(candidate: PayoutCandidate): boolean {
  return payoutBlockers(candidate).length === 0;
}
