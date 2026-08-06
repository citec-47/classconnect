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
