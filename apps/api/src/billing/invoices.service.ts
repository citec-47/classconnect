import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { Prisma } from '@prisma/client';
import { PLATFORM_TIMEZONE } from '@classconnect/shared';
import { PrismaService } from '../common/prisma.service';
import { AppError } from '../common/http-exception.filter';

/**
 * Numbered invoices (FR-PAY-016).
 *
 * The number comes from a database sequence rather than from `COUNT(*) + 1`.
 * A count repeats after any deletion and races under concurrency, and a
 * duplicated or skipped invoice number is the kind of defect a tax audit finds
 * rather than a test.
 *
 * OI-07 leaves the legally required fields for a Cameroonian invoice open. They
 * are carried as JSON so the shape can be settled without a migration, and the
 * fields that *are* certain — number, date, amount, tax — are columns.
 */
@Injectable()
export class InvoicesService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Allocates the next number. Format `CC-YYYY-NNNNNN`.
   *
   * `nextval` is transactional-safe and never returns the same value twice, even
   * if the surrounding transaction rolls back — which costs a number rather than
   * risking a duplicate, the right way round for a legal document.
   */
  private async nextNumber(tx: Prisma.TransactionClient): Promise<string> {
    const rows = await tx.$queryRaw<
      { nextval: bigint }[]
    >`SELECT nextval('invoice_number_seq') AS nextval`;
    const value = rows[0]?.nextval;
    if (value === undefined) throw new Error('invoice number sequence returned nothing');

    const year = new Intl.DateTimeFormat('en-CA', {
      timeZone: PLATFORM_TIMEZONE,
      year: 'numeric',
    }).format(new Date());

    return `CC-${year}-${value.toString().padStart(6, '0')}`;
  }

  /**
   * Issues the invoice for a settled payment.
   *
   * Idempotent on the payment: a retried collection callback must not produce a
   * second invoice for the same money (CON-04).
   */
  async issueFor(
    paymentId: string,
    tx?: Prisma.TransactionClient,
  ): Promise<{ id: string; number: string }> {
    const run = async (client: Prisma.TransactionClient) => {
      const existing = await client.invoice.findUnique({ where: { paymentId } });
      if (existing) return { id: existing.id, number: existing.number };

      const payment = await client.payment.findUnique({
        where: { id: paymentId },
        include: {
          subscription: {
            include: { learner: true, payer: true, plan: true },
          },
        },
      });
      if (!payment) throw AppError.notFound();
      if (payment.status !== 'succeeded') {
        throw AppError.badRequest('errors.refund.not_refundable');
      }

      const number = await this.nextNumber(client);
      const invoice = await client.invoice.create({
        data: {
          id: randomUUID(),
          number,
          paymentId,
          totalXaf: payment.amountXaf,
          taxXaf: payment.taxXaf,
          legalFieldsJson: {
            // OI-07: placeholders, present so the renderer has a stable shape and
            // the gap is visible in the data rather than discovered at filing.
            supplierName: 'ClassConnect',
            supplierTaxId: null,
            customerName: payment.subscription?.payer.fullName ?? null,
            learnerName: payment.subscription?.learner.fullName ?? null,
            planCode: payment.subscription?.plan.code ?? null,
            periodStart: payment.subscription?.periodStart ?? null,
            periodEnd: payment.subscription?.periodEnd ?? null,
            vatTreatment: 'unresolved_oi_07',
            mobileMoneyLevy: 'unresolved_oi_07',
          } as never,
        },
      });

      return { id: invoice.id, number: invoice.number };
    };

    return tx ? run(tx) : this.prisma.$transaction(run);
  }

  /** §4.7.1: the data behind "view numbered invoice PDF". */
  async render(invoiceId: string) {
    const invoice = await this.prisma.invoice.findUnique({
      where: { id: invoiceId },
      include: {
        payment: {
          include: {
            subscription: { include: { learner: true, payer: true, plan: true } },
          },
        },
      },
    });
    if (!invoice) throw AppError.notFound();

    return {
      number: invoice.number,
      issuedAt: invoice.issuedAt,
      totalXaf: invoice.totalXaf.toString(),
      taxXaf: invoice.taxXaf.toString(),
      legalFields: invoice.legalFieldsJson,
      payment: {
        id: invoice.payment.id,
        method: invoice.payment.method,
        // CON-03 / FR-PAY-020: a provider reference, never a PAN or a wallet PIN.
        providerRef: invoice.payment.providerRef,
        settledAt: invoice.payment.settledAt,
      },
      learner: invoice.payment.subscription?.learner.fullName ?? null,
      payer: invoice.payment.subscription?.payer.fullName ?? null,
      plan: invoice.payment.subscription?.plan.nameEn ?? null,
    };
  }
}
