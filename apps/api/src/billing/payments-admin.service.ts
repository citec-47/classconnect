import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { NotificationChannel, PaymentMethod } from '@prisma/client';
import { CONFIG_KEYS, freezeDateFor, toXaf } from '@classconnect/shared';
import { PrismaService } from '../common/prisma.service';
import { PlatformConfigService } from '../common/platform-config.service';
import { AppError } from '../common/http-exception.filter';
import { AuditService } from '../audit/audit.service';
import { NotificationsService } from '../notifications/notifications.service';
import { LedgerService, LEDGER_ACCOUNTS } from './ledger.service';
import { InvoicesService } from './invoices.service';
import { InstalmentsService } from './instalments.service';
import { FreezeService } from './freeze.service';

/**
 * §4.7.1 and §4.7.2 — students paid, and the collections screen.
 *
 * Every discretionary action here (refund, offline payment, freeze) requires a
 * reason and names the admin who took it, because FR-AI-005 puts all three on
 * the far side of the "no automated final decision" boundary.
 */
@Injectable()
export class PaymentsAdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: PlatformConfigService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
    private readonly ledger: LedgerService,
    private readonly invoices: InvoicesService,
    private readonly instalments: InstalmentsService,
    private readonly freeze: FreezeService,
  ) {}

  // -------------------------------------------------------------------------
  // §4.7.1 — students, paid
  // -------------------------------------------------------------------------

  async studentsPaid(filters: { from?: Date; to?: Date; method?: PaymentMethod; levelId?: string }) {
    const payments = await this.prisma.payment.findMany({
      where: {
        status: 'succeeded',
        // A refund is itself a payment row; it belongs on its own line rather
        // than mixed in with collections.
        refundOfPaymentId: null,
        ...(filters.method ? { method: filters.method } : {}),
        ...(filters.from || filters.to
          ? {
              settledAt: {
                ...(filters.from ? { gte: filters.from } : {}),
                ...(filters.to ? { lte: filters.to } : {}),
              },
            }
          : {}),
        ...(filters.levelId
          ? { subscription: { learner: { levelId: filters.levelId } } }
          : {}),
      },
      include: {
        invoice: true,
        refunds: true,
        subscription: {
          include: {
            learner: { include: { level: true } },
            payer: { select: { id: true, fullName: true, phoneE164: true } },
            plan: true,
            schedule: { include: { instalments: true } },
          },
        },
      },
      orderBy: { settledAt: 'desc' },
      take: 500,
    });

    return payments.map((payment) => {
      const schedule = payment.subscription?.schedule;
      const instalments = schedule?.instalments ?? [];
      const paidCount = instalments.filter((i) => i.state === 'paid').length;

      return {
        id: payment.id,
        // Needed by the record-payment action, which posts against the
        // subscription rather than against this payment row.
        subscriptionId: payment.subscriptionId,
        learner: payment.subscription?.learner.fullName ?? null,
        learnerId: payment.subscription?.learnerId ?? null,
        payer: payment.subscription?.payer.fullName ?? null,
        payerPhone: payment.subscription?.payer.phoneE164 ?? null,
        plan: payment.subscription?.plan.code ?? null,
        planNameEn: payment.subscription?.plan.nameEn ?? null,
        planNameFr: payment.subscription?.plan.nameFr ?? null,
        level: payment.subscription?.learner.level
          ? {
              nameEn: payment.subscription.learner.level.nameEn,
              nameFr: payment.subscription.learner.level.nameFr,
            }
          : null,
        periodStart: payment.subscription?.periodStart ?? null,
        periodEnd: payment.subscription?.periodEnd ?? null,
        method: payment.method,
        amountXaf: payment.amountXaf.toString(),
        settledAt: payment.settledAt,
        // CON-03 / FR-PAY-020: a provider reference is safe to show. A PAN, a
        // CVV or a wallet PIN never reaches this system at all.
        providerRef: payment.providerRef,
        invoiceId: payment.invoice?.id ?? null,
        invoiceNumber: payment.invoice?.number ?? null,
        planType: schedule?.planType ?? 'full',
        instalmentsDone: paidCount,
        instalmentsTotal: instalments.length,
        recordedOffline: payment.recordedOffline,
        refundedXaf: payment.refunds
          .reduce((sum, r) => sum + r.amountXaf, 0n)
          .toString(),
      };
    });
  }

  /**
   * FR-PAY-017: a refund, by a Finance Admin, with a mandatory reason, the
   * correct ledger reversal, and the payer notified.
   */
  async refund(input: {
    paymentId: string;
    amountXaf?: bigint;
    reason: string;
    actorId: string;
  }) {
    const reason = input.reason.trim();
    if (!reason) throw AppError.badRequest('errors.refund.reason_required');

    const payment = await this.prisma.payment.findUnique({
      where: { id: input.paymentId },
      include: { refunds: true, subscription: { include: { payer: true, learner: true } } },
    });
    if (!payment) throw AppError.notFound();
    if (payment.status !== 'succeeded' || payment.refundOfPaymentId) {
      throw AppError.badRequest('errors.refund.not_refundable');
    }

    const alreadyRefunded = payment.refunds.reduce((sum, r) => sum + r.amountXaf, 0n);
    const amount = input.amountXaf ?? payment.amountXaf - alreadyRefunded;

    if (amount <= 0n || amount + alreadyRefunded > payment.amountXaf) {
      throw AppError.badRequest('errors.refund.exceeds_payment');
    }

    const now = new Date();
    const refund = await this.prisma.$transaction(async (tx) => {
      const created = await tx.payment.create({
        data: {
          id: randomUUID(),
          subscriptionId: payment.subscriptionId,
          method: payment.method,
          // CON-04: derived, so a double-submitted refund collides rather than
          // sending the money twice.
          idempotencyKey: `refund:${payment.id}:${alreadyRefunded + amount}`,
          amountXaf: amount,
          status: 'succeeded',
          settledAt: now,
          refundOfPaymentId: payment.id,
          refundReason: reason,
          refundedBy: input.actorId,
        },
      });

      await tx.payment.update({
        where: { id: payment.id },
        data: {
          status:
            alreadyRefunded + amount === payment.amountXaf ? 'refunded' : 'partially_refunded',
        },
      });

      await this.ledger.recordRefund(
        {
          refundPaymentId: created.id,
          originalPaymentId: payment.id,
          method: payment.method,
          amountXaf: amount,
          occurredAt: now,
          reason,
        },
        tx,
      );

      return created;
    });

    await this.audit.record({
      action: 'billing.refund_issued',
      entity: 'payment',
      entityId: payment.id,
      actorId: input.actorId,
      before: { status: payment.status, amountXaf: payment.amountXaf.toString() },
      after: { refundPaymentId: refund.id, amountXaf: amount.toString() },
      reason,
    });

    if (payment.subscription) {
      await this.notifications.notifyUser(
        payment.subscription.payerUserId,
        'refundIssued',
        { amount: amount.toString(), learner: payment.subscription.learner.fullName },
        { dedupeKey: `refund:${refund.id}` },
      );
    }

    return { id: refund.id, amountXaf: amount.toString() };
  }

  /** §4.7.1: resend the receipt for a settled payment. */
  async resendReceipt(paymentId: string, actorId: string) {
    const payment = await this.prisma.payment.findUnique({
      where: { id: paymentId },
      include: { invoice: true, subscription: { include: { payer: true } } },
    });
    if (!payment || !payment.subscription) throw AppError.notFound();

    const invoice = payment.invoice ?? (await this.invoices.issueFor(paymentId));

    await this.notifications.notifyUser(
      payment.subscription.payerUserId,
      'paymentReceipt',
      { invoice: invoice.number, amount: payment.amountXaf.toString() },
      // No dedupe key: resending is the whole point of the action, and FR-NOT-005
      // would otherwise swallow the second send.
      {},
    );

    await this.audit.record({
      action: 'billing.reminder_sent',
      entity: 'payment',
      entityId: paymentId,
      actorId,
      after: { kind: 'receipt', invoiceNumber: invoice.number },
    });

    return { invoiceNumber: invoice.number };
  }

  // -------------------------------------------------------------------------
  // §4.7.2 — students, owing. The collections screen.
  // -------------------------------------------------------------------------

  /**
   * Sorted by days overdue descending by default, which is what a collections
   * operator wants first and which the brief asks for explicitly.
   */
  async studentsOwing(filters: {
    levelId?: string;
    state?: 'active' | 'grace' | 'frozen';
    minOutstandingXaf?: bigint;
  }) {
    const graceDays = this.config.getNumber(CONFIG_KEYS.INSTALMENT_GRACE_DAYS);
    const today = new Date();

    const schedules = await this.prisma.paymentSchedule.findMany({
      where: {
        settledInFullAt: null,
        /*
         * Anything not yet paid, not only what has fallen due.
         *
         * Filtering on `due`/`overdue` alone hid the learners who most need
         * watching: a schedule created this morning has every instalment in
         * `scheduled`, so a student nobody has ever paid for appeared on
         * neither screen — absent from Paid because there is no payment, and
         * absent from Owing because nothing had reached its due date.
         *
         * Owing now means "money is outstanding on this schedule", which is the
         * plain reading of the word and makes the two screens complementary:
         * every learner with a schedule is on exactly one of them.
         */
        instalments: { some: { state: { in: ['scheduled', 'due', 'overdue'] } } },
        ...(filters.levelId
          ? { subscription: { learner: { levelId: filters.levelId } } }
          : {}),
      },
      include: {
        instalments: { orderBy: { sequence: 'asc' }, include: { payment: true } },
        subscription: {
          include: {
            plan: true,
            payer: { select: { id: true, fullName: true, phoneE164: true, email: true } },
            learner: {
              include: {
                level: true,
                freezes: { where: { liftedAt: null } },
                guardians: { include: { guardian: { include: { user: true } } } },
              },
            },
            payments: { orderBy: { createdAt: 'desc' }, take: 5 },
          },
        },
      },
    });

    const rows = await Promise.all(
      schedules.map(async (schedule) => {
        const learner = schedule.subscription.learner;
        const instalments = schedule.instalments;

        const paidToDate = instalments
          .filter((i) => i.state === 'paid')
          .reduce((sum, i) => sum + i.amountXaf, 0n);
        const outstanding = instalments
          .filter((i) => i.state !== 'paid' && i.state !== 'cancelled')
          .reduce((sum, i) => sum + i.amountXaf, 0n);

        const oldestUnpaid = instalments.find(
          (i) => i.state === 'due' || i.state === 'overdue',
        );
        const daysOverdue = oldestUnpaid
          ? Math.max(
              0,
              Math.floor((today.getTime() - oldestUnpaid.dueOn.getTime()) / 86_400_000),
            )
          : 0;

        const live = learner.freezes;
        const manual = live.find((f) => f.kind === 'manual');
        const automatic = live.find((f) => f.kind === 'automatic');

        const accountState: 'active' | 'grace' | 'frozen' = live.length
          ? 'frozen'
          : daysOverdue > 0 && daysOverdue <= graceDays
            ? 'grace'
            : 'active';

        const lastAttempt = schedule.subscription.payments[0];
        const lastReminder = await this.prisma.notification.findFirst({
          where: {
            userId: schedule.subscription.payerUserId,
            eventType: { startsWith: 'instalment' },
          },
          orderBy: { createdAt: 'desc' },
        });

        return {
          scheduleId: schedule.id,
          subscriptionId: schedule.subscriptionId,
          learnerId: learner.id,
          learner: learner.fullName,
          level: learner.level
            ? { nameEn: learner.level.nameEn, nameFr: learner.level.nameFr }
            : null,
          guardian: schedule.subscription.payer.fullName,
          guardianPhone: schedule.subscription.payer.phoneE164,
          guardianEmail: schedule.subscription.payer.email,
          payerUserId: schedule.subscription.payerUserId,
          plan: schedule.subscription.plan.code,
          totalXaf: schedule.totalXaf.toString(),
          paidToDateXaf: paidToDate.toString(),
          outstandingXaf: outstanding.toString(),
          daysOverdue,
          accountState,
          // §5.5: which kind of freeze, because the remedy differs.
          freezeKind: manual ? 'manual' : automatic ? 'automatic' : null,
          freezeReason: manual?.reason ?? automatic?.reason ?? null,
          liftableByPayment: Boolean(automatic) && !manual,
          instalments: instalments.map((i) => ({
            id: i.id,
            sequence: i.sequence,
            amountXaf: i.amountXaf.toString(),
            dueOn: i.dueOn.toISOString().slice(0, 10),
            freezesOn: freezeDateFor(i.dueOn.toISOString().slice(0, 10), graceDays),
            state: i.state,
            paidAt: i.paidAt,
          })),
          lastAttempt: lastAttempt
            ? {
                at: lastAttempt.createdAt,
                status: lastAttempt.status,
                failureReason: lastAttempt.failureReason,
              }
            : null,
          lastReminderAt: lastReminder?.createdAt ?? null,
        };
      }),
    );

    const filtered = rows.filter((row) => {
      if (filters.state && row.accountState !== filters.state) return false;
      if (
        filters.minOutstandingXaf !== undefined &&
        BigInt(row.outstandingXaf) < filters.minOutstandingXaf
      ) {
        return false;
      }
      return true;
    });

    // The default the brief asks for.
    return filtered.sort((a, b) => b.daysOverdue - a.daysOverdue);
  }

  /** §4.7.2: "send payment reminder now", with a channel picker. */
  async sendReminder(input: {
    scheduleId: string;
    channel: NotificationChannel;
    actorId: string;
  }) {
    const schedule = await this.prisma.paymentSchedule.findUnique({
      where: { id: input.scheduleId },
      include: {
        instalments: { orderBy: { sequence: 'asc' } },
        subscription: { include: { learner: true } },
      },
    });
    if (!schedule) throw AppError.notFound();

    const owing = schedule.instalments.find((i) => i.state === 'due' || i.state === 'overdue');
    if (!owing) throw AppError.conflict('errors.instalment.already_paid');

    await this.notifications.notifyUser(
      schedule.subscription.payerUserId,
      'instalmentDueSoon',
      {
        learner: schedule.subscription.learner.fullName,
        instalment: owing.sequence,
        amount: owing.amountXaf.toString(),
        dueOn: owing.dueOn.toISOString().slice(0, 10),
        days: 0,
      },
      // Manual sends are deliberate, so they carry no dedupe key and always go.
      { channels: [input.channel, 'in_app'] },
    );

    await this.audit.record({
      action: 'billing.reminder_sent',
      entity: 'instalment',
      entityId: owing.id,
      actorId: input.actorId,
      after: { channel: input.channel, sequence: owing.sequence, manual: true },
    });

    return { sent: true, instalmentId: owing.id };
  }

  /**
   * §4.7.2: record an offline or manual payment.
   *
   * Finance Admin only, reason and evidence mandatory, and it produces ledger
   * entries — this is a recorded collection, not a state edit. It then runs the
   * same instalment application and unfreeze path a provider callback would, so
   * a cash payment behaves identically to a MoMo one from here on.
   */
  async recordOfflinePayment(input: {
    subscriptionId: string;
    amountXaf: bigint | number | string;
    method: PaymentMethod;
    reason: string;
    evidenceKey: string;
    receivedAt?: Date;
    actorId: string;
  }) {
    const reason = input.reason.trim();
    if (!reason) throw AppError.badRequest('errors.offlinePayment.reason_required');
    if (!input.evidenceKey?.trim()) {
      throw AppError.badRequest('errors.offlinePayment.evidence_required');
    }

    const amountXaf = toXaf(input.amountXaf);
    const receivedAt = input.receivedAt ?? new Date();

    const subscription = await this.prisma.subscription.findUnique({
      where: { id: input.subscriptionId },
      include: { learner: true },
    });
    if (!subscription) throw AppError.notFound();

    const payment = await this.prisma.$transaction(async (tx) => {
      const created = await tx.payment.create({
        data: {
          id: randomUUID(),
          subscriptionId: input.subscriptionId,
          method: input.method,
          idempotencyKey: `offline:${input.subscriptionId}:${input.evidenceKey}`,
          amountXaf,
          status: 'succeeded',
          settledAt: receivedAt,
          recordedOffline: true,
          recordedBy: input.actorId,
          recordReason: reason,
          evidenceKey: input.evidenceKey,
        },
      });

      await this.ledger.recordCollection(
        {
          paymentId: created.id,
          method: input.method,
          amountXaf,
          feeXaf: 0n,
          taxXaf: 0n,
          occurredAt: receivedAt,
          learnerId: subscription.learnerId,
        },
        tx,
      );

      return created;
    });

    // FR-PAY-016: an offline collection is still a numbered invoice.
    const invoice = await this.invoices.issueFor(payment.id);

    const applied = await this.instalments.applyPayment({
      subscriptionId: input.subscriptionId,
      paymentId: payment.id,
      amountXaf,
      paidAt: receivedAt,
    });

    // §5.3: "On payment, the account unfreezes immediately and automatically."
    // §5.5: unless the freeze was manual, which this call refuses to lift.
    let unfrozen: { lifted: boolean; blockedByManual: boolean } = {
      lifted: false,
      blockedByManual: false,
    };
    if (applied.instalmentIds.length > 0) {
      unfrozen = await this.freeze.unfreezeForPayment({
        learnerId: subscription.learnerId,
        instalmentId: applied.instalmentIds[0]!,
      });
    }

    await this.audit.record({
      action: 'billing.offline_payment_recorded',
      entity: 'payment',
      entityId: payment.id,
      actorId: input.actorId,
      after: {
        subscriptionId: input.subscriptionId,
        amountXaf: amountXaf.toString(),
        method: input.method,
        evidenceKey: input.evidenceKey,
        invoiceNumber: invoice.number,
        instalmentsSettled: applied.instalmentIds.length,
        unfroze: unfrozen.lifted,
        stillFrozenByManual: unfrozen.blockedByManual,
      },
      reason,
    });

    return {
      paymentId: payment.id,
      invoiceNumber: invoice.number,
      instalmentsSettled: applied.instalmentIds.length,
      scheduleSettled: applied.scheduleSettled,
      unfroze: unfrozen.lifted,
      stillFrozenByManual: unfrozen.blockedByManual,
    };
  }

  /** §4.7.2: "view payment history" for one learner. */
  async paymentHistory(learnerId: string) {
    const payments = await this.prisma.payment.findMany({
      where: { subscription: { learnerId } },
      include: { invoice: true },
      orderBy: { createdAt: 'desc' },
    });

    return payments.map((p) => ({
      id: p.id,
      amountXaf: p.amountXaf.toString(),
      method: p.method,
      status: p.status,
      createdAt: p.createdAt,
      settledAt: p.settledAt,
      failureReason: p.failureReason,
      providerRef: p.providerRef,
      invoiceNumber: p.invoice?.number ?? null,
      isRefund: Boolean(p.refundOfPaymentId),
      recordedOffline: p.recordedOffline,
    }));
  }

  /**
   * Every approved learner, with where their fees stand.
   *
   * The paid and owing screens are both payment-shaped: they list movements, so
   * a learner nobody has ever paid for appears on neither. That is the wrong
   * shape for the question an operator actually asks — *"who is registered and
   * what have they paid?"* — which is asked learner-first.
   *
   * So this is roster-first. Every approved learner appears exactly once, with a
   * stage derived from their schedule, and those with no schedule at all show as
   * `not_registered` rather than vanishing.
   *
   * The stage is **derived, never stored**. It is a reading of the instalments,
   * which are a reading of the ledger. A stored stage would be a fourth place
   * the truth lives, and the first to drift.
   */
  async studentsFees(filters: { levelId?: string; query?: string } = {}) {
    const learners = await this.prisma.learner.findMany({
      where: {
        approvalState: 'approved',
        archivedAt: null,
        ...(filters.levelId ? { levelId: filters.levelId } : {}),
      },
      select: {
        id: true,
        fullName: true,
        level: { select: { id: true, code: true, nameEn: true, nameFr: true } },
        /*
         * `Guardian` carries no name — it is a role row keyed on `user_id`, and
         * the name and phone live on `User`. Hence the extra hop.
         *
         * `isPrimary` first: a learner may have two guardians (FR-FAM-004), and
         * the one to call is the primary rather than whichever the database
         * happens to return.
         */
        guardians: {
          orderBy: { isPrimary: 'desc' },
          take: 1,
          select: {
            guardian: {
              select: { user: { select: { fullName: true, phoneE164: true } } },
            },
          },
        },
        subscriptions: {
          where: { status: { in: ['active', 'grace', 'suspended', 'pending_payment'] } },
          orderBy: { periodStart: 'desc' },
          take: 1,
          select: {
            id: true,
            status: true,
            plan: { select: { code: true, priceXaf: true } },
            schedule: {
              select: {
                id: true,
                planType: true,
                totalXaf: true,
                registrationFeeXaf: true,
                registrationPaidAt: true,
                settledInFullAt: true,
                instalments: {
                  orderBy: { sequence: 'asc' },
                  select: {
                    sequence: true,
                    state: true,
                    dueOn: true,
                    paidAt: true,
                    amountXaf: true,
                  },
                },
              },
            },
          },
        },
      },
      orderBy: { fullName: 'asc' },
      take: 500,
    });

    const needle = filters.query?.trim().toLowerCase();

    return learners
      .map((learner) => {
        const subscription = learner.subscriptions[0] ?? null;
        const schedule = subscription?.schedule ?? null;
        const instalments = schedule?.instalments ?? [];
        const paid = instalments.filter((i) => i.state === 'paid');

        /*
         * The four states an operator thinks in.
         *
         * `not_registered` is deliberately distinct from "nothing paid": a
         * learner with no subscription has not started, and telling those two
         * apart is the difference between chasing a payment and chasing an
         * enrolment.
         */
        const stage: 'not_registered' | 'registered' | 'first' | 'second' | 'completed' =
          !subscription
            ? 'not_registered'
            : schedule?.settledInFullAt || (instalments.length > 0 && paid.length === instalments.length)
              ? 'completed'
              : paid.length >= 2
                ? 'second'
                : paid.length === 1
                  ? 'first'
                  : 'registered';

        const outstanding = instalments
          .filter((i) => i.state !== 'paid' && i.state !== 'cancelled')
          .reduce((sum, i) => sum + i.amountXaf, 0n);

        return {
          learnerId: learner.id,
          learner: learner.fullName,
          levelId: learner.level?.id ?? null,
          levelCode: learner.level?.code ?? null,
          levelEn: learner.level?.nameEn ?? null,
          levelFr: learner.level?.nameFr ?? null,
          guardian: learner.guardians[0]?.guardian.user.fullName ?? null,
          guardianPhone: learner.guardians[0]?.guardian.user.phoneE164 ?? null,
          subscriptionId: subscription?.id ?? null,
          subscriptionStatus: subscription?.status ?? null,
          planCode: subscription?.plan.code ?? null,
          planType: schedule?.planType ?? null,
          stage,
          instalmentsPaid: paid.length,
          instalmentsTotal: instalments.length,
          totalXaf: (schedule?.totalXaf ?? 0n).toString(),
          registrationFeeXaf: (schedule?.registrationFeeXaf ?? 0n).toString(),
          registrationPaid: Boolean(schedule?.registrationPaidAt),
          outstandingXaf: outstanding.toString(),
          nextDueOn:
            instalments.find((i) => i.state !== 'paid' && i.state !== 'cancelled')?.dueOn ?? null,
          // Enough for the plan editor to open without a second round trip.
          parts: instalments.map((i) => ({
            sequence: i.sequence,
            state: i.state,
            amountXaf: i.amountXaf.toString(),
            dueOn: i.dueOn ? i.dueOn.toISOString().slice(0, 10) : null,
          })),
        };
      })
      .filter(
        (row) =>
          !needle ||
          row.learner.toLowerCase().includes(needle) ||
          (row.guardian?.toLowerCase().includes(needle) ?? false) ||
          (row.guardianPhone?.includes(needle) ?? false),
      );
  }


  /**
   * Set a learner's fee stage directly, as an adjustment.
   *
   * The stage is normally a *reading* of the instalments, which are a reading of
   * the ledger — so a plain field edit would leave the money saying one thing
   * and the screen another, and reconciliation would surface the difference
   * weeks later with nobody able to reconstruct it.
   *
   * This does the operator's job without that consequence. Moving a stage
   * **forward** clears the instalments up to it and posts a balanced adjustment
   * against the learner's receivable, so the ledger records that the debt was
   * written off rather than collected. Moving it **back** reverses that.
   *
   * The result is the same control the operator asked for, and an auditor can
   * still answer "who decided this, when, and why" — which a field edit cannot.
   *
   * Not a substitute for `recordOfflinePayment`. Money received goes through
   * that path, where it lands in a cash account and produces an invoice. This is
   * for corrections: a mistaken entry, a waiver, a scholarship, a reconciliation
   * of records kept elsewhere.
   */
  async setFeeStage(input: {
    subscriptionId: string;
    stage: 'registered' | 'first' | 'second' | 'completed';
    reason: string;
    actorId: string;
  }) {
    const reason = input.reason.trim();
    // UI-007 in its ledger form: an adjustment with no stated reason is an
    // unexplained hole in the audit trail.
    if (reason.length < 3) throw AppError.badRequest('errors.adjustment.reason_required');

    const schedule = await this.prisma.paymentSchedule.findFirst({
      where: { subscriptionId: input.subscriptionId },
      select: {
        id: true,
        subscriptionId: true,
        instalments: {
          orderBy: { sequence: 'asc' },
          select: { id: true, sequence: true, state: true, amountXaf: true },
        },
      },
    });
    if (!schedule) throw AppError.notFound();

    const target = { registered: 0, first: 1, second: 2, completed: schedule.instalments.length }[
      input.stage
    ];
    const before = schedule.instalments.filter((i) => i.state === 'paid').length;
    if (target === before) return { changed: false, stage: input.stage };

    const now = new Date();

    const result = await this.prisma.$transaction(async (tx) => {
      const toSettle = schedule.instalments.slice(before, target);
      const toUnsettle = schedule.instalments.slice(target, before);

      for (const instalment of toSettle) {
        await tx.instalment.update({
          where: { id: instalment.id },
          data: { state: 'paid', paidAt: now, adjustedBy: input.actorId, adjustmentReason: reason },
        });
      }
      for (const instalment of toUnsettle) {
        await tx.instalment.update({
          where: { id: instalment.id },
          data: { state: 'due', paidAt: null, adjustedBy: input.actorId, adjustmentReason: reason },
        });
      }

      const amount = [...toSettle, ...toUnsettle].reduce((sum, i) => sum + i.amountXaf, 0n);

      /*
       * The balancing entries.
       *
       * Forward: the receivable is cleared and the same amount is charged to
       * refunds/contra-revenue — the platform gave up the claim rather than
       * collecting it. Backward: the reverse, reinstating the debt.
       *
       * Never a cash account. No money moved, and pretending otherwise would
       * corrupt the very reconciliation this design exists to protect.
       */
      if (amount > 0n) {
        await this.ledger.post(
          {
            legs:
              toSettle.length > 0
                ? [
                    { account: LEDGER_ACCOUNTS.REFUNDS, direction: 'debit', amountXaf: amount },
                    {
                      account: LEDGER_ACCOUNTS.LEARNER_RECEIVABLE,
                      direction: 'credit',
                      amountXaf: amount,
                    },
                  ]
                : [
                    {
                      account: LEDGER_ACCOUNTS.LEARNER_RECEIVABLE,
                      direction: 'debit',
                      amountXaf: amount,
                    },
                    { account: LEDGER_ACCOUNTS.REFUNDS, direction: 'credit', amountXaf: amount },
                  ],
            occurredAt: now,
            metadata: {
              kind: 'fee_stage_adjustment',
              subscriptionId: input.subscriptionId,
              stage: input.stage,
              reason,
              actorId: input.actorId,
            },
          },
          tx,
        );
      }

      await tx.paymentSchedule.update({
        where: { id: schedule.id },
        data: { settledInFullAt: target >= schedule.instalments.length ? now : null },
      });

      return { settled: toSettle.length, unsettled: toUnsettle.length, amount };
    });

    /*
     * The learner sees the new status on their Fees screen, and is told it
     * changed rather than being left to notice.
     */
    const subscription = await this.prisma.subscription.findUnique({
      where: { id: input.subscriptionId },
      select: {
        payerUserId: true,
        learner: { select: { userId: true, fullName: true } },
      },
    });
    if (subscription) {
      const targets = new Set(
        [subscription.payerUserId, subscription.learner.userId].filter(Boolean) as string[],
      );
      for (const target of targets) {
        await this.notifications
          .notifyUser(target, 'fees.status_changed', {
            learner: subscription.learner.fullName,
            stage: input.stage,
          })
          .catch(() => undefined);
      }
    }

    // FR-RBA-004: a financial decision, recorded with who made it and why.
    await this.audit.record({
      action: 'payment.stage_adjusted',
      entity: 'payment_schedule',
      entityId: schedule.id,
      actorId: input.actorId,
      before: { instalmentsPaid: before },
      after: { instalmentsPaid: target, stage: input.stage, reason },
    });

    return { changed: true, stage: input.stage, ...result, amountXaf: result.amount.toString() };
  }


  /** The plans an Admin may register a learner onto. */
  async plans() {
    const plans = await this.prisma.plan.findMany({
      where: { active: true },
      orderBy: [{ levelScope: 'asc' }, { priceXaf: 'asc' }],
      select: {
        id: true,
        code: true,
        nameEn: true,
        nameFr: true,
        levelScope: true,
        period: true,
        priceXaf: true,
      },
    });
    return plans.map((plan) => ({ ...plan, priceXaf: plan.priceXaf.toString() }));
  }

  /**
   * Register a learner: create the subscription and its payment schedule.
   *
   * This is the step that was missing, and its absence is why every learner read
   * "Not registered" with no action available. A fee stage is a position within
   * a schedule; with no subscription there is no schedule, so there was nothing
   * to set a stage *on*. The screen was right — it had nothing to offer.
   *
   * The payer is the learner's primary guardian, or the learner themselves for
   * an Adult Learner. Money is somebody's responsibility, and a subscription
   * with no named payer is a debt with nobody to ask.
   */
  async registerLearner(input: {
    learnerId: string;
    planId: string;
    planType: 'full' | 'three_instalments';
    startOn: string;
    actorId: string;
  }) {
    const learner = await this.prisma.learner.findUnique({
      where: { id: input.learnerId },
      select: {
        id: true,
        userId: true,
        fullName: true,
        guardians: {
          orderBy: { isPrimary: 'desc' },
          take: 1,
          select: { guardian: { select: { userId: true } } },
        },
        subscriptions: {
          where: { status: { in: ['active', 'grace', 'suspended', 'pending_payment'] } },
          select: { id: true },
        },
      },
    });
    if (!learner) throw AppError.notFound();

    // One live subscription per learner per period (FR-PAY-003). Registering
    // twice would produce two schedules and two answers to "what is owed".
    if (learner.subscriptions.length > 0) {
      throw AppError.conflict('errors.subscription.already_registered');
    }

    const payerUserId = learner.guardians[0]?.guardian.userId ?? learner.userId;
    if (!payerUserId) throw AppError.badRequest('errors.subscription.no_payer');

    const plan = await this.prisma.plan.findUnique({
      where: { id: input.planId },
      select: { id: true, priceXaf: true, period: true, active: true },
    });
    if (!plan || !plan.active) throw AppError.badRequest('errors.subscription.plan_unavailable');

    const periodStart = new Date(`${input.startOn}T00:00:00.000Z`);
    if (Number.isNaN(periodStart.getTime())) {
      throw AppError.badRequest('errors.subscription.bad_start_date');
    }
    const periodEnd = new Date(periodStart);
    if (plan.period === 'monthly') periodEnd.setUTCMonth(periodEnd.getUTCMonth() + 1);
    else periodEnd.setUTCFullYear(periodEnd.getUTCFullYear() + 1);

    const subscription = await this.prisma.subscription.create({
      data: {
        learnerId: learner.id,
        payerUserId,
        planId: plan.id,
        periodStart,
        periodEnd,
        // FR-PAY-007: nothing is active until settlement. The schedule below
        // decides what is owed and when.
        status: 'pending_payment',
      },
      select: { id: true },
    });

    const schedule = await this.instalments.createSchedule({
      subscriptionId: subscription.id,
      totalXaf: plan.priceXaf,
      planType: input.planType,
      startOn: input.startOn,
      actorId: input.actorId,
    });

    /*
     * Tell the learner, and the payer if they are a different person.
     *
     * A fee status the family only discovers by opening the app is a fee status
     * that surprises them at the worst moment. FR-NOT-003 makes payment
     * notifications non-disableable for exactly this reason.
     *
     * Failure to notify must never undo the registration — the money side is
     * already committed, and a dropped SMS is not a reason to pretend it was
     * not (NFR-AVL-006). Hence the catch.
     */
    const notifyTargets = new Set([payerUserId, learner.userId].filter(Boolean) as string[]);
    for (const target of notifyTargets) {
      await this.notifications
        .notifyUser(target, 'fees.registered', { learner: learner.fullName })
        .catch(() => undefined);
    }

    await this.audit.record({
      action: 'subscription.registered',
      entity: 'subscription',
      entityId: subscription.id,
      actorId: input.actorId,
      after: {
        learnerId: learner.id,
        planId: plan.id,
        planType: input.planType,
        startOn: input.startOn,
      },
    });

    return { subscriptionId: subscription.id, scheduleId: schedule.id };
  }


  /**
   * Edit the payment plan: what each part costs, and when it falls due.
   *
   * A plan set at registration is a starting point, not a contract carved in
   * stone — families negotiate, a term is shortened, a sibling discount is
   * agreed. Without this an operator's only recourse was to void and re-create,
   * which loses the history.
   *
   * Three rules hold, and they are the reason this is not just an UPDATE:
   *
   *  1. **Parts must sum exactly to the total.** §5.1 requires it, and a plan
   *     whose parts do not add up produces a balance nobody can explain.
   *  2. **A settled part cannot be re-priced.** Money has already moved against
   *     it; changing the figure afterwards would make the ledger disagree with
   *     the schedule. Use Set status to reverse it first if that is really the
   *     intent.
   *  3. **Whole francs only** (CON-02). XAF has no subunit.
   *
   * The learner and the payer are told, because a due date moving is exactly the
   * kind of change a family needs to hear about before it surprises them.
   */
  async updateSchedule(input: {
    subscriptionId: string;
    registrationFeeXaf: number;
    parts: { sequence: number; amountXaf: number; dueOn: string }[];
    reason: string;
    actorId: string;
  }) {
    const reason = input.reason.trim();
    if (reason.length < 3) throw AppError.badRequest('errors.adjustment.reason_required');

    const schedule = await this.prisma.paymentSchedule.findFirst({
      where: { subscriptionId: input.subscriptionId },
      select: {
        id: true,
        totalXaf: true,
        instalments: {
          orderBy: { sequence: 'asc' },
          select: { id: true, sequence: true, state: true, amountXaf: true, dueOn: true },
        },
      },
    });
    if (!schedule) throw AppError.notFound();

    // CON-02: integers, and nothing negative.
    const amounts = [input.registrationFeeXaf, ...input.parts.map((p) => p.amountXaf)];
    if (amounts.some((amount) => !Number.isInteger(amount) || amount < 0)) {
      throw AppError.badRequest('errors.schedule.whole_francs');
    }

    /*
     * The tuition total is *derived* from the parts, not checked against the
     * plan price.
     *
     * The plan price was being treated as the contract, so a school charging
     * 10 000 to register and 75 000 in tuition could not be expressed at all —
     * the parts had to sum to 10 000 or the save was refused. Registration and
     * tuition are different debts, and the operator knows the real figures.
     *
     * The plan still decides what a learner is enrolled in; it no longer
     * dictates what they owe.
     */
    const tuition = input.parts.reduce((sum, part) => sum + BigInt(part.amountXaf), 0n);
    if (tuition <= 0n) throw AppError.badRequest('errors.schedule.tuition_required');

    for (const part of input.parts) {
      const existing = schedule.instalments.find((i) => i.sequence === part.sequence);
      if (!existing) throw AppError.badRequest('errors.schedule.unknown_part');
      if (existing.state === 'paid' && BigInt(part.amountXaf) !== existing.amountXaf) {
        throw AppError.badRequest('errors.schedule.part_already_paid', {
          number: part.sequence,
        });
      }
    }

    const before = schedule.instalments.map((i) => ({
      sequence: i.sequence,
      amountXaf: i.amountXaf.toString(),
      dueOn: i.dueOn.toISOString().slice(0, 10),
    }));

    await this.prisma.$transaction(async (tx) => {
      await tx.paymentSchedule.update({
        where: { id: schedule.id },
        data: {
          totalXaf: tuition,
          registrationFeeXaf: BigInt(input.registrationFeeXaf),
        },
      });

      for (const part of input.parts) {
        const existing = schedule.instalments.find((i) => i.sequence === part.sequence)!;
        await tx.instalment.update({
          where: { id: existing.id },
          data: {
            amountXaf: BigInt(part.amountXaf),
            dueOn: new Date(`${part.dueOn}T00:00:00.000Z`),
            adjustedBy: input.actorId,
            adjustmentReason: reason,
          },
        });
      }
    });

    const subscription = await this.prisma.subscription.findUnique({
      where: { id: input.subscriptionId },
      select: { payerUserId: true, learner: { select: { userId: true, fullName: true } } },
    });
    if (subscription) {
      const targets = new Set(
        [subscription.payerUserId, subscription.learner.userId].filter(Boolean) as string[],
      );
      for (const target of targets) {
        await this.notifications
          .notifyUser(target, 'fees.plan_changed', { learner: subscription.learner.fullName })
          .catch(() => undefined);
      }
    }

    await this.audit.record({
      action: 'payment.schedule_updated',
      entity: 'payment_schedule',
      entityId: schedule.id,
      actorId: input.actorId,
      before: { parts: before },
      after: { parts: input.parts, reason },
    });

    return { ok: true };
  }

}
