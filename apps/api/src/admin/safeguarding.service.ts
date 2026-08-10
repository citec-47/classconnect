import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { SafeguardingSource } from '@prisma/client';
import { CONFIG_KEYS } from '@classconnect/shared';
import { PrismaService } from '../common/prisma.service';
import { PlatformConfigService } from '../common/platform-config.service';
import { CacheService } from '../common/cache.service';
import { AppError } from '../common/http-exception.filter';
import { AuditService } from '../audit/audit.service';
import { FreezeService } from '../billing/freeze.service';

/**
 * §4.6 — the safeguarding queue.
 *
 * FR-SAF-006 governs everything here: visible only to designated staff, evidence
 * retained in full, and nothing deleted by an operator. The database refuses
 * DELETE on both tables regardless of what this service does.
 *
 * FR-SAF-005: a 4-hour first-response target, stamped at creation so the
 * countdown survives a later change to the configured target.
 */
@Injectable()
export class SafeguardingService {
  private readonly logger = new Logger(SafeguardingService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: PlatformConfigService,
    private readonly audit: AuditService,
    private readonly freeze: FreezeService,
    private readonly cache: CacheService,
  ) {}

  /**
   * FR-SAF-006: "restricted to designated staff regardless of role level".
   *
   * Holding `safeguarding:read` is not enough — the person has to be named. A
   * super admin who has not been designated is refused too, which is the plain
   * reading of "regardless of role level". They can designate themselves, and
   * that act is itself audited, so the platform is never locked out but nobody
   * arrives in this queue silently.
   */
  async assertDesignated(userId: string): Promise<void> {
    const profile = await this.prisma.supportAgentProfile.findUnique({
      where: { userId },
      select: { safeguardingDesignated: true },
    });
    if (!profile?.safeguardingDesignated) {
      throw AppError.forbidden('errors.safeguarding.not_designated');
    }
  }

  async isDesignated(userId: string): Promise<boolean> {
    /**
     * Cached: this is read on every nav request and again inside every badge
     * refresh, so an uncached lookup cost two 235ms round trips on every page
     * load for a boolean that changes perhaps twice a year.
     *
     * `setDesignation` invalidates explicitly, so a revocation takes effect at
     * once rather than after the TTL — which matters, because FR-SAF-006 is
     * about who may see the queue and removal should not lag.
     */
    return this.cache.get(
      CacheService.KEYS.designation(userId),
      CacheService.TTL.designation,
      async () => {
        const profile = await this.prisma.supportAgentProfile.findUnique({
          where: { userId },
          select: { safeguardingDesignated: true },
        });
        return profile?.safeguardingDesignated ?? false;
      },
    );
  }

  /** §6: designating someone is a super-admin act and is audited both ways. */
  async setDesignation(input: { userId: string; designated: boolean; actorId: string }) {
    const before = await this.isDesignated(input.userId);

    await this.prisma.supportAgentProfile.upsert({
      where: { userId: input.userId },
      create: { userId: input.userId, safeguardingDesignated: input.designated },
      update: { safeguardingDesignated: input.designated },
    });

    // The gate just moved; nobody should wait out a TTL for it.
    this.cache.invalidate(CacheService.KEYS.designation(input.userId));
    this.cache.invalidatePrefix(CacheService.KEYS.badgesPrefix);

    await this.audit.record({
      action: 'safeguarding.designation_changed',
      entity: 'user',
      entityId: input.userId,
      actorId: input.actorId,
      before: { safeguardingDesignated: before },
      after: { safeguardingDesignated: input.designated },
    });

    return { designated: input.designated };
  }

  /**
   * The queue.
   *
   * FR-RBA-004 asks for an audit entry on "every staff access to a learner's
   * personal data". A safeguarding report is the most sensitive personal data
   * the platform holds, so opening the queue is recorded, not only acting on it.
   */
  async list(actorId: string, includeClosed = false) {
    await this.assertDesignated(actorId);

    const reports = await this.prisma.safeguardingReport.findMany({
      where: includeClosed ? {} : { state: { in: ['open', 'in_review', 'actioned'] } },
      include: {
        teacher: { include: { user: { select: { id: true, fullName: true } } } },
        ticket: { select: { id: true, subject: true, channel: true } },
      },
      orderBy: [{ state: 'asc' }, { firstResponseDueAt: 'asc' }],
    });

    await this.audit.record({
      action: 'safeguarding.viewed',
      entity: 'safeguarding_queue',
      entityId: null,
      actorId,
      after: { reportCount: reports.length, includeClosed },
    });

    const learnerIds = reports
      .map((r) => r.subjectLearnerId)
      .filter((id): id is string => Boolean(id));
    const learners = await this.prisma.learner.findMany({
      where: { id: { in: learnerIds } },
      select: { id: true, fullName: true },
    });
    const learnerName = new Map(learners.map((l) => [l.id, l.fullName]));

    const reporterIds = reports.map((r) => r.reporterId).filter((id): id is string => Boolean(id));
    const reporters = await this.prisma.user.findMany({
      where: { id: { in: reporterIds } },
      select: { id: true, fullName: true },
    });
    const reporterName = new Map(reporters.map((r) => [r.id, r.fullName]));

    const now = Date.now();
    const targetHours = this.config.getNumber(CONFIG_KEYS.SAFEGUARDING_FIRST_RESPONSE_HOURS);

    return {
      targetHours,
      reports: reports.map((report) => ({
        id: report.id,
        source: report.source,
        reporter: report.reporterId ? reporterName.get(report.reporterId) ?? null : null,
        subjectTeacher: report.teacher
          ? { id: report.teacher.userId, fullName: report.teacher.user.fullName }
          : null,
        subjectLearner: report.subjectLearnerId
          ? {
              id: report.subjectLearnerId,
              fullName: learnerName.get(report.subjectLearnerId) ?? null,
            }
          : null,
        relatedSessionId: report.relatedSessionId,
        ticket: report.ticket,
        summary: report.summary,
        evidence: report.evidenceJson,
        state: report.state,
        assignedTo: report.assignedTo,
        createdAt: report.createdAt,
        ageMinutes: Math.floor((now - report.createdAt.getTime()) / 60_000),
        firstResponseDueAt: report.firstResponseDueAt,
        firstResponseAt: report.firstResponseAt,
        // FR-SAF-005: the countdown, and whether it has been missed.
        slaMinutesRemaining: report.firstResponseAt
          ? null
          : Math.round((report.firstResponseDueAt.getTime() - now) / 60_000),
        slaBreached: !report.firstResponseAt && report.firstResponseDueAt.getTime() < now,
        actionTaken: report.actionTaken,
        closedAt: report.closedAt,
      })),
    };
  }

  /**
   * FR-SAF-002: repeated attempts by a teacher to pass contact details to a
   * minor. Surfaced on this queue rather than buried in a moderation log.
   */
  async redactionFlags(actorId: string) {
    await this.assertDesignated(actorId);

    const flags = await this.prisma.redactionFlag.groupBy({
      by: ['teacherId'],
      _count: true,
      _max: { occurredAt: true },
      orderBy: { _count: { teacherId: 'desc' } },
    });

    const teachers = await this.prisma.teacher.findMany({
      where: { userId: { in: flags.map((f) => f.teacherId) } },
      include: { user: { select: { fullName: true } } },
    });
    const name = new Map(teachers.map((t) => [t.userId, t.user.fullName]));

    return flags.map((flag) => ({
      teacherId: flag.teacherId,
      teacherName: name.get(flag.teacherId) ?? null,
      attempts: flag._count,
      lastAt: flag._max.occurredAt,
    }));
  }

  /**
   * Raises a report. FR-SAF-005 stamps the 4-hour deadline now, so a later
   * change to the configured target cannot retroactively make a breach
   * compliant — or a compliant response late.
   */
  async create(input: {
    source: SafeguardingSource;
    reporterId?: string;
    subjectTeacherId?: string;
    subjectLearnerId?: string;
    relatedSessionId?: string;
    ticketId?: string;
    summary: string;
    evidence?: Record<string, unknown>;
  }) {
    const targetHours = this.config.getNumber(CONFIG_KEYS.SAFEGUARDING_FIRST_RESPONSE_HOURS);
    const now = new Date();

    const report = await this.prisma.safeguardingReport.create({
      data: {
        id: randomUUID(),
        source: input.source,
        reporterId: input.reporterId ?? null,
        subjectTeacherId: input.subjectTeacherId ?? null,
        subjectLearnerId: input.subjectLearnerId ?? null,
        relatedSessionId: input.relatedSessionId ?? null,
        ticketId: input.ticketId ?? null,
        summary: input.summary,
        evidenceJson: (input.evidence ?? null) as never,
        firstResponseDueAt: new Date(now.getTime() + targetHours * 3_600_000),
      },
    });

    // FR-SUP-007: a safeguarding ticket never sits in the general pool. It is
    // unassigned from whoever had it and its visibility moves to this queue.
    if (input.ticketId) {
      await this.prisma.ticket.update({
        where: { id: input.ticketId },
        data: {
          category: 'safeguarding',
          priority: 'urgent',
          assigneeId: null,
          firstResponseDueAt: report.firstResponseDueAt,
        },
      });
    }

    await this.audit.record({
      action: 'safeguarding.report_created',
      entity: 'safeguarding_report',
      entityId: report.id,
      actorId: input.reporterId ?? null,
      after: {
        source: input.source,
        subjectTeacherId: input.subjectTeacherId,
        firstResponseDueAt: report.firstResponseDueAt,
      },
    });

    this.logger.warn({
      msg: 'Safeguarding report raised',
      reportId: report.id,
      source: input.source,
      firstResponseDueAt: report.firstResponseDueAt,
    });

    return { id: report.id, firstResponseDueAt: report.firstResponseDueAt };
  }

  /** FR-SAF-005: stops the 4-hour clock. Only ever set once. */
  async recordFirstResponse(input: { reportId: string; note: string; actorId: string }) {
    await this.assertDesignated(input.actorId);

    const report = await this.prisma.safeguardingReport.findUnique({
      where: { id: input.reportId },
    });
    if (!report) throw AppError.notFound();
    if (report.closedAt) throw AppError.conflict('errors.safeguarding.already_closed');

    const now = new Date();
    const updated = await this.prisma.safeguardingReport.update({
      where: { id: input.reportId },
      data: {
        firstResponseAt: report.firstResponseAt ?? now,
        state: report.state === 'open' ? 'in_review' : report.state,
        assignedTo: report.assignedTo ?? input.actorId,
      },
    });

    await this.audit.record({
      action: 'safeguarding.first_response',
      entity: 'safeguarding_report',
      entityId: input.reportId,
      actorId: input.actorId,
      after: {
        firstResponseAt: updated.firstResponseAt,
        withinTarget: (updated.firstResponseAt ?? now) <= report.firstResponseDueAt,
      },
      reason: input.note,
    });

    return {
      firstResponseAt: updated.firstResponseAt,
      withinTarget: (updated.firstResponseAt ?? now) <= report.firstResponseDueAt,
    };
  }

  /**
   * §4.6: "Actionable directly to immediate teacher suspension."
   *
   * FR-AI-005: suspending a teacher materially affects a person, so it names the
   * deciding admin and carries their reason. FR-TVR-009's four consequences are
   * applied by the freeze service, which is the only place they live.
   */
  async suspendTeacher(input: { reportId: string; reason: string; actorId: string }) {
    await this.assertDesignated(input.actorId);

    const reason = input.reason.trim();
    if (!reason) throw AppError.badRequest('errors.freeze.reason_required');

    const report = await this.prisma.safeguardingReport.findUnique({
      where: { id: input.reportId },
    });
    if (!report?.subjectTeacherId) throw AppError.notFound();

    const result = await this.freeze.freezeManually({
      scope: 'teacher',
      subjectId: report.subjectTeacherId,
      category: 'safeguarding',
      reason,
      actorId: input.actorId,
    });

    await this.prisma.teacher.update({
      where: { userId: report.subjectTeacherId },
      data: { suspendedAt: new Date(), suspendedReason: reason },
    });

    await this.prisma.safeguardingReport.update({
      where: { id: input.reportId },
      data: {
        state: 'actioned',
        actionTaken: `Teacher suspended. ${reason}`,
        decidedBy: input.actorId,
        firstResponseAt: report.firstResponseAt ?? new Date(),
      },
    });

    await this.audit.record({
      action: 'safeguarding.actioned',
      entity: 'safeguarding_report',
      entityId: input.reportId,
      actorId: input.actorId,
      after: { action: 'teacher_suspended', teacherId: report.subjectTeacherId, ...result },
      reason,
    });

    return result;
  }

  /** §4.6: closed, never deleted. The evidence stays. */
  async close(input: { reportId: string; actionTaken: string; actorId: string }) {
    await this.assertDesignated(input.actorId);

    const actionTaken = input.actionTaken.trim();
    if (!actionTaken) throw AppError.badRequest('errors.safeguarding.action_required');

    const report = await this.prisma.safeguardingReport.findUnique({
      where: { id: input.reportId },
    });
    if (!report) throw AppError.notFound();
    if (report.closedAt) throw AppError.conflict('errors.safeguarding.already_closed');

    const now = new Date();
    await this.prisma.safeguardingReport.update({
      where: { id: input.reportId },
      data: {
        state: 'closed',
        actionTaken,
        decidedBy: input.actorId,
        closedAt: now,
        firstResponseAt: report.firstResponseAt ?? now,
      },
    });

    await this.audit.record({
      action: 'safeguarding.closed',
      entity: 'safeguarding_report',
      entityId: input.reportId,
      actorId: input.actorId,
      before: { state: report.state },
      after: { state: 'closed', closedAt: now },
      reason: actionTaken,
    });

    return { closedAt: now };
  }

  /** §3: the red badge, and the count in the browser tab title. */
  async openCount(userId: string): Promise<number> {
    if (!(await this.isDesignated(userId))) return 0;
    return this.prisma.safeguardingReport.count({
      where: { state: { in: ['open', 'in_review'] } },
    });
  }
}
