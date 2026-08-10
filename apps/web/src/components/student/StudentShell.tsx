'use client';

import type { ReactNode } from 'react';
import type { Language } from '@classconnect/shared';
import { useI18n } from '@/lib/i18n';
import { useStudent } from '@/lib/student-context';
import { AccountMenu } from './AccountMenu';
import { FrozenNotice } from './FrozenNotice';
import { TabBar } from './TabBar';
import { ErrorState } from './ui';

/**
 * The learner chrome (§2, §4).
 *
 * One shell for every level. What varies is read from the resolved
 * `LevelConfig` — the tab set and the type scale — and nothing here branches on
 * the level itself.
 *
 * The layout is a bottom bar over a single column on the phone and a left rail
 * beside it from `md` up, which is the same DOM in both cases. A learner who
 * rotates a tablet does not get a different tree.
 */
export function StudentShell({
  language,
  children,
}: {
  language: Language;
  children: ReactNode;
}) {
  const { t } = useI18n();
  const { learner, config, loading, error, reload } = useStudent();

  if (loading) {
    return (
      <main id="main" className="p-4">
        <p className="text-sm text-ink-600">{t('common.loading')}</p>
      </main>
    );
  }

  /*
   * NFR-BAN-006: the profile is what decides the tab set, so without it there
   * is no honest surface to draw. Better a plain message and a retry than a
   * five-tab default that silently shows a Primary learner a Practice tab.
   */
  if (error || !config) {
    return (
      <main id="main" className="p-4">
        <ErrorState onRetry={() => void reload()} />
      </main>
    );
  }

  const large = config.typeScale === 'large';

  return (
    <div
      className={[
        'min-h-screen bg-ink-100/40',
        // NFR-USA-005: primary-level learners get larger type throughout. Set
        // once here so no screen has to remember to ask.
        large ? 'text-[1.0625rem]' : 'text-base',
        'md:flex md:items-start',
      ].join(' ')}
    >
      <TabBar language={language} config={config} />

      <div className="min-w-0 flex-1">
        <header className="sticky top-0 z-20 flex items-center gap-3 border-b border-ink-300 bg-white px-4 py-2">
          <span
            className={[
              'truncate font-display font-semibold text-ink-900',
              large ? 'text-lg' : 'text-base',
            ].join(' ')}
          >
            {t('common.appName')}
          </span>

          {/*
           * The learner's class, on every screen.
           *
           * It earns a permanent place for two reasons. A shared family phone
           * carries more than one child's account, and "which of my children am
           * I looking at" is answered faster by a class than by a name. And the
           * level is what decides everything else on the surface — the tab set,
           * the past papers, the countdown — so showing it makes the surface
           * legible rather than mysterious when it differs from a classmate's.
           */}
          {learner && (
            <span
              className="shrink-0 rounded-full bg-brand-50 px-2.5 py-1 text-xs font-medium text-brand-700"
              title={t('student.subjects.yourClass')}
            >
              {learner.levelLabel}
            </span>
          )}

          <div className="ml-auto">
            <AccountMenu language={language} />
          </div>
        </header>

        {/*
         * `pb-24` clears the fixed bottom bar on the phone. Without it the last
         * card on every screen sits under the tab bar and cannot be tapped —
         * which on a 360px screen is most of what is on it.
         */}
        <main id="main" className="mx-auto w-full max-w-3xl space-y-4 p-4 pb-24 md:pb-8">
          {/* §6: above the content, because the content still works. */}
          <FrozenNotice />
          {children}
        </main>
      </div>
    </div>
  );
}
