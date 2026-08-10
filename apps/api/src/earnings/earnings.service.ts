import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import {
  CONFIG_KEYS,
  computeDeductions,
  computePool,
  configVersion,
  distributePool,
  netPayable,
  roundHalfUpDiv,
  sessionCountsTowardEarnings,
  type LearnerContribution,
  type PoolBasis,
  type PoolConfig,
} from '@classconnect/shared';
import { PrismaService } from '../common/prisma.service';
import { PlatformConfigService } from '../common/platform-config.service';
import { AppError } from '../common/http-exception.filter';
import { AuditService } from '../audit/audit.service';
import { LedgerService } from '../billing/ledger.service';

/**
 * Teacher earnings for one accrual period (§4.7.5, FR-ERN-001..006).
 *
 * The arithmetic is in `@classconnect/shared/earnings` and is pure. This service
 * supplies it with three things the database knows and it does not:
 *
 *   1. revenue *recognised* in the period, per learner (FR-ERN-001) — not
 *      revenue collected, which is a different number whenever anyone pays
 *      annually or in instalments;
 *   2. verified attended minutes from the media server's join/leave events
 *      (FR-LIV-014, SI-005) — never a teacher's self-report;
 *   3. which of those minutes are eligible (FR-ERN-005, and §5.4's rule that
 *      frozen minutes do not accrue).
 *
 * OI-02: the split, its basis and the session weights are read here, at
 * calculation time, and written onto every earnings row.
 */
@Injectable()
export class EarningsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: PlatformConfigService,
    private readonly audit: AuditService,
    private readonly ledger: LedgerService,
  ) {}

  /** OI-02: read once per calculation, so one run cannot straddle a config change. */
  private poolConfig(): PoolConfig {
    return {
      teacherPoolPercent: this.config.getNumber(CONFIG_KEYS.TEACHER_POOL_PERCENT),
      basis: this.config.getString(CONFIG_KEYS.TEACHER_POOL_BASIS) as PoolBasis,
      oneToOneFactor: this.config.getNumber(CONFIG_KEYS.SESSION_TYPE_FACTOR_ONE_TO_ONE),
      groupFactor: this.config.getNumber(CONFIG_KEYS.SESSION_TYPE_FACTOR_GROUP),
      minPresencePercent: this.config.getNumber(CONFIG_KEYS.EARNING_MIN_PRESENCE_PERCENT),
    };
  }

  /** `YYYY-MM` to the UTC half-open interval that period covers. */
  private periodBounds(period: string): { start: Date; end: Date } {
    const match = /^(\d{4})-(\d{2})$/.exec(period);
    if (!match) throw AppError.badRequest('errors.validation');
    const year = Number(match[1]);
    const month = Number(match[2]);
    if (month < 1 || month > 12) throw AppError.badRequest('errors.validation');

    return {
      start: new Date(Date.UTC(year, month - 1, 1)),
      end: new Date(Date.UTC(month === 12 ? year + 1 : year, month % 12, 1)),
    };
  }

  // -------------------------------------------------------------------------
  // FR-ERN-001 — revenue recognition
  // -------------------------------------------------------------------------

  /**
   * What each learner recognised in the period.
   *
   * A subscription's collected amount is spread evenly across the days of its
   * own period, and the days that fall inside this month are what is recognised.
   * That is the whole content of "recognised rateably across the billing period,
   * not at collection".
   *
   * Fees and tax are apportioned by the same ratio so the pool basis stays
   * consistent with the revenue it is taken from.
   */
  private async recogniseByLearner(period: string) {
    const { start, end } = this.periodBounds(period);

    const subscriptions = await this.prisma.subscription.findMany({
      where: { periodStart: { lt: end }, periodEnd: { gt: start } },
      include: {
        learner: true,
        payments: { where: { status: 'succeeded' } },
      },
    });

    const byLearner = new Map<
      string,
      { learnerId: string; revenueXaf: bigint; feesXaf: bigint; taxXaf: bigint }
    >();

    for (const subscription of subscriptions) {
      const subStart = subscription.periodStart.getTime();
      const subEnd = subscription.periodEnd.getTime();
      const subDays = Math.max(1, Math.round((subEnd - subStart) / 86_400_000));

      const overlapStart = Math.max(subStart, start.getTime());
      const overlapEnd = Math.min(subEnd, end.getTime());
      const overlapDays = Math.max(0, Math.round((overlapEnd - overlapStart) / 86_400_000));
      if (overlapDays === 0) continue;

      // Refunds are their own payment rows pointing at what they reverse, so
      // netting them here keeps a refunded month from paying teachers on money
      // that went back to the payer.
      const collected = subscription.payments.reduce(
        (sum, p) => sum + (p.refundOfPaymentId ? -p.amountXaf : p.amountXaf),
        0n,
      );
      const fees = subscription.payments.reduce(
        (sum, p) => sum + (p.refundOfPaymentId ? -p.feeXaf : p.feeXaf),
        0n,
      );
      const tax = subscription.payments.reduce(
        (sum, p) => sum + (p.refundOfPaymentId ? -p.taxXaf : p.taxXaf),
        0n,
      );
      if (collected <= 0n) continue;

      const ratioNum = BigInt(overlapDays);
      const ratioDen = BigInt(subDays);

      const existing = byLearner.get(subscription.learnerId) ?? {
        learnerId: subscription.learnerId,
        revenueXaf: 0n,
        feesXaf: 0n,
        taxXaf: 0n,
      };

      existing.revenueXaf += roundHalfUpDiv(collected * ratioNum, ratioDen);
      existing.feesXaf += roundHalfUpDiv(fees * ratioNum, ratioDen);
      existing.taxXaf += roundHalfUpDiv(tax * ratioNum, ratioDen);
      byLearner.set(subscription.learnerId, existing);
    }

    return [...byLearner.values()];
  }

  // -------------------------------------------------------------------------
  // FR-ERN-003/005 — attribution
  // -------------------------------------------------------------------------

  /**
   * Verified attended minutes per learner and teacher for the period.
   *
   * FR-ERN-005: a session counts where the teacher was present for at least the
   * configured share of the scheduled duration, or where the learner failed to
   * appear after the teacher waited.
   *
   * §5.4: minutes taught while the learner's account was frozen do not accrue.
   * Minutes taught *before* the freeze are unaffected and remain payable, which
   * is why this filters by whether the session started inside a freeze window
   * rather than by the learner's state today.
   */
  private async attributionByLearner(period: string) {
    const { start, end } = this.periodBounds(period);

    const sessions = await this.prisma.session.findMany({
      where: {
        startsAtUtc: { gte: start, lt: end },
        status: { in: ['completed', 'no_show_learner'] },
      },
      include: {
        participants: true,
        cohort: { include: { members: true } },
      },
    });

    const freezes = await this.prisma.accountFreeze.findMany({
      where: { scope: 'learner', effectiveFrom: { lt: end } },
      select: { learnerId: true, effectiveFrom: true, liftedAt: true },
    });

    const frozenAt = (learnerId: string, at: Date) =>
      freezes.some(
        (f) =>
          f.learnerId === learnerId &&
          f.effectiveFrom <= at &&
          (f.liftedAt === null || f.liftedAt > at),
      );

    const byLearner = new Map<
      string,
      { teacherId: string; sessionType: 'one_to_one' | 'group'; attendedMinutes: number }[]
    >();

    const config = this.poolConfig();

    for (const session of sessions) {
      const teacherSeat = session.participants.find((p) => p.userId === session.teacherId);
      const teacherPresentMinutes = teacherSeat?.attendedMinutes ?? 0;

      if (
        !sessionCountsTowardEarnings(
          {
            scheduledMinutes: session.durationMin,
            teacherPresentMinutes,
            status: session.status,
          },
          config.minPresencePercent,
        )
      ) {
        continue;
      }

      // A one-to-one session names its learner; a group session's learners are
      // its cohort members, each credited with their own attendance.
      const learnerIds = session.learnerId
        ? [session.learnerId]
        : (session.cohort?.members.map((m) => m.learnerId) ?? []);

      for (const learnerId of learnerIds) {
        if (frozenAt(learnerId, session.startsAtUtc)) continue;

        // FR-LIV-014: the learner's own attendance is what the teacher is paid
        // against, except on a learner no-show, where the teacher waited and is
        // credited with the time they were present for.
        const learnerMinutes =
          session.status === 'no_show_learner'
            ? teacherPresentMinutes
            : this.learnerMinutes(session, learnerId);
        if (learnerMinutes <= 0) continue;

        const entries = byLearner.get(learnerId) ?? [];
        entries.push({
          teacherId: session.teacherId,
          sessionType: session.type,
          attendedMinutes: learnerMinutes,
        });
        byLearner.set(learnerId, entries);
      }
    }

    return byLearner;
  }

  private learnerMinutes(
    session: { participants: { userId: string; attendedMinutes: number }[] },
    learnerId: string,
  ): number {
    // A minor without their own sign-in has no participant row under a user id
    // of their own; the join is recorded against whichever identity was in the
    // room. Where no seat is found the session contributes nothing rather than a
    // guess, which keeps FR-LIV-014's "authoritative" claim honest.
    const seat = session.participants.find((p) => p.userId === learnerId);
    return seat?.attendedMinutes ?? 0;
  }

  // -------------------------------------------------------------------------
  // The calculation
  // -------------------------------------------------------------------------

  /**
   * Calculates and stores earnings for a period.
   *
   * Re-runnable: a recalculation replaces the period's earnings rows, but only
   * for teachers whose earnings have not yet been paid out. A paid figure is
   * history and a later configuration change must not silently restate it.
   */
  async calculatePeriod(period: string, actorId?: string) {
    const config = this.poolConfig();
    const version = configVersion(config);

    const recognised = await this.recogniseByLearner(period);
    const attribution = await this.attributionByLearner(period);

    const totals = recognised.reduce(
      (acc, row) => ({
        revenue: acc.revenue + row.revenueXaf,
        fees: acc.fees + row.feesXaf,
        tax: acc.tax + row.taxXaf,
      }),
      { revenue: 0n, fees: 0n, tax: 0n },
    );

    const poolXaf = computePool(
      {
        recognisedRevenueXaf: totals.revenue,
        providerFeesXaf: totals.fees,
        taxXaf: totals.tax,
      },
      config,
    );

    const contributions: LearnerContribution[] = recognised.map((row) => ({
      learnerId: row.learnerId,
      recognisedRevenueXaf: row.revenueXaf,
      attribution: attribution.get(row.learnerId) ?? [],
    }));

    // Throws rather than returns on a rounding drift — the acceptance criterion
    // is "to the franc, with no rounding drift", so a near-miss is a failure.
    const distribution = distributePool(poolXaf, contributions, config);

    const taxPercent = this.config.getNumber(CONFIG_KEYS.TAX_WITHHOLDING_PERCENT);

    const written = await this.prisma.$transaction(async (tx) => {
      const alreadyPaid = await tx.earning.findMany({
        where: { period, payout: { status: { in: ['paid', 'processing'] } } },
        select: { teacherId: true },
      });
      const locked = new Set(alreadyPaid.map((e) => e.teacherId));

      await tx.earning.deleteMany({
        where: { period, teacherId: { notIn: [...locked] } },
      });

      const rows = [];
      for (const share of distribution.teacherShares) {
        if (locked.has(share.teacherId)) continue;

        const deductions = computeDeductions(share.amountXaf, {
          taxWithholdingPercent: taxPercent,
        });

        rows.push(
          await tx.earning.create({
            data: {
              id: randomUUID(),
              teacherId: share.teacherId,
              period,
              attendedMinutes: share.attendedMinutes,
              oneToOneMinutes: share.oneToOneMinutes,
              groupMinutes: share.groupMinutes,
              amountXaf: share.amountXaf,
              deductionsXaf: deductions.totalXaf,
              netPayableXaf: netPayable(share.amountXaf, deductions),
              configVersion: version,
              // FR-ERN-006: "every figure links through to the underlying
              // sessions that produced it."
              basisJson: {
                fromLearners: share.fromLearners.map((f) => ({
                  learnerId: f.learnerId,
                  amountXaf: f.amountXaf.toString(),
                  attendedMinutes: f.attendedMinutes,
                })),
                poolXaf: poolXaf.toString(),
                recognisedRevenueXaf: totals.revenue.toString(),
                deductions: {
                  providerFeeXaf: deductions.providerFeeXaf.toString(),
                  taxWithheldXaf: deductions.taxWithheldXaf.toString(),
                  taxWithholdingPercent: taxPercent,
                },
                config,
              } as never,
            },
          }),
        );
      }

      // FR-ERN-004: the unallocated balance is recorded with the learners that
      // produced it, so the Admin deciding its fate is deciding on evidence.
      if (distribution.unallocatedXaf > 0n) {
        await tx.unallocatedPool.upsert({
          where: { period },
          create: {
            id: randomUUID(),
            period,
            amountXaf: distribution.unallocatedXaf,
            basisJson: {
              learners: distribution.unallocated.map((u) => ({
                learnerId: u.learnerId,
                amountXaf: u.amountXaf.toString(),
                reason: u.reason,
              })),
              configVersion: version,
            } as never,
          },
          update: {
            amountXaf: distribution.unallocatedXaf,
            basisJson: {
              learners: distribution.unallocated.map((u) => ({
                learnerId: u.learnerId,
                amountXaf: u.amountXaf.toString(),
                reason: u.reason,
              })),
              configVersion: version,
            } as never,
          },
        });
      }

      const occurredAt = this.periodBounds(period).end;
      if (totals.revenue > 0n) {
        await this.ledger.recogniseRevenue(
          { amountXaf: totals.revenue, period, occurredAt },
          tx,
        );
      }
      if (poolXaf > 0n) {
        await this.ledger.accruePool(
          {
            period,
            poolXaf,
            teacherPayableXaf: poolXaf - distribution.unallocatedXaf,
            unallocatedXaf: distribution.unallocatedXaf,
            occurredAt,
          },
          tx,
        );
      }

      return { rows, lockedCount: locked.size };
    });

    await this.audit.record({
      action: 'earnings.calculated',
      entity: 'period',
      entityId: period,
      actorId: actorId ?? null,
      after: {
        poolXaf: poolXaf.toString(),
        recognisedRevenueXaf: totals.revenue.toString(),
        teacherCount: distribution.teacherShares.length,
        unallocatedXaf: distribution.unallocatedXaf.toString(),
        configVersion: version,
        skippedAlreadyPaid: written.lockedCount,
      },
    });

    return {
      period,
      configVersion: version,
      poolXaf: poolXaf.toString(),
      recognisedRevenueXaf: totals.revenue.toString(),
      providerFeesXaf: totals.fees.toString(),
      taxXaf: totals.tax.toString(),
      unallocatedXaf: distribution.unallocatedXaf.toString(),
      teacherCount: distribution.teacherShares.length,
      skippedAlreadyPaid: written.lockedCount,
    };
  }

  /**
   * §4.7.5: hours taught and earnings, per teacher, for a period.
   *
   * "A teacher must be able to ask 'why this number?' and support must be able
   * to answer in two clicks" — so the basis travels with the row rather than
   * being reconstructable only by re-running the calculation.
   */
  async periodBreakdown(period: string) {
    const earnings = await this.prisma.earning.findMany({
      where: { period },
      include: {
        teacher: { include: { user: { select: { fullName: true } } } },
        payout: true,
      },
      orderBy: { amountXaf: 'desc' },
    });

    const { start, end } = this.periodBounds(period);
    const unallocated = await this.prisma.unallocatedPool.findUnique({ where: { period } });

    const rows = await Promise.all(
      earnings.map(async (earning) => {
        const sessions = await this.prisma.session.count({
          where: {
            teacherId: earning.teacherId,
            startsAtUtc: { gte: start, lt: end },
            status: { in: ['completed', 'no_show_learner'] },
          },
        });

        const hours = earning.attendedMinutes / 60;
        return {
          // §4.7.5's "why this number?" link needs the earnings row, not the
          // teacher: the same teacher has one of these per period.
          earningId: earning.id,
          teacherId: earning.teacherId,
          teacherName: earning.teacher.user.fullName,
          sessionsDelivered: sessions,
          attendedMinutes: earning.attendedMinutes,
          oneToOneMinutes: earning.oneToOneMinutes,
          groupMinutes: earning.groupMinutes,
          grossXaf: earning.amountXaf.toString(),
          deductionsXaf: earning.deductionsXaf.toString(),
          netPayableXaf: earning.netPayableXaf.toString(),
          // Presentation-only, so a float is safe here — it never re-enters the
          // money path (CON-02 applies to stored and calculated money).
          effectiveHourlyXaf:
            hours > 0 ? Math.round(Number(earning.amountXaf) / hours) : 0,
          configVersion: earning.configVersion,
          basis: earning.basisJson,
          payout: earning.payout
            ? { id: earning.payout.id, status: earning.payout.status }
            : null,
        };
      }),
    );

    const config = this.poolConfig();
    const poolXaf = rows.reduce((sum, r) => sum + BigInt(r.grossXaf), 0n);

    return {
      period,
      config,
      configVersion: configVersion(config),
      poolXaf: (poolXaf + (unallocated?.amountXaf ?? 0n)).toString(),
      teachers: rows,
      unallocated: unallocated
        ? {
            amountXaf: unallocated.amountXaf.toString(),
            decision: unallocated.decision,
            decidedBy: unallocated.decidedBy,
            decidedAt: unallocated.decidedAt,
            reason: unallocated.reason,
            basis: unallocated.basisJson,
          }
        : null,
    };
  }

  /**
   * FR-ERN-004 / FR-AI-005: an Admin decides what becomes of the unallocated
   * balance. There is no automatic disposal, and the reason is mandatory.
   */
  async decideUnallocated(input: {
    period: string;
    decision: 'released_to_teachers' | 'retained_by_platform' | 'carried_forward';
    reason: string;
    actorId: string;
  }) {
    const reason = input.reason.trim();
    if (!reason) throw AppError.badRequest('errors.payout.decision_required');

    const pool = await this.prisma.unallocatedPool.findUnique({
      where: { period: input.period },
    });
    if (!pool) throw AppError.notFound();
    if (pool.decision !== 'pending') throw AppError.conflict('errors.reconciliation.already_resolved');

    const now = new Date();
    await this.prisma.$transaction(async (tx) => {
      await tx.unallocatedPool.update({
        where: { period: input.period },
        data: {
          decision: input.decision,
          decidedBy: input.actorId,
          decidedAt: now,
          reason,
        },
      });

      await this.ledger.settleUnallocated(
        {
          period: input.period,
          amountXaf: pool.amountXaf,
          decision: input.decision,
          decidedBy: input.actorId,
          reason,
          occurredAt: now,
        },
        tx,
      );
    });

    await this.audit.record({
      action: 'earnings.unallocated_decided',
      entity: 'unallocated_pool',
      entityId: input.period,
      actorId: input.actorId,
      before: { decision: 'pending', amountXaf: pool.amountXaf.toString() },
      after: { decision: input.decision },
      reason,
    });

    return { period: input.period, decision: input.decision };
  }
}
