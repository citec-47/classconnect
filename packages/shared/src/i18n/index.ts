/**
 * Translation lookup.
 *
 * NFR-LOC-002: strings live in resource files; nothing user-visible is hard-coded.
 * NFR-LOC-003: the caller supplies the resolved language — browser locale by
 * default, overridden by the profile setting, and applied to every channel.
 */
import { en } from './en';
import { fr } from './fr';

export type Language = 'en' | 'fr';
export const LANGUAGES: readonly Language[] = ['en', 'fr'];
export const DEFAULT_LANGUAGE: Language = 'en';

export const catalogues = { en, fr } as const;
export type { Messages } from './en';
export { en, fr };

/** Dotted key into the catalogue, e.g. `errors.otp.expired`. */
export type MessageKey = string;

function lookup(language: Language, key: MessageKey): string | undefined {
  const parts = key.split('.');
  let node: unknown = catalogues[language];
  for (const part of parts) {
    if (typeof node !== 'object' || node === null) return undefined;
    node = (node as Record<string, unknown>)[part];
  }
  return typeof node === 'string' ? node : undefined;
}

/**
 * Resolves a key with `{placeholder}` interpolation.
 *
 * Falls back to English, then to the key itself. Returning the key rather than
 * an empty string makes a missing translation visible in testing — acceptance
 * criterion 8 in §9.2 requires no untranslated string at release.
 */
export function t(
  language: Language,
  key: MessageKey,
  params: Record<string, string | number> = {},
): string {
  const template = lookup(language, key) ?? lookup(DEFAULT_LANGUAGE, key) ?? key;
  return template.replace(/\{(\w+)\}/g, (match, name: string) =>
    name in params ? String(params[name]) : match,
  );
}

/** Binds a language once, for a request or a render tree. */
export function translator(language: Language) {
  return (key: MessageKey, params?: Record<string, string | number>) =>
    t(language, key, params);
}

/** NFR-LOC-003: derive the default from the browser's Accept-Language. */
export function languageFromHeader(header: string | undefined | null): Language {
  if (!header) return DEFAULT_LANGUAGE;
  for (const part of header.split(',')) {
    const tag = part.split(';')[0]?.trim().toLowerCase() ?? '';
    if (tag.startsWith('fr')) return 'fr';
    if (tag.startsWith('en')) return 'en';
  }
  return DEFAULT_LANGUAGE;
}
