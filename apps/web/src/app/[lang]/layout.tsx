import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import { notFound } from 'next/navigation';
import { LANGUAGES, t, type Language } from '@classconnect/shared';
import { I18nProvider } from '@/lib/i18n';
import { AuthProvider } from '@/lib/auth-context';
import { OfflineBanner } from '@/components/OfflineBanner';
import '../globals.css';

/**
 * The root layout.
 *
 * It lives under `[lang]` rather than at `app/` so that `<html lang>` carries
 * the actual page language — WCAG 3.1.1, required by UI-003 and NFR-USA-003.
 * A screen reader picks its voice from this attribute, so getting it wrong
 * makes the French pages unusable for the users who most need the label to be
 * read correctly.
 *
 * This layout holds only what every surface shares: the document, the language
 * and session providers, and the connectivity banner. The visible chrome is
 * split below it, because the platform has two of them:
 *
 *   `(site)`  — the learner, parent and teacher PWA. Mobile-first at 360px,
 *               centred reading measure, header and footer (UI-001).
 *   `admin`   — the operations surface. Desktop-first at 1440px with a
 *               persistent sidebar and no reading measure at all (§2.3 of the
 *               admin brief: "the opposite of the learner PWA").
 *
 * Route groups keep both under `/{lang}/...` without either inheriting the
 * other's furniture.
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
    /*
     * The tab icon, and the one Android uses on the home screen.
     *
     * One SVG at every size rather than a raster set: nothing to keep in step,
     * and a few hundred bytes against the NFR-PER-002 payload budget. `shortcut`
     * covers browsers that still ask for `/favicon.ico` — which is what was
     * producing a 404 on every page load.
     */
    icons: {
      icon: [{ url: '/icon.svg', type: 'image/svg+xml' }],
      shortcut: ['/icon.svg'],
      apple: [{ url: '/icon.svg' }],
    },
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
  // Matches the mark, so the browser chrome and the Android task switcher
  // agree with the icon rather than contradicting it.
  themeColor: '#0B4A34',
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

            {children}
          </AuthProvider>
        </I18nProvider>
      </body>
    </html>
  );
}
