'use client';

import { useState } from 'react';
import { useI18n } from '@/lib/i18n';
import { api, type ApiError } from '@/lib/api';
import { ErrorAlert } from '@/components/Alert';

/**
 * Editing the payment plan.
 *
 * A plan set at registration is a starting point, not a contract carved in
 * stone: families negotiate, a term is shortened, a sibling discount is agreed.
 * Without this the only recourse was to void and re-create, which loses the
 * history.
 *
 * Three rules the server enforces and this dialog surfaces *before* the save,
 * so an operator is not told after the fact:
 *
 *  - the parts must sum exactly to the total (§5.1)
 *  - a settled part cannot be re-priced — money has already moved against it
 *  - whole francs only (CON-02)
 *
 * The running total is shown live and Save stays disabled until it matches, so
 * the constraint is visible while it is being violated rather than announced
 * afterwards.
 */

interface Part {
  sequence: number;
  state: string;
  amountXaf: string;
  dueOn: string | null;
}

export function EditPlanDialog({
  row,
  onClose,
  onSaved,
}: {
  row: { subscriptionId: string; learner: string; totalXaf: string; parts: Part[] };
  onClose: () => void;
  onSaved: (message: string) => void;
}) {
  const { t, language } = useI18n();
  const [parts, setParts] = useState(
    row.parts.map((part) => ({
      sequence: part.sequence,
      state: part.state,
      amount: part.amountXaf,
      dueOn: part.dueOn ?? new Date().toISOString().slice(0, 10),
    })),
  );
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);

  const total = Number(row.totalXaf);
  const sum = parts.reduce((acc, part) => acc + (Number(part.amount) || 0), 0);
  const balanced = sum === total;
  const valid = balanced && reason.trim().length >= 3 && parts.every((p) => p.dueOn);

  function setPart(sequence: number, patch: Partial<{ amount: string; dueOn: string }>) {
    setParts((prior) =>
      prior.map((part) => (part.sequence === sequence ? { ...part, ...patch } : part)),
    );
  }

  async function submit() {
    if (!valid || busy) return;
    setBusy(true);
    setError(null);
    try {
      await api(`/admin/payments/subscriptions/${row.subscriptionId}/schedule`, {
        method: 'POST',
        body: {
          parts: parts.map((part) => ({
            sequence: part.sequence,
            amountXaf: Number(part.amount),
            dueOn: part.dueOn,
          })),
          reason: reason.trim(),
        },
        language,
      });
      onSaved(t('payments.planUpdated', { learner: row.learner }));
    } catch (caught) {
      setError(caught as ApiError);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink-900/40 p-4">
      <div className="w-full max-w-lg space-y-3 rounded-xl bg-white p-5 shadow-lg">
        <h2 className="font-display text-lg font-semibold text-ink-900">
          {t('payments.editPlanTitle')}
        </h2>
        <p className="text-sm text-ink-600">{row.learner}</p>

        {error && <ErrorAlert error={error} />}

        <div className="space-y-2">
          {parts.map((part) => {
            const settled = part.state === 'paid';
            return (
              <div key={part.sequence} className="flex items-end gap-2">
                <span className="mb-2 w-16 shrink-0 text-sm text-ink-600">
                  {t('student.fees.stage', { number: part.sequence })}
                </span>

                <label className="flex-1">
                  <span className="block text-xs text-ink-600">{t('payments.amount')}</span>
                  <input
                    inputMode="numeric"
                    value={part.amount}
                    disabled={settled}
                    onChange={(event) =>
                      setPart(part.sequence, { amount: event.target.value.replace(/\D/g, '') })
                    }
                    className="min-h-touch w-full rounded-lg border border-ink-300 px-2 tabular-nums disabled:bg-ink-100"
                  />
                </label>

                <label className="flex-1">
                  <span className="block text-xs text-ink-600">{t('payments.dueOn')}</span>
                  <input
                    type="date"
                    value={part.dueOn}
                    disabled={settled}
                    onChange={(event) => setPart(part.sequence, { dueOn: event.target.value })}
                    className="min-h-touch w-full rounded-lg border border-ink-300 px-2 disabled:bg-ink-100"
                  />
                </label>

                {/* Says why it is locked, rather than looking broken. */}
                {settled && (
                  <span className="mb-2 shrink-0 text-xs text-success-600">
                    {t('student.fees.stagePaid')}
                  </span>
                )}
              </div>
            );
          })}
        </div>

        {/*
         * The constraint, live. Visible while it is being broken rather than
         * announced after a rejected save.
         */}
        <p
          className={[
            'rounded-lg px-3 py-2 text-sm tabular-nums',
            balanced ? 'bg-success-50 text-success-600' : 'bg-warning-50 text-warning-600',
          ].join(' ')}
        >
          {t('payments.partsSum', {
            sum: formatXaf(sum),
            total: formatXaf(total),
          })}
          {!balanced && ` · ${t('payments.mustMatch')}`}
        </p>

        <label className="block text-sm font-medium text-ink-900" htmlFor="plan-reason">
          {t('payments.reason')}
        </label>
        <textarea
          id="plan-reason"
          rows={2}
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          className="w-full rounded-lg border border-ink-300 p-2 text-sm"
        />

        <p className="rounded-lg bg-ink-100 px-3 py-2 text-xs text-ink-600">
          {t('payments.editPlanConsequence')}
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
            {busy ? t('common.saving') : t('payments.savePlan')}
          </button>
        </div>
      </div>
    </div>
  );
}

/** UI-009: whole XAF, thousands separated, `FCFA` suffix. */
function formatXaf(amount: number): string {
  return `${amount.toLocaleString('fr-FR').replace(/\u202f|\u00a0/g, ' ')} FCFA`;
}
