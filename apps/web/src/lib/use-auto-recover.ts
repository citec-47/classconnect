'use client';

import { useEffect } from 'react';

/**
 * Retry a loader when the connection comes back.
 *
 * The learner surface got this for free: everything there reads through
 * `useCachedApi`, which recovers on its own. The admin screens each load with a
 * plain `api()` call inside a `useEffect`, so a fetch that failed while the API
 * was starting left the screen showing "We could not reach ClassConnect"
 * indefinitely — long after the API was answering normally.
 *
 * That is the wrong behaviour anywhere, and worse on this platform: AS-08 says
 * connectivity interruptions are normal rather than exceptional, and a screen
 * that needs a manual reload after every one of them is a screen people stop
 * trusting.
 *
 * Three triggers, because each catches a case the others miss:
 *
 *   · `online`           — the browser noticed the interface returned
 *   · `visibilitychange` — a backgrounded tab came back, which is what actually
 *                          happens when someone takes a call or switches apps
 *   · `focus`            — the desktop case, where neither of the above fires
 *
 * Also polls slowly while `failed` is true, because none of those events fire
 * when the *server* was the thing that was down and the browser never lost its
 * connection at all — which is precisely the case that stranded the admin
 * sidebar during an API restart.
 */
export function useAutoRecover(
  retry: () => void | Promise<void>,
  failed: boolean,
  intervalMs = 5_000,
): void {
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const attempt = () => {
      if (navigator.onLine) void retry();
    };

    const onVisible = () => {
      if (document.visibilityState === 'visible') attempt();
    };

    window.addEventListener('online', attempt);
    window.addEventListener('focus', attempt);
    document.addEventListener('visibilitychange', onVisible);

    // Only while something is actually broken. A healthy screen must not poll:
    // on a metered connection that is a learner's or an operator's money.
    const timer = failed ? setInterval(attempt, intervalMs) : null;

    return () => {
      window.removeEventListener('online', attempt);
      window.removeEventListener('focus', attempt);
      document.removeEventListener('visibilitychange', onVisible);
      if (timer) clearInterval(timer);
    };
  }, [retry, failed, intervalMs]);
}
