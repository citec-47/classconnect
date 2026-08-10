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
  | 'user.password_changed'
  | 'user.sessions_revoked'
  | 'role.granted'
  | 'role.revoked'
  // Family
  | 'learner.created'
  | 'learner.updated'
  | 'learner.archived'
  | 'learner.credentials_granted'
  | 'learner.credentials_revoked'
  | 'guardian.invited'
  // Teacher verification
  | 'teacher.applied'
  | 'teacher.document_uploaded'
  | 'teacher.checklist_item_verified'
  | 'teacher.approved'
  | 'teacher.rejected'
  | 'teacher.more_info_required'
  | 'teacher.suspended'
  | 'teacher.reinstated'
  /** FR-SCH-002: which band a teacher teaches, and so who may be assigned to them. */
  | 'teacher.classified'
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
