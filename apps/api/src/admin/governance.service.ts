import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { ROLES, type Role } from '@classconnect/shared';
import { PrismaService } from '../common/prisma.service';
import { AppError } from '../common/http-exception.filter';
import { AuditService } from '../audit/audit.service';
import { TokenService } from '../auth/token.service';

/**
 * §6 — Accounts & access, Reports, and the Audit log.
 *
 * The audit log is read-only here by construction: this service exposes `search`
 * and nothing else. There is no delete method, because §6 says "there is no
 * delete control, because there is no delete" — and the database refuses UPDATE
 * and DELETE on `audit_log` to the application role regardless (DAT-005).
 */
@Injectable()
export class GovernanceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly tokens: TokenService,
  ) {}

  // -------------------------------------------------------------------------
  // Accounts & access
  // -------------------------------------------------------------------------

  /** §6: search across all users, with their state, roles and linked records. */
  async searchAccounts(query: string, actorId: string) {
    const term = query.trim();
    if (term.length < 2) return [];

    const users = await this.prisma.user.findMany({
      where: {
        deletedAt: null,
        OR: [
          { fullName: { contains: term, mode: 'insensitive' } },
          { phoneE164: { contains: term } },
          { email: { contains: term, mode: 'insensitive' } },
        ],
      },
      include: {
        roles: true,
        teacherProfile: { include: { freezes: { where: { liftedAt: null } } } },
        guardianProfile: {
          include: {
            learners: {
              include: {
                learner: {
                  select: { id: true, fullName: true, approvalState: true, status: true },
                },
              },
            },
          },
        },
        learnerProfile: {
          select: { id: true, fullName: true, approvalState: true },
        },
        authSessions: { where: { revokedAt: null, expiresAt: { gt: new Date() } } },
      },
      take: 50,
      orderBy: { createdAt: 'desc' },
    });

    // FR-RBA-004: a staff member reading a learner's personal data is recorded,
    // and a search that returns children is exactly that.
    for (const user of users) {
      for (const link of user.guardianProfile?.learners ?? []) {
        await this.audit.recordLearnerAccess(actorId, link.learner.id);
      }
      if (user.learnerProfile) {
        await this.audit.recordLearnerAccess(actorId, user.learnerProfile.id);
      }
    }

    const designations = await this.prisma.supportAgentProfile.findMany({
      where: { userId: { in: users.map((u) => u.id) } },
    });
    const designated = new Map(designations.map((d) => [d.userId, d.safeguardingDesignated]));

    return users.map((user) => ({
      id: user.id,
      fullName: user.fullName,
      phone: user.phoneE164,
      email: user.email,
      status: user.status,
      preferredLanguage: user.preferredLanguage,
      mfaEnabled: user.mfaEnabled,
      roles: user.roles.map((r) => r.role),
      safeguardingDesignated: designated.get(user.id) ?? false,
      // FR-AUT-010: active sessions per user.
      activeSessions: user.authSessions.length,
      teacher: user.teacherProfile
        ? {
            verificationStatus: user.teacherProfile.verificationStatus,
            suspendedAt: user.teacherProfile.suspendedAt,
            frozen: user.teacherProfile.freezes.length > 0,
          }
        : null,
      learners: [
        ...(user.guardianProfile?.learners.map((l) => ({
          id: l.learner.id,
          fullName: l.learner.fullName,
          approvalState: l.learner.approvalState,
          relationship: 'guardian' as const,
        })) ?? []),
        ...(user.learnerProfile
          ? [
              {
                id: user.learnerProfile.id,
                fullName: user.learnerProfile.fullName,
                approvalState: user.learnerProfile.approvalState,
                relationship: 'self' as const,
              },
            ]
          : []),
      ],
    }));
  }

  /** FR-AUT-010: which devices a user is signed in on. */
  async sessionsFor(userId: string) {
    const sessions = await this.prisma.authSession.findMany({
      where: { userId, revokedAt: null, expiresAt: { gt: new Date() } },
      orderBy: { lastActivityAt: 'desc' },
      select: {
        id: true,
        deviceLabel: true,
        ipAddress: true,
        approxLocation: true,
        userAgent: true,
        lastActivityAt: true,
        createdAt: true,
      },
    });
    return sessions;
  }

  /** FR-AUT-006: force sign-out of all devices. Audited. */
  async forceSignOut(input: { userId: string; reason: string; actorId: string }) {
    const revoked = await this.tokens.revokeAll(input.userId, input.reason);

    await this.audit.record({
      action: 'user.sessions_revoked',
      entity: 'user',
      entityId: input.userId,
      actorId: input.actorId,
      after: { revokedCount: revoked },
      reason: input.reason,
    });

    return { revoked };
  }

  /**
   * §6: "grant and revoke roles (super admin only)".
   *
   * The permission check is at the controller. The invariant enforced here is
   * the one a permission cannot express: the platform must never end up with
   * nobody who can grant a role again.
   */
  async setRole(input: {
    userId: string;
    role: Role;
    grant: boolean;
    actorId: string;
  }) {
    if (!ROLES.includes(input.role)) throw AppError.badRequest('errors.validation');

    const user = await this.prisma.user.findUnique({
      where: { id: input.userId },
      include: { roles: true },
    });
    if (!user) throw AppError.notFound();

    if (!input.grant && input.role === 'super_admin') {
      const others = await this.prisma.userRole.count({
        where: { role: 'super_admin', userId: { not: input.userId } },
      });
      if (others === 0) {
        throw AppError.conflict('errors.role.cannot_remove_last_super_admin');
      }
    }

    const before = user.roles.map((r) => r.role);

    if (input.grant) {
      await this.prisma.userRole.upsert({
        where: { userId_role: { userId: input.userId, role: input.role } },
        create: { userId: input.userId, role: input.role, grantedBy: input.actorId },
        update: { grantedBy: input.actorId },
      });
    } else {
      await this.prisma.userRole.deleteMany({
        where: { userId: input.userId, role: input.role },
      });
    }

    // FR-RBA-004 names permission changes explicitly as auditable.
    await this.audit.record({
      action: input.grant ? 'role.granted' : 'role.revoked',
      entity: 'user',
      entityId: input.userId,
      actorId: input.actorId,
      before: { roles: before },
      after: {
        roles: input.grant
          ? [...new Set([...before, input.role])]
          : before.filter((r) => r !== input.role),
      },
    });

    // FR-AUT-009: staff roles require MFA. A role change that makes someone
    // staff without MFA leaves an account that must not stay signed in on its
    // old, weaker session.
    if (input.grant && ['support_agent', 'admin_ops', 'admin_finance', 'super_admin'].includes(input.role)) {
      await this.tokens.revokeAll(input.userId, 'role_changed');
    }

    return { userId: input.userId, role: input.role, granted: input.grant };
  }

  // -------------------------------------------------------------------------
  // §6 — the audit log
  // -------------------------------------------------------------------------

  /**
   * Searchable and filterable by actor, action type, entity and date range.
   * Read-only: there is no companion write or delete method on this service.
   */
  async searchAudit(filters: {
    actorId?: string;
    action?: string;
    entity?: string;
    entityId?: string;
    from?: Date;
    to?: Date;
    cursor?: string;
    limit?: number;
  }) {
    const limit = Math.min(filters.limit ?? 100, 500);

    const where: Prisma.AuditLogWhereInput = {
      ...(filters.actorId ? { actorId: filters.actorId } : {}),
      ...(filters.action ? { action: { startsWith: filters.action } } : {}),
      ...(filters.entity ? { entity: filters.entity } : {}),
      ...(filters.entityId ? { entityId: filters.entityId } : {}),
      ...(filters.from || filters.to
        ? {
            occurredAt: {
              ...(filters.from ? { gte: filters.from } : {}),
              ...(filters.to ? { lte: filters.to } : {}),
            },
          }
        : {}),
    };

    const entries = await this.prisma.auditLog.findMany({
      where,
      include: { actor: { select: { id: true, fullName: true } } },
      orderBy: { occurredAt: 'desc' },
      take: limit + 1,
      ...(filters.cursor ? { cursor: { id: filters.cursor }, skip: 1 } : {}),
    });

    const hasMore = entries.length > limit;
    const page = hasMore ? entries.slice(0, limit) : entries;

    return {
      entries: page.map((entry) => ({
        id: entry.id,
        occurredAt: entry.occurredAt,
        // A rule that fired has no actor. Rendered as "System" rather than blank,
        // because a blank column reads as missing data.
        actor: entry.actor ? { id: entry.actor.id, fullName: entry.actor.fullName } : null,
        action: entry.action,
        entity: entry.entity,
        entityId: entry.entityId,
        before: entry.before,
        after: entry.after,
        ip: entry.ip,
        userAgent: entry.userAgent,
        correlationId: entry.correlationId,
        reason: entry.reason,
      })),
      nextCursor: hasMore ? page[page.length - 1]?.id : null,
    };
  }

  /** The distinct action types present, so the filter offers real values. */
  async auditActions(): Promise<string[]> {
    const rows = await this.prisma.auditLog.groupBy({ by: ['action'], _count: true });
    return rows.map((r) => r.action).sort();
  }

  // -------------------------------------------------------------------------
  // §6 — reports
  // -------------------------------------------------------------------------

  /**
   * FR-RPT-005: every table on the reporting screens is exportable to CSV.
   *
   * Generated here rather than in the browser so the export is the same data the
   * screen was authorised to show — a client-side export of a paginated table
   * silently truncates, and one built from a second unauthorised fetch would be
   * a hole in FR-RBA-002.
   */
  toCsv(rows: Record<string, unknown>[]): string {
    if (rows.length === 0) return '';

    const columns = [...new Set(rows.flatMap((row) => Object.keys(row)))];

    const escape = (value: unknown): string => {
      if (value === null || value === undefined) return '';
      const text =
        value instanceof Date
          ? value.toISOString()
          : typeof value === 'object'
            ? JSON.stringify(value)
            : String(value);
      // A leading =, +, - or @ is executed as a formula by spreadsheet software.
      // Prefixing an apostrophe makes an exported "reason" field inert.
      const guarded = /^[=+\-@]/.test(text) ? `'${text}` : text;
      return /[",\n\r]/.test(guarded) ? `"${guarded.replace(/"/g, '""')}"` : guarded;
    };

    return [
      columns.join(','),
      ...rows.map((row) => columns.map((column) => escape(row[column])).join(',')),
    ].join('\r\n');
  }
}
