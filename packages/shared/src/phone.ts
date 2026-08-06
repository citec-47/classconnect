/**
 * Phone-number handling.
 *
 * FR-AUT-002: a Cameroonian mobile number is the primary account identifier,
 * normalised to E.164 (+237XXXXXXXXX).
 * AS-07: a mobile number is assumed to be the universal identifier.
 */

import { parsePhoneNumberFromString } from 'libphonenumber-js';

export const DEFAULT_COUNTRY = 'CM' as const;

/** Cameroonian mobile prefixes, used to reject landlines for OTP delivery. */
const CM_MOBILE_PREFIXES = ['6'];

export interface NormalisedPhone {
  e164: string;
  national: string;
  isMobile: boolean;
}

/**
 * Normalises user input to E.164. Returns null when the input cannot be a valid
 * number — callers surface a field-level error rather than storing junk.
 */
export function normalisePhone(input: string, country = DEFAULT_COUNTRY): NormalisedPhone | null {
  const trimmed = input.trim();
  if (!trimmed) return null;

  const parsed = parsePhoneNumberFromString(trimmed, country);
  if (!parsed || !parsed.isValid()) return null;

  const national = parsed.nationalNumber.toString();
  const isMobile =
    parsed.country !== 'CM' ||
    CM_MOBILE_PREFIXES.some((prefix) => national.startsWith(prefix));

  return { e164: parsed.number, national, isMobile };
}

export function isValidCameroonMobile(input: string): boolean {
  const result = normalisePhone(input);
  return result !== null && result.isMobile;
}

/**
 * NFR-SEC-009: logs must never contain full phone numbers.
 * Renders +237650123456 as +237*****3456.
 */
export function maskPhone(e164: string): string {
  if (e164.length <= 8) return '*'.repeat(e164.length);
  const head = e164.slice(0, 4);
  const tail = e164.slice(-4);
  return `${head}${'*'.repeat(Math.max(0, e164.length - 8))}${tail}`;
}

/** NFR-SEC-009: same treatment for email in logs. */
export function maskEmail(email: string): string {
  const at = email.indexOf('@');
  if (at <= 0) return '***';
  const name = email.slice(0, at);
  const domain = email.slice(at);
  const visible = name.slice(0, 1);
  return `${visible}${'*'.repeat(Math.max(1, name.length - 1))}${domain}`;
}
