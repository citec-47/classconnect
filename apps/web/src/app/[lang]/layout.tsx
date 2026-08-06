import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import { notFound } from 'next/navigation';
import { LANGUAGES, t, type Language } from '@classconnect/shared';
import { I18nProvider } from '@/lib/i18n';
import { AuthProvider } from '@/lib/auth-context';
import { LanguageSwitcher } from '@/components/LanguageSwitcher';
import { OfflineBanner } from '@/components/OfflineBanner';
import { Logo } from '@/components/Logo';
import '../globals.css';

/**
 * The root layout.
 *
 * It lives under `[lang]` rather than at `app/` so that `<html lang>` carries
 * the actual page language — WCAG 3.1.1, required by UI-003 and NFR-USA-003.
 * A screen reader picks its voice from this attribute, so getting it wrong
 * makes the French pages unusable for the users who most need the label to be
 * read correctly.
 */

export function generateStaticParams() {
  return LANGUAGES.map((lang) => ({ lang }));
}

/** NFR-LOC-001: metadata is translated too, not only the page body. */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ lang: string }>;
}): Promise<Metadata> {
  const { lang } = await params;
  const language = (LANGUAGES.includes(lang as Language) ? lang : 'en') as Language;

  return {
    title: t(language, 'common.appName'),
    description: t(language, 'common.tagline'),
    applicationName: t(language, 'common.appName'),
    // §1.2: version 1.0 is a responsive Progressive Web App.
    manifest: '/manifest.webmanifest',
    alternates: {
      languages: { en: '/en', fr: '/fr' },
    },
  };
}

export const viewport: Viewport = {
  // UI-001: mobile-first at a 360px reference width.
  width: 'device-width',
  initialScale: 1,
  // Never block zoom — WCAG 1.4.4 Resize Text.
  maximumScale: 5,
  themeColor: '#1559a0',
};

export default async function LanguageLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ lang: string }>;
}) {
  const { lang } = await params;
  if (!LANGUAGES.includes(lang as Language)) notFound();
  const language = lang as Language;

  return (
    <html lang={language}>
      <body>
        <I18nProvider language={language}>
          <AuthProvider language={language}>
            {/* UI-003: a skip link is the first focusable element on every page. */}
            <a
              href="#main"
              className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-50
                         focus:rounded-lg focus:bg-brand-600 focus:px-4 focus:py-2 focus:text-white"
            >
              {t(language, 'common.skipToContent')}
            </a>

            {/* UI-010 / NFR-BAN-006: connectivity loss is surfaced, not silent. */}
            <OfflineBanner />

            {/*
             * The shell is full width; the measure is chosen per region. Header
             * and footer sit on the wider landing measure so they line up with
             * its full-bleed bands, while `main` keeps the narrower reading
             * column that suits forms and lists. The landing breaks out of that
             * column and re-centres itself on the same 5xl measure.
             */}
            <div className="flex min-h-screen w-full flex-col">
              <header className="sticky top-0 z-40 border-b border-ink-300 bg-white/95 backdrop-blur-sm">
                <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
                  <a
                    href={`/${language}`}
                    className="rounded-md"
                    aria-label={t(language, 'common.appName')}
                  >
                    <Logo />
                  </a>
                  {/* UI-004: switchable from any screen. */}
                  <LanguageSwitcher current={language} />
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
            </div>
          </AuthProvider>
        </I18nProvider>
      </body>
    </html>
  );
}
