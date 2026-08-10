import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { z } from 'zod';
import { zodBody } from '../common/zod-validation.pipe';
import { CurrentUser, RequirePermissions, type AuthenticatedUser } from '../rbac/decorators';
import { EarningsService } from './earnings.service';
import { PayoutsService } from './payouts.service';

/**
 * §4.7.3, §4.7.4 and §4.7.5 — teachers paid, pending, and the earnings basis.
 *
 * `finance:read` reads; moving money needs `payout:approve`, which `admin_ops`
 * does not hold. That is the whole of the "read-only for Ops" row in §3.
 */

const periodSchema = z.string().regex(/^\d{4}-\d{2}$/);

const batchSchema = z.object({
  /** §4.7.4: the exact ids the confirmation screen listed, so what was shown is
   *  what is committed. */
  earningIds: z.array(z.string().uuid()).min(1).max(200),
});

const heldDecisionSchema = z.object({
  decision: z.enum(['release', 'withhold']),
  reason: z.string().min(3, 'errors.payout.decision_required').max(2000).trim(),
});

const unallocatedSchema = z.object({
  decision: z.enum(['released_to_teachers', 'retained_by_platform', 'carried_forward']),
  reason: z.string().min(3, 'errors.payout.decision_required').max(2000).trim(),
});

@Controller('admin/earnings')
export class EarningsController {
  constructor(
    private readonly earnings: EarningsService,
    private readonly payouts: PayoutsService,
  ) {}

  // --- §4.7.5 -------------------------------------------------------------

  @Get('periods/:period')
  @RequirePermissions('finance:read')
  async breakdown(@Param('period') period: string) {
    return this.earnings.periodBreakdown(periodSchema.parse(period));
  }

  /**
   * Recalculating restates a period. It needs `payout:approve` rather than
   * `finance:read` because it moves the ledger, even though it pays nobody.
   */
  @Post('periods/:period/calculate')
  @RequirePermissions('payout:approve')
  async calculate(
    @CurrentUser() admin: AuthenticatedUser,
    @Param('period') period: string,
  ) {
    return this.earnings.calculatePeriod(periodSchema.parse(period), admin.id);
  }

  /** FR-ERN-004 / FR-AI-005: a named human decides, with a recorded reason. */
  @Post('periods/:period/unallocated')
  @RequirePermissions('unallocated:decide')
  async decideUnallocated(
    @CurrentUser() admin: AuthenticatedUser,
    @Param('period') period: string,
    @Body(zodBody(unallocatedSchema)) body: z.infer<typeof unallocatedSchema>,
  ) {
    return this.earnings.decideUnallocated({
      period: periodSchema.parse(period),
      decision: body.decision,
      reason: body.reason,
      actorId: admin.id,
    });
  }

  // --- §4.7.4 -------------------------------------------------------------

  @Get('payouts/pending')
  @RequirePermissions('finance:read')
  async pending(@Query('period') period?: string) {
    return this.payouts.pending(period ? periodSchema.parse(period) : undefined);
  }

  @Get('payouts/paid')
  @RequirePermissions('finance:read')
  async paid(@Query() query: Record<string, string>) {
    return this.payouts.paid({
      period: query.period ? periodSchema.parse(query.period) : undefined,
      from: query.from ? new Date(query.from) : undefined,
      to: query.to ? new Date(query.to) : undefined,
    });
  }

  /**
   * §4.7.3: "why this number?" answered in two clicks — this is the second.
   * Every figure links through to the sessions that produced it.
   */
  @Get(':earningId/explain')
  @RequirePermissions('finance:read')
  async explain(@Param('earningId') earningId: string) {
    return this.payouts.explain(earningId);
  }

  /** FR-ERN-008/010: approval is Finance Admin's, and the blockers bite here. */
  @Post(':earningId/approve')
  @RequirePermissions('payout:approve')
  async approve(
    @CurrentUser() admin: AuthenticatedUser,
    @Param('earningId') earningId: string,
  ) {
    return this.payouts.approve({ earningId, actorId: admin.id });
  }

  @Post('payouts/approve-batch')
  @RequirePermissions('payout:approve')
  async approveBatch(
    @CurrentUser() admin: AuthenticatedUser,
    @Body(zodBody(batchSchema)) body: z.infer<typeof batchSchema>,
  ) {
    return this.payouts.approveBatch({ earningIds: body.earningIds, actorId: admin.id });
  }

  /** §4.7.4: a suspended teacher's accrual is released or withheld by a person. */
  @Post(':earningId/held-decision')
  @RequirePermissions('payout:approve')
  async decideHeld(
    @CurrentUser() admin: AuthenticatedUser,
    @Param('earningId') earningId: string,
    @Body(zodBody(heldDecisionSchema)) body: z.infer<typeof heldDecisionSchema>,
  ) {
    return this.payouts.decideHeld({
      earningId,
      decision: body.decision,
      reason: body.reason,
      actorId: admin.id,
    });
  }
}
