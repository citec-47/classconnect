import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import {
  CONFIG_KEYS,
  payoutBlockers,
  type PayoutBlockReason,
} from '@classconnect/shared';
import { PrismaService } from '../common/prisma.service';
import { PlatformConfigService } from '../common/platform-config.service';
import { AppError } from '../common/http-exception.filter';
import { AuditService } from '../audit/audit.service';
import { LedgerService } from '../billing/ledger.service';
import { FieldEncryptionService } from '../teachers/field-encryption.service';

/**
 * Teacher payouts (§4.7.3/§4.7.4, FR-ERN-007..010).
 *
 * The rule this file exists to enforce, verbatim from FR-ERN-010 and repeated in
 * the acceptance criteria: "A payout to an unverified wallet, a suspended
 * teacher, or an incomplete-KYC teacher is refused at the API."
 *
 * Refused *at the API* — the pending list still shows those teachers, with the
 * specific reason on the row, because §4.7.4 asks for that rather than a greyed
 * out button with no explanation. Hiding the row would also hide the problem.
 */
@Injectable()
export class PayoutsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: PlatformConfigService,
    private readonly audit: AuditService,
    private readonly ledger: LedgerService,
    private readonly encryption: FieldEncryptionService,
  ) {}

  /**
   * The single authority on whether a payout may execute.
   *
   * Both the list view and the approval endpoint call this, so what an admin is
   * shown and what the API will accept cannot disagree.
   */
  private async evaluate(teacherId: string, netPayableXaf: bigint) {
    const teacher = await this.prisma.teacher.findUnique({
      where: { userId: teacherId },
      include: {
        user: { select: { fullName: true, status: true } },
        freezes: { where: { liftedAt: null } },
      },
    });
    if (!teacher) throw AppError.notFound();

    // A teacher is "suspended" for payout purposes whether that came from a
    // verification decision (FR-TVR-009) or a manual freeze (§5.5). Both stop
    // the money; neither forfeits it.
    const suspended =
      Boolean(teacher.suspendedAt) ||
      teacher.user.status === 'suspended' ||
      teacher.freezes.length > 0;

    const minimumXaf = BigInt(this.config.getNumber(CONFIG_KEYS.PAYOUT_MINIMUM_XAF));

    const blockers = payoutBlockers({
      walletVerified: teacher.walletVerified,
      kycComplete: teacher.kycComplete,
      suspended,
      netPayableXaf,
      minimumXaf,
    });

    return { teacher, suspended, blockers, minimumXaf };
  }

  /**
   * NFR-SEC-003 / CON-03: a wallet is shown masked, never in full. Reuses the
   * teachers module's preview so a wallet renders identically wherever it
   * appears, and so a decryption failure degrades to `****` rather than throwing
   * in the middle of a list.
   */
  private maskWallet(encrypted: string | null): string | null {
    return encrypted ? this.encryption.maskedPreview(encrypted) : null;
  }

  private blockerKey(reason: PayoutBlockReason): string {
    return `errors.payout.${reason}`;
  }

  // -------------------------------------------------------------------------
  // §4.7.4 — pending salary
  // -------------------------------------------------------------------------

  async pending(period?: string) {
    const earnings = await this.prisma.earning.findMany({
      where: {
        ...(period ? { period } : {}),
        // An earnings row already settled by a paid payout is history, not a
        // pending obligation.
        OR: [{ payoutId: null }, { payout: { status: { in: ['requested', 'rejected', 'failed'] } } }],
      },
      include: {
        teacher: {
          include: { user: { select: { fullName: true, status: true } } },
        },
        payout: true,
      },
      orderBy: [{ period: 'desc' }, { netPayableXaf: 'desc' }],
    });

    const now = Date.now();

    return Promise.all(
      earnings.map(async (earning) => {
        const { teacher, suspended, blockers, minimumXaf } = await this.evaluate(
          earning.teacherId,
          earning.netPayableXaf,
        );

        return {
          earningId: earning.id,
          teacherId: earning.teacherId,
          teacherName: teacher.user.fullName,
          period: earning.period,
          attendedMinutes: earning.attendedMinutes,
          grossXaf: earning.amountXaf.toString(),
          deductionsXaf: earning.deductionsXaf.toString(),
          netPayableXaf: earning.netPayableXaf.toString(),
          kycComplete: teacher.kycComplete,
          walletVerified: teacher.walletVerified,
          walletMasked: this.maskWallet(teacher.payoutWalletEnc),
          payoutMethod: teacher.payoutMethod,
          suspended,
          daysPending: Math.floor((now - earning.createdAt.getTime()) / 86_400_000),
          // §4.7.4: the specific reason, on the row.
          blockers: blockers.map((reason) => ({
            reason,
            messageKey: this.blockerKey(reason),
            params: reason === 'below_minimum' ? { minimum: minimumXaf.toString() } : {},
          })),
          payable: blockers.length === 0,
          // §4.7.4: where a suspended teacher has accrued earnings, the money is
          // held, not forfeited.
          heldPendingReview: suspended && earning.netPayableXaf > 0n,
          heldReason: earning.payout?.heldReason ?? null,
          existingPayout: earning.payout
            ? { id: earning.payout.id, status: earning.payout.status }
            : null,
          configVersion: earning.configVersion,
        };
      }),
    );
  }

  // -------------------------------------------------------------------------
  // FR-ERN-008 — approval and execution
  // -------------------------------------------------------------------------

  /**
   * Approves and executes one payout.
   *
   * Idempotent on a platform-generated key (CON-04/FR-PAY-013): a retried
   * approval finds the existing payout and returns it rather than sending the
   * money a second time.
   */
  async approve(input: { earningId: string; actorId: string }) {
    const earning = await this.prisma.earning.findUnique({
      where: { id: input.earningId },
      include: { payout: true },
    });
    if (!earning) throw AppError.notFound();

    if (earning.payout && ['approved', 'processing', 'paid'].includes(earning.payout.status)) {
      throw AppError.conflict('errors.payout.already_approved');
    }

    const { teacher, blockers, minimumXaf } = await this.evaluate(
      earning.teacherId,
      earning.netPayableXaf,
    );

    // FR-ERN-010, enforced here rather than in the UI.
    if (blockers.length > 0) {
      const first = blockers[0]!;
      throw AppError.badRequest(
        this.blockerKey(first),
        first === 'below_minimum' ? { minimum: minimumXaf.toString() } : undefined,
      );
    }
    if (!teacher.payoutMethod) {
      throw AppError.badRequest('errors.payout.wallet_unverified');
    }

    // Derived from the earning, not random: the same period approved twice
    // produces the same key and the unique index refuses the second write.
    const idempotencyKey = `payout:${earning.teacherId}:${earning.period}`;
    const now = new Date();

    const payout = await this.prisma.$transaction(async (tx) => {
      const existing = await tx.payout.findUnique({ where: { idempotencyKey } });
      if (existing) return existing;

      const created = await tx.payout.create({
        data: {
          id: randomUUID(),
          teacherId: earning.teacherId,
          amountXaf: earning.netPayableXaf,
          method: teacher.payoutMethod!,
          idempotencyKey,
          status: 'approved',
          approvedBy: input.actorId,
          approvedAt: now,
          withheldTaxXaf: earning.deductionsXaf,
          period: earning.period,
        },
      });

      await tx.earning.update({
        where: { id: earning.id },
        data: { payoutId: created.id },
      });

      await this.ledger.recordPayout(
        {
          payoutId: created.id,
          teacherId: earning.teacherId,
          method: teacher.payoutMethod!,
          grossXaf: earning.amountXaf,
          taxWithheldXaf: earning.deductionsXaf,
          providerFeeXaf: 0n,
          occurredAt: now,
        },
        tx,
      );

      return created;
    });

    await this.audit.record({
      action: 'payout.approved',
      entity: 'payout',
      entityId: payout.id,
      actorId: input.actorId,
      after: {
        teacherId: earning.teacherId,
        period: earning.period,
        amountXaf: payout.amountXaf.toString(),
        idempotencyKey,
      },
    });

    return {
      id: payout.id,
      status: payout.status,
      amountXaf: payout.amountXaf.toString(),
    };
  }

  /**
   * §4.7.4: batch approval.
   *
   * "Batch approval must still list each teacher and amount on the confirmation
   * screen before commit" — so the caller sends the exact ids it displayed, and
   * each is evaluated separately. One blocked teacher does not silently drop out
   * of the batch and does not take the rest down with them: the result names
   * what went through and what did not.
   */
  async approveBatch(input: { earningIds: string[]; actorId: string }) {
    const approved: { earningId: string; payoutId: string; amountXaf: string }[] = [];
    const refused: { earningId: string; messageKey: string }[] = [];

    for (const earningId of input.earningIds) {
      try {
        const result = await this.approve({ earningId, actorId: input.actorId });
        approved.push({ earningId, payoutId: result.id, amountXaf: result.amountXaf });
      } catch (error) {
        refused.push({
          earningId,
          messageKey:
            error instanceof AppError
              ? ((error.getResponse() as { messageKey?: string }).messageKey ?? 'errors.generic')
              : 'errors.generic',
        });
      }
    }

    await this.audit.record({
      action: 'payout.batch_approved',
      entity: 'payout_batch',
      entityId: null,
      actorId: input.actorId,
      after: {
        requested: input.earningIds.length,
        approved: approved.length,
        refused: refused.length,
        totalXaf: approved.reduce((sum, a) => sum + BigInt(a.amountXaf), 0n).toString(),
      },
    });

    return { approved, refused };
  }

  /**
   * §4.7.4 / FR-AI-005: a suspended teacher's accrued earnings are held. Only a
   * named human decides to release or withhold them, and the reason is recorded.
   */
  async decideHeld(input: {
    earningId: string;
    decision: 'release' | 'withhold';
    reason: string;
    actorId: string;
  }) {
    const reason = input.reason.trim();
    if (!reason) throw AppError.badRequest('errors.payout.decision_required');

    const earning = await this.prisma.earning.findUnique({
      where: { id: input.earningId },
      include: { payout: true, teacher: true },
    });
    if (!earning) throw AppError.notFound();

    if (input.decision === 'withhold') {
      const now = new Date();
      const payout = await this.prisma.payout.upsert({
        where: { idempotencyKey: `payout:${earning.teacherId}:${earning.period}` },
        create: {
          id: randomUUID(),
          teacherId: earning.teacherId,
          amountXaf: earning.netPayableXaf,
          method: earning.teacher.payoutMethod ?? 'mtn_momo',
          idempotencyKey: `payout:${earning.teacherId}:${earning.period}`,
          status: 'rejected',
          period: earning.period,
          heldReason: reason,
          failureReason: 'withheld_by_decision',
          approvedBy: input.actorId,
          approvedAt: now,
        },
        update: {
          status: 'rejected',
          heldReason: reason,
          failureReason: 'withheld_by_decision',
          approvedBy: input.actorId,
          approvedAt: now,
        },
      });

      await this.prisma.earning.update({
        where: { id: earning.id },
        data: { payoutId: payout.id },
      });

      await this.audit.record({
        action: 'payout.withheld',
        entity: 'earning',
        entityId: earning.id,
        actorId: input.actorId,
        after: {
          teacherId: earning.teacherId,
          period: earning.period,
          amountXaf: earning.netPayableXaf.toString(),
        },
        reason,
      });

      return { decision: 'withhold' as const, payoutId: payout.id };
    }

    // Releasing does not bypass FR-ERN-010. It records the decision to pay a
    // suspended teacher's accrual; the wallet and KYC checks still apply, and
    // approving is a separate, separately audited action.
    await this.prisma.payout.updateMany({
      where: { teacherId: earning.teacherId, period: earning.period },
      data: { heldReason: null },
    });

    await this.audit.record({
      action: 'payout.released',
      entity: 'earning',
      entityId: earning.id,
      actorId: input.actorId,
      after: {
        teacherId: earning.teacherId,
        period: earning.period,
        amountXaf: earning.netPayableXaf.toString(),
      },
      reason,
    });

    return { decision: 'release' as const };
  }

  // -------------------------------------------------------------------------
  // §4.7.3 — teachers paid
  // -------------------------------------------------------------------------

  async paid(filters: { period?: string; from?: Date; to?: Date }) {
    const payouts = await this.prisma.payout.findMany({
      where: {
        status: { in: ['paid', 'processing', 'approved'] },
        ...(filters.period ? { period: filters.period } : {}),
        ...(filters.from || filters.to
          ? {
              approvedAt: {
                ...(filters.from ? { gte: filters.from } : {}),
                ...(filters.to ? { lte: filters.to } : {}),
              },
            }
          : {}),
      },
      include: {
        teacher: { include: { user: { select: { fullName: true } } } },
        earnings: true,
      },
      orderBy: { approvedAt: 'desc' },
    });

    const approverIds = [...new Set(payouts.map((p) => p.approvedBy).filter(Boolean))] as string[];
    const approvers = await this.prisma.user.findMany({
      where: { id: { in: approverIds } },
      select: { id: true, fullName: true },
    });
    const approverName = new Map(approvers.map((a) => [a.id, a.fullName]));

    return payouts.map((payout) => {
      const earning = payout.earnings[0];
      return {
        id: payout.id,
        teacherId: payout.teacherId,
        teacherName: payout.teacher.user.fullName,
        period: payout.period,
        attendedMinutes: earning?.attendedMinutes ?? 0,
        grossXaf: (earning?.amountXaf ?? payout.amountXaf).toString(),
        providerFeeXaf: payout.providerFeeXaf.toString(),
        taxWithheldXaf: payout.withheldTaxXaf.toString(),
        netPaidXaf: payout.amountXaf.toString(),
        method: payout.method,
        walletMasked: this.maskWallet(payout.teacher.payoutWalletEnc),
        providerRef: payout.providerRef,
        approvedBy: payout.approvedBy ? approverName.get(payout.approvedBy) ?? null : null,
        approvedAt: payout.approvedAt,
        paidAt: payout.executedAt,
        status: payout.status,
        // §4.7.3: "Every figure links through to the underlying sessions."
        earningId: earning?.id ?? null,
        configVersion: earning?.configVersion ?? null,
      };
    });
  }

  /**
   * §4.7.3: "A teacher must be able to ask 'why this number?' and support must
   * be able to answer in two clicks." This is the second click.
   */
  async explain(earningId: string) {
    const earning = await this.prisma.earning.findUnique({
      where: { id: earningId },
      include: { teacher: { include: { user: { select: { fullName: true } } } } },
    });
    if (!earning) throw AppError.notFound();

    const basis = earning.basisJson as {
      fromLearners?: { learnerId: string; amountXaf: string; attendedMinutes: number }[];
      poolXaf?: string;
      recognisedRevenueXaf?: string;
      config?: Record<string, unknown>;
    };

    const learnerIds = (basis.fromLearners ?? []).map((f) => f.learnerId);
    const learners = await this.prisma.learner.findMany({
      where: { id: { in: learnerIds } },
      select: { id: true, fullName: true },
    });
    const name = new Map(learners.map((l) => [l.id, l.fullName]));

    const [year, month] = earning.period.split('-').map(Number);
    const start = new Date(Date.UTC(year!, month! - 1, 1));
    const end = new Date(Date.UTC(month === 12 ? year! + 1 : year!, month! % 12, 1));

    const sessions = await this.prisma.session.findMany({
      where: {
        teacherId: earning.teacherId,
        startsAtUtc: { gte: start, lt: end },
        status: { in: ['completed', 'no_show_learner'] },
      },
      include: {
        participants: { where: { userId: earning.teacherId } },
        subject: { select: { nameEn: true, nameFr: true } },
        learner: { select: { id: true, fullName: true } },
      },
      orderBy: { startsAtUtc: 'asc' },
    });

    return {
      earningId: earning.id,
      teacherName: earning.teacher.user.fullName,
      period: earning.period,
      configVersion: earning.configVersion,
      poolXaf: basis.poolXaf ?? null,
      recognisedRevenueXaf: basis.recognisedRevenueXaf ?? null,
      grossXaf: earning.amountXaf.toString(),
      deductionsXaf: earning.deductionsXaf.toString(),
      netPayableXaf: earning.netPayableXaf.toString(),
      perLearner: (basis.fromLearners ?? []).map((f) => ({
        learnerId: f.learnerId,
        learnerName: name.get(f.learnerId) ?? null,
        amountXaf: f.amountXaf,
        attendedMinutes: f.attendedMinutes,
      })),
      sessions: sessions.map((session) => ({
        id: session.id,
        startsAtUtc: session.startsAtUtc,
        durationMin: session.durationMin,
        type: session.type,
        status: session.status,
        subject: session.subject,
        learner: session.learner,
        // FR-LIV-014: from the media server, not from the teacher.
        teacherAttendedMinutes: session.participants[0]?.attendedMinutes ?? 0,
      })),
    };
  }
}
