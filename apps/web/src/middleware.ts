import { NextResponse, type NextRequest } from 'next/server';

/**
 * Locale routing.
 *
 * NFR-LOC-003: the language defaults from the browser locale and is overridden
 * explicitly by the user, with the choice persisted to the profile.
 *
 * This runs before rendering so that `/` never renders in the wrong language
 * and then corrects itself — which would cost a paint on a 3G connection the
 * §6.1 budget cannot afford.
 */
const LOCALES = ['en', 'fr'] as const;
type Locale = (typeof LOCALES)[number];

const LOCALE_COOKIE = 'cc.lang';

function preferredLocale(request: NextRequest): Locale {
  // An explicit earlier choice wins over the browser's header.
  const cookie = request.cookies.get(LOCALE_COOKIE)?.value;
  if (cookie === 'en' || cookie === 'fr') return cookie;

  const header = request.headers.get('accept-language');
  if (!header) return 'en';

  for (const part of header.split(',')) {
    const tag = part.split(';')[0]?.trim().toLowerCase() ?? '';
    if (tag.startsWith('fr')) return 'fr';
    if (tag.startsWith('en')) return 'en';
  }
  return 'en';
}

/**
 * Writes the chosen locale back to the cookie `preferredLocale` reads.
 *
 * Without this the cookie is read and never written, so the "explicit override"
 * half of NFR-LOC-003 never happens: a user picks French, lands on `/fr/...`,
 * and the moment anything sends them to a path without a locale — the root, a
 * sign-out redirect, a shared link — the browser's Accept-Language wins and they
 * are back in English. From the user's side the language switch simply does not
 * work.
 *
 * A year is right for a preference: it is not a session, and re-asking someone
 * which language they read is not a decision worth making twice.
 */
function rememberLocale(response: NextResponse, locale: Locale): NextResponse {
  response.cookies.set(LOCALE_COOKIE, locale, {
    path: '/',
    maxAge: 60 * 60 * 24 * 365,
    sameSite: 'lax',
    // Readable by the client so LanguageSwitcher can set it synchronously on
    // click; it carries a preference, not a credential (NFR-SEC-006).
    httpOnly: false,
  });
  return response;
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  const matched = LOCALES.find(
    (locale) => pathname === `/${locale}` || pathname.startsWith(`/${locale}/`),
  );

  // A locale-bearing URL is itself a statement of intent — whether it came from
  // the switcher, a bookmark or a link someone was sent. Record it, so the next
  // visit to a bare path lands in the same language.
  if (matched) return rememberLocale(NextResponse.next(), matched);

  const locale = preferredLocale(request);
  const url = request.nextUrl.clone();
  url.pathname = `/${locale}${pathname === '/' ? '' : pathname}`;
  return rememberLocale(NextResponse.redirect(url), locale);
}

export const config = {
  // Everything except Next internals, the manifest and static files.
  matcher: ['/((?!_next|api|manifest.webmanifest|favicon.ico|.*\\..*).*)'],
};
