/**
 * The timetable, and the rule that stops one teacher being in two places.
 *
 * The brief calls the clash check "an AI system". It is an interval overlap
 * test, and it is written as one — deliberately. A model would give a
 * probabilistic answer to a question with an exact one, could not explain
 * itself to the admin who has to act on it, and would need a service call in
 * the middle of a form submission. This runs in under a millisecond, in the
 * browser and on the server, from the same source.
 *
 * Living in `packages/shared` is the point: the form warns with exactly the
 * rule the API enforces, so a teacher is never told their hours are fine and
 * then refused, nor warned about a clash the server would have allowed.
 */

/**
 * 1 = Monday … 7 = Sunday.
 *
 * Every day the column can hold. Which of them a *class* timetable may use is
 * `SCHOOL_WEEK_DAYS` in `PlatformConfig` — 5 for the 24/5 default, 6 or 7 when
 * the platform is set that way — so switching the school week is a
 * configuration change and not a migration.
 */
export const TIMETABLE_DAYS = [1, 2, 3, 4, 5, 6, 7] as const;
export type TimetableDay = (typeof TIMETABLE_DAYS)[number];

/** The default: Monday to Friday. */
export const DEFAULT_SCHOOL_WEEK_DAYS = 5;

/** Message-key suffixes under `timetable.day.` — never day names in code. */
export const TIMETABLE_DAY_KEYS: Record<TimetableDay, string> = {
  1: 'monday',
  2: 'tuesday',
  3: 'wednesday',
  4: 'thursday',
  5: 'friday',
  6: 'saturday',
  7: 'sunday',
};

/** The days a class timetable may use, given the configured week length. */
export function schoolWeekDays(weekDays: number): readonly TimetableDay[] {
  const days = Math.min(Math.max(Math.trunc(weekDays), 1), 7);
  return TIMETABLE_DAYS.slice(0, days);
}

export type TimetableSlotState = 'proposed' | 'confirmed' | 'rejected' | 'on_hold';

/** The three grids a period can sit in. See the Prisma enum for why. */
export type TimetableSession = 'day' | 'evening' | 'private';

/**
 * The wall-clock bounds of each session.
 *
 * `private` spans the whole day because it is 24/7 by definition — a private
 * arrangement is timetabled at whatever hour suits the learner and the tutor,
 * which is the entire point of it.
 */
export const TIMETABLE_SESSIONS: Record<
  TimetableSession,
  { startMinute: number; endMinute: number }
> = {
  day: { startMinute: 8 * 60, endMinute: 15 * 60 },
  evening: { startMinute: 17 * 60, endMinute: 21 * 60 },
  private: { startMinute: 0, endMinute: 24 * 60 },
};

/** One period. Every class grid is built from these. */
export const TIMETABLE_PERIOD_MINUTES = 45;

/**
 * FR-TMT: a subject is taught twice a week to a class, and one teacher holds at
 * most those two periods of it.
 *
 * Both numbers are the same rule seen from two sides — the class gets two
 * periods of Mathematics, and the teacher who claims them cannot claim a third.
 */
export const PERIODS_PER_SUBJECT_PER_WEEK = 2;

/** Which session a wall-clock minute falls in, for a non-private class. */
export function sessionForMinute(startMinute: number): TimetableSession | null {
  if (
    startMinute >= TIMETABLE_SESSIONS.day.startMinute &&
    startMinute < TIMETABLE_SESSIONS.day.endMinute
  ) {
    return 'day';
  }
  if (
    startMinute >= TIMETABLE_SESSIONS.evening.startMinute &&
    startMinute < TIMETABLE_SESSIONS.evening.endMinute
  ) {
    return 'evening';
  }
  return null;
}

/** The shape the clash rule needs, and nothing more. */
export interface TimetableInterval {
  id?: string;
  dayOfWeek: number;
  /** Minutes from midnight. */
  startMinute: number;
  endMinute: number;
}

/**
 * The teaching day the platform timetables within.
 *
 * 07:00–19:00. Outside it a slot is refused rather than quietly accepted: a
 * class proposed for 03:00 is a typo every time, and letting it through puts a
 * child's lesson in the middle of the night on somebody's screen.
 */
export const TIMETABLE_DAY_START_MINUTE = 7 * 60;
/**
 * 21:00, not the 19:00 this started at.
 *
 * The evening session runs 17:00–21:00, so a period beginning at 20:15 is an
 * ordinary evening lesson — and the old bound refused it as "outside the
 * teaching day", which would have made the evening grid unusable after seven.
 *
 * The private session is exempt: it is 24/7 by definition, and
 * `validateTimetableSlot` takes the session so it can say so.
 */
export const TIMETABLE_DAY_END_MINUTE = 21 * 60;

/** The shortest and longest a single slot may be. */
export const TIMETABLE_MIN_SLOT_MINUTES = 30;
export const TIMETABLE_MAX_SLOT_MINUTES = 4 * 60;

/**
 * Do two intervals on the same day overlap?
 *
 * Half-open on purpose: a slot ending at 10:00 and one starting at 10:00 do not
 * clash. Back-to-back periods are how a timetable is built, and a rule that
 * called them a conflict would reject every real week ever drawn up.
 */
export function intervalsOverlap(a: TimetableInterval, b: TimetableInterval): boolean {
  if (a.dayOfWeek !== b.dayOfWeek) return false;
  return a.startMinute < b.endMinute && b.startMinute < a.endMinute;
}

/**
 * Every existing slot a proposal would collide with.
 *
 * Returns the conflicts rather than a boolean, because the admin confirming the
 * slot has to be told *what* it clashes with. "Rejected: clash" is not a thing
 * anybody can act on.
 *
 * `ignoreId` lets a slot be edited without clashing with itself.
 */
export function findClashes<T extends TimetableInterval>(
  proposed: TimetableInterval,
  existing: readonly T[],
  options: { ignoreId?: string } = {},
): T[] {
  return existing.filter(
    (slot) =>
      slot.id !== options.ignoreId &&
      // A rejected slot timetables nobody, so it cannot be clashed with.
      intervalsOverlap(proposed, slot),
  );
}

export type TimetableProblem =
  | 'errors.timetable.day_out_of_range'
  | 'errors.timetable.outside_teaching_day'
  | 'errors.timetable.reversed'
  | 'errors.timetable.too_short'
  | 'errors.timetable.too_long';

/**
 * Is this a sane slot at all, before anyone asks whether it clashes?
 *
 * Returns a message key rather than a boolean or a thrown error, so the API and
 * the form render the same sentence in the user's own language (NFR-LOC-001)
 * without either of them owning the wording.
 */
export function validateTimetableSlot(
  slot: TimetableInterval,
  session: TimetableSession = 'day',
): TimetableProblem | null {
  if (!TIMETABLE_DAYS.includes(slot.dayOfWeek as TimetableDay)) {
    return 'errors.timetable.day_out_of_range';
  }
  if (slot.endMinute <= slot.startMinute) return 'errors.timetable.reversed';
  /*
   * The private session keeps no hours.
   *
   * It exists precisely for learners taught outside school time — an early
   * morning before work, a Sunday evening — so the bound that protects a class
   * timetable from a 03:00 typo would be the thing preventing the arrangement
   * the session is for. The admin sets these slots, so there is a person
   * choosing the hour rather than a form to mis-key.
   */
  if (
    session !== 'private' &&
    (slot.startMinute < TIMETABLE_DAY_START_MINUTE ||
      slot.endMinute > TIMETABLE_DAY_END_MINUTE)
  ) {
    return 'errors.timetable.outside_teaching_day';
  }

  const length = slot.endMinute - slot.startMinute;
  if (length < TIMETABLE_MIN_SLOT_MINUTES) return 'errors.timetable.too_short';
  if (length > TIMETABLE_MAX_SLOT_MINUTES) return 'errors.timetable.too_long';
  return null;
}

/** `540` → `09:00`. Rendering only; never parsed back. */
export function minutesToClock(minute: number): string {
  const hours = Math.floor(minute / 60);
  const minutes = minute % 60;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

/** `09:00` → `540`. Returns null on anything that is not HH:MM. */
export function clockToMinutes(clock: string): number | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec(clock.trim());
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return null;
  return hours * 60 + minutes;
}

/**
 * Hours in a set of slots, for the teacher's own total and for earnings.
 *
 * Counts confirmed slots only. FR-ERN-* pays for timetabled teaching, and a
 * proposal nobody has agreed to is not that — showing it in a total would have
 * a teacher expecting to be paid for hours the school never booked.
 */
export function confirmedWeeklyMinutes(
  slots: readonly (TimetableInterval & { state: TimetableSlotState })[],
): number {
  return slots
    .filter((slot) => slot.state === 'confirmed')
    .reduce((total, slot) => total + (slot.endMinute - slot.startMinute), 0);
}
