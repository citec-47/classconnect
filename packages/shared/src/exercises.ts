/**
 * Group exercises, and the deadline that closes one.
 *
 * BUILD-PLAN Phase 3. The brief asks for a countdown that appears as the deadline
 * approaches and a group that locks itself at the exact time, reopenable only by
 * the teacher or an admin.
 *
 * The countdown is the part worth being careful about. It is a *convenience*: the
 * rule that decides whether work may be handed in runs on the server, against the
 * server's clock, on the submit request. A client clock is not an access control —
 * a learner whose phone is twenty minutes slow must not get twenty extra minutes,
 * and one whose phone is fast must not lose them.
 *
 * So this file holds the shared arithmetic and both sides use it: the screen to
 * render a countdown, the API to accept or refuse a submission. `now` is a
 * parameter rather than being read inside, which is what makes it testable and
 * what makes the server's answer reproducible.
 */

/** How close the deadline has to be before a learner is warned. */
export const EXERCISE_COUNTDOWN_WINDOW_MS = 60 * 60 * 1000;

export type ExerciseLockState =
  /** No deadline at all — open indefinitely. */
  | 'open'
  /** Deadline set, still far off. No countdown yet. */
  | 'scheduled'
  /** Inside the countdown window. The screen shows the clock running down. */
  | 'closing_soon'
  /** The deadline has passed and nobody has reopened it. */
  | 'locked'
  /** Locked, then reopened by the teacher or an admin. */
  | 'reopened';

export interface ExerciseTiming {
  /** When submission closes entirely. Null means it never does. */
  locksAt: Date | string | null;
  /** When someone reopened it, if they did. */
  unlockedAt?: Date | string | null;
}

function toTime(value: Date | string | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  const time = value instanceof Date ? value.getTime() : Date.parse(value);
  return Number.isNaN(time) ? null : time;
}

/**
 * The state of one exercise at an instant.
 *
 * A reopen wins over a passed deadline, and only over a passed deadline: an
 * exercise reopened and then given a *later* deadline is scheduled again rather
 * than permanently open, because the second deadline is the teacher's current
 * intention and the reopen was about the first.
 */
export function exerciseLockState(
  exercise: ExerciseTiming,
  now: Date,
  windowMs: number = EXERCISE_COUNTDOWN_WINDOW_MS,
): ExerciseLockState {
  const locksAt = toTime(exercise.locksAt);
  if (locksAt === null) return 'open';

  const unlockedAt = toTime(exercise.unlockedAt);
  const at = now.getTime();

  if (at < locksAt) {
    return locksAt - at <= windowMs ? 'closing_soon' : 'scheduled';
  }

  // Past the deadline. Reopening after it is what puts the group back in.
  return unlockedAt !== null && unlockedAt >= locksAt ? 'reopened' : 'locked';
}

/**
 * May a learner hand this in right now?
 *
 * The single question the submit endpoint asks, so the screen and the server
 * cannot disagree about the answer.
 */
export function exerciseAcceptsSubmission(exercise: ExerciseTiming, now: Date): boolean {
  const state = exerciseLockState(exercise, now);
  return state !== 'locked';
}

/**
 * Milliseconds until the deadline, or null when there is nothing to count down
 * to. Never negative — a passed deadline is a lock, not a negative clock.
 */
export function millisUntilLock(exercise: ExerciseTiming, now: Date): number | null {
  const locksAt = toTime(exercise.locksAt);
  if (locksAt === null) return null;
  return Math.max(0, locksAt - now.getTime());
}

/**
 * `3 h 05 m` / `04:59` — the countdown, formatted.
 *
 * Switches to minutes and seconds under an hour, because that is when a learner
 * starts watching it rather than glancing at it.
 */
export function formatCountdown(millis: number): string {
  const totalSeconds = Math.max(0, Math.floor(millis / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) return `${hours} h ${String(minutes).padStart(2, '0')} m`;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}
