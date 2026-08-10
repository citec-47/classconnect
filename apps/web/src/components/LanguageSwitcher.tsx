'use client';

import { usePathname } from 'next/navigation';
import { useState } from 'react';
import { LANGUAGES, type Language } from '@classconnect/shared';
import { api, tokenStore } from '@/lib/api';

/**
 * UI-004: every screen is available in English and French, switchable from any
 * screen, with the choice persisted to the user profile.
 * NFR-LOC-003: an explicit override is persisted and applied to all channels.
 */
export function LanguageSwitcher({ current }: { current: Language }) {
  const pathname = usePathname();
  const [switching, setSwitching] = useState<Language | null>(null);

  const switchTo = (language: Language) => {
    if (language === current || switching) return;
    setSwitching(language);

    /**
     * NFR-LOC-003: an explicit override is persisted.
     *
     * Written before navigating, so the middleware's own cookie write is a
     * confirmation rather than the only record. Without this, a bare path — the
     * root, a redirect, a shared link — falls back to the browser's
     * Accept-Language and the choice silently reverts.
     */
    document.cookie = `cc.lang=${language}; path=/; max-age=${60 * 60 * 24 * 365}; samesite=lax`;

    // Swap the leading locale segment, keeping the rest of the route intact so
    // the user stays where they were.
    const rest = pathname.replace(/^\/(en|fr)(?=\/|$)/, '');
    const next = `/${language}${rest || ''}`;

    // Persist to the profile when signed in, so notifications, receipts and
    // emails follow the same choice (NFR-LOC-001). Fire-and-forget: the reload
    // below must not wait on it, and the cookie already carries the choice.
    // `keepalive` is what makes that safe — the navigation on the next line
    // would otherwise cancel the request before it left the browser.
    if (tokenStore.access) {
      void api('/auth/me/language', {
        method: 'PATCH',
        body: { preferredLanguage: language },
        language,
        keepalive: true,
      }).catch(() => {
        // A failed persist must not block the visible switch.
      });
    }

    /**
     * A full page load, deliberately, rather than `router.push`.
     *
     * The language lives in the `[lang]` segment, so switching it changes a
     * parameter that every layout above the page reads. Next's client router
     * reuses a layout instance across navigations that share its position in the
     * tree, and `[lang]/layout` and `(site)/layout` occupy the same position for
     * both locales — so a soft navigation can swap the page while leaving the
     * surrounding chrome, and the `I18nProvider` that feeds it, rendered in the
     * previous language. The result is a switch that half-works, or appears not
     * to work at all.
     *
     * `router.refresh()` alongside `push()` does not fix it and makes it worse:
     * refresh re-fetches the *current* route and races the push, which can leave
     * the user exactly where they started.
     *
     * Switching language is a rare, deliberate act — at most once a session. A
     * hard navigation costs one page load and removes the entire class of
     * problem: the server re-renders everything in the new language, and the
     * middleware sees the request and confirms the cookie.
     */
    window.location.assign(next);
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
            // Only the button being navigated to is disabled, and only while the
            // load is in flight. Disabling both — as `useTransition`'s pending
            // flag did — meant that if the navigation stalled for any reason,
            // the control locked up with no way back.
            disabled={switching === language}
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
