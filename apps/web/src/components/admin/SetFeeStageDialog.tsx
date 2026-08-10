'use client';

import { useState } from 'react';
import { useI18n } from '@/lib/i18n';
import { api, type ApiError } from '@/lib/api';
import { ErrorAlert } from '@/components/Alert';

/**
 * Setting a fee stage directly.
 *
 * Normally the stage is a reading of the instalments, and the instalments are a
 * reading of the ledger — so **Record payment** is the ordinary way to move it,
 * and the way that keeps the money and the screen agreeing.
 *
 * This is the other case: a correction, a waiver, a scholarship, or fees
 * collected in a record kept elsewhere. It does what the operator asked for and
 * still leaves the books answerable — the server clears or reinstates the
 * instalments *and* posts a balanced ledger entry against the learner's
 * receivable, so an auditor can see the debt was written off rather than
 * collected.
 *
 * Which is why the reason is mandatory and the consequence is spelled out before
 * the button (UI-007). An adjustment nobody explained is the thing that makes
 * reconciliation unanswerable three months later.
 */

type Stage = 'registered' | 'first' | 'second' | 'completed';

const STAGES: Stage[] = ['registered', 'first', 'second', 'completed'];

export function SetFeeStageDialog({
  row,
  onClose,
  onSaved,
}: {
  row: {
    subscriptionId: string;
    learner: string;
    stage: string;
    instalmentsPaid: number;
    instalmentsTotal: number;
  };
  onClose: () => void;
  onSaved: (message: string) => void;
}) {
  const { t, language } = useI18n();
  const [stage, setStage] = useState<Stage>(
    STAGES.includes(row.stage as Stage) ? (row.stage as Stage) : 'registered',
  );
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);

  const changed = stage !== row.stage;
  const valid = changed && reason.trim().length >= 3;

  async function submit() {
    if (!valid || busy) return;
    setBusy(true);
    setError(null);
    try {
      await api(`/admin/payments/subscriptions/${row.subscriptionId}/stage`, {
        method: 'POST',
        body: { stage, reason: reason.trim() },
        language,
      });
      onSaved(t('payments.stageAdjusted', { stage: t(`payments.stage.${stage}`) }));
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
          {t('payments.setStageTitle')}
        </h2>
        <p className="text-sm text-ink-600">{row.learner}</p>

        {error && <ErrorAlert error={error} />}

        <fieldset>
          <legend className="mb-1 text-sm font-medium text-ink-900">
            {t('payments.feeStage')}
          </legend>
          <div className="space-y-1">
            {STAGES.map((option) => (
              <label
                key={option}
                className="flex min-h-touch cursor-pointer items-center gap-2 rounded-lg border border-ink-300 px-3 text-sm"
              >
                <input
                  type="radio"
                  name="stage"
                  value={option}
                  checked={stage === option}
                  onChange={() => setStage(option)}
                />
                <span>{t(`payments.stage.${option}`)}</span>
                {option === row.stage && (
                  <span className="ml-auto text-xs text-ink-600">{t('payments.current')}</span>
                )}
              </label>
            ))}
          </div>
        </fieldset>

        <label className="block text-sm font-medium text-ink-900" htmlFor="stage-reason">
          {t('payments.reason')}
        </label>
        <textarea
          id="stage-reason"
          rows={2}
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          placeholder={t('payments.reasonHint')}
          className="w-full rounded-lg border border-ink-300 p-2 text-sm"
        />

        {/* UI-007: the consequence, in plain language, before the button. */}
        <p className="rounded-lg bg-warning-50 px-3 py-2 text-xs text-warning-600">
          {t('payments.stageConsequence')}
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
            {busy ? t('common.saving') : t('payments.setStage')}
          </button>
        </div>
      </div>
    </div>
  );
}
