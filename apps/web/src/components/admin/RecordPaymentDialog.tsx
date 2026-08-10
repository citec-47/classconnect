'use client';

import { useState } from 'react';
import { formatXaf } from '@classconnect/shared';
import { useI18n } from '@/lib/i18n';
import { api, type ApiError } from '@/lib/api';
import { ErrorAlert } from '@/components/Alert';

/**
 * Recording a payment a student has made.
 *
 * The requirement was "update the amount the student has paid, and whether it is
 * the first or second instalment or the fees are complete." This does that —
 * but note what it does *not* do: it never edits a stored total.
 *
 * Money in this system moves through an append-only double-entry ledger
 * (FR-LDG-001), and the amount paid is the sum of the payments recorded against
 * a subscription. So "update the amount" is expressed as recording another
 * payment, which the existing `POST /payments/offline` handler already does
 * properly: it creates the payment, writes balanced ledger entries, issues a
 * numbered invoice, settles instalments **in sequence**, and lifts an automatic
 * freeze if one was in force.
 *
 * That last part is why the admin does not choose which instalment to mark.
 * They enter what was received; the schedule decides what it settles. An admin
 * who could tick "instalment 2 paid" while instalment 1 was outstanding would
 * be creating a schedule the ledger disagrees with, and the disagreement would
 * surface weeks later in reconciliation with nobody able to explain it.
 *
 * Paying the balance in full settles every remaining instalment in one movement,
 * which is the "completed" case.
 */
export function RecordPaymentDialog({
  row,
  onClose,
  onRecorded,
}: {
  row: {
    subscriptionId: string | null;
    learner: string | null;
    instalmentsDone: number;
    instalmentsTotal: number;
    outstandingXaf?: string | null;
  };
  onClose: () => void;
  onRecorded: (message: string) => void;
}) {
  const { t, language } = useI18n();
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState<'mtn_momo' | 'orange_money' | 'cash' | 'bank_transfer'>(
    'mtn_momo',
  );
  const [reason, setReason] = useState('');
  const [evidenceKey, setEvidenceKey] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);

  const amountXaf = Number(amount.replace(/\s/g, ''));
  const valid =
    row.subscriptionId !== null &&
    Number.isInteger(amountXaf) &&
    amountXaf > 0 &&
    reason.trim().length > 0 &&
    evidenceKey.trim().length > 0;

  async function submit() {
    if (!valid || !row.subscriptionId) return;
    setBusy(true);
    setError(null);
    try {
      const result = await api<{
        instalmentsSettled: number;
        scheduleSettled: boolean;
        invoiceNumber: string;
        unfroze: boolean;
      }>('/payments/offline', {
        method: 'POST',
        body: {
          subscriptionId: row.subscriptionId,
          amountXaf,
          method,
          reason: reason.trim(),
          evidenceKey: evidenceKey.trim(),
        },
        language,
      });

      onRecorded(
        result.scheduleSettled
          ? t('payments.recordedComplete', { invoice: result.invoiceNumber })
          : t('payments.recordedPartial', {
              count: result.instalmentsSettled,
              invoice: result.invoiceNumber,
            }),
      );
    } catch (caught) {
      setError(caught as ApiError);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink-900/40 p-4">
      <div className="w-full max-w-md space-y-3 rounded-xl bg-white p-5 shadow-lg">
        <h2 className="font-display text-lg font-semibold text-ink-900">
          {t('payments.recordPaymentTitle')}
        </h2>
        <p className="text-sm text-ink-600">
          {row.learner} · {t('payments.instalmentsDone', {
            done: row.instalmentsDone,
            total: row.instalmentsTotal,
          })}
        </p>

        {error && <ErrorAlert error={error} />}

        <label className="block text-sm font-medium text-ink-900" htmlFor="rp-amount">
          {t('payments.amountReceived')}
        </label>
        <input
          id="rp-amount"
          inputMode="numeric"
          value={amount}
          onChange={(event) => setAmount(event.target.value.replace(/[^\d\s]/g, ''))}
          className="min-h-touch w-full rounded-lg border border-ink-300 px-3 tabular-nums"
        />
        {/* CON-02 / UI-009: whole XAF only. There is no such thing as 15 000.50. */}
        <p className="text-xs text-ink-600">
          {amountXaf > 0 ? formatXaf(BigInt(amountXaf)) : t('payments.wholeFrancsOnly')}
        </p>

        <label className="block text-sm font-medium text-ink-900" htmlFor="rp-method">
          {t('payments.paidVia')}
        </label>
        <select
          id="rp-method"
          value={method}
          onChange={(event) => setMethod(event.target.value as typeof method)}
          className="min-h-touch w-full rounded-lg border border-ink-300 px-3"
        >
          <option value="mtn_momo">MTN Mobile Money</option>
          <option value="orange_money">Orange Money</option>
          <option value="cash">{t('payments.methodCash')}</option>
          <option value="bank_transfer">{t('payments.methodBank')}</option>
        </select>

        <label className="block text-sm font-medium text-ink-900" htmlFor="rp-evidence">
          {t('payments.evidenceRef')}
        </label>
        <input
          id="rp-evidence"
          value={evidenceKey}
          onChange={(event) => setEvidenceKey(event.target.value)}
          placeholder={t('payments.evidenceHint')}
          className="min-h-touch w-full rounded-lg border border-ink-300 px-3"
        />

        <label className="block text-sm font-medium text-ink-900" htmlFor="rp-reason">
          {t('payments.reason')}
        </label>
        <textarea
          id="rp-reason"
          rows={2}
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          className="w-full rounded-lg border border-ink-300 p-2"
        />

        {/* UI-007: name the consequence before the button that causes it. */}
        <p className="rounded-lg bg-ink-100 px-3 py-2 text-xs text-ink-600">
          {t('payments.recordConsequence')}
        </p>

        <div className="flex justify-end gap-2 pt-1">
          <button
            type="button"
            onClick={onClose}
            className="min-h-touch rounded-lg border border-ink-300 px-4 text-sm"
          >
            {t('common.cancel')}
          </button>
          <button
            type="button"
            disabled={!valid || busy}
            onClick={() => void submit()}
            className="min-h-touch rounded-lg bg-brand-600 px-4 text-sm font-medium text-white disabled:opacity-50"
          >
            {busy ? t('common.saving') : t('payments.recordPayment')}
          </button>
        </div>
      </div>
    </div>
  );
}
