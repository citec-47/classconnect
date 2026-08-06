'use client';

import { usePathname, useRouter } from 'next/navigation';
import { useTransition } from 'react';
import { LANGUAGES, type Language } from '@classconnect/shared';
import { api, tokenStore } from '@/lib/api';

/**
 * UI-004: every screen is available in English and French, switchable from any
 * screen, with the choice persisted to the user profile.
 * NFR-LOC-003: an explicit override is persisted and applied to all channels.
 */
export function LanguageSwitcher({ current }: { current: Language }) {
  const pathname = usePathname();
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const switchTo = (language: Language) => {
    if (language === current) return;

    // Swap the leading locale segment, keeping the rest of the route intact so
    // the user stays where they were.
    const rest = pathname.replace(/^\/(en|fr)(?=\/|$)/, '');
    const next = `/${language}${rest || ''}`;

    startTransition(() => {
      router.push(next);
    });

    // Persist to the profile when signed in, so notifications, receipts and
    // emails follow the same choice (NFR-LOC-001).
    if (tokenStore.access) {
      void api('/auth/me/language', {
        method: 'PATCH',
        body: { preferredLanguage: language },
        language,
      }).catch(() => {
        // A failed persist must not block the visible switch; the URL already
        // carries the choice for this session.
      });
    }
  };

  return (
    <div
      className="flex items-center gap-1 rounded-lg border border-ink-300 p-0.5"
      role="group"
      aria-label={current === 'fr' ? 'Choix de la langue' : 'Language choice'}
    >
      {LANGUAGES.map((language) => {
        const active = language === current;
        return (
          <button
            key={language}
            type="button"
            onClick={() => switchTo(language)}
            disabled={pending}
            // UI-002 is met by the parent header's touch sizing; this control is
            // a compact segmented toggle, so it keeps a 44px tap height.
            className={`min-h-touch rounded-md px-3 text-sm font-medium transition-colors ${
              active ? 'bg-brand-600 text-white' : 'text-ink-600 hover:bg-ink-100'
            }`}
            aria-pressed={active}
            lang={language}
          >
            {language === 'en' ? 'EN' : 'FR'}
          </button>
        );
      })}
    </div>
  );
}
