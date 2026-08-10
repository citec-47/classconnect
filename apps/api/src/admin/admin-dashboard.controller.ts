import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { z } from 'zod';
import { zodBody } from '../common/zod-validation.pipe';
import { CurrentUser, RequirePermissions, type AuthenticatedUser } from '../rbac/decorators';
import { DashboardService } from './dashboard.service';
import { ApprovalsService } from './approvals.service';
import { SupportService } from './support.service';
import { SafeguardingService } from './safeguarding.service';
import { BadgesGateway } from './badges.gateway';

/**
 * §3, §4.1, §4.2, §4.3, §4.5 and §4.6 of the admin brief.
 *
 * Every mutating route pushes fresh badge counts afterwards, which is what makes
 * §3's "the count decrements only when an item is actioned" true in practice
 * rather than only in principle.
 */

const decisionSchema = z
  .object({
    decision: z.enum(['approved', 'rejected', 'more_info_required']),
    reason: z.string().max(2000).trim().optional(),
  })
  .refine(
    (value) => value.decision === 'approved' || Boolean(value.reason?.trim()),
    { path: ['reason'], message: 'errors.approval.reason_required' },
  );

const assignSchema = z.object({
  ticketIds: z.array(z.string().uuid()).min(1).max(100),
  agentId: z.string().uuid(),
});

const escalateSchema = z.object({
  reason: z.string().min(3).max(2000).trim(),
});

const noteSchema = z.object({
  note: z.string().min(3).max(4000).trim(),
});

const suspendSchema = z.object({
  reason: z.string().min(3, 'errors.freeze.reason_required').max(2000).trim(),
});

const closeSchema = z.object({
  actionTaken: z.string().min(3, 'errors.safeguarding.action_required').max(4000).trim(),
});

@Controller('admin')
export class AdminDashboardController {
  constructor(
    private readonly dashboard: DashboardService,
    private readonly approvals: ApprovalsService,
    private readonly support: SupportService,
    private readonly safeguarding: SafeguardingService,
    private readonly badges: BadgesGateway,
  ) {}

  // --- §3 -----------------------------------------------------------------

  /** The sidebar, filtered server-side. Presentation follows authorisation. */
  @Get('nav')
  @RequirePermissions('profile:read:own')
  async nav(@CurrentUser() admin: AuthenticatedUser) {
    return this.dashboard.navFor(admin);
  }

  /** COM-003: the 60-second reconciliation poll behind the WebSocket push. */
  @Get('dashboard/badges')
  @RequirePermissions('profile:read:own')
  async badgeCounts(@CurrentUser() admin: AuthenticatedUser) {
    return this.dashboard.badges(admin);
  }

  // --- §4.1 ---------------------------------------------------------------

  @Get('dashboard/overview')
  @RequirePermissions('profile:read:own')
  async overview(@CurrentUser() admin: AuthenticatedUser) {
    return this.dashboard.overview(admin);
  }

  // --- §4.2 / §4.3 --------------------------------------------------------

  @Get('approvals/students')
  @RequirePermissions('learner:approve')
  async studentQueue(@CurrentUser() admin: AuthenticatedUser) {
    return this.approvals.queue('all', admin.id);
  }

  @Get('approvals/primary')
  @RequirePermissions('learner:approve')
  async primaryQueue(@CurrentUser() admin: AuthenticatedUser) {
    return this.approvals.queue('primary', admin.id);
  }

  @Get('approvals/learners/:learnerId/checks')
  @RequirePermissions('learner:approve')
  async checks(@Param('learnerId') learnerId: string) {
    return this.approvals.checksFor(learnerId);
  }

  /**
   * One learner per call.
   *
   * There is deliberately no list-taking variant of this route. "Bulk approve is
   * not available" is therefore a property of the API surface, and no client can
   * reintroduce it by looping faster.
   */
  @Post('approvals/learners/:learnerId/decision')
  @RequirePermissions('learner:approve')
  async decide(
    @CurrentUser() admin: AuthenticatedUser,
    @Param('learnerId') learnerId: string,
    @Body(zodBody(decisionSchema)) body: z.infer<typeof decisionSchema>,
  ) {
    const result = await this.approvals.decide({
      learnerId,
      decision: body.decision,
      reason: body.reason,
      actorId: admin.id,
    });
    // §3: the badge falls only now, because the item was actioned.
    await this.badges.broadcast();
    return result;
  }

  // --- §4.5 ---------------------------------------------------------------

  @Get('support/queue')
  @RequirePermissions('support:read:own')
  async supportQueue(
    @CurrentUser() admin: AuthenticatedUser,
    @Query('scope') scope?: string,
  ) {
    return this.support.queue({
      actorId: admin.id,
      roles: admin.roles,
      scope: scope === 'mine' ? 'mine' : 'unassigned',
    });
  }

  @Get('support/agents')
  @RequirePermissions('support:assign')
  async agents() {
    return this.support.agents();
  }

  /** FR-SUP-004: everything an agent needs, without hunting for it. */
  @Get('support/tickets/:ticketId/context')
  @RequirePermissions('support:read:own')
  async ticketContext(
    @CurrentUser() admin: AuthenticatedUser,
    @Param('ticketId') ticketId: string,
  ) {
    return this.support.context(ticketId, admin.id);
  }

  @Post('support/assign')
  @RequirePermissions('support:assign')
  async assign(
    @CurrentUser() admin: AuthenticatedUser,
    @Body(zodBody(assignSchema)) body: z.infer<typeof assignSchema>,
  ) {
    const result = await this.support.assign({
      ticketIds: body.ticketIds,
      agentId: body.agentId,
      actorId: admin.id,
    });
    await this.badges.broadcast();
    return result;
  }

  @Post('support/tickets/:ticketId/escalate')
  @RequirePermissions('support:read:own')
  async escalate(
    @CurrentUser() admin: AuthenticatedUser,
    @Param('ticketId') ticketId: string,
    @Body(zodBody(escalateSchema)) body: z.infer<typeof escalateSchema>,
  ) {
    return this.support.escalate({ ticketId, reason: body.reason, actorId: admin.id });
  }

  // --- §4.6 ---------------------------------------------------------------

  /**
   * FR-SAF-006: the permission is necessary but the service also requires the
   * per-person designation. A `super_admin` who has not been designated is
   * refused here, which is what "regardless of role level" means.
   */
  @Get('safeguarding')
  @RequirePermissions('safeguarding:read')
  async safeguardingQueue(
    @CurrentUser() admin: AuthenticatedUser,
    @Query('includeClosed') includeClosed?: string,
  ) {
    return this.safeguarding.list(admin.id, includeClosed === 'true');
  }

  /** FR-SAF-002: repeated attempts to pass contact details to a minor. */
  @Get('safeguarding/redaction-flags')
  @RequirePermissions('safeguarding:read')
  async redactionFlags(@CurrentUser() admin: AuthenticatedUser) {
    return this.safeguarding.redactionFlags(admin.id);
  }

  @Post('safeguarding/:reportId/first-response')
  @RequirePermissions('safeguarding:act')
  async firstResponse(
    @CurrentUser() admin: AuthenticatedUser,
    @Param('reportId') reportId: string,
    @Body(zodBody(noteSchema)) body: z.infer<typeof noteSchema>,
  ) {
    const result = await this.safeguarding.recordFirstResponse({
      reportId,
      note: body.note,
      actorId: admin.id,
    });
    await this.badges.broadcast();
    return result;
  }

  /** §4.6: actionable directly to immediate teacher suspension. */
  @Post('safeguarding/:reportId/suspend-teacher')
  @RequirePermissions('safeguarding:act')
  async suspendTeacher(
    @CurrentUser() admin: AuthenticatedUser,
    @Param('reportId') reportId: string,
    @Body(zodBody(suspendSchema)) body: z.infer<typeof suspendSchema>,
  ) {
    const result = await this.safeguarding.suspendTeacher({
      reportId,
      reason: body.reason,
      actorId: admin.id,
    });
    await this.badges.broadcast();
    return result;
  }

  @Post('safeguarding/:reportId/close')
  @RequirePermissions('safeguarding:act')
  async closeReport(
    @CurrentUser() admin: AuthenticatedUser,
    @Param('reportId') reportId: string,
    @Body(zodBody(closeSchema)) body: z.infer<typeof closeSchema>,
  ) {
    const result = await this.safeguarding.close({
      reportId,
      actionTaken: body.actionTaken,
      actorId: admin.id,
    });
    await this.badges.broadcast();
    return result;
  }
}
