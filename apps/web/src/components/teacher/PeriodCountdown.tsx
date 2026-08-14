'use client';

import { useCallback, useEffect, useState } from 'react';
import { useI18n } from '@/lib/i18n';
import { api } from '@/lib/api';

interface Countdown {
  earns: boolean;
  minutesEarned: number;
  minutesRemaining: number | null;
  completed: boolean;
  minimumMinutes?: number;
  periodEndsAt: string | null;
  rateXaf: number | null;
  valueXaf: string;
}

/**
 * Where the teacher stands inside the period, while teaching.
 *
 * Every number here comes from the server. The browser could count its own
 * minutes far more cheaply, and that is exactly the problem: what a lesson
 * earned is decided by the server's record of when the room opened, and a
 * figure the page calculated for itself would be a different number in a
 * position to disagree with the payslip.
 *
 * Polled once a minute rather than ticking every second. The interesting
 * transitions — passing the 30-minute floor, reaching the end of the period —
 * happen on minute boundaries, and a per-second poll on §6.2's network spends
 * bandwidth a lesson needs for its video.
 */
export function PeriodCountdown({ sessionId }: { sessionId: string }) {
  const { t, language } = useI18n();
  const [state, setState] = useState<Countdown | null>(null);
  const [failed, setFailed] = useState(false);

  const load = useCallback(async () => {
    try {
      setState(await api<Countdown>(`/teacher/live/${sessionId}/countdown`, { language }));
      setFailed(false);
    } catch {
      /*
       * A failed poll is not worth interrupting a lesson for. The last figure
       * stays on screen and the next minute tries again; only a first load that
       * never succeeds shows anything at all.
       */
      setFailed(true);
    }
  }, [sessionId, language]);

  useEffect(() => {
    void load();
    const timer = setInterval(() => void load(), 60_000);
    return () => clearInterval(timer);
  }, [load]);

  if (!state) {
    return failed ? null : <div className="h-16 animate-pulse rounded-xl bg-ink-100" />;
  }

  /*
   * An invite-only call has no period and earns nothing, so it says so rather
   * than showing a countdown to a deadline that does not exist.
   */
  if (!state.earns) {
    return (
      <div className="rounded-xl border border-ink-200 bg-white p-3">
        <p className="text-sm text-ink-600">{t('live.countdown.noEarnings')}</p>
      </div>
    );
  }

  return (
    <div
      className={`rounded-xl border p-3 ${
        state.completed ? 'border-success-600 bg-success-50' : 'border-brand-600 bg-brand-50'
      }`}
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-sm font-semibold text-ink-900">
          {t('live.countdown.taught', { minutes: state.minutesEarned })}
        </p>
        <p className="font-mono text-sm text-ink-900">
          {t('live.countdown.earned', { amount: state.valueXaf })}
        </p>
      </div>

      <p className="mt-1 text-sm text-ink-600">
        {state.minutesRemaining === 0
          ? t('live.countdown.periodOver')
          : t('live.countdown.remaining', { minutes: state.minutesRemaining ?? 0 })}
      </p>

      {/*
       * The floor stated as a fact, not a warning.
       *
       * A teacher 12 minutes in is not doing anything wrong; they simply have
       * not reached the point where the period counts, and saying so plainly is
       * more useful than a red banner.
       */}
      <p className="mt-1 text-xs text-ink-600">
        {state.completed
          ? t('live.countdown.completed', { minutes: state.minimumMinutes ?? 30 })
          : t('live.countdown.notYet', { minutes: state.minimumMinutes ?? 30 })}
      </p>
    </div>
  );
}
