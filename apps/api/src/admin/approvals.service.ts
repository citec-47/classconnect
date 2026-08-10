import { Injectable } from '@nestjs/common';
import { ageInYears, isMinor } from '@classconnect/shared';
import { PrismaService } from '../common/prisma.service';
import { AppError } from '../common/http-exception.filter';
import { AuditService } from '../audit/audit.service';
import { NotificationsService } from '../notifications/notifications.service';

/**
 * §4.2 and §4.3 — the student approval queues.
 *
 * The rule these exist to enforce, from the acceptance criteria: "No student —
 * and especially no primary student — can be approved without recorded guardian
 * consent." That is checked here, server-side, not by disabling a button.
 *
 * Bulk approval does not exist. `decide` takes one learner id, and there is no
 * endpoint that takes a list.
 */

/**
 * Everything `computeChecks` needs, loaded once for a whole page of learners.
 *
 * The checks are comparisons; only their evidence needs the database. Loading
 * that evidence in bulk is what turns a queue that cost four queries per learner
 * into one that costs two queries per page.
 */
interface CheckContext {
  /** Keyed `guardianUserId:learnerId:consentType`, newest consent per key. */
  consents: Map<string, { grantedAt: Date }>;
  duplicatePhones: Set<string>;
  duplicateEmails: Set<string>;
}

/** The shape the checks read. Structural, so both callers can satisfy it. */
interface LearnerForChecks {
  id: string;
  dob: Date;
  levelId: string | null;
  userId: string | null;
  level: { schoolType: string; subjects: { subjectId: string }[] } | null;
  user: { id: string; phoneE164: string | null; email: string | null } | null;
  subjects: { subjectId: string }[];
  guardians: {
    isPrimary: boolean;
    acceptedAt: Date | null;
    guardian: { userId: string; user: { fullName: string; phoneVerifiedAt: Date | null } };
  }[];
}

/** A check the queue runs and the detail panel shows. §4.2/§4.3. */
export interface ApprovalCheck {
  key: string;
  labelKey: string;
  passed: boolean;
  /** A soft check informs the admin; a hard one blocks approval outright. */
  blocking: boolean;
  detail?: string;
}

@Injectable()
export class ApprovalsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
  ) {}

  /**
   * §4.3: the primary queue is the same mechanics filtered to Classes 1–6.
   * It is separated because this cohort carries the heaviest safeguarding
   * weight, and because four of its checks do not apply to anyone else.
   */
  async queue(cohort: 'all' | 'primary', actorId: string) {
    const learners = await this.prisma.learner.findMany({
      where: {
        approvalState: { in: ['submitted', 'more_info_required'] },
        ...(cohort === 'primary' ? { level: { schoolType: 'primary' } } : {}),
      },
      include: {
        // `subjects` on the level is what the catalogue check compares against.
        // Pulled here so the check does not have to re-fetch the level per row.
        level: { include: { subjects: { select: { subjectId: true } } } },
        user: { select: { id: true, phoneE164: true, email: true, status: true } },
        subjects: { include: { subject: true } },
        guardians: {
          include: {
            guardian: {
              include: {
                user: {
                  select: {
                    id: true,
                    fullName: true,
                    phoneE164: true,
                    email: true,
                    status: true,
                    phoneVerifiedAt: true,
                  },
                },
              },
            },
          },
        },
        subscriptions: { include: { plan: true }, orderBy: { createdAt: 'desc' }, take: 1 },
      },
      orderBy: { submittedAt: 'asc' },
    });

    /**
     * The evidence every check needs, for every learner, in two queries.
     *
     * This screen used to run four queries per learner and one audit write per
     * learner, all sequentially — against a database a network hop away that
     * measured 8.2 seconds for eight learners, and would have grown linearly
     * with the queue. The checks themselves are pure comparisons; only the
     * evidence needs the database, and it can be fetched for everyone at once.
     */
    const context = await this.loadCheckContext(learners);

    /**
     * FR-RBA-004: staff reading learners' personal data is auditable.
     *
     * One entry for the read, naming every learner it covered, rather than one
     * write per learner. The requirement is that the access is recorded and
     * attributable — which this satisfies — and a single entry keeps the trail
     * legible: a reviewer sees "opened the approval queue, saw these eight"
     * rather than eight rows they must infer were one action.
     */
    await this.audit.record({
      action: 'staff.viewed_learner',
      entity: 'approval_queue',
      entityId: cohort,
      actorId,
      after: { cohort, count: learners.length, learnerIds: learners.map((l) => l.id) },
    });

    const now = new Date();

    return Promise.all(
      learners.map(async (learner) => {
        const checks = this.computeChecks(learner, context);
        const primaryGuardian =
          learner.guardians.find((g) => g.isPrimary) ?? learner.guardians[0];

        return {
          learnerId: learner.id,
          fullName: learner.fullName,
          dob: learner.dob.toISOString().slice(0, 10),
          // FR-FAM-006: derived, never a stored flag and never typed by an admin.
          ageYears: ageInYears(learner.dob, now),
          isMinor: isMinor(learner.dob, now),
          level: learner.level
            ? {
                id: learner.level.id,
                nameEn: learner.level.nameEn,
                nameFr: learner.level.nameFr,
                schoolType: learner.level.schoolType,
              }
            : null,
          subjects: learner.subjects.map((s) => ({
            nameEn: s.subject.nameEn,
            nameFr: s.subject.nameFr,
          })),
          guardian: primaryGuardian
            ? {
                userId: primaryGuardian.guardian.userId,
                fullName: primaryGuardian.guardian.user.fullName,
                phone: primaryGuardian.guardian.user.phoneE164,
                email: primaryGuardian.guardian.user.email,
                verified: Boolean(primaryGuardian.guardian.user.phoneVerifiedAt),
              }
            : null,
          plan: learner.subscriptions[0]
            ? {
                code: learner.subscriptions[0].plan.code,
                nameEn: learner.subscriptions[0].plan.nameEn,
                nameFr: learner.subscriptions[0].plan.nameFr,
                priceXaf: learner.subscriptions[0].plan.priceXaf.toString(),
              }
            : null,
          hasOwnSignIn: Boolean(learner.userId),
          status: learner.approvalState,
          submittedAt: learner.submittedAt ?? learner.createdAt,
          ageOfRequestDays: Math.floor(
            (now.getTime() - (learner.submittedAt ?? learner.createdAt).getTime()) / 86_400_000,
          ),
          decisionReason: learner.decisionReason,
          checks,
          // The single fact the Approve button is bound to. Computed here so the
          // client cannot be the thing that decides it.
          approvable: checks.every((c) => !c.blocking || c.passed),
        };
      }),
    );
  }

  /**
   * The required checks from §4.2, plus the four extra ones §4.3 adds for
   * primary learners.
   *
   * Consent is blocking for everyone: §4.2 requires it "before the learner's
   * first session" (FR-SAF-009), and §4.3 makes it explicit that a primary
   * learner cannot be approved without it. Enforcing it at approval for both is
   * the stricter reading and the safer one.
   */
  async checksFor(learnerId: string): Promise<ApprovalCheck[]> {
    const learner = await this.prisma.learner.findUnique({
      where: { id: learnerId },
      include: {
        level: { include: { subjects: { select: { subjectId: true } } } },
        user: { select: { id: true, phoneE164: true, email: true } },
        subjects: true,
        guardians: {
          include: { guardian: { include: { user: true } } },
        },
      },
    });
    if (!learner) throw AppError.notFound();

    const context = await this.loadCheckContext([learner]);
    return this.computeChecks(learner, context);
  }

  /**
   * The database evidence every check needs, for a whole page of learners.
   *
   * Two queries regardless of how many learners are being checked, because the
   * checks themselves are comparisons and only the evidence needs fetching.
   * Written as a separate step so `checksFor` (one learner, on a decision) and
   * `queue` (many, on a page load) share one definition of what the evidence is.
   */
  private async loadCheckContext(
    learners: { id: string; user: { id: string; phoneE164: string | null; email: string | null } | null;
      guardians: { guardian: { userId: string } }[] }[],
  ): Promise<CheckContext> {
    const learnerIds = learners.map((l) => l.id);
    const guardianIds = [
      ...new Set(learners.flatMap((l) => l.guardians.map((g) => g.guardian.userId))),
    ];

    const phones = learners.map((l) => l.user?.phoneE164).filter((v): v is string => Boolean(v));
    const emails = learners.map((l) => l.user?.email).filter((v): v is string => Boolean(v));
    const learnerUserIds = learners.map((l) => l.user?.id).filter((v): v is string => Boolean(v));

    const [consents, duplicates] = await Promise.all([
      // FR-SAF-009 / NFR-PRV-003: recorded, timestamped consents with evidence.
      guardianIds.length > 0
        ? this.prisma.consent.findMany({
            where: {
              userId: { in: guardianIds },
              learnerId: { in: learnerIds },
              consentType: { in: ['guardian_consent_minor', 'session_recording'] },
              revokedAt: null,
            },
            orderBy: { grantedAt: 'desc' },
          })
        : Promise.resolve([]),

      // DAT-004: another account already holding a learner's contact details.
      phones.length + emails.length > 0
        ? this.prisma.user.findMany({
            where: {
              id: { notIn: learnerUserIds },
              OR: [
                ...(phones.length ? [{ phoneE164: { in: phones } }] : []),
                ...(emails.length ? [{ email: { in: emails } }] : []),
              ],
            },
            select: { id: true, phoneE164: true, email: true },
          })
        : Promise.resolve([]),
    ]);

    // Keyed by guardian+learner+type, so a lookup is a map hit rather than a scan.
    const consentMap = new Map<string, { grantedAt: Date }>();
    for (const consent of consents) {
      const key = `${consent.userId}:${consent.learnerId}:${consent.consentType}`;
      // Ordered newest first, so the first one seen for a key is the current one.
      if (!consentMap.has(key)) consentMap.set(key, { grantedAt: consent.grantedAt });
    }

    return {
      consents: consentMap,
      duplicatePhones: new Set(duplicates.map((d) => d.phoneE164).filter(Boolean) as string[]),
      duplicateEmails: new Set(duplicates.map((d) => d.email).filter(Boolean) as string[]),
    };
  }

  /**
   * The checks themselves: pure comparisons over already-loaded evidence.
   *
   * No database access, so running it for a page of learners costs nothing
   * beyond the one context load.
   */
  private computeChecks(learner: LearnerForChecks, context: CheckContext): ApprovalCheck[] {
    const isPrimary = learner.level?.schoolType === 'primary';
    const guardianLink = learner.guardians.find((g) => g.isPrimary) ?? learner.guardians[0];

    const consentFor = (type: string) =>
      guardianLink
        ? context.consents.get(`${guardianLink.guardian.userId}:${learner.id}:${type}`)
        : undefined;

    const consent = consentFor('guardian_consent_minor');
    const recordingConsent = consentFor('session_recording');

    const duplicate = Boolean(
      (learner.user?.phoneE164 && context.duplicatePhones.has(learner.user.phoneE164)) ||
        (learner.user?.email && context.duplicateEmails.has(learner.user.email)),
    );

    // FR-PRO-001/002: the chosen subjects must be taught at the chosen level.
    const offeredAtLevel = new Set(learner.level?.subjects.map((s) => s.subjectId) ?? []);
    const offCatalogue = learner.subjects.filter((s) => !offeredAtLevel.has(s.subjectId));

    const checks: ApprovalCheck[] = [
      {
        key: 'guardian_linked',
        labelKey: 'approvals.checkGuardianLinked',
        // FR-FAM-001: an adult learner manages themselves and needs no guardian.
        blocking: isMinor(learner.dob),
        passed: Boolean(guardianLink) && Boolean(guardianLink?.guardian.user.phoneVerifiedAt),
        detail: guardianLink ? guardianLink.guardian.user.fullName : undefined,
      },
      {
        key: 'dob_recorded',
        labelKey: 'approvals.checkDobRecorded',
        blocking: true,
        passed: Boolean(learner.dob),
      },
      {
        key: 'guardian_consent',
        labelKey: 'approvals.checkConsent',
        // The criterion the acceptance list singles out.
        blocking: isMinor(learner.dob),
        passed: Boolean(consent),
        detail: consent ? consent.grantedAt.toISOString() : undefined,
      },
      {
        key: 'catalogue',
        labelKey: 'approvals.checkCatalogue',
        blocking: true,
        passed: Boolean(learner.levelId) && learner.subjects.length > 0 && offCatalogue.length === 0,
        detail:
          offCatalogue.length > 0
            ? `${offCatalogue.length} subject(s) are not taught at this level`
            : undefined,
      },
      {
        key: 'duplicate',
        labelKey: 'approvals.checkDuplicate',
        blocking: true,
        passed: !duplicate,
      },
    ];

    if (isPrimary) {
      checks.push(
        {
          // FR-SAF-004: recording is on by default for a minor's one-to-one
          // sessions, and everyone is told — at booking and again on joining.
          key: 'recording_disclosed',
          labelKey: 'approvals.checkRecordingDisclosed',
          blocking: true,
          passed: Boolean(recordingConsent),
        },
        {
          // FR-FAM-003: credentials for a child exist only if a guardian granted
          // them. A primary learner arriving with their own sign-in and no such
          // grant is a fault, not a preference.
          key: 'no_self_sign_in',
          labelKey: 'approvals.checkNoSelfSignIn',
          blocking: true,
          passed: !learner.userId || Boolean(guardianLink?.acceptedAt),
        },
        {
          // FR-SAF-007: name, photograph, school and location are visible only
          // to linked guardians, assigned teachers and authorised staff. The
          // platform has no public learner profile, so this holds by design —
          // it is surfaced so the admin confirms it rather than assumes it.
          key: 'profile_locked',
          labelKey: 'approvals.checkProfileLocked',
          blocking: false,
          passed: true,
        },
      );
    }

    return checks;
  }

  /**
   * §4.2: Approve, Reject with reason, or Request more information.
   *
   * One learner per call. There is no list variant and no bulk endpoint, which
   * is what makes "bulk approve is not available" a property of the API rather
   * than of the screen.
   */
  async decide(input: {
    learnerId: string;
    decision: 'approved' | 'rejected' | 'more_info_required';
    reason?: string;
    actorId: string;
  }) {
    const learner = await this.prisma.learner.findUnique({
      where: { id: input.learnerId },
      include: {
        guardians: { include: { guardian: true } },
        level: true,
      },
    });
    if (!learner) throw AppError.notFound();

    if (learner.approvalState === 'approved' || learner.approvalState === 'rejected') {
      throw AppError.conflict('errors.approval.already_decided');
    }

    // §4.2: "Reason is mandatory on the latter two, and the guardian is notified
    // with it."
    const reason = input.reason?.trim() ?? '';
    if (input.decision !== 'approved' && !reason) {
      throw AppError.badRequest('errors.approval.reason_required');
    }

    if (input.decision === 'approved') {
      const checks = await this.checksFor(input.learnerId);
      const failed = checks.filter((c) => c.blocking && !c.passed);

      if (failed.length > 0) {
        // Consent gets its own message because it is the one an operator most
        // needs to act on, and NFR-USA-004 wants the remedy, not a list of keys.
        if (failed.some((c) => c.key === 'guardian_consent')) {
          throw AppError.badRequest('errors.approval.consent_missing');
        }
        throw AppError.badRequest('errors.approval.checks_incomplete', {
          missing: failed.map((c) => c.key).join(', '),
        });
      }
    }

    const now = new Date();
    const before = { approvalState: learner.approvalState, status: learner.status };

    const updated = await this.prisma.learner.update({
      where: { id: input.learnerId },
      data: {
        approvalState: input.decision,
        decisionReason: reason || null,
        // FR-AI-005: the deciding human is named on the record itself, not only
        // in the audit trail.
        approvedBy: input.actorId,
        approvedAt: input.decision === 'approved' ? now : null,
        status: input.decision === 'approved' ? 'active' : learner.status,
      },
    });

    await this.audit.record({
      action:
        input.decision === 'approved'
          ? 'learner.approved'
          : input.decision === 'rejected'
            ? 'learner.rejected'
            : 'learner.more_info_required',
      entity: 'learner',
      entityId: learner.id,
      actorId: input.actorId,
      before,
      after: { approvalState: updated.approvalState, status: updated.status },
      reason: reason || undefined,
    });

    // §4.2: the guardian is notified, with the reason.
    for (const link of learner.guardians) {
      await this.notifications.notifyUser(
        link.guardian.userId,
        input.decision === 'approved'
          ? 'studentApproved'
          : input.decision === 'rejected'
            ? 'studentRejected'
            : 'studentMoreInfo',
        { learner: learner.fullName, reason },
        { dedupeKey: `learner-decision:${learner.id}:${input.decision}:${now.toISOString()}` },
      );
    }

    return {
      learnerId: learner.id,
      approvalState: updated.approvalState,
      approvedAt: updated.approvedAt,
    };
  }

  /** §3: the badge counts for the two student queues. */
  async pendingCounts() {
    const [students, primary] = await Promise.all([
      this.prisma.learner.count({
        where: { approvalState: { in: ['submitted', 'more_info_required'] } },
      }),
      this.prisma.learner.count({
        where: {
          approvalState: { in: ['submitted', 'more_info_required'] },
          level: { schoolType: 'primary' },
        },
      }),
    ]);

    // The Students queue is everyone awaiting a decision; the Primary one is the
    // subset. They are reported separately because they are separate screens,
    // and an operator working one should not see the other's count move.
    return { students, primary };
  }
}
