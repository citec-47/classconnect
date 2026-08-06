/**
 * Time handling.
 *
 * §2.4: all timestamps are stored in UTC; all user-facing times render in
 * Africa/Douala (UTC+1), which does not observe daylight saving.
 */

export const PLATFORM_TIMEZONE = 'Africa/Douala' as const;
/** Africa/Douala is a fixed UTC+1 with no DST, which keeps this arithmetic safe. */
export const PLATFORM_UTC_OFFSET_MINUTES = 60;

/** Renders an instant in platform local time, per the viewer's language. */
export function formatLocal(
  instant: Date,
  language: 'en' | 'fr' = 'en',
  options: Intl.DateTimeFormatOptions = { dateStyle: 'medium', timeStyle: 'short' },
): string {
  return new Intl.DateTimeFormat(language === 'fr' ? 'fr-CM' : 'en-CM', {
    ...options,
    timeZone: PLATFORM_TIMEZONE,
  }).format(instant);
}

/** Converts an `HH:mm` wall-clock time on a given local date to a UTC instant. */
export function localWallClockToUtc(dateIso: string, hhmm: string): Date {
  const [hourPart, minutePart] = hhmm.split(':');
  const hour = Number(hourPart);
  const minute = Number(minutePart);
  const base = new Date(`${dateIso}T00:00:00.000Z`);
  base.setUTCMinutes(base.getUTCMinutes() + hour * 60 + minute - PLATFORM_UTC_OFFSET_MINUTES);
  return base;
}

/** FR-FAM-006: minor status is derived from date of birth, never stored. */
export function ageInYears(dob: Date, asOf: Date = new Date()): number {
  let age = asOf.getUTCFullYear() - dob.getUTCFullYear();
  const monthDelta = asOf.getUTCMonth() - dob.getUTCMonth();
  if (monthDelta < 0 || (monthDelta === 0 && asOf.getUTCDate() < dob.getUTCDate())) {
    age -= 1;
  }
  return age;
}

export function isMinor(dob: Date, asOf: Date = new Date()): boolean {
  return ageInYears(dob, asOf) < 18;
}

/** FR-FAM-006: the platform notifies both parties as a Student approaches 18. */
export function daysUntil18(dob: Date, asOf: Date = new Date()): number {
  const eighteenth = new Date(dob);
  eighteenth.setUTCFullYear(eighteenth.getUTCFullYear() + 18);
  return Math.ceil((eighteenth.getTime() - asOf.getTime()) / 86_400_000);
}
