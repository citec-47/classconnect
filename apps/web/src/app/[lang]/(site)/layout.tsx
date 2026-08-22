import type { ReactNode } from 'react';
import { t, type Language } from '@classconnect/shared';
import { LanguageSwitcher } from '@/components/LanguageSwitcher';
import { Logo } from '@/components/Logo';
import { DashboardLink } from '@/components/DashboardLink';
import { ChatWidget } from '@/components/ChatWidget';

/**
 * The learner, parent and teacher surface.
 *
 * UI-001: mobile-first at a 360px reference width. The shell is full width and
 * the measure is chosen per region — header and footer sit on the wider landing
 * measure so they line up with its full-bleed bands, while `main` keeps the
 * narrower reading column that suits forms and lists. The landing breaks out of
 * that column and re-centres itself on the same 5xl measure.
 *
 * The admin surface deliberately does not use this layout; see `admin/layout`.
 */
export default async function SiteLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ lang: string }>;
}) {
  const { lang } = await params;
  const language = lang as Language;

  return (
    <div className="flex min-h-screen w-full flex-col">
      <header className="sticky top-0 z-40 border-b border-ink-300 bg-white/95 backdrop-blur-sm">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
          <a href={`/${language}`} className="rounded-md" aria-label={t(language, 'common.appName')}>
            <Logo />
          </a>
          <div className="flex items-center gap-3">
            {/* Renders nothing when signed out — see the component. */}
            <DashboardLink />
            {/* UI-004: switchable from any screen. */}
            <LanguageSwitcher current={language} />
          </div>
        </div>
      </header>

      <main id="main" className="mx-auto w-full max-w-3xl flex-1 px-4 py-6">
        {children}
      </main>

      <footer className="border-t border-ink-300">
        <div className="mx-auto max-w-5xl px-4 py-6">
          <Logo size="sm" />
          {/* §1.2: a preparation service, not an examining body. */}
          <p className="mt-3 max-w-prose text-xs leading-relaxed text-ink-600">
            {t(language, 'common.notAnExamBody')}
          </p>
        </div>
      </footer>

      {/*
        * Live chat, on the public surface only.
        *
        * Mounted here rather than in the root layout so it appears for visitors
        * — the people it is for — and not on top of a lesson in progress or an
        * admin's approval queue. A floating button over a live classroom is in
        * the way of the thing that matters.
        */}
      <ChatWidget />
    </div>
  );
}
