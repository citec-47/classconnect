import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { FreezeCategory } from '@prisma/client';
import { CONFIG_KEYS, freezeDateFor, isBlockedWhileFrozen } from '@classconnect/shared';
import { PrismaService } from '../common/prisma.service';
import { PlatformConfigService } from '../common/platform-config.service';
import { AppError } from '../common/http-exception.filter';
import { AuditService } from '../audit/audit.service';
import { NotificationsService } from '../notifications/notifications.service';

/**
 * Account freezing (§5.3, §5.4, §5.5 of the admin brief).
 *
 * Two mechanisms share one table and one set of consequences:
 *
 *   automatic — a deterministic contractual rule, preceded by five notices and
 *               reversible by the payer in one tap. That combination is what
 *               places it on the permitted side of the FR-AI-005 boundary.
 *   manual    — an admin decision with a mandatory reason and category.
 *
 * §5.5: "A manual freeze outranks the automatic rule: paying an instalment does
 * not lift a manual freeze." That rule is enforced in exactly one place —
 * `unfreezeForPayment` refuses to touch anything whose `kind` is `manual`.
 */
@Injectable()
export class FreezeService {
  private readonly logger = new Logger(FreezeService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: PlatformConfigService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
  ) {}

  // -------------------------------------------------------------------------
  // Reading state
  // -------------------------------------------------------------------------

  /**
   * §5.5: the account shows *which* kind of freeze it is under, because the
   * remedy differs — "Frozen — non-payment (automatic)" is cleared by paying,
   * "Frozen — manual: <reason>" is not.
   */
  async learnerFreezeState(learnerId: string) {
    const live = await this.prisma.accountFreeze.findMany({
      where: { learnerId, liftedAt: null },
      include: { instalment: true },
      orderBy: { appliedAt: 'desc' },
    });

    return this.summarise(live);
  }

  async teacherFreezeState(teacherUserId: string) {
    const live = await this.prisma.accountFreeze.findMany({
      where: { teacherUserId, liftedAt: null },
      orderBy: { appliedAt: 'desc' },
    });
    return this.summarise(live);
  }

  private summarise(live: { kind: string; effectiveFrom: Date; reason: string; category: string; id: string; appliedAt: Date }[]) {
    const now = new Date();
    // A freeze deferred to the end of a live session exists but has not bitten
    // yet (§5.4), so it is reported separately rather than as "frozen".
    const active = live.filter((f) => f.effectiveFrom <= now);
    const manual = active.find((f) => f.kind === 'manual');
    const automatic = active.find((f) => f.kind === 'automatic');
    const pending = live.filter((f) => f.effectiveFrom > now);

    return {
      frozen: active.length > 0,
      // The manual one is reported first: it is the one that governs the remedy.
      kind: manual ? ('manual' as const) : automatic ? ('automatic' as const) : null,
      reason: manual?.reason ?? automatic?.reason ?? null,
      category: manual?.category ?? automatic?.category ?? null,
      since: manual?.appliedAt ?? automatic?.appliedAt ?? null,
      liftableByPayment: Boolean(automatic) && !manual,
      pendingFreezes: pending.map((f) => ({ id: f.id, effectiveFrom: f.effectiveFrom })),
      freezeIds: active.map((f) => f.id),
    };
  }

  /**
   * §5.4: the entitlement gate. A frozen learner can still sign in, see their
   * balance, pay, see their schedule and past feedback, and contact support.
   * They cannot join or book a lesson, start a quiz, open materials or submit
   * homework.
   *
   * FR-RBA-002: this is server-side. The learner PWA hides the affordances too,
   * but hiding them is presentation, not the control.
   */
  async assertCapability(learnerId: string, capability: string): Promise<void> {
    if (!isBlockedWhileFrozen(capability)) return;
    const state = await this.learnerFreezeState(learnerId);
    if (!state.frozen) return;

    throw AppError.forbidden(
      state.kind === 'manual' ? 'errors.freeze.manual_outranks' : 'errors.freeze.already_frozen',
    );
  }

  // -------------------------------------------------------------------------
  // §5.3 — the automatic rule
  // -------------------------------------------------------------------------

  /**
   * Freezes a learner because an instalment passed its due date plus grace.
   *
   * Idempotent: a partial unique index allows only one live automatic freeze per
   * learner, so a re-run of the daily job cannot stack duplicates. Returns null
   * when there was nothing to do.
   */
  async freezeForMissedInstalment(instalmentId: string): Promise<{ id: string } | null> {
    const instalment = await this.prisma.instalment.findUnique({
      where: { id: instalmentId },
      include: {
        schedule: {
          include: { subscription: { include: { learner: true, payer: true } } },
        },
      },
    });
    if (!instalment) throw AppError.notFound();
    if (instalment.state === 'paid' || instalment.state === 'cancelled') return null;

    const learner = instalment.schedule.subscription.learner;

    const existing = await this.prisma.accountFreeze.findFirst({
      where: { learnerId: learner.id, kind: 'automatic', liftedAt: null },
    });
    if (existing) return null;

    // §5.4: "Never freeze mid-session. If a freeze becomes due while the learner
    // is in a live class, it applies at session end." The decision is recorded
    // now — deferring the *record* as well would lose the fact that the rule
    // fired on the day it was supposed to.
    const liveSession = await this.liveSessionFor(learner.id);
    const effectiveFrom = liveSession
      ? this.expectedEndOf(liveSession)
      : new Date();

    const dueOn = instalment.dueOn.toISOString().slice(0, 10);
    const graceDays = this.config.getNumber(CONFIG_KEYS.INSTALMENT_GRACE_DAYS);

    const freeze = await this.prisma.accountFreeze.create({
      data: {
        id: randomUUID(),
        scope: 'learner',
        learnerId: learner.id,
        kind: 'automatic',
        category: 'non_payment',
        reason:
          `Instalment ${instalment.sequence} of ${instalment.amountXaf} XAF was due on ` +
          `${dueOn} and was not paid by ${freezeDateFor(dueOn, graceDays)} ` +
          `(due date plus ${graceDays} days' grace).`,
        triggeringInstalmentId: instalment.id,
        effectiveFrom,
        deferredForSessionId: liveSession?.id ?? null,
      },
    });

    // §5.4: freezing cancels future bookings and notifies the assigned teachers.
    const cancelled = await this.cancelFutureSessions(learner.id, effectiveFrom, freeze.id);

    await this.audit.record({
      action: 'account.frozen',
      entity: 'learner',
      entityId: learner.id,
      // A rule fired, so there is no actor. The trail names the instalment
      // instead, which FR-RBA-004 requires of every automatic freeze.
      actorId: null,
      after: {
        freezeId: freeze.id,
        kind: 'automatic',
        triggeringInstalmentId: instalment.id,
        instalmentSequence: instalment.sequence,
        effectiveFrom,
        deferredForSessionId: liveSession?.id ?? null,
        sessionsCancelled: cancelled,
      },
      reason: freeze.reason,
    });

    // FR-NOT-003: a freeze is transactional, so it is not disableable, and
    // FR-NOT-005's dedupe key stops a re-run of the job sending it twice.
    await this.notifications.notifyUser(
      instalment.schedule.subscription.payerUserId,
      'accountFrozen',
      {
        learner: learner.fullName,
        instalment: instalment.sequence,
        amount: instalment.amountXaf.toString(),
      },
      { dedupeKey: `freeze:${freeze.id}` },
    );

    this.logger.log({
      msg: 'Learner account frozen for non-payment',
      learnerId: learner.id,
      instalmentId: instalment.id,
      effectiveFrom,
    });

    return { id: freeze.id };
  }

  /**
   * §5.3: "On payment, the account unfreezes immediately and automatically."
   *
   * §5.5 draws the line this method exists to hold: a manual freeze is untouched.
   * The learner stays frozen and the reason on the account still says why.
   */
  async unfreezeForPayment(input: {
    learnerId: string;
    instalmentId: string;
  }): Promise<{ lifted: boolean; blockedByManual: boolean }> {
    const live = await this.prisma.accountFreeze.findMany({
      where: { learnerId: input.learnerId, liftedAt: null },
    });

    const automatic = live.filter((f) => f.kind === 'automatic');
    const blockedByManual = live.some((f) => f.kind === 'manual');

    if (automatic.length === 0) return { lifted: false, blockedByManual };

    const now = new Date();
    await this.prisma.accountFreeze.updateMany({
      where: { id: { in: automatic.map((f) => f.id) } },
      data: {
        liftedAt: now,
        liftReason: `Instalment ${input.instalmentId} paid.`,
      },
    });

    for (const freeze of automatic) {
      await this.audit.record({
        action: 'account.unfrozen',
        entity: 'learner',
        entityId: input.learnerId,
        actorId: null,
        before: { freezeId: freeze.id, kind: 'automatic' },
        after: { liftedAt: now, triggeringInstalmentId: freeze.triggeringInstalmentId },
        reason: `Instalment ${input.instalmentId} paid.`,
      });
    }

    // §5.4: "On unfreeze, restore bookings where the slot is still free; where it
    // is not, prompt the learner to rebook."
    const restored = await this.restoreBookings(input.learnerId, automatic.map((f) => f.id));

    this.logger.log({
      msg: 'Learner account unfrozen on payment',
      learnerId: input.learnerId,
      lifted: automatic.length,
      bookingsRestored: restored.restored,
      rebookNeeded: restored.rebookNeeded,
      blockedByManual,
    });

    return { lifted: true, blockedByManual };
  }

  // -------------------------------------------------------------------------
  // §5.5 — manual freeze and unfreeze
  // -------------------------------------------------------------------------

  /**
   * §5.5: reason is mandatory and free-text, with a category alongside it. The
   * caller is responsible for having shown the consequences first (UI-007); the
   * consequence figures come from `previewLearnerFreeze` below so the dialog and
   * the action cannot disagree.
   */
  async freezeManually(input: {
    scope: 'learner' | 'teacher';
    subjectId: string;
    category: FreezeCategory;
    reason: string;
    actorId: string;
  }) {
    const reason = input.reason.trim();
    if (!reason) throw AppError.badRequest('errors.freeze.reason_required');

    const where =
      input.scope === 'learner'
        ? { learnerId: input.subjectId, kind: 'manual' as const, liftedAt: null }
        : { teacherUserId: input.subjectId, kind: 'manual' as const, liftedAt: null };

    const existing = await this.prisma.accountFreeze.findFirst({ where });
    if (existing) throw AppError.conflict('errors.freeze.already_frozen');

    const liveSession =
      input.scope === 'learner' ? await this.liveSessionFor(input.subjectId) : null;
    const effectiveFrom = liveSession ? this.expectedEndOf(liveSession) : new Date();

    const freeze = await this.prisma.accountFreeze.create({
      data: {
        id: randomUUID(),
        scope: input.scope,
        learnerId: input.scope === 'learner' ? input.subjectId : null,
        teacherUserId: input.scope === 'teacher' ? input.subjectId : null,
        kind: 'manual',
        category: input.category,
        reason,
        effectiveFrom,
        deferredForSessionId: liveSession?.id ?? null,
        createdBy: input.actorId,
      },
    });

    const consequences =
      input.scope === 'learner'
        ? { sessionsCancelled: await this.cancelFutureSessions(input.subjectId, effectiveFrom, freeze.id) }
        : await this.applyTeacherSuspensionConsequences(input.subjectId, freeze.id, reason);

    await this.audit.record({
      action: 'account.frozen',
      entity: input.scope,
      entityId: input.subjectId,
      actorId: input.actorId,
      after: {
        freezeId: freeze.id,
        kind: 'manual',
        category: input.category,
        effectiveFrom,
        deferredForSessionId: liveSession?.id ?? null,
        ...consequences,
      },
      reason,
    });

    return {
      id: freeze.id,
      effectiveFrom,
      deferred: Boolean(liveSession),
      ...consequences,
    };
  }

  /** §5.5: only an admin lifts a manual freeze, and the lift is audited too. */
  async unfreezeManually(input: {
    scope: 'learner' | 'teacher';
    subjectId: string;
    reason: string;
    actorId: string;
  }) {
    const reason = input.reason.trim();
    if (!reason) throw AppError.badRequest('errors.freeze.reason_required');

    const where =
      input.scope === 'learner'
        ? { learnerId: input.subjectId, liftedAt: null }
        : { teacherUserId: input.subjectId, liftedAt: null };

    const live = await this.prisma.accountFreeze.findMany({ where });
    if (live.length === 0) throw AppError.conflict('errors.freeze.not_frozen');

    const now = new Date();
    await this.prisma.accountFreeze.updateMany({
      where: { id: { in: live.map((f) => f.id) } },
      data: { liftedAt: now, liftedBy: input.actorId, liftReason: reason },
    });

    for (const freeze of live) {
      await this.audit.record({
        action: 'account.unfrozen',
        entity: input.scope,
        entityId: input.subjectId,
        actorId: input.actorId,
        before: { freezeId: freeze.id, kind: freeze.kind, category: freeze.category },
        after: { liftedAt: now },
        reason,
      });
    }

    const restored =
      input.scope === 'learner'
        ? await this.restoreBookings(input.subjectId, live.map((f) => f.id))
        : { restored: 0, rebookNeeded: 0 };

    return { lifted: live.length, ...restored };
  }

  /**
   * UI-007: "Every destructive dialog names the consequence." These are the
   * numbers the dialog interpolates, computed from the same queries the action
   * itself will run so the two cannot drift.
   */
  async previewLearnerFreeze(learnerId: string) {
    const now = new Date();
    const upcoming = await this.prisma.session.findMany({
      where: {
        learnerId,
        startsAtUtc: { gt: now },
        status: { in: ['scheduled', 'in_progress'] },
      },
      select: { id: true, teacherId: true },
    });

    const learner = await this.prisma.learner.findUnique({
      where: { id: learnerId },
      include: { guardians: true },
    });

    return {
      sessions: upcoming.length,
      teachers: new Set(upcoming.map((s) => s.teacherId)).size,
      guardians: learner?.guardians.length ?? 0,
      inLiveSession: Boolean(await this.liveSessionFor(learnerId)),
    };
  }

  /** FR-TVR-009: the four consequences the teacher dialog has to state. */
  async previewTeacherFreeze(teacherUserId: string) {
    const now = new Date();
    const upcoming = await this.prisma.session.findMany({
      where: {
        teacherId: teacherUserId,
        startsAtUtc: { gt: now },
        status: { in: ['scheduled', 'in_progress'] },
      },
      select: { id: true, learnerId: true },
    });

    const assignments = await this.prisma.assignment.count({
      where: { teacherId: teacherUserId, status: 'accepted' },
    });

    const pendingPayouts = await this.prisma.payout.aggregate({
      where: { teacherId: teacherUserId, status: { in: ['requested', 'approved'] } },
      _sum: { amountXaf: true },
      _count: true,
    });

    return {
      sessions: upcoming.length,
      learners: new Set(upcoming.map((s) => s.learnerId).filter(Boolean)).size,
      assignmentsToReassign: assignments,
      payoutsFrozen: pendingPayouts._count,
      payoutsFrozenXaf: (pendingPayouts._sum.amountXaf ?? 0n).toString(),
    };
  }

  // -------------------------------------------------------------------------
  // Consequences
  // -------------------------------------------------------------------------

  /**
   * Everyone who can act on a learner's account: the learner where they hold
   * their own sign-in, plus every linked guardian (FR-FAM-001/003).
   */
  private async peopleActingFor(learnerId: string): Promise<string[]> {
    const learner = await this.prisma.learner.findUnique({
      where: { id: learnerId },
      select: { userId: true, guardians: { select: { guardianId: true } } },
    });
    if (!learner) return [];

    const ids = new Set<string>(learner.guardians.map((g) => g.guardianId));
    if (learner.userId) ids.add(learner.userId);
    return [...ids];
  }

  /** §5.4: the learner is not pulled out of a lesson they are already in. */
  private async liveSessionFor(learnerId: string) {
    return this.prisma.session.findFirst({
      where: { learnerId, status: 'in_progress' },
      select: { id: true, startsAtUtc: true, durationMin: true },
    });
  }

  private expectedEndOf(session: { startsAtUtc: Date; durationMin: number }): Date {
    return new Date(session.startsAtUtc.getTime() + session.durationMin * 60_000);
  }

  /**
   * §5.4: "Freezing cancels future bookings and notifies the assigned teacher(s)."
   *
   * The freeze id goes on the cancellation reason so `restoreBookings` can find
   * exactly the sessions this freeze cancelled, and not ones cancelled for any
   * other reason.
   */
  private async cancelFutureSessions(
    learnerId: string,
    from: Date,
    freezeId: string,
  ): Promise<number> {
    const upcoming = await this.prisma.session.findMany({
      where: { learnerId, startsAtUtc: { gt: from }, status: 'scheduled' },
      select: { id: true, teacherId: true, startsAtUtc: true },
    });
    if (upcoming.length === 0) return 0;

    await this.prisma.session.updateMany({
      where: { id: { in: upcoming.map((s) => s.id) } },
      data: {
        status: 'cancelled_by_learner',
        cancelledAt: new Date(),
        cancelReason: `account_frozen:${freezeId}`,
      },
    });

    // §5.4: the assigned teachers are told, because the cancellation is not
    // their doing and they would otherwise find an empty slot with no reason.
    for (const teacherId of new Set(upcoming.map((s) => s.teacherId))) {
      await this.notifications.notifyUser(
        teacherId,
        'sessionsCancelledAccountFrozen',
        { count: upcoming.filter((s) => s.teacherId === teacherId).length },
        { dedupeKey: `freeze:${freezeId}:teacher:${teacherId}` },
      );
    }

    return upcoming.length;
  }

  /**
   * §5.4: "restore bookings where the slot is still free; where it is not,
   * prompt the learner to rebook."
   *
   * A slot is taken if the teacher has since been booked at that instant — the
   * `(teacher_id, starts_at_utc)` unique index would reject the restore, so it
   * is checked first rather than caught as a constraint violation.
   */
  private async restoreBookings(
    learnerId: string,
    freezeIds: string[],
  ): Promise<{ restored: number; rebookNeeded: number }> {
    const now = new Date();
    const reasons = freezeIds.map((id) => `account_frozen:${id}`);

    const cancelled = await this.prisma.session.findMany({
      where: {
        learnerId,
        status: 'cancelled_by_learner',
        cancelReason: { in: reasons },
        startsAtUtc: { gt: now },
      },
      select: { id: true, teacherId: true, startsAtUtc: true },
    });

    let restored = 0;
    let rebookNeeded = 0;

    for (const session of cancelled) {
      const clash = await this.prisma.session.findFirst({
        where: {
          teacherId: session.teacherId,
          startsAtUtc: session.startsAtUtc,
          status: { in: ['scheduled', 'in_progress'] },
        },
      });

      if (clash) {
        rebookNeeded += 1;
        continue;
      }

      await this.prisma.session.update({
        where: { id: session.id },
        data: { status: 'scheduled', cancelledAt: null, cancelReason: null },
      });
      restored += 1;
    }

    if (rebookNeeded > 0) {
      // A learner id is not a user id — a minor managed by a parent may have no
      // sign-in at all (FR-FAM-003). The prompt to rebook goes to whoever can
      // act on it: the learner if they hold credentials, and every linked
      // guardian regardless.
      for (const userId of await this.peopleActingFor(learnerId)) {
        await this.notifications.notifyUser(
          userId,
          'rebookNeeded',
          { count: rebookNeeded },
          { dedupeKey: `unfreeze:${learnerId}:${now.toISOString().slice(0, 10)}:${userId}` },
        );
      }
    }

    return { restored, rebookNeeded };
  }

  /**
   * FR-TVR-009 / §5.5: freezing a teacher does four things, and the confirmation
   * dialog has already named all four in plain language.
   */
  private async applyTeacherSuspensionConsequences(
    teacherUserId: string,
    freezeId: string,
    reason: string,
  ) {
    const now = new Date();

    // 1. Cancel all future sessions.
    const upcoming = await this.prisma.session.findMany({
      where: { teacherId: teacherUserId, startsAtUtc: { gt: now }, status: 'scheduled' },
      select: { id: true, learnerId: true },
    });

    if (upcoming.length > 0) {
      await this.prisma.session.updateMany({
        where: { id: { in: upcoming.map((s) => s.id) } },
        data: {
          status: 'cancelled_by_teacher',
          cancelledAt: now,
          cancelReason: `teacher_suspended:${freezeId}`,
        },
      });
    }

    // 2. Notify the affected learners and their guardians.
    const learnerIds = [...new Set(upcoming.map((s) => s.learnerId).filter(Boolean))] as string[];
    const guardians = await this.prisma.guardianLearner.findMany({
      where: { learnerId: { in: learnerIds } },
      select: { guardianId: true },
    });

    for (const guardianId of new Set(guardians.map((g) => g.guardianId))) {
      await this.notifications.notifyUser(
        guardianId,
        'teacherSuspendedSessionsCancelled',
        // NFR-SEC-007: the suspension reason is internal. Families are told that
        // lessons are cancelled and that a replacement is being arranged, not
        // what a third party is accused of.
        { count: upcoming.length },
        { dedupeKey: `suspend:${freezeId}:guardian:${guardianId}` },
      );
    }

    // 3. Freeze payouts pending review. FR-AI-005 and §4.7.4: the money is held,
    //    not forfeited, and releasing it needs a named human decision.
    const held = await this.prisma.payout.updateMany({
      where: { teacherId: teacherUserId, status: { in: ['requested', 'approved'] } },
      data: {
        status: 'requested',
        heldReason: `Teacher suspended: ${reason}. Held pending review, not forfeited.`,
      },
    });

    // 4. Trigger reassignment of their learners.
    const reassigned = await this.prisma.assignment.updateMany({
      where: { teacherId: teacherUserId, status: { in: ['accepted', 'proposed'] } },
      data: { status: 'ended', endedAt: now },
    });

    return {
      sessionsCancelled: upcoming.length,
      learnersNotified: learnerIds.length,
      payoutsHeld: held.count,
      assignmentsEnded: reassigned.count,
    };
  }

  // -------------------------------------------------------------------------
  // §5.4 — deferred freezes
  // -------------------------------------------------------------------------

  /**
   * Called when a session ends. A freeze that was deferred because the learner
   * was mid-lesson takes effect now, and its future bookings are cancelled at
   * that point rather than when the rule fired.
   */
  async applyDeferredFreezes(sessionId: string): Promise<number> {
    const deferred = await this.prisma.accountFreeze.findMany({
      where: { deferredForSessionId: sessionId, liftedAt: null },
    });

    for (const freeze of deferred) {
      const now = new Date();
      await this.prisma.accountFreeze.update({
        where: { id: freeze.id },
        data: { effectiveFrom: now, deferredForSessionId: null },
      });
      if (freeze.learnerId) {
        await this.cancelFutureSessions(freeze.learnerId, now, freeze.id);
      }
      await this.audit.record({
        action: 'account.frozen',
        entity: freeze.scope,
        entityId: freeze.learnerId ?? freeze.teacherUserId ?? freeze.id,
        actorId: freeze.createdBy,
        after: { freezeId: freeze.id, tookEffectAt: now, afterSessionId: sessionId },
        reason: `Deferred to the end of session ${sessionId} (§5.4: never freeze mid-session).`,
      });
    }

    return deferred.length;
  }
}
