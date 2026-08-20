import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';
import { currentContext } from '../common/correlation.middleware';
import { redact } from '../common/logger';

/**
 * FR-RBA-004: an immutable audit entry for every administrative action, every
 * permission change, every financial action, and every access to a learner's
 * personal data by staff.
 *
 * DAT-005: `audit_log` is append-only, enforced by database grants. There is
 * deliberately no update or delete method on this service.
 */
export type AuditAction =
  // Account and access
  | 'user.registered'
  | 'user.login'
  | 'user.login_failed'
  | 'user.locked'
  | 'user.suspended'
  /*
   * An admin removed an account from the platform.
   *
   * DAT-006's soft delete, so the row survives and this entry is what explains
   * why it is no longer anywhere. Written once per account even when a hundred
   * were selected together: somebody asking why one person vanished should find
   * an entry naming them, not "37 accounts deleted".
   */
  | 'user.deleted'
  | 'user.password_changed'
  | 'user.sessions_revoked'
  | 'role.granted'
  | 'role.revoked'
  // Family
  | 'learner.created'
  | 'learner.updated'
  /*
   * Staff placed a learner in a class and set what they offer.
   *
   * Distinct from `learner.updated` because it decides which timetable, which
   * lessons and which exams reach that child — and because it replaces the
   * subject list wholesale, so the before and after are the record of what a
   * learner stopped offering as well as what they started.
   */
  | 'learner.class_assigned'
  | 'learner.archived'
  | 'learner.credentials_granted'
  | 'learner.credentials_revoked'
  | 'guardian.invited'
  // Teacher verification
  | 'teacher.applied'
  | 'teacher.document_uploaded'
  /*
   * A reviewer removed a document from an application.
   *
   * The file and its Cloudinary asset are both destroyed, so this entry is the
   * only remaining record that it ever existed — which is why the action
   * carries the file's details and the reviewer's stated reason.
   */
  | 'teacher.document_removed'
  /* BUILD-PLAN Phase 1: the timetable is attributed like every other decision. */
  | 'timetable.proposed'
  /*
   * A teacher moved a period they already held.
   *
   * Distinct from claiming, because the class was already timetabled: somebody
   * looking at why a lesson changed day needs to find the move, not infer it
   * from a claim that appears to have always been on Thursday.
   */
  | 'timetable.edited'
  | 'timetable.admin_edited'
  | 'timetable.withdrawn'
  | 'timetable.decided'
  | 'group.archived'
  /*
   * BUILD-PLAN Phase 2 — lessons.
   *
   * A lesson reaches every learner in a level, so who published what to which
   * class is exactly the question asked after the fact. `lesson.removed` carries
   * the title and the storage key because the file is destroyed with the row and
   * this entry is all that is left of it.
   */
  | 'lesson.published'
  | 'lesson.quarantined'
  | 'lesson.removed'
  /*
   * BUILD-PLAN Phase 3 — groups and exercises.
   *
   * `exercise.unlocked` is the one that matters. Reopening a locked exercise
   * gives one group more time than the rest of the class had, so who did it and
   * why is exactly the question asked afterwards.
   */
  | 'group.created'
  | 'group.members_set'
  /* Marking a submission: who gave the score, and what it was. */
  | 'work.graded'
  | 'exercise.created'
  | 'exercise.unlocked'
  | 'exercise.group_scored'
  /* BUILD-PLAN Phase 4 — exams. */
  | 'exam.created'
  | 'exam.published'
  | 'exam.marked'
  | 'exam.results_released'
  /* BUILD-PLAN Phase 6 — report cards. */
  | 'report.marks_submitted'
  | 'report.cards_generated'
  | 'report.cards_published'
  /*
   * BUILD-PLAN Phase 5 — live.
   *
   * A lesson going live and ending are both recorded because the pair is what
   * FR-ERN-003 counts, and because `live.floor_granted` names the moment a child
   * was audible to a class.
   */
  | 'live.started'
  | 'live.ended'
  /*
   * Somebody who was not booked into anything was let into a room with a
   * teacher in it — and the moment that permission was taken away again.
   *
   * The whole of invite-only rests on these two rows: they are the record of
   * who could enter a private call, which is the first question a safeguarding
   * review asks about one.
   */
  | 'live.invited'
  | 'live.invite_revoked'
  | 'live.floor_granted'
  | 'live.floor_revoked'
  | 'recording.deleted'
  | 'teacher.checklist_item_verified'
  | 'teacher.approved'
  | 'teacher.rejected'
  | 'teacher.more_info_required'
  | 'teacher.suspended'
  | 'teacher.reinstated'
  /** FR-SCH-002: which band a teacher teaches, and so who may be assigned to them. */
  | 'teacher.classified'
  /*
   * An admin set which classes and subjects a teacher may teach.
   *
   * Worth its own action because it decides what that teacher can timetable and
   * therefore be paid for — and because the assignment replaces the set rather
   * than adding to it, so the counts either side are the record of what changed.
   */
  | 'teacher.subjects_assigned'
  /**
   * Watching lessons in progress.
   *
   * The *read* is the auditable event here, not an action taken afterwards. It
   * names who looked at which live lessons — including one-to-one lessons
   * between an adult and a child — which is what keeps FR-SAF-007's "authorised
   * staff" reviewable rather than merely asserted.
   */
  | 'live.viewed'
  // Learner approval (§4.2/§4.3)
  | 'learner.approved'
  | 'learner.rejected'
  | 'learner.more_info_required'
  // Billing and instalments (§5.1/§5.2)
  | 'billing.schedule_created'
  | 'billing.schedule_settled'
  | 'billing.reminder_sent'
  | 'billing.offline_payment_recorded'
  | 'billing.refund_issued'
  // Freezing (§5.3/§5.5). The trail carries the triggering instalment id for an
  // automatic freeze, per FR-RBA-004.
  | 'account.frozen'
  | 'account.unfrozen'
  // Earnings and payouts (§4.7.3/§4.7.4/§4.7.5)
  | 'earnings.calculated'
  | 'earnings.unallocated_decided'
  | 'payout.approved'
  | 'payout.batch_approved'
  | 'payout.withheld'
  | 'payout.released'
  // Reconciliation (§4.7.6)
  | 'reconciliation.run'
  | 'reconciliation.item_matched'
  | 'reconciliation.item_written_off'
  | 'reconciliation.item_escalated'
  // Support routing (§4.5)
  /**
   * Staff opening a learner's support conversation.
   *
   * The *read* is the auditable event, as with `live.viewed` and
   * `safeguarding.viewed`. FR-RBA-004 requires every staff access to a learner's
   * personal data to be recorded, and a child's messages are the most personal
   * data on the platform. Naming the thread rather than reusing
   * `staff.viewed_learner` is what makes the trail answerable to "who read
   * *this* conversation".
   */
  | 'message.attachment_uploaded'
  | 'message.attachment_quarantined'
  | 'subscription.registered'
  | 'payment.schedule_updated'
  | 'payment.stage_adjusted'
  | 'support.thread_read'
  | 'support.replied'
  | 'ticket.assigned'
  | 'ticket.reassigned'
  | 'ticket.escalated'
  // Safeguarding (§4.6). FR-SAF-006: even *reading* this queue is recorded.
  | 'safeguarding.viewed'
  | 'safeguarding.report_created'
  | 'safeguarding.first_response'
  | 'safeguarding.actioned'
  | 'safeguarding.closed'
  | 'safeguarding.designation_changed'
  // Staff access to personal data
  | 'staff.viewed_learner'
  | 'staff.impersonation_started'
  | 'staff.impersonation_ended'
  // Configuration
  | 'config.updated';

export interface AuditInput {
  action: AuditAction;
  entity: string;
  entityId?: string | null;
  actorId?: string | null;
  before?: unknown;
  after?: unknown;
  /** FR-RBA-005: impersonation requires a recorded reason. */
  reason?: string;
}

@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(private readonly prisma: PrismaService) {}

  async record(input: AuditInput): Promise<void> {
    const ctx = currentContext();
    try {
      await this.prisma.auditLog.create({
        data: {
          actorId: input.actorId ?? ctx?.userId ?? null,
          action: input.action,
          entity: input.entity,
          entityId: input.entityId ?? null,
          // NFR-SEC-009: the trail records what changed, with secrets stripped.
          before: (input.before === undefined ? null : redact(input.before)) as never,
          after: (input.after === undefined ? null : redact(input.after)) as never,
          ip: ctx?.ip ?? null,
          userAgent: ctx?.userAgent ?? null,
          correlationId: ctx?.correlationId ?? null,
          reason: input.reason ?? null,
        },
      });
    } catch (error) {
      // An audit write must never silently vanish. It also must not take down
      // the user-facing action, so it is logged loudly for the alerting in
      // NFR-MNT-006 to pick up.
      this.logger.error({
        msg: 'AUDIT WRITE FAILED',
        action: input.action,
        entity: input.entity,
        entityId: input.entityId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /** FR-RBA-004: staff reading a learner's personal data is itself auditable. */
  async recordLearnerAccess(actorId: string, learnerId: string): Promise<void> {
    await this.record({
      action: 'staff.viewed_learner',
      entity: 'learner',
      entityId: learnerId,
      actorId,
    });
  }
}
