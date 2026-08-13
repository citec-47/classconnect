import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';
import { AuditService } from '../audit/audit.service';
import { NotificationsService } from '../notifications/notifications.service';
import { FieldEncryptionService } from './field-encryption.service';
import { AppError } from '../common/http-exception.filter';
import { MANDATORY_CHECKLIST_KEYS, VERIFICATION_CHECKLIST } from './verification-checklist';
import type { VerificationStatus } from '@classconnect/db';
import type { AuthenticatedUser } from '../rbac/decorators';
import type { TeacherApplicationInput, VerificationDecisionInput } from '@classconnect/shared';

/**
 * Teacher onboarding and verification — FR-TVR-001..010.
 *
 * AS-06 names this process as *the* control on teacher authenticity, so the
 * rules here are deliberately unforgiving: no bulk approval, no approval
 * without every mandatory checklist item recorded, and no listing or payment
 * before approval.
 */
@Injectable()
export class TeachersService {
  private readonly logger = new Logger(TeachersService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
    private readonly encryption: FieldEncryptionService,
  ) {}

  /**
   * FR-TVR-001: the application captures identity, qualification, subjects,
   * experience, languages and payout details.
   * FR-TVR-003: an applicant moves draft -> submitted.
   */
  async submitApplication(user: AuthenticatedUser, input: TeacherApplicationInput) {
    const teacher = await this.prisma.teacher.findUnique({
      where: { userId: user.id },
      // The applicant's name, for the notification that tells staff a review is
      // waiting — a queue item reading "a teacher applied" names nobody.
      include: { user: { select: { fullName: true } } },
    });
    if (!teacher) throw AppError.notFound();

    /**
     * The application is editable while it is still open.
     *
     * Registration already puts a self-registered teacher in `submitted`, so
     * refusing that state would lock them out of the very form they were sent
     * to fill in. `more_info_required` must stay open too — FR-TVR-006 gives
     * the applicant the right to resubmit.
     *
     * Closed once decided: an approved teacher cannot quietly rewrite the
     * credentials an Admin signed off (FR-TVR-010 keeps that evidence), and a
     * rejected one starts again rather than editing in place.
     */
    const open: VerificationStatus[] = ['draft', 'submitted', 'under_review', 'more_info_required'];
    if (!open.includes(teacher.verificationStatus)) {
      throw AppError.conflict('errors.teacher.application_closed');
    }

    /*
     * Batched, not interactive.
     *
     * `$transaction(async (tx) => …)` opens a transaction and then makes a
     * separate round trip for each statement inside it, holding a connection
     * open across all of them. Against a database in another region that is
     * six round trips of pure latency — measured at roughly 14s of a 35s
     * submission on the §6.2 target link, which is past the client's own
     * timeout, so the applicant saw "that is taking longer than expected" for a
     * request that was in fact still working.
     *
     * Nothing in here reads a value written by the statement before it, so the
     * array form applies: Prisma sends the whole batch in one go, still inside
     * one transaction with the same all-or-nothing guarantee.
     */
    await this.prisma.$transaction([
      this.prisma.teacher.update({
        where: { userId: user.id },
        data: {
          bio: input.bio ?? null,
          yearsExperience: input.yearsExperience,
          highestQualification: input.highestQualification,
          institution: input.institution,
          qualificationYear: input.qualificationYear,
          languages: input.languages,
          // FR-PRO-005 / NFR-SEC-003: never stored or returned in clear.
          //
          // Omitted rather than nulled when absent: the applicant form no longer
          // asks for the number, and a resubmission that simply does not carry
          // it must not erase one an admin recorded earlier.
          ...(input.nationalId
            ? { nationalIdEnc: this.encryption.encrypt(input.nationalId) }
            : {}),
          addressEnc: input.address ? this.encryption.encrypt(input.address) : null,
          payoutWalletEnc: this.encryption.encrypt(input.payoutWallet),
          payoutMethod: input.payoutMethod,
          // FR-ERN-010: a wallet is unverified until Finance confirms it.
          walletVerified: false,
          kycComplete: false,
          verificationStatus: 'submitted',
          submittedAt: new Date(),
          rejectionReason: null,
        },
      }),

      this.prisma.teacherSubject.deleteMany({ where: { teacherId: user.id } }),
      this.prisma.teacherSubject.createMany({
        data: input.subjects.map((s) => ({
          teacherId: user.id,
          subjectId: s.subjectId,
          levelId: s.levelId,
        })),
        skipDuplicates: true,
      }),

      /*
       * FR-TVR-004: the queue shows a checklist; the rows are created up front
       * so an admin cannot approve an application that has none.
       *
       * Added, never replaced. `verification_checklist_items` carries a
       * `DO INSTEAD NOTHING` rule on DELETE (FR-TVR-010 / §4.4: a verification
       * decision and its evidence are retained, and superseded by a later
       * decision rather than removed). A `deleteMany` there does not fail — it
       * silently reports zero rows — so the delete-then-recreate this used to do
       * left every existing row in place and then collided with them on the
       * unique `(teacher_id, item_key)`, turning every resubmission into a 500.
       *
       * `skipDuplicates` makes this ensure-the-rows-exist, which is all the
       * comment above ever asked for. An item an admin has already recorded
       * keeps its finding; the application going back to `submitted` is what
       * tells them to look again.
       */
      this.prisma.verificationChecklistItem.createMany({
        data: VERIFICATION_CHECKLIST.map((item) => ({
          teacherId: user.id,
          itemKey: item.key,
          verified: false,
        })),
        skipDuplicates: true,
      }),
    ]);

    await this.audit.record({
      action: 'teacher.applied',
      entity: 'teacher',
      entityId: user.id,
      actorId: user.id,
      after: { subjects: input.subjects.length, qualification: input.highestQualification },
    });

    /*
     * Told, but not waited for.
     *
     * These two took 11.3s of a 35s submission — measured — and the applicant
     * has no stake in either. Their own confirmation is a courtesy they are
     * about to see on screen anyway, and the staff alert is for somebody who is
     * not at the keyboard. Awaiting them put a message *to* the applicant ahead
     * of the answer *for* the applicant, and pushed the whole request past the
     * client's 30s ceiling: the submission worked and the browser reported a
     * timeout.
     *
     * Failures are logged, never thrown — the application is already committed
     * by this point, and a notification that did not send is not a submission
     * that did not happen.
     *
     * Caveat worth knowing: on a serverless host the instance may be frozen
     * once the response is written, which can cut these short. That is a real
     * trade — on the deployment target it argues for handing this to a queue
     * rather than for making the applicant wait.
     */
    void this.notifications
      .notifyUser(user.id, 'teacherApplicationSubmitted')
      .catch((error: Error) =>
        this.logger.error(`Applicant notification failed for ${user.id}: ${error.message}`),
      );

    /*
     * FR-TVR-004: the application is only useful once somebody knows it is
     * waiting. The applicant was told, and nobody who could act was — the queue
     * only showed it to whoever happened to open that screen.
     *
     * Support is told alongside Ops because both now hold
     * `teacher:verification:decide`, and an applicant who waits on one team
     * waits longer for no reason.
     */
    void this.notifications
      .notifyRoles(
        ['admin_ops', 'super_admin', 'support_agent'],
        'teacherVerificationPending',
        { applicant: teacher.user.fullName },
        /*
         * The key FR-NOT-005 wants, recorded — but not yet enforced.
         *
         * `dedupeKey` is written to an indexed column and nothing reads it
         * before inserting: there is no unique constraint and no prior lookup.
         * So a teacher who resubmits three times puts three alerts on the desk
         * today. Passing the key anyway means the data is already correct for
         * whenever the check lands; do not read it as protection that exists.
         */
        { dedupeKey: `teacher-verification:${user.id}` },
      )
      .catch((error: Error) =>
        this.logger.error(`Staff verification alert failed for ${user.id}: ${error.message}`),
      );

    return this.getOwnApplication(user);
  }

  /** The applicant's own view. Never exposes another teacher's private fields. */
  async getOwnApplication(user: AuthenticatedUser) {
    const teacher = await this.prisma.teacher.findUnique({
      where: { userId: user.id },
      include: {
        documents: {
          select: {
            id: true,
            type: true,
            fileName: true,
            expiresOn: true,
            verified: true,
            scanStatus: true,
            uploadedAt: true,
          },
        },
        subjects: {
          select: {
            subject: { select: { id: true, code: true, nameEn: true, nameFr: true } },
            level: { select: { id: true, code: true, nameEn: true, nameFr: true } },
          },
        },
      },
    });
    if (!teacher) throw AppError.notFound();

    return {
      status: teacher.verificationStatus,
      submittedAt: teacher.submittedAt,
      verifiedAt: teacher.verifiedAt,
      rejectionReason: teacher.rejectionReason,
      suspendedAt: teacher.suspendedAt,
      bio: teacher.bio,
      yearsExperience: teacher.yearsExperience,
      highestQualification: teacher.highestQualification,
      institution: teacher.institution,
      qualificationYear: teacher.qualificationYear,
      languages: teacher.languages,
      payoutMethod: teacher.payoutMethod,
      // FR-PRO-005: the applicant sees a masked confirmation, not the value.
      payoutWalletPreview: teacher.payoutWalletEnc
        ? this.encryption.maskedPreview(teacher.payoutWalletEnc)
        : null,
      walletVerified: teacher.walletVerified,
      documents: teacher.documents,
      subjects: teacher.subjects,
    };
  }

  /**
   * FR-TVR-004: the Admin verification queue — each application, its documents,
   * the checklist, and space for required free-text findings.
   */
  async verificationQueue(status?: 'submitted' | 'under_review' | 'more_info_required') {
    const teachers = await this.prisma.teacher.findMany({
      where: {
        verificationStatus: status ?? { in: ['submitted', 'under_review', 'more_info_required'] },
      },
      orderBy: { submittedAt: 'asc' },
      include: {
        user: { select: { id: true, fullName: true, phoneE164: true, email: true } },
        documents: {
          /*
           * Only files that actually arrived.
           *
           * A row is created when an upload is *signed*, so every abandoned
           * attempt leaves one behind at `awaiting_upload` with a filename and
           * no bytes. The applicant's own page filters these out; the queue did
           * not, so a reviewer saw fifteen documents where seven exist — eight
           * of them unopenable, and no way to tell which from the list.
           */
          where: { scanStatus: { not: 'awaiting_upload' } },
          select: {
            id: true,
            type: true,
            fileName: true,
            mimeType: true,
            sizeBytes: true,
            expiresOn: true,
            verified: true,
            scanStatus: true,
            uploadedAt: true,
          },
        },
        checklist: true,
        subjects: {
          select: {
            subject: { select: { id: true, code: true, nameEn: true, nameFr: true } },
            level: { select: { id: true, code: true, nameEn: true, nameFr: true } },
          },
        },
      },
    });

    return teachers.map((teacher) => ({
      teacherId: teacher.userId,
      applicant: {
        // Admin needs to reach the applicant, so contact details are present
        // here — this endpoint requires teacher:verification:read, which only
        // admin_ops and super_admin hold.
        fullName: teacher.user.fullName,
        phone: teacher.user.phoneE164,
        email: teacher.user.email,
      },
      status: teacher.verificationStatus,
      submittedAt: teacher.submittedAt,
      waitingDays: teacher.submittedAt
        ? Math.floor((Date.now() - teacher.submittedAt.getTime()) / 86_400_000)
        : 0,
      qualification: {
        highest: teacher.highestQualification,
        institution: teacher.institution,
        year: teacher.qualificationYear,
        yearsExperience: teacher.yearsExperience,
      },
      // NFR-SEC-003: the identity document number is decrypted only in this
      // admin view, which is itself audited below on decision.
      nationalIdPreview: teacher.nationalIdEnc
        ? this.encryption.maskedPreview(teacher.nationalIdEnc)
        : null,
      payoutWalletPreview: teacher.payoutWalletEnc
        ? this.encryption.maskedPreview(teacher.payoutWalletEnc)
        : null,
      // FR-TVR-004: the queue shows each application's documents. FR-FIL-001
      // keeps an unscanned file unopenable, so the admin is told which is which
      // rather than being handed a link that fails.
      documents: teacher.documents.map((document) => ({
        ...document,
        downloadable: document.scanStatus === 'clean',
      })),
      subjects: teacher.subjects,
      checklist: VERIFICATION_CHECKLIST.map((item) => {
        const recorded = teacher.checklist.find((c) => c.itemKey === item.key);
        return {
          key: item.key,
          labelKey: item.labelKey,
          mandatory: item.mandatory,
          verified: recorded?.verified ?? false,
          findings: recorded?.findings ?? null,
          verifiedBy: recorded?.verifiedBy ?? null,
          verifiedAt: recorded?.verifiedAt ?? null,
        };
      }),
    }));
  }

  /**
   * FR-TVR-005: approval requires an Admin to affirmatively record that each
   * checklist item was verified. Bulk approval shall not be possible.
   * FR-TVR-006: on rejection or more_info_required, the applicant is notified
   * with the reason and may resubmit.
   */
  async decide(
    admin: AuthenticatedUser,
    teacherId: string,
    input: VerificationDecisionInput,
  ) {
    const teacher = await this.prisma.teacher.findUnique({
      where: { userId: teacherId },
      include: { checklist: true },
    });
    if (!teacher) throw AppError.notFound();

    if (teacher.verificationStatus === 'approved') {
      throw AppError.conflict('errors.verification.already_decided');
    }

    // Merge the submitted checklist over what is already recorded, then judge
    // approval against the merged state. This lets an admin work through the
    // queue across several sittings without losing earlier findings.
    const merged = new Map(teacher.checklist.map((c) => [c.itemKey, c.verified]));
    for (const item of input.checklist) merged.set(item.itemKey, item.verified);

    if (input.decision === 'approved') {
      const missing = MANDATORY_CHECKLIST_KEYS.filter((key) => merged.get(key) !== true);
      if (missing.length > 0) {
        throw AppError.badRequest('errors.verification.checklist_incomplete', {
          missing: missing.join(', '),
        });
      }
    }

    const now = new Date();

    await this.prisma.$transaction(async (tx) => {
      for (const item of input.checklist) {
        await tx.verificationChecklistItem.upsert({
          where: { teacherId_itemKey: { teacherId, itemKey: item.itemKey } },
          create: {
            teacherId,
            itemKey: item.itemKey,
            verified: item.verified,
            findings: item.findings ?? null,
            verifiedBy: admin.id,
            verifiedAt: now,
          },
          update: {
            verified: item.verified,
            findings: item.findings ?? null,
            verifiedBy: admin.id,
            verifiedAt: now,
          },
        });
      }

      await tx.teacher.update({
        where: { userId: teacherId },
        data: {
          verificationStatus: input.decision,
          // FR-TVR-010: the deciding admin's identity is retained.
          verifiedBy: admin.id,
          verifiedAt: input.decision === 'approved' ? now : null,
          rejectionReason: input.decision === 'approved' ? null : (input.reason ?? null),
        },
      });
    });

    // FR-TVR-010: the decision, its evidence and the deciding admin are retained.
    await this.audit.record({
      action:
        input.decision === 'approved'
          ? 'teacher.approved'
          : input.decision === 'rejected'
            ? 'teacher.rejected'
            : 'teacher.more_info_required',
      entity: 'teacher',
      entityId: teacherId,
      actorId: admin.id,
      before: { status: teacher.verificationStatus },
      after: {
        status: input.decision,
        checklist: input.checklist,
        reason: input.reason,
      },
    });

    const eventType =
      input.decision === 'approved'
        ? 'teacherApproved'
        : input.decision === 'rejected'
          ? 'teacherRejected'
          : 'teacherMoreInfo';

    await this.notifications.notifyUser(teacherId, eventType, {
      reason: input.reason ?? '',
    });

    return { teacherId, status: input.decision };
  }

  /**
   * FR-TVR-009: immediate suspension cancels future sessions, notifies affected
   * learners and parents, freezes payouts pending review, and triggers
   * reassignment.
   */
  async suspend(admin: AuthenticatedUser, teacherId: string, reason: string) {
    const teacher = await this.prisma.teacher.findUnique({ where: { userId: teacherId } });
    if (!teacher) throw AppError.notFound();

    const now = new Date();

    const affected = await this.prisma.$transaction(async (tx) => {
      await tx.teacher.update({
        where: { userId: teacherId },
        data: { suspendedAt: now, suspendedReason: reason },
      });

      // Future sessions are cancelled. Past sessions are left untouched: they
      // are the evidence base for both earnings and any investigation.
      const future = await tx.session.findMany({
        where: { teacherId, startsAtUtc: { gt: now }, status: 'scheduled' },
        select: {
          id: true,
          learnerId: true,
          cohortId: true,
          cohort: { select: { members: { select: { learnerId: true } } } },
        },
      });

      await tx.session.updateMany({
        where: { teacherId, startsAtUtc: { gt: now }, status: 'scheduled' },
        data: {
          status: 'cancelled_by_teacher',
          cancelledAt: now,
          cancelReason: 'teacher_suspended',
        },
      });

      // FR-TVR-009: assignments re-enter the queue for reassignment.
      await tx.assignment.updateMany({
        where: { teacherId, status: 'accepted' },
        data: { status: 'ended', endedAt: now },
      });

      // FR-ERN-010 / FR-TVR-009: payouts freeze pending review.
      await tx.payout.updateMany({
        where: { teacherId, status: { in: ['requested', 'approved'] } },
        data: { status: 'rejected', failureReason: 'teacher_suspended' },
      });

      const learnerIds = new Set<string>();
      for (const session of future) {
        if (session.learnerId) learnerIds.add(session.learnerId);
        for (const member of session.cohort?.members ?? []) learnerIds.add(member.learnerId);
      }
      return { cancelledSessions: future.length, learnerIds: [...learnerIds] };
    });

    await this.audit.record({
      action: 'teacher.suspended',
      entity: 'teacher',
      entityId: teacherId,
      actorId: admin.id,
      reason,
      after: { cancelledSessions: affected.cancelledSessions },
    });

    await this.notifications.notifyUser(teacherId, 'teacherSuspended', { reason });
    await this.notifyAffectedParties(affected.learnerIds);

    return {
      teacherId,
      cancelledSessions: affected.cancelledSessions,
      affectedLearners: affected.learnerIds.length,
    };
  }

  /** FR-TVR-009: affected learners and their guardians are told. */
  private async notifyAffectedParties(learnerIds: string[]): Promise<void> {
    if (learnerIds.length === 0) return;

    const learners = await this.prisma.learner.findMany({
      where: { id: { in: learnerIds } },
      select: {
        id: true,
        userId: true,
        guardians: { select: { guardianId: true } },
      },
    });

    const recipients = new Set<string>();
    for (const learner of learners) {
      if (learner.userId) recipients.add(learner.userId);
      for (const guardian of learner.guardians) recipients.add(guardian.guardianId);
    }

    for (const userId of recipients) {
      await this.notifications.notifyUser(userId, 'sessionCancelledTeacherSuspended', {}, {
        dedupeKey: `teacher_suspended:${userId}`,
      });
    }
  }
}
