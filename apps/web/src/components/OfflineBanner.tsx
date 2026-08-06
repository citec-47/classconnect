'use client';

import { useEffect, useState } from 'react';
import { useT } from '@/lib/i18n';

/**
 * UI-010: a persistent, dismissible offline indicator when the client loses
 * connectivity, with permitted actions queued for retry.
 * NFR-BAN-006: nothing fails silently on a network error.
 */
export function OfflineBanner() {
  const t = useT();
  const [offline, setOffline] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    const goOffline = () => {
      setOffline(true);
      // A fresh disconnection re-shows the banner even if a previous one was
      // dismissed — the state has changed, so the dismissal no longer applies.
      setDismissed(false);
    };
    const goOnline = () => setOffline(false);

    setOffline(!navigator.onLine);
    window.addEventListener('offline', goOffline);
    window.addEventListener('online', goOnline);
    return () => {
      window.removeEventListener('offline', goOffline);
      window.removeEventListener('online', goOnline);
    };
  }, []);

  if (!offline || dismissed) return null;

  return (
    <div
      className="flex items-start justify-between gap-3 bg-warning-50 px-4 py-3 text-sm text-warning-600"
      // UI-003: announced to assistive technology without stealing focus.
      role="status"
      aria-live="polite"
    >
      <p className="font-medium">{t('common.offline')}</p>
      <button
        type="button"
        onClick={() => setDismissed(true)}
        className="min-h-touch min-w-touch shrink-0 rounded-md px-2 font-medium underline"
      >
        {t('common.close')}
      </button>
    </div>
  );
}
