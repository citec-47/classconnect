'use client';

import { formatXaf } from '@classconnect/shared';
import { useI18n } from '@/lib/i18n';
import { useStudent, type LearnerFreeze } from '@/lib/student-context';
import { PauseCircleIcon } from './icons';

/**
 * §6 — the frozen state.
 *
 * When a guardian misses an instalment and the account auto-freezes, a child
 * opens the app and sees this. They are not the person who owes the money, and
 * every decision below follows from that one fact:
 *
 *   · No amount, no due date, no instalment schedule for a minor. The type
 *     carries none of it (see `LearnerFreeze`), so there is nothing to leak.
 *   · No blame. Not "your account has been suspended for non-payment" — the
 *     subject of these sentences is the payment, never the learner.
 *   · Not a takeover. §6 requires the timetable, past marked work and saved
 *     offline material to stay readable, so this is a notice above a working
 *     surface rather than a wall in front of a dead one.
 *
 * The Adult Learner is the exception in both directions: their own payer, so
 * they see the full detail and a way to settle it (2.3, FR-PAY-003).
 */

export function FrozenNotice() {
  const { t, language } = useI18n();
  const { learner } = useStudent();
  const freeze = learner?.freeze;

  if (!freeze?.active) return null;

  const minor = freeze.payer === 'guardian';

  return (
    <div
      // `status`, not `alert`: this is a standing condition the learner will see
      // every time they open the app for days, not an event that just happened.
      // `alert` would interrupt a screen reader mid-sentence on every screen.
      role="status"
      className="rounded-xl border border-warning-600 bg-warning-50 p-4"
    >
      <div className="flex items-start gap-3">
        <PauseCircleIcon className="mt-0.5 h-6 w-6 shrink-0 text-warning-600" />
        <div className="min-w-0 flex-1">
          <h2 className="text-base font-semibold text-ink-900">
            {t(minor ? 'student.frozen.minorTitle' : 'student.frozen.adultTitle')}
          </h2>
          <p className="mt-1.5 max-w-prose text-sm text-ink-900">
            {t(minor ? 'student.frozen.minorBody' : 'student.frozen.adultBody')}
          </p>

          {minor ? (
            /*
             * §6: say what still works. A child told only that things are
             * paused will assume everything is, and stop opening the app.
             */
            <div className="mt-3 rounded-lg bg-white/70 p-3">
              <p className="text-sm font-semibold text-ink-900">
                {t('student.frozen.minorStillOpen')}
              </p>
              <p className="mt-1 text-sm text-ink-600">
                {t('student.frozen.minorStillOpenBody')}
              </p>
            </div>
          ) : (
            <p className="mt-3 text-sm font-semibold tabular-nums text-ink-900">
              {t('student.frozen.adultAmount', {
                amount: formatXaf(freeze.amountOutstandingXaf, language),
              })}
            </p>
          )}

          <div className="mt-4 flex flex-wrap items-center gap-2">
            {!minor && (
              <a
                href="#pay"
                className={[
                  'inline-flex min-h-touch items-center rounded-lg bg-brand-600 px-4',
                  'text-sm font-semibold text-white hover:bg-brand-700',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600',
                  'focus-visible:ring-offset-2 focus-visible:ring-offset-warning-50',
                ].join(' ')}
              >
                {t('student.frozen.adultPay')}
              </a>
            )}
            {/* FR-SUP-001: always a way to reach a person. */}
            <a
              href="#support"
              className={[
                'inline-flex min-h-touch items-center rounded-lg border border-ink-300 bg-white px-4',
                'text-sm font-semibold text-ink-900 hover:bg-ink-100',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600',
                'focus-visible:ring-offset-2 focus-visible:ring-offset-warning-50',
              ].join(' ')}
            >
              {t('student.frozen.contactSupport')}
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Renders in place of a control §6 blocks: joining or booking a session,
 * starting a quiz or mock, submitting homework, opening new material.
 *
 * Says why, in one sentence, without repeating the whole notice above it — and
 * without naming money to a minor.
 */
export function BlockedByFreeze() {
  const { t } = useI18n();

  return (
    <p className="rounded-lg bg-ink-100 px-3 py-2 text-sm text-ink-600">
      {t('student.frozen.blockedAction')}
    </p>
  );
}

/**
 * Whether §6's blocked actions are currently blocked.
 *
 * A convenience for screens, never the enforcement — FR-RBA-002 requires the
 * endpoint behind each of these to refuse in its own right, and a client that
 * forgot to call this must not be the reason a frozen account can still book.
 */
export function useFrozen(): boolean {
  const { learner } = useStudent();
  return learner?.freeze.active === true;
}

/** Narrowing helper, exported for the tests that assert §10's criterion 9. */
export function freezeCarriesAmount(
  freeze: LearnerFreeze,
): freeze is { active: true; payer: 'self'; amountOutstandingXaf: number } {
  return freeze.active && freeze.payer === 'self';
}
