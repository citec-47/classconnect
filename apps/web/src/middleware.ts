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

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  const hasLocale = LOCALES.some(
    (locale) => pathname === `/${locale}` || pathname.startsWith(`/${locale}/`),
  );
  if (hasLocale) return NextResponse.next();

  const locale = preferredLocale(request);
  const url = request.nextUrl.clone();
  url.pathname = `/${locale}${pathname === '/' ? '' : pathname}`;
  return NextResponse.redirect(url);
}

export const config = {
  // Everything except Next internals, the manifest and static files.
  matcher: ['/((?!_next|api|manifest.webmanifest|favicon.ico|.*\\..*).*)'],
};
