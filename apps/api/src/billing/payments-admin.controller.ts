import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { z } from 'zod';
import { zodBody } from '../common/zod-validation.pipe';
import { CurrentUser, RequirePermissions, type AuthenticatedUser } from '../rbac/decorators';
import { PaymentsAdminService } from './payments-admin.service';
import { InstalmentsService } from './instalments.service';
import { InvoicesService } from './invoices.service';
import { ReconciliationService } from './reconciliation.service';
import { FreezeService } from './freeze.service';

/**
 * §4.7 — the money screens.
 *
 * FR-RBA-002: every route below states its permission. The role table in §3
 * gives `admin_ops` a read-only view of these screens, which falls out of the
 * permission split rather than from a flag: Ops holds `finance:read` and none of
 * `finance:refund`, `finance:record_payment` or `payout:approve`.
 */

const dateRangeSchema = z.object({
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
});

const paymentMethodSchema = z.enum(['mtn_momo', 'orange_money', 'visa', 'mastercard']);

const refundSchema = z.object({
  /** FR-PAY-017: mandatory, and it reaches the audit trail and the payer. */
  reason: z.string().min(3, 'errors.refund.reason_required').max(2000).trim(),
  /** Omit for a full refund of what remains. */
  amountXaf: z.union([z.number().int().nonnegative(), z.string().regex(/^\d+$/)]).optional(),
});

const reminderSchema = z.object({
  channel: z.enum(['sms', 'whatsapp', 'email', 'in_app']),
});

const offlinePaymentSchema = z.object({
  subscriptionId: z.string().uuid(),
  amountXaf: z.union([z.number().int().positive(), z.string().regex(/^\d+$/)]),
  method: paymentMethodSchema,
  reason: z.string().min(3, 'errors.offlinePayment.reason_required').max(2000).trim(),
  evidenceKey: z.string().min(1, 'errors.offlinePayment.evidence_required').max(500),
  receivedAt: z.string().datetime().optional(),
});

const freezeSchema = z.object({
  scope: z.enum(['learner', 'teacher']),
  subjectId: z.string().uuid(),
  category: z.enum(['non_payment', 'safeguarding', 'abuse', 'dispute', 'other']),
  reason: z.string().min(3, 'errors.freeze.reason_required').max(2000).trim(),
});

const unfreezeSchema = z.object({
  scope: z.enum(['learner', 'teacher']),
  subjectId: z.string().uuid(),
  reason: z.string().min(3, 'errors.freeze.reason_required').max(2000).trim(),
});

const writeOffSchema = z.object({
  note: z.string().min(3, 'errors.reconciliation.note_required').max(2000).trim(),
});

const matchSchema = z.object({ paymentId: z.string().uuid() });

@Controller('admin/payments')
export class PaymentsAdminController {
  constructor(
    private readonly payments: PaymentsAdminService,
    private readonly instalments: InstalmentsService,
    private readonly invoices: InvoicesService,
    private readonly reconciliation: ReconciliationService,
    private readonly freeze: FreezeService,
  ) {}

  // --- §4.7.1 -------------------------------------------------------------

  /**
   * Every approved learner, with where their fees stand.
   *
   * Roster-first rather than payment-first: the paid and owing screens both list
   * *movements*, so a learner nobody has paid for appears on neither — which is
   * the wrong shape for "who is registered and what have they paid?".
   */
  @Get('plans')
  @RequirePermissions('finance:read')
  async plans() {
    return this.payments.plans();
  }

  /**
   * Register a learner onto a plan.
   *
   * The step that was missing: a fee stage is a position within a schedule, and
   * with no subscription there is no schedule to be at a position within.
   */
  @Post('learners/:learnerId/register')
  @RequirePermissions('finance:record_payment')
  async registerLearner(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('learnerId') learnerId: string,
    @Body()
    body: { planId: string; planType: 'full' | 'three_instalments'; startOn: string },
  ) {
    return this.payments.registerLearner({
      learnerId,
      planId: body.planId,
      planType: body.planType,
      startOn: body.startOn,
      actorId: actor.id,
    });
  }

  /** Edit the plan: what each part costs and when it falls due. */
  @Post('subscriptions/:subscriptionId/schedule')
  @RequirePermissions('finance:record_payment')
  async updateSchedule(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('subscriptionId') subscriptionId: string,
    @Body()
    body: {
      registrationFeeXaf?: number;
      parts: { sequence: number; amountXaf: number; dueOn: string }[];
      reason: string;
    },
  ) {
    return this.payments.updateSchedule({
      subscriptionId,
      registrationFeeXaf: body.registrationFeeXaf ?? 0,
      parts: body.parts ?? [],
      reason: body.reason ?? '',
      actorId: actor.id,
    });
  }

  @Get('students/fees')
  @RequirePermissions('finance:read')
  async studentsFees(@Query() query: Record<string, string>) {
    return this.payments.studentsFees({
      levelId: query.levelId || undefined,
      query: query.q || undefined,
    });
  }

  /**
   * Set a fee stage directly, as an adjustment.
   *
   * Finance-write, because it moves a receivable. Money actually received goes
   * through `POST /payments/offline` instead — this is for corrections.
   */
  @Post('subscriptions/:subscriptionId/stage')
  @RequirePermissions('finance:record_payment')
  async setFeeStage(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('subscriptionId') subscriptionId: string,
    @Body() body: { stage: 'registered' | 'first' | 'second' | 'completed'; reason: string },
  ) {
    return this.payments.setFeeStage({
      subscriptionId,
      stage: body.stage,
      reason: body.reason ?? '',
      actorId: actor.id,
    });
  }

  @Get('students/paid')
  @RequirePermissions('finance:read')
  async studentsPaid(
    @Query() query: Record<string, string>,
  ) {
    const range = dateRangeSchema.parse(query);
    return this.payments.studentsPaid({
      from: range.from ? new Date(range.from) : undefined,
      to: range.to ? new Date(range.to) : undefined,
      method: query.method ? paymentMethodSchema.parse(query.method) : undefined,
      levelId: query.levelId || undefined,
    });
  }

  /** FR-PAY-017: Finance Admin only. Ops can see the row but not reverse it. */
  @Post(':paymentId/refund')
  @RequirePermissions('finance:refund')
  async refund(
    @CurrentUser() admin: AuthenticatedUser,
    @Param('paymentId') paymentId: string,
    @Body(zodBody(refundSchema)) body: z.infer<typeof refundSchema>,
  ) {
    return this.payments.refund({
      paymentId,
      reason: body.reason,
      amountXaf: body.amountXaf === undefined ? undefined : BigInt(body.amountXaf),
      actorId: admin.id,
    });
  }

  @Post(':paymentId/receipt')
  @RequirePermissions('finance:read')
  async resendReceipt(
    @CurrentUser() admin: AuthenticatedUser,
    @Param('paymentId') paymentId: string,
  ) {
    return this.payments.resendReceipt(paymentId, admin.id);
  }

  /** FR-PAY-016: the numbered invoice behind a payment. */
  @Get('invoices/:invoiceId')
  @RequirePermissions('finance:read')
  async invoice(@Param('invoiceId') invoiceId: string) {
    return this.invoices.render(invoiceId);
  }

  // --- §4.7.2 -------------------------------------------------------------

  @Get('students/owing')
  @RequirePermissions('finance:read')
  async studentsOwing(@Query() query: Record<string, string>) {
    return this.payments.studentsOwing({
      levelId: query.levelId || undefined,
      state: query.state as 'active' | 'grace' | 'frozen' | undefined,
      minOutstandingXaf: query.minOutstanding ? BigInt(query.minOutstanding) : undefined,
    });
  }

  @Get('schedules/:subscriptionId')
  @RequirePermissions('finance:read')
  async schedule(@Param('subscriptionId') subscriptionId: string) {
    return this.instalments.scheduleFor(subscriptionId);
  }

  /** §5.1: both options priced side by side, before anyone commits (UI-007). */
  @Get('schedules/preview/:totalXaf/:startOn')
  @RequirePermissions('finance:read')
  async preview(@Param('totalXaf') totalXaf: string, @Param('startOn') startOn: string) {
    return this.instalments.previewOptions(BigInt(totalXaf), startOn);
  }

  @Get('learners/:learnerId/history')
  @RequirePermissions('finance:read')
  async history(@Param('learnerId') learnerId: string) {
    return this.payments.paymentHistory(learnerId);
  }

  @Post('schedules/:scheduleId/remind')
  @RequirePermissions('finance:read')
  async remind(
    @CurrentUser() admin: AuthenticatedUser,
    @Param('scheduleId') scheduleId: string,
    @Body(zodBody(reminderSchema)) body: z.infer<typeof reminderSchema>,
  ) {
    return this.payments.sendReminder({
      scheduleId,
      channel: body.channel,
      actorId: admin.id,
    });
  }

  /** §4.7.2: Finance Admin only, reason and evidence mandatory. */
  @Post('offline')
  @RequirePermissions('finance:record_payment')
  async recordOffline(
    @CurrentUser() admin: AuthenticatedUser,
    @Body(zodBody(offlinePaymentSchema)) body: z.infer<typeof offlinePaymentSchema>,
  ) {
    return this.payments.recordOfflinePayment({
      subscriptionId: body.subscriptionId,
      amountXaf: body.amountXaf,
      method: body.method,
      reason: body.reason,
      evidenceKey: body.evidenceKey,
      receivedAt: body.receivedAt ? new Date(body.receivedAt) : undefined,
      actorId: admin.id,
    });
  }

  // --- §5.5 — manual freeze -------------------------------------------------

  /**
   * UI-007: the consequences the dialog must state, computed from the same
   * queries the freeze itself will run.
   */
  @Get('freeze/preview/:scope/:subjectId')
  @RequirePermissions('account:freeze')
  async freezePreview(@Param('scope') scope: string, @Param('subjectId') subjectId: string) {
    return scope === 'teacher'
      ? this.freeze.previewTeacherFreeze(subjectId)
      : this.freeze.previewLearnerFreeze(subjectId);
  }

  @Get('freeze/state/:scope/:subjectId')
  @RequirePermissions('finance:read')
  async freezeState(@Param('scope') scope: string, @Param('subjectId') subjectId: string) {
    return scope === 'teacher'
      ? this.freeze.teacherFreezeState(subjectId)
      : this.freeze.learnerFreezeState(subjectId);
  }

  @Post('freeze')
  @RequirePermissions('account:freeze')
  async freezeAccount(
    @CurrentUser() admin: AuthenticatedUser,
    @Body(zodBody(freezeSchema)) body: z.infer<typeof freezeSchema>,
  ) {
    return this.freeze.freezeManually({ ...body, actorId: admin.id });
  }

  @Post('unfreeze')
  @RequirePermissions('account:freeze')
  async unfreezeAccount(
    @CurrentUser() admin: AuthenticatedUser,
    @Body(zodBody(unfreezeSchema)) body: z.infer<typeof unfreezeSchema>,
  ) {
    return this.freeze.unfreezeManually({ ...body, actorId: admin.id });
  }

  // --- §4.7.6 -------------------------------------------------------------

  @Get('reconciliation')
  @RequirePermissions('finance:read')
  async reconciliationList(@Query() query: Record<string, string>) {
    return this.reconciliation.list({
      provider: query.provider ? paymentMethodSchema.parse(query.provider) : undefined,
      state: query.state || undefined,
      from: query.from ? new Date(query.from) : undefined,
      to: query.to ? new Date(query.to) : undefined,
    });
  }

  @Get('reconciliation/summary')
  @RequirePermissions('finance:read')
  async reconciliationSummary() {
    return this.reconciliation.summary();
  }

  @Post('reconciliation/:itemId/match')
  @RequirePermissions('reconciliation:resolve')
  async matchItem(
    @CurrentUser() admin: AuthenticatedUser,
    @Param('itemId') itemId: string,
    @Body(zodBody(matchSchema)) body: z.infer<typeof matchSchema>,
  ) {
    return this.reconciliation.match({ itemId, paymentId: body.paymentId, actorId: admin.id });
  }

  @Post('reconciliation/:itemId/write-off')
  @RequirePermissions('reconciliation:resolve')
  async writeOff(
    @CurrentUser() admin: AuthenticatedUser,
    @Param('itemId') itemId: string,
    @Body(zodBody(writeOffSchema)) body: z.infer<typeof writeOffSchema>,
  ) {
    return this.reconciliation.writeOff({ itemId, note: body.note, actorId: admin.id });
  }

  @Post('reconciliation/:itemId/escalate')
  @RequirePermissions('reconciliation:resolve')
  async escalate(
    @CurrentUser() admin: AuthenticatedUser,
    @Param('itemId') itemId: string,
    @Body(zodBody(writeOffSchema)) body: z.infer<typeof writeOffSchema>,
  ) {
    return this.reconciliation.escalate({ itemId, note: body.note, actorId: admin.id });
  }
}
