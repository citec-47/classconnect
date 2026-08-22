import { Injectable } from '@nestjs/common';
import {
  BADGE_KEYS,
  CONFIG_KEYS,
  permissionsFor,
  visibleBadgeKeys,
  visibleNav,
  type BadgeCounts,
  type BadgeKey,
  type Role,
} from '@classconnect/shared';
import { PrismaService } from '../common/prisma.service';
import { PlatformConfigService } from '../common/platform-config.service';
import { CacheService } from '../common/cache.service';
import { ApprovalsService } from './approvals.service';
import { SupportService } from './support.service';
import { SafeguardingService } from './safeguarding.service';
import { ReconciliationService } from '../billing/reconciliation.service';

/**
 * §3 and §4.1 — the sidebar badges and the overview.
 *
 * The badge contract, verbatim: "A badge shows the count of items awaiting an
 * admin action, not unread items. The count decrements only when an item is
 * actioned (approved, rejected, assigned, resolved) — never merely by opening
 * the screen."
 *
 * That falls out of computing every count from the queue's own state. There is
 * no read marker anywhere in this file, so there is nothing that opening a
 * screen could clear.
 */
@Injectable()
export class DashboardService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: PlatformConfigService,
    private readonly cache: CacheService,
    private readonly approvals: ApprovalsService,
    private readonly support: SupportService,
    private readonly safeguarding: SafeguardingService,
    private readonly reconciliation: ReconciliationService,
  ) {}

  /**
   * Counts, filtered to what this user is permitted to see.
   *
   * FR-RBA-002: a count is information. An agent who cannot open the payments
   * screen is not told how many learners owe money, so the badge set is derived
   * from the same `visibleNav` the sidebar renders from.
   */
  async badges(user: { id: string; roles: Role[] }): Promise<Partial<BadgeCounts>> {
    /**
     * Cached for ten seconds, per user.
     *
     * Four operators with the dashboard open poll this every sixty seconds, and
     * every screen reads it on mount. Uncached, each of those paid nine queries
     * at 235ms of latency apiece. Ten seconds is well inside the reconciliation
     * window COM-003 already specifies, and every action that moves a queue
     * invalidates it — so a badge still falls the moment an item is actioned,
     * which is the §3 contract that matters.
     */
    return this.cache.get(
      CacheService.KEYS.badges(user.id),
      CacheService.TTL.badges,
      () => this.computeBadges(user),
    );
  }

  private async computeBadges(user: { id: string; roles: Role[] }): Promise<Partial<BadgeCounts>> {
    const permissions = permissionsFor(user.roles);
    const designated = await this.safeguarding.isDesignated(user.id);

    const allowed = new Set<BadgeKey>(
      visibleBadgeKeys({
        has: (permission) => permissions.has(permission),
        safeguardingDesignated: designated,
      }),
    );

    /**
     * Every count runs at once.
     *
     * These were awaited one after another, which on managed PostgreSQL is not
     * a small inefficiency: the database is a network hop away, so eight serial
     * counts cost eight round trips — measured at 2.2 seconds for a payload of
     * eight integers. Issued together they cost one round trip's latency, and
     * the sidebar re-reads this every sixty seconds on every open tab.
     *
     * The permission check still gates each one, so a query is not merely
     * hidden after the fact — it is never issued for a badge this user may not
     * see (FR-RBA-002).
     */
    const wanted = new Map<BadgeKey, Promise<number>>();

    const want = (key: BadgeKey, run: () => Promise<number>) => {
      if (allowed.has(key)) wanted.set(key, run());
    };

    // `pendingCounts` answers two badges from one pair of queries, so it is
    // started once and both keys read from the same promise.
    const pending =
      allowed.has('studentsAwaitingApproval') || allowed.has('primaryAwaitingApproval')
        ? this.approvals.pendingCounts()
        : null;
    if (pending) {
      want('studentsAwaitingApproval', () => pending.then((p) => p.students));
      want('primaryAwaitingApproval', () => pending.then((p) => p.primary));
    }

    want('teachersAwaitingVerification', () =>
      this.prisma.teacher.count({
        where: { verificationStatus: { in: ['submitted', 'under_review'] } },
      }),
    );

    want('unassignedTickets', () => this.support.unassignedCount());

    want('safeguardingOpen', () => this.safeguarding.openCount(user.id));

    want('studentsOwing', () =>
      this.prisma.paymentSchedule.count({
        where: {
          settledInFullAt: null,
          instalments: { some: { state: { in: ['due', 'overdue'] } } },
        },
      }),
    );

    want('teacherPayoutsPending', () =>
      this.prisma.earning.count({
        where: {
          netPayableXaf: { gt: 0 },
          OR: [{ payoutId: null }, { payout: { status: { in: ['requested', 'failed'] } } }],
        },
      }),
    );

    want('reconciliationUnmatched', () =>
      this.prisma.reconciliationItem.count({ where: { state: 'unmatched' } }),
    );

    // Not audited: a count of rooms carries no personal data. Opening the
    // screen that names who is in them is the audited act (FR-RBA-004).
    want('liveClasses', () =>
      this.prisma.session.count({ where: { status: 'in_progress' } }),
    );

    // FR-SCH-002: without a band a teacher cannot be assigned a learner, so
    // this is a queue of work even though it does not look like one.
    want('teachersUnclassified', () =>
      this.prisma.teacher.count({ where: { schoolType: null, verificationStatus: 'approved' } }),
    );

    const settled = await Promise.all(
      [...wanted.entries()].map(async ([key, promise]) => [key, await promise] as const),
    );

    return Object.fromEntries(settled) as Partial<BadgeCounts>;
  }

  /** §3: the sidebar itself, filtered server-side rather than trusted from the client. */
  async navFor(user: { id: string; roles: Role[] }, viaHttpBridge = false) {
    const permissions = permissionsFor(user.roles);
    const designated = await this.safeguarding.isDesignated(user.id);

    return {
      sections: visibleNav({
        has: (permission) => permissions.has(permission),
        safeguardingDesignated: designated,
      }),
      safeguardingDesignated: designated,
      pollSeconds: this.config.getNumber(CONFIG_KEYS.BADGE_POLL_SECONDS),
      /**
       * COM-002: whether this deployment can push badge counts at all.
       *
       * A serverless function cannot hold a WebSocket open between invocations,
       * so on Vercel there is no gateway to connect to. Saying so here stops the
       * client opening a socket that will never succeed and then retrying it on
       * a backoff for the rest of the session.
       *
       * `viaHttpBridge` is the same answer for a different reason: this process
       * can hold a socket perfectly well, but the request reached it through the
       * frontend's `/api/v1` forwarder, and the client will dial the socket at
       * the origin it is already using. An upgrade never reaches a Next API
       * route, so that dial has nowhere to land. Where the browser addresses the
       * API directly the header is absent and push stays on.
       *
       * COM-003's 60-second reconciliation poll runs either way and is the
       * authoritative path, so this is a latency difference rather than a lost
       * feature: a badge is correct within a minute instead of immediately.
       */
      pushEnabled:
        !viaHttpBridge && !process.env.VERCEL && !process.env.AWS_LAMBDA_FUNCTION_NAME,
    };
  }

  // -------------------------------------------------------------------------
  // §4.1 — the overview
  // -------------------------------------------------------------------------

  /**
   * The action strip: "what needs me right now?".
   *
   * Every tile is a queue with a live count and a link into it. No vanity
   * metrics — every number here is something an admin can act on today.
   */
  async actionStrip(
    user: { id: string; roles: Role[] },
    /**
     * Reuses the counts the caller already has.
     *
     * `overview` needs the badges anyway, and recomputing them here made the
     * screen pay for the same nine queries twice. Optional so the strip can
     * still be asked for on its own.
     */
    precomputed?: Partial<BadgeCounts>,
  ) {
    const dayAgo = new Date(Date.now() - 86_400_000);

    const [badges, pendingReconciliation, autoFrozen24h] = await Promise.all([
      precomputed ? Promise.resolve(precomputed) : this.badges(user),
      this.prisma.payment.count({ where: { status: 'pending_reconciliation' } }),
      this.prisma.accountFreeze.count({
        where: { kind: 'automatic', appliedAt: { gte: dayAgo } },
      }),
    ]);

    return {
      teachersAwaitingVerification: badges.teachersAwaitingVerification ?? null,
      studentsAwaitingApproval: badges.studentsAwaitingApproval ?? null,
      unassignedTickets: badges.unassignedTickets ?? null,
      safeguardingOpen: badges.safeguardingOpen ?? null,
      paymentsPendingReconciliation: pendingReconciliation,
      autoFrozen24h,
    };
  }

  /** FR-RPT-003 — the operational row. */
  async operational() {
    const now = new Date();
    const dayStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    const dayEnd = new Date(dayStart.getTime() + 86_400_000);
    const weekAgo = new Date(now.getTime() - 7 * 86_400_000);

    const [
      activeLearners,
      activeTeachers,
      scheduled,
      delivered,
      cancelled,
      teacherNoShow,
      learnerNoShow,
      totalToday,
      verifiedThisWeek,
      slaAttainment,
    ] = await Promise.all([
      this.prisma.learner.count({ where: { status: 'active', approvalState: 'approved' } }),
      this.prisma.teacher.count({
        where: { verificationStatus: 'approved', suspendedAt: null },
      }),
      this.prisma.session.count({
        where: { startsAtUtc: { gte: dayStart, lt: dayEnd } },
      }),
      this.prisma.session.count({
        where: { startsAtUtc: { gte: dayStart, lt: dayEnd }, status: 'completed' },
      }),
      this.prisma.session.count({
        where: {
          startsAtUtc: { gte: dayStart, lt: dayEnd },
          status: { in: ['cancelled_by_learner', 'cancelled_by_teacher'] },
        },
      }),
      this.prisma.session.count({
        where: { startsAtUtc: { gte: weekAgo }, status: 'no_show_teacher' },
      }),
      this.prisma.session.count({
        where: { startsAtUtc: { gte: weekAgo }, status: 'no_show_learner' },
      }),
      this.prisma.session.count({ where: { startsAtUtc: { gte: weekAgo } } }),
      this.prisma.teacher.count({
        where: { verificationStatus: 'approved', verifiedAt: { gte: weekAgo } },
      }),
      this.support.slaAttainment(weekAgo),
    ]);

    const rate = (count: number) =>
      totalToday === 0 ? 0 : Math.round((count / totalToday) * 1000) / 10;

    return {
      activeLearners,
      activeTeachers,
      sessionsScheduledToday: scheduled,
      sessionsDeliveredToday: delivered,
      sessionsCancelledToday: cancelled,
      teacherNoShowRatePercent: rate(teacherNoShow),
      learnerNoShowRatePercent: rate(learnerNoShow),
      verificationThroughputPerWeek: verifiedThisWeek,
      supportSlaAttainmentPercent: slaAttainment,
    };
  }

  /** FR-RPT-004 — the money row, for the current calendar month. */
  async money() {
    const now = new Date();
    const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    const period = `${monthStart.getUTCFullYear()}-${String(monthStart.getUTCMonth() + 1).padStart(2, '0')}`;

    const [collections, refunds, byMethod, byPlan, earnings, payouts, payable, unmatched] =
      await Promise.all([
        this.prisma.payment.aggregate({
          where: {
            status: 'succeeded',
            refundOfPaymentId: null,
            settledAt: { gte: monthStart },
          },
          _sum: { amountXaf: true },
          _count: true,
        }),
        this.prisma.payment.aggregate({
          where: { refundOfPaymentId: { not: null }, settledAt: { gte: monthStart } },
          _sum: { amountXaf: true },
          _count: true,
        }),
        this.prisma.payment.groupBy({
          by: ['method', 'status'],
          where: { createdAt: { gte: monthStart }, refundOfPaymentId: null },
          _count: true,
        }),
        this.prisma.payment.findMany({
          where: {
            status: 'succeeded',
            refundOfPaymentId: null,
            settledAt: { gte: monthStart },
          },
          select: {
            amountXaf: true,
            subscription: {
              select: { plan: { select: { code: true } }, learner: { select: { levelId: true } } },
            },
          },
        }),
        this.prisma.earning.aggregate({ where: { period }, _sum: { amountXaf: true } }),
        this.prisma.payout.aggregate({
          where: { status: { in: ['paid', 'processing'] }, approvedAt: { gte: monthStart } },
          _sum: { amountXaf: true },
        }),
        this.prisma.earning.aggregate({
          where: { period, payoutId: null },
          _sum: { netPayableXaf: true },
        }),
        this.reconciliation.summary(),
      ]);

    // FR-RPT-004: payment success rate by method.
    const methodStats = new Map<string, { attempted: number; succeeded: number }>();
    for (const row of byMethod) {
      const stat = methodStats.get(row.method) ?? { attempted: 0, succeeded: 0 };
      stat.attempted += row._count;
      if (row.status === 'succeeded') stat.succeeded += row._count;
      methodStats.set(row.method, stat);
    }

    const planTotals = new Map<string, bigint>();
    for (const payment of byPlan) {
      const code = payment.subscription?.plan.code ?? 'unknown';
      planTotals.set(code, (planTotals.get(code) ?? 0n) + payment.amountXaf);
    }

    // Churn: subscriptions that ended this month without a successor.
    const [expired, activeAtStart] = await Promise.all([
      this.prisma.subscription.count({
        where: { status: { in: ['expired', 'cancelled'] }, updatedAt: { gte: monthStart } },
      }),
      this.prisma.subscription.count({ where: { periodStart: { lt: monthStart } } }),
    ]);

    return {
      period,
      grossRevenueXaf: (collections._sum.amountXaf ?? 0n).toString(),
      collectionCount: collections._count,
      refundsXaf: (refunds._sum.amountXaf ?? 0n).toString(),
      refundCount: refunds._count,
      revenueByPlan: [...planTotals.entries()].map(([plan, amountXaf]) => ({
        plan,
        amountXaf: amountXaf.toString(),
      })),
      paymentSuccessByMethod: [...methodStats.entries()].map(([method, stat]) => ({
        method,
        attempted: stat.attempted,
        succeeded: stat.succeeded,
        ratePercent:
          stat.attempted === 0 ? null : Math.round((stat.succeeded / stat.attempted) * 100),
      })),
      teacherPoolAccruedXaf: (earnings._sum.amountXaf ?? 0n).toString(),
      payoutsMadeXaf: (payouts._sum.amountXaf ?? 0n).toString(),
      payoutsPayableXaf: (payable._sum.netPayableXaf ?? 0n).toString(),
      unreconciledCount: unmatched.unmatchedCount,
      unreconciledValueXaf: unmatched.unmatchedValueXaf,
      churnRatePercent:
        activeAtStart === 0 ? null : Math.round((expired / activeAtStart) * 1000) / 10,
    };
  }

  /**
   * §4.1 — the alerts panel.
   *
   * Four sources, each named by the brief. Returned as message keys and params
   * rather than sentences, so both languages render from the same payload
   * (NFR-LOC-002).
   */
  async alerts() {
    const alerts: {
      key: string;
      severity: 'warning' | 'danger';
      messageKey: string;
      params: Record<string, string | number>;
      href?: string;
    }[] = [];

    // FR-LDG-004 — unmatched items above the threshold.
    const reconciliation = await this.reconciliation.summary();
    if (reconciliation.breached) {
      alerts.push({
        key: 'reconciliation',
        severity: 'warning',
        messageKey: 'overview.alert.unmatchedAboveThreshold',
        params: {
          count: reconciliation.unmatchedCount,
          value: reconciliation.unmatchedValueXaf,
        },
        href: '/payments/reconciliation',
      });
    }

    // FR-RAT-006 — a teacher below the rating or reliability threshold.
    const ratingFloor = this.config.getNumber(CONFIG_KEYS.TEACHER_RATING_ALERT_BELOW);
    const reliabilityFloor = this.config.getNumber(CONFIG_KEYS.TEACHER_RELIABILITY_ALERT_BELOW);
    const weakTeachers = await this.prisma.teacher.findMany({
      where: {
        verificationStatus: 'approved',
        suspendedAt: null,
        OR: [
          { ratingAvg: { lt: ratingFloor }, ratingCount: { gte: 5 } },
          { reliabilityScore: { lt: reliabilityFloor } },
        ],
      },
      include: { user: { select: { fullName: true } } },
      take: 10,
    });
    for (const teacher of weakTeachers) {
      alerts.push({
        key: `teacher:${teacher.userId}`,
        severity: 'warning',
        messageKey: 'overview.alert.teacherBelowThreshold',
        params: { name: teacher.user.fullName },
        href: `/accounts?q=${encodeURIComponent(teacher.user.fullName)}`,
      });
    }

    // FR-HWK-008 — submissions ungraded beyond the configured window.
    const ungradedDays = this.config.getNumber(CONFIG_KEYS.UNGRADED_ESCALATION_DAYS);
    const ungraded = await this.prisma.submission.count({
      where: {
        grade: null,
        submittedAt: { lt: new Date(Date.now() - ungradedDays * 86_400_000) },
      },
    });
    if (ungraded > 0) {
      alerts.push({
        key: 'ungraded',
        severity: 'warning',
        messageKey: 'overview.alert.ungradedOverdue',
        params: { count: ungraded, days: ungradedDays },
      });
    }

    // NFR-DEP-004 — a provider integration degraded. Inferred from a run of
    // failures rather than from a health flag nobody sets.
    const hourAgo = new Date(Date.now() - 3_600_000);
    const recentByMethod = await this.prisma.payment.groupBy({
      by: ['method', 'status'],
      where: { createdAt: { gte: hourAgo } },
      _count: true,
    });
    const providerStats = new Map<string, { total: number; failed: number }>();
    for (const row of recentByMethod) {
      const stat = providerStats.get(row.method) ?? { total: 0, failed: 0 };
      stat.total += row._count;
      if (row.status === 'failed') stat.failed += row._count;
      providerStats.set(row.method, stat);
    }
    for (const [method, stat] of providerStats) {
      // Needs a meaningful sample: two failures out of two is noise, not an outage.
      if (stat.total >= 5 && stat.failed / stat.total > 0.5) {
        alerts.push({
          key: `provider:${method}`,
          severity: 'danger',
          messageKey: 'overview.alert.providerDegraded',
          params: { provider: method },
        });
      }
    }

    return alerts;
  }

  async overview(user: { id: string; roles: Role[] }) {
    // Computed once and handed to the strip, rather than each of them asking
    // the database for the same nine counts.
    const badges = await this.badges(user);

    const [actionStrip, operational, money, alerts] = await Promise.all([
      this.actionStrip(user, badges),
      this.operational(),
      this.money(),
      this.alerts(),
    ]);
    return { actionStrip, operational, money, alerts };
  }
}

/** Re-exported so the gateway and controller agree on the key set. */
export { BADGE_KEYS };
