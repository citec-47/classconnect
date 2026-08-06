'use client';

import { createContext, useCallback, useContext, useMemo, type ReactNode } from 'react';
import { t as translate, type Language } from '@classconnect/shared';

/**
 * NFR-LOC-002: no user-visible string is hard-coded — components call `t()`.
 * NFR-LOC-003: the language comes from the URL segment, which is itself seeded
 *              from the browser locale and overridden by the profile setting.
 * UI-004: every screen is available in both languages, switchable from any
 *         screen, with the choice persisted.
 */

interface I18nValue {
  language: Language;
  t: (key: string, params?: Record<string, string | number>) => string;
}

const I18nContext = createContext<I18nValue | null>(null);

export function I18nProvider({
  language,
  children,
}: {
  language: Language;
  children: ReactNode;
}) {
  const t = useCallback(
    (key: string, params?: Record<string, string | number>) =>
      translate(language, key, params),
    [language],
  );

  const value = useMemo(() => ({ language, t }), [language, t]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nValue {
  const value = useContext(I18nContext);
  if (!value) throw new Error('useI18n must be used inside an I18nProvider');
  return value;
}

/** Convenience for components that only need the translate function. */
export function useT() {
  return useI18n().t;
}
