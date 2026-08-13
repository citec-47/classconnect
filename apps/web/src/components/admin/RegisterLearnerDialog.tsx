'use client';

import { useEffect, useState } from 'react';
import { formatXaf } from '@classconnect/shared';
import { useI18n } from '@/lib/i18n';
import { api, type ApiError } from '@/lib/api';
import { ErrorAlert } from '@/components/Alert';

/**
 * Registering a learner onto a plan.
 *
 * This is the step whose absence made every row read "Not registered" with no
 * action beside it. A fee stage is a *position within a schedule*; with no
 * subscription there is no schedule, so there was nothing for a stage control to
 * act on. The screen was not broken — it had nothing to offer.
 *
 * Creating the subscription creates the schedule, and from that moment Record
 * payment and Set status both become available on the row.
 *
 * The payer is chosen by the server: the learner's primary guardian, or the
 * learner themselves for an Adult Learner. Money is somebody's responsibility,
 * and a subscription with no named payer is a debt with nobody to ask.
 */

interface Plan {
  id: string;
  code: string;
  nameEn: string;
  nameFr: string;
  levelScope: string;
  period: string;
  priceXaf: string;
}

export function RegisterLearnerDialog({
  learnerId,
  learnerName,
  onClose,
  onRegistered,
}: {
  learnerId: string;
  learnerName: string;
  onClose: () => void;
  onRegistered: (message: string) => void;
}) {
  const { t, language } = useI18n();
  const [plans, setPlans] = useState<Plan[] | null>(null);
  const [planId, setPlanId] = useState('');
  const [planType, setPlanType] = useState<'full' | 'three_instalments'>('three_instalments');
  // Today, in Africa/Douala — the schedule's first due date counts from here.
  const [startOn, setStartOn] = useState(() => new Date().toISOString().slice(0, 10));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        const list = await api<Plan[]>('/admin/payments/plans', { language });
        setPlans(list);
        if (list[0]) setPlanId(list[0].id);
      } catch (caught) {
        setError(caught as ApiError);
      }
    })();
  }, [language]);

  const selected = plans?.find((plan) => plan.id === planId) ?? null;

  async function submit() {
    if (!planId || busy) return;
    setBusy(true);
    setError(null);
    try {
      await api(`/admin/payments/learners/${learnerId}/register`, {
        method: 'POST',
        body: { planId, planType, startOn },
        language,
      });
      onRegistered(t('payments.registered', { learner: learnerName }));
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
      <div className="my-auto w-full max-w-md space-y-3 rounded-xl bg-white p-5 shadow-lg">
        <h2 className="font-display text-lg font-semibold text-ink-900">
          {t('payments.registerTitle')}
        </h2>
        <p className="text-sm text-ink-600">{learnerName}</p>

        {error && <ErrorAlert error={error} />}

        <label className="block text-sm font-medium text-ink-900" htmlFor="reg-plan">
          {t('payments.choosePlan')}
        </label>
        <select
          id="reg-plan"
          value={planId}
          onChange={(event) => setPlanId(event.target.value)}
          className="min-h-touch w-full rounded-lg border border-ink-300 px-3 text-sm"
        >
          {(plans ?? []).map((plan) => (
            <option key={plan.id} value={plan.id}>
              {(language === 'fr' ? plan.nameFr : plan.nameEn)} — {formatXaf(BigInt(plan.priceXaf))}
            </option>
          ))}
        </select>

        <fieldset>
          <legend className="mb-1 text-sm font-medium text-ink-900">
            {t('payments.howToPay')}
          </legend>
          {(['three_instalments', 'full'] as const).map((option) => (
            <label
              key={option}
              className="flex min-h-touch cursor-pointer items-center gap-2 rounded-lg border border-ink-300 px-3 text-sm"
            >
              <input
                type="radio"
                name="planType"
                checked={planType === option}
                onChange={() => setPlanType(option)}
              />
              <span>
                {option === 'full'
                  ? t('student.fees.payInFull')
                  : t('student.fees.threeInstalments')}
              </span>
            </label>
          ))}
        </fieldset>

        <label className="block text-sm font-medium text-ink-900" htmlFor="reg-start">
          {t('payments.startOn')}
        </label>
        <input
          id="reg-start"
          type="date"
          value={startOn}
          onChange={(event) => setStartOn(event.target.value)}
          className="min-h-touch w-full rounded-lg border border-ink-300 px-3 text-sm"
        />

        {/* UI-007: name the consequence before the button that causes it. */}
        <p className="rounded-lg bg-ink-100 px-3 py-2 text-xs text-ink-600">
          {selected
            ? t('payments.registerConsequence', {
                total: formatXaf(BigInt(selected.priceXaf)),
              })
            : t('common.loading')}
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
            disabled={!planId || busy}
            onClick={() => void submit()}
            className="min-h-touch rounded-lg bg-brand-600 px-4 text-sm font-medium text-white disabled:opacity-50"
          >
            {busy ? t('common.saving') : t('payments.register')}
          </button>
        </div>
      </div>
    </div>
  );
}
