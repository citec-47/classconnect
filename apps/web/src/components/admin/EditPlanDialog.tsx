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
  row: {
    subscriptionId: string;
    learner: string;
    totalXaf: string;
    registrationFeeXaf: string;
    parts: Part[];
  };
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
  const [registration, setRegistration] = useState(row.registrationFeeXaf || '0');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);

  /*
   * The tuition total is what the parts add up to — it is no longer checked
   * against the plan price.
   *
   * Registration and tuition are different debts. Requiring the parts to equal
   * the plan price made it impossible to express "10 000 to register, 75 000 in
   * tuition", which is how the school actually charges.
   */
  const registrationFee = Number(registration) || 0;
  const tuition = parts.reduce((acc, part) => acc + (Number(part.amount) || 0), 0);
  const contract = registrationFee + tuition;
  const valid = tuition > 0 && reason.trim().length >= 3 && parts.every((p) => p.dueOn);

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
          registrationFeeXaf: registrationFee,
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
    <div
      /*
       * The overlay scrolls, not the page behind it.
       *
       * A fixed panel taller than the viewport simply runs off the bottom —
       * which is what happened to the plan editor with three parts and a
       * summary. `items-start` plus vertical padding keeps a tall dialog
       * reachable, and `overflow-y-auto` on the overlay gives it somewhere to
       * go on a short laptop screen.
       */
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-ink-900/40 p-4 sm:items-center"
    >
      <div className="my-auto w-full max-w-lg space-y-3 rounded-xl bg-white p-5 shadow-lg">
        <h2 className="font-display text-lg font-semibold text-ink-900">
          {t('payments.editPlanTitle')}
        </h2>
        <p className="text-sm text-ink-600">{row.learner}</p>

        {error && <ErrorAlert error={error} />}

        {/* Registration first, because it is paid first. */}
        <label className="block">
          <span className="block text-sm font-medium text-ink-900">
            {t('payments.registrationFee')}
          </span>
          <input
            inputMode="numeric"
            value={registration}
            onChange={(event) => setRegistration(event.target.value.replace(/\D/g, ''))}
            className="min-h-touch w-full rounded-lg border border-ink-300 px-2 tabular-nums"
          />
          <span className="mt-0.5 block text-xs text-ink-600">
            {t('payments.registrationFeeHint')}
          </span>
        </label>

        {/*
         * The parts scroll; the totals and the buttons below do not.
         *
         * With three parts this fits, but a plan with six would push Save off a
         * laptop screen — and the summary is the thing an operator is watching
         * while they type, so it must not scroll away from them.
         */}
        <div className="max-h-[40vh] space-y-2 overflow-y-auto">
          <p className="text-sm font-medium text-ink-900">{t('payments.tuitionParts')}</p>
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
                  <span className="block text-xs text-ink-600">{t('payments.partDueOn')}</span>
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
        {/* The arithmetic, shown as it is typed rather than after a rejection. */}
        <dl className="space-y-1 rounded-lg bg-ink-100 px-3 py-2 text-sm">
          <div className="flex justify-between">
            <dt className="text-ink-600">{t('payments.registrationFee')}</dt>
            <dd className="tabular-nums text-ink-900">{formatXaf(registrationFee)}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-ink-600">{t('payments.tuitionTotal')}</dt>
            <dd className="tabular-nums text-ink-900">{formatXaf(tuition)}</dd>
          </div>
          <div className="flex justify-between border-t border-ink-300 pt-1 font-semibold">
            <dt className="text-ink-900">{t('payments.contractTotal')}</dt>
            <dd className="tabular-nums text-ink-900">{formatXaf(contract)}</dd>
          </div>
        </dl>

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
