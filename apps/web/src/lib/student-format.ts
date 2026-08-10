'use client';

import { PLATFORM_TIMEZONE, formatLocal, type Language } from '@classconnect/shared';

/**
 * Dates and times for the learner surface.
 *
 * 2.4 fixes every rendered time to Africa/Douala regardless of where the device
 * thinks it is — a shared family phone with a wrong timezone must not move a
 * lesson. Everything here goes through `formatLocal`, which pins the zone.
 */

type T = (key: string, params?: Record<string, string | number>) => string;

/** The calendar day an instant falls on, in Douala. */
function localDay(value: Date): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: PLATFORM_TIMEZONE }).format(value);
}

export function isSameLocalDay(a: Date, b: Date): boolean {
  return localDay(a) === localDay(b);
}

/** Whole calendar days between two instants, counted in Douala. */
export function calendarDaysBetween(from: Date, to: Date): number {
  const start = Date.parse(`${localDay(from)}T00:00:00Z`);
  const end = Date.parse(`${localDay(to)}T00:00:00Z`);
  return Math.round((end - start) / 86_400_000);
}

export function timeOfDay(value: Date, language: Language): string {
  return formatLocal(value, language, { hour: '2-digit', minute: '2-digit' });
}

export function dayAndMonth(value: Date, language: Language): string {
  return formatLocal(value, language, { day: 'numeric', month: 'short' });
}

export function fullDate(value: Date, language: Language): string {
  return formatLocal(value, language, { dateStyle: 'long' });
}

/**
 * "Today, 14:30" / "Tomorrow, 09:00" / "12 Sep, 09:00".
 *
 * Named days for the two that matter and a date for the rest. A learner
 * checking whether they have a class *now* should not have to compare two
 * numbers to find out.
 */
export function whenLabel(value: Date, language: Language, t: T, now = new Date()): string {
  const days = calendarDaysBetween(now, value);
  const time = timeOfDay(value, language);

  if (days === 0) return `${t('student.unit.today')}, ${time}`;
  if (days === 1) return `${t('student.unit.tomorrow')}, ${time}`;
  if (days === -1) return `${t('student.unit.yesterday')}, ${time}`;
  return `${dayAndMonth(value, language)}, ${time}`;
}

/**
 * How long until something, in the largest unit that is still useful.
 *
 * Minutes under an hour, hours under a day, days beyond that. "in 2874 min" is
 * technically true and no help to anyone.
 */
export function countdownLabel(target: Date, t: T, now = new Date()): string {
  const ms = target.getTime() - now.getTime();
  const minutes = Math.max(0, Math.round(ms / 60_000));

  if (minutes < 60) return t('student.unit.inMinutes', { count: minutes });
  if (minutes < 60 * 24) return t('student.unit.inHours', { count: Math.round(minutes / 60) });
  return t('student.unit.inDays', { count: Math.round(minutes / (60 * 24)) });
}

/**
 * NFR-BAN-002: a data estimate, before anything is downloaded.
 *
 * Binary units, one decimal, because the number is a warning rather than an
 * accounting record — the point is "this is big" or "this is fine".
 */
export function fileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function durationLabel(minutes: number, t: T): string {
  return t('student.unit.minutes', { count: minutes });
}
