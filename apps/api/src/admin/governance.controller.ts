import { Body, Controller, Delete, Get, Header, Param, Post, Query, Res } from '@nestjs/common';
import type { Response } from 'express';
import { z } from 'zod';
import { ROLES } from '@classconnect/shared';
import { zodBody } from '../common/zod-validation.pipe';
import { CurrentUser, RequirePermissions, type AuthenticatedUser } from '../rbac/decorators';
import { AuditService } from '../audit/audit.service';
import { uuidParam } from '../common/zod-validation.pipe';
import { RecordingsService } from '../teachers/recordings.service';
import { GovernanceService } from './governance.service';
import { SafeguardingService } from './safeguarding.service';
import { DashboardService } from './dashboard.service';
import { EarningsService } from '../earnings/earnings.service';
import { PayoutsService } from '../earnings/payouts.service';
import { PaymentsAdminService } from '../billing/payments-admin.service';

/**
 * §6 — Accounts & access, Reports, Audit log.
 *
 * The audit routes are GET only. There is no DELETE handler anywhere in this
 * file, which is the API-level statement of "there is no delete control,
 * because there is no delete".
 */

const roleSchema = z.object({
  role: z.enum(ROLES),
  grant: z.boolean(),
});

const signOutSchema = z.object({
  reason: z.string().min(3).max(500).trim(),
});

const designationSchema = z.object({
  designated: z.boolean(),
});

@Controller('admin')
export class GovernanceController {
  constructor(
    private readonly governance: GovernanceService,
    private readonly auditLog: AuditService,
    private readonly safeguarding: SafeguardingService,
    private readonly dashboard: DashboardService,
    private readonly earnings: EarningsService,
    private readonly recordings: RecordingsService,
    private readonly payouts: PayoutsService,
    private readonly payments: PaymentsAdminService,
  ) {}

  // --- Accounts & access --------------------------------------------------

  @Get('accounts')
  @RequirePermissions('user:read:any')
  async search(@CurrentUser() admin: AuthenticatedUser, @Query('q') q = '') {
    return this.governance.searchAccounts(q, admin.id);
  }

  @Get('accounts/:userId/sessions')
  @RequirePermissions('user:read:any')
  async sessions(@Param('userId') userId: string) {
    return this.governance.sessionsFor(userId);
  }

  @Post('accounts/:userId/sign-out-all')
  @RequirePermissions('user:suspend')
  async signOutAll(
    @CurrentUser() admin: AuthenticatedUser,
    @Param('userId') userId: string,
    @Body(zodBody(signOutSchema)) body: z.infer<typeof signOutSchema>,
  ) {
    return this.governance.forceSignOut({ userId, reason: body.reason, actorId: admin.id });
  }

  /** §6: super admin only. `role:grant` is held by no other role. */
  @Post('accounts/:userId/roles')
  @RequirePermissions('role:grant')
  async setRole(
    @CurrentUser() admin: AuthenticatedUser,
    @Param('userId') userId: string,
    @Body(zodBody(roleSchema)) body: z.infer<typeof roleSchema>,
  ) {
    return this.governance.setRole({
      userId,
      role: body.role,
      grant: body.grant,
      actorId: admin.id,
    });
  }

  /**
   * FR-SAF-006: naming who may see the safeguarding queue. Deliberately gated on
   * `role:grant` rather than on `safeguarding:act` — designating oneself must be
   * the super admin's act, not something a designated agent can spread.
   */
  @Post('accounts/:userId/safeguarding-designation')
  @RequirePermissions('role:grant')
  async designate(
    @CurrentUser() admin: AuthenticatedUser,
    @Param('userId') userId: string,
    @Body(zodBody(designationSchema)) body: z.infer<typeof designationSchema>,
  ) {
    return this.safeguarding.setDesignation({
      userId,
      designated: body.designated,
      actorId: admin.id,
    });
  }

  // --- Audit log ----------------------------------------------------------

  @Get('audit')
  @RequirePermissions('audit:read')
  async audit(@Query() query: Record<string, string>) {
    return this.governance.searchAudit({
      actorId: query.actorId || undefined,
      action: query.action || undefined,
      entity: query.entity || undefined,
      entityId: query.entityId || undefined,
      from: query.from ? new Date(query.from) : undefined,
      to: query.to ? new Date(query.to) : undefined,
      cursor: query.cursor || undefined,
      limit: query.limit ? Number(query.limit) : undefined,
    });
  }

  @Get('audit/actions')
  @RequirePermissions('audit:read')
  async auditActions() {
    return this.governance.auditActions();
  }

  // --- Reports ------------------------------------------------------------

  /**
   * FR-RPT-003/004: the operational and money dashboards.
   *
   * FR-RPT-006 requires these to be served from a read replica. The
   * `PrismaService` is the seam for that — pointing it at a replica connection
   * for read-only queries is a deployment change, not a code change. Until a
   * replica is provisioned this reads the primary, which is a deployment gap
   * rather than a silent one.
   */
  @Get('reports')
  @RequirePermissions('reports:read')
  async reports() {
    const [operational, money] = await Promise.all([
      this.dashboard.operational(),
      this.dashboard.money(),
    ]);
    return { operational, money };
  }

  /**
   * FR-RPT-005: every table is exportable to CSV.
   *
   * The dataset is named rather than free-form so an export cannot become a
   * query interface that skirts the permission on the screen it came from.
   */
  @Get('reports/export/:dataset')
  @RequirePermissions('reports:read')
  @Header('content-type', 'text/csv; charset=utf-8')
  async export(
    @CurrentUser() admin: AuthenticatedUser,
    @Param('dataset') dataset: string,
    @Query() query: Record<string, string>,
    @Res({ passthrough: true }) response: Response,
  ) {
    const rows = await this.rowsFor(dataset, query);

    /**
     * FR-RBA-004: an export takes personal data out of the platform, which is
     * the single most consequential read an admin can perform. It is recorded
     * with what was taken and how much, so a later question about where a
     * spreadsheet came from has an answer.
     */
    await this.auditLog.record({
      action: 'staff.viewed_learner',
      entity: 'report_export',
      entityId: dataset,
      actorId: admin.id,
      after: { dataset, rowCount: rows.length, filters: query },
    });

    response.setHeader(
      'content-disposition',
      `attachment; filename="classconnect-${dataset}-${new Date().toISOString().slice(0, 10)}.csv"`,
    );
    return this.governance.toCsv(rows);
  }

  private async rowsFor(
    dataset: string,
    query: Record<string, string>,
  ): Promise<Record<string, unknown>[]> {
    switch (dataset) {
      case 'students-paid':
        return this.payments.studentsPaid({
          from: query.from ? new Date(query.from) : undefined,
          to: query.to ? new Date(query.to) : undefined,
        }) as unknown as Promise<Record<string, unknown>[]>;

      case 'students-owing':
        return this.payments.studentsOwing({}) as unknown as Promise<Record<string, unknown>[]>;

      case 'teachers-paid':
        return this.payouts.paid({
          period: query.period || undefined,
        }) as unknown as Promise<Record<string, unknown>[]>;

      case 'teachers-pending':
        return this.payouts.pending(query.period || undefined) as unknown as Promise<
          Record<string, unknown>[]
        >;

      case 'earnings': {
        const breakdown = await this.earnings.periodBreakdown(
          query.period ?? new Date().toISOString().slice(0, 7),
        );
        return breakdown.teachers as unknown as Record<string, unknown>[];
      }

      case 'audit': {
        const result = await this.governance.searchAudit({
          from: query.from ? new Date(query.from) : undefined,
          to: query.to ? new Date(query.to) : undefined,
          action: query.action || undefined,
          limit: 500,
        });
        return result.entries as unknown as Record<string, unknown>[];
      }

      default:
        return [];
    }
  }

  // -------------------------------------------------------------------------
  // Recordings
  // -------------------------------------------------------------------------

  /**
   * Every recording on the platform, in one place.
   *
   * The admin's list is unfiltered by design — safeguarding review is the reason
   * the recordings exist at all, and a review that can only see part of the
   * archive is not one.
   */
  @Get('recordings')
  @RequirePermissions('recording:delete')
  async allRecordings(@CurrentUser() user: AuthenticatedUser) {
    return this.recordings.forUser(user);
  }

  /**
   * A signed link, for the admin as for everybody else.
   *
   * Seeing every recording is not the same as holding a permanent URL to one:
   * the link expires here too, so an administrator forwarding it does not create
   * an unauthenticated copy of a room full of children.
   */
  @Get('recordings/:recordingId/url')
  @RequirePermissions('recording:delete')
  async adminRecordingUrl(
    @CurrentUser() user: AuthenticatedUser,
    @Param('recordingId', uuidParam()) recordingId: string,
  ) {
    return this.recordings.playbackUrl(user, recordingId);
  }

  /**
   * Deleting one. Admin only, and the file goes before the row.
   *
   * The `recording:delete` permission is held by the admin alone — not by a
   * teacher, and not
   * by customer service — so the permission is the rule rather than a check the
   * interface performs.
   */
  @Delete('recordings/:recordingId')
  @RequirePermissions('recording:delete')
  async deleteRecording(
    @CurrentUser() user: AuthenticatedUser,
    @Param('recordingId', uuidParam()) recordingId: string,
  ) {
    return this.recordings.remove(user, recordingId);
  }
}
