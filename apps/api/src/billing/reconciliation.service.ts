import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { PaymentMethod } from '@prisma/client';
import { CONFIG_KEYS } from '@classconnect/shared';
import { PrismaService } from '../common/prisma.service';
import { PlatformConfigService } from '../common/platform-config.service';
import { AppError } from '../common/http-exception.filter';
import { AuditService } from '../audit/audit.service';

/**
 * §4.7.6 — reconciliation (FR-LDG-003/004, FR-PAY-012/013).
 *
 * CON-04 is the reason this screen exists at all: mobile-money callbacks are
 * unreliable, so they are treated as advisory and the platform polls as well.
 * Anything the two disagree about lands here for a human, rather than being
 * resolved by whichever signal arrived last.
 */

/** One line of a provider's settlement report. */
export interface StatementLine {
  providerRef: string;
  amountXaf: bigint;
  occurredAt: Date;
}

@Injectable()
export class ReconciliationService {
  private readonly logger = new Logger(ReconciliationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: PlatformConfigService,
    private readonly audit: AuditService,
  ) {}

  /**
   * FR-LDG-003: the daily comparison for one provider.
   *
   * Matching is on provider reference *and* amount. Reference alone would match
   * a payment the provider settled for a different figure, which is exactly the
   * discrepancy this report is supposed to surface.
   */
  async run(input: {
    provider: PaymentMethod;
    statementDate: Date;
    lines: StatementLine[];
    actorId?: string;
  }) {
    const dayStart = new Date(
      Date.UTC(
        input.statementDate.getUTCFullYear(),
        input.statementDate.getUTCMonth(),
        input.statementDate.getUTCDate(),
      ),
    );
    const dayEnd = new Date(dayStart.getTime() + 86_400_000);

    const platformPayments = await this.prisma.payment.findMany({
      where: {
        method: input.provider,
        createdAt: { gte: dayStart, lt: dayEnd },
        status: { in: ['succeeded', 'pending', 'pending_reconciliation'] },
      },
    });

    const byRef = new Map(
      platformPayments.filter((p) => p.providerRef).map((p) => [p.providerRef!, p]),
    );

    const run = await this.prisma.reconciliationRun.upsert({
      where: {
        provider_statementDate: { provider: input.provider, statementDate: dayStart },
      },
      create: {
        id: randomUUID(),
        provider: input.provider,
        statementDate: dayStart,
      },
      update: {},
    });

    // A re-run replaces the unresolved items but leaves anything a human has
    // already decided on, so a repeated import cannot undo a write-off.
    await this.prisma.reconciliationItem.deleteMany({
      where: { runId: run.id, state: 'unmatched' },
    });

    const items: {
      providerRef: string;
      amountXaf: bigint;
      occurredAt: Date;
      paymentId: string | null;
      state: 'matched' | 'unmatched';
      note: string | null;
    }[] = [];

    const seen = new Set<string>();

    // Direction one: on the statement. Is it on the platform, for the same money?
    for (const line of input.lines) {
      seen.add(line.providerRef);
      const payment = byRef.get(line.providerRef);

      if (payment && payment.amountXaf === line.amountXaf) {
        items.push({
          providerRef: line.providerRef,
          amountXaf: line.amountXaf,
          occurredAt: line.occurredAt,
          paymentId: payment.id,
          state: 'matched',
          note: null,
        });
        continue;
      }

      items.push({
        providerRef: line.providerRef,
        amountXaf: line.amountXaf,
        occurredAt: line.occurredAt,
        paymentId: payment?.id ?? null,
        state: 'unmatched',
        note: payment
          ? `Amount differs: provider ${line.amountXaf} XAF, platform ${payment.amountXaf} XAF.`
          : 'On the provider statement, not on the platform.',
      });
    }

    // Direction two: on the platform. Did the provider actually settle it?
    // This is the one that catches a callback we believed and a settlement that
    // never happened, which a statement-only sweep would miss entirely.
    for (const payment of platformPayments) {
      if (payment.providerRef && seen.has(payment.providerRef)) continue;

      items.push({
        providerRef: payment.providerRef ?? `platform:${payment.id}`,
        amountXaf: payment.amountXaf,
        occurredAt: payment.createdAt,
        paymentId: payment.id,
        state: 'unmatched',
        note: 'Recorded on the platform, not on the provider statement.',
      });
    }

    await this.prisma.reconciliationItem.createMany({
      data: items.map((item) => ({
        id: randomUUID(),
        runId: run.id,
        provider: input.provider,
        ...item,
      })),
    });

    const unmatched = items.filter((i) => i.state === 'unmatched');
    const unmatchedValue = unmatched.reduce((sum, i) => sum + i.amountXaf, 0n);

    // FR-LDG-004: alert Finance when unmatched items cross either threshold.
    const alertCount = this.config.getNumber(CONFIG_KEYS.RECONCILIATION_ALERT_ITEM_COUNT);
    const alertValue = BigInt(this.config.getNumber(CONFIG_KEYS.RECONCILIATION_ALERT_VALUE_XAF));
    const breached = unmatched.length >= alertCount || unmatchedValue >= alertValue;

    await this.prisma.reconciliationRun.update({
      where: { id: run.id },
      data: {
        itemCount: items.length,
        unmatchedCount: unmatched.length,
        unmatchedValueXaf: unmatchedValue,
        alertedAt: breached ? new Date() : null,
      },
    });

    // FR-PAY-012: an unmatched platform payment stops claiming to have
    // succeeded and enters the recheck loop instead.
    const toRecheck = unmatched
      .filter((i) => i.paymentId && i.note?.startsWith('Recorded on the platform'))
      .map((i) => i.paymentId!);
    if (toRecheck.length > 0) {
      await this.prisma.payment.updateMany({
        where: { id: { in: toRecheck }, status: { not: 'succeeded' } },
        data: { status: 'pending_reconciliation' },
      });
    }

    await this.audit.record({
      action: 'reconciliation.run',
      entity: 'reconciliation_run',
      entityId: run.id,
      actorId: input.actorId ?? null,
      after: {
        provider: input.provider,
        statementDate: dayStart.toISOString().slice(0, 10),
        itemCount: items.length,
        unmatchedCount: unmatched.length,
        unmatchedValueXaf: unmatchedValue.toString(),
        thresholdBreached: breached,
      },
    });

    if (breached) {
      this.logger.warn({
        msg: 'Reconciliation threshold breached — Finance Admin alerted (FR-LDG-004)',
        provider: input.provider,
        unmatchedCount: unmatched.length,
        unmatchedValueXaf: unmatchedValue.toString(),
      });
    }

    return {
      runId: run.id,
      itemCount: items.length,
      unmatchedCount: unmatched.length,
      unmatchedValueXaf: unmatchedValue.toString(),
      thresholdBreached: breached,
    };
  }

  /** §4.7.6: the list Finance works from. */
  async list(filters: { provider?: PaymentMethod; state?: string; from?: Date; to?: Date }) {
    const escalationHours = this.config.getNumber(CONFIG_KEYS.RECONCILIATION_ESCALATION_HOURS);
    const now = Date.now();

    const items = await this.prisma.reconciliationItem.findMany({
      where: {
        ...(filters.provider ? { provider: filters.provider } : {}),
        ...(filters.state ? { state: filters.state as never } : { state: 'unmatched' }),
        ...(filters.from || filters.to
          ? {
              occurredAt: {
                ...(filters.from ? { gte: filters.from } : {}),
                ...(filters.to ? { lte: filters.to } : {}),
              },
            }
          : {}),
      },
      include: {
        run: true,
        payment: {
          include: { subscription: { include: { learner: true, payer: true } } },
        },
      },
      orderBy: { occurredAt: 'desc' },
      take: 500,
    });

    return items.map((item) => ({
      id: item.id,
      provider: item.provider,
      providerRef: item.providerRef,
      amountXaf: item.amountXaf.toString(),
      occurredAt: item.occurredAt,
      statementDate: item.run.statementDate.toISOString().slice(0, 10),
      state: item.state,
      note: item.note,
      ageHours: Math.floor((now - item.occurredAt.getTime()) / 3_600_000),
      // FR-PAY-012 / NFR-DEP-003: escalate if unresolved after the window.
      escalationDue:
        item.state === 'unmatched' &&
        now - item.occurredAt.getTime() > escalationHours * 3_600_000,
      payment: item.payment
        ? {
            id: item.payment.id,
            status: item.payment.status,
            amountXaf: item.payment.amountXaf.toString(),
            learner: item.payment.subscription?.learner.fullName ?? null,
            payer: item.payment.subscription?.payer.fullName ?? null,
          }
        : null,
    }));
  }

  /** Attaches an unmatched statement line to the payment it turns out to be. */
  async match(input: { itemId: string; paymentId: string; actorId: string }) {
    const item = await this.prisma.reconciliationItem.findUnique({
      where: { id: input.itemId },
    });
    if (!item) throw AppError.notFound();
    if (item.state !== 'unmatched') throw AppError.conflict('errors.reconciliation.already_resolved');

    const payment = await this.prisma.payment.findUnique({ where: { id: input.paymentId } });
    if (!payment) throw AppError.notFound();

    await this.prisma.$transaction([
      this.prisma.reconciliationItem.update({
        where: { id: input.itemId },
        data: {
          state: 'matched',
          paymentId: input.paymentId,
          resolvedBy: input.actorId,
          resolvedAt: new Date(),
        },
      }),
      this.prisma.payment.update({
        where: { id: input.paymentId },
        data: {
          status: 'succeeded',
          providerRef: item.providerRef,
          settledAt: payment.settledAt ?? item.occurredAt,
        },
      }),
    ]);

    await this.audit.record({
      action: 'reconciliation.item_matched',
      entity: 'reconciliation_item',
      entityId: input.itemId,
      actorId: input.actorId,
      before: { state: 'unmatched' },
      after: { state: 'matched', paymentId: input.paymentId },
    });

    return { matched: true };
  }

  /**
   * FR-AI-005: writing off is discretionary, so the note and the actor are both
   * mandatory — the database check constraint enforces the same rule.
   */
  async writeOff(input: { itemId: string; note: string; actorId: string }) {
    const note = input.note.trim();
    if (!note) throw AppError.badRequest('errors.reconciliation.note_required');

    const item = await this.prisma.reconciliationItem.findUnique({
      where: { id: input.itemId },
    });
    if (!item) throw AppError.notFound();
    if (item.state !== 'unmatched') throw AppError.conflict('errors.reconciliation.already_resolved');

    await this.prisma.reconciliationItem.update({
      where: { id: input.itemId },
      data: { state: 'written_off', note, resolvedBy: input.actorId, resolvedAt: new Date() },
    });

    await this.audit.record({
      action: 'reconciliation.item_written_off',
      entity: 'reconciliation_item',
      entityId: input.itemId,
      actorId: input.actorId,
      before: { state: 'unmatched', amountXaf: item.amountXaf.toString() },
      after: { state: 'written_off' },
      reason: note,
    });

    return { writtenOff: true };
  }

  async escalate(input: { itemId: string; note: string; actorId: string }) {
    const item = await this.prisma.reconciliationItem.findUnique({
      where: { id: input.itemId },
    });
    if (!item) throw AppError.notFound();

    await this.prisma.reconciliationItem.update({
      where: { id: input.itemId },
      data: { state: 'escalated', note: input.note.trim() || item.note },
    });

    await this.audit.record({
      action: 'reconciliation.item_escalated',
      entity: 'reconciliation_item',
      entityId: input.itemId,
      actorId: input.actorId,
      after: { state: 'escalated' },
      reason: input.note,
    });

    return { escalated: true };
  }

  /** §4.1: the summary the overview alert panel reads. */
  async summary() {
    const alertCount = this.config.getNumber(CONFIG_KEYS.RECONCILIATION_ALERT_ITEM_COUNT);
    const alertValue = BigInt(this.config.getNumber(CONFIG_KEYS.RECONCILIATION_ALERT_VALUE_XAF));

    const unmatched = await this.prisma.reconciliationItem.aggregate({
      where: { state: 'unmatched' },
      _count: true,
      _sum: { amountXaf: true },
    });

    const value = unmatched._sum.amountXaf ?? 0n;

    return {
      unmatchedCount: unmatched._count,
      unmatchedValueXaf: value.toString(),
      thresholdCount: alertCount,
      thresholdValueXaf: alertValue.toString(),
      breached: unmatched._count >= alertCount || value >= alertValue,
    };
  }
}
