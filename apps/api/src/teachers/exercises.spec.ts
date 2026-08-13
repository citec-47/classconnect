import {
  exerciseLockState,
  exerciseAcceptsSubmission,
  millisUntilLock,
  formatCountdown,
  EXERCISE_COUNTDOWN_WINDOW_MS,
} from '@classconnect/shared';

/**
 * BUILD-PLAN Phase 3: "Store `locksAt` on the exercise and enforce it
 * *server-side* on submission. The countdown in the UI is a convenience; a client
 * clock is not an access control."
 *
 * These are the tests for that rule. `now` is a parameter in every case, which is
 * both what makes the behaviour testable and what makes the server's answer
 * reproducible — nothing here reads a clock of its own.
 */
const AT = new Date('2026-08-13T10:00:00.000Z');
const iso = (offsetMs: number) => new Date(AT.getTime() + offsetMs).toISOString();

describe('group exercises — the locking deadline', () => {
  it('is open with no deadline at all', () => {
    expect(exerciseLockState({ locksAt: null }, AT)).toBe('open');
    expect(exerciseAcceptsSubmission({ locksAt: null }, AT)).toBe(true);
  });

  it('is scheduled while the deadline is far off, and shows no countdown', () => {
    // Two hours away, with a one-hour countdown window.
    expect(exerciseLockState({ locksAt: iso(2 * 60 * 60 * 1000) }, AT)).toBe('scheduled');
  });

  it('starts counting down inside the window', () => {
    expect(exerciseLockState({ locksAt: iso(59 * 60 * 1000) }, AT)).toBe('closing_soon');
    // The boundary itself counts as inside, so the badge never skips.
    expect(exerciseLockState({ locksAt: iso(EXERCISE_COUNTDOWN_WINDOW_MS) }, AT)).toBe(
      'closing_soon',
    );
    expect(exerciseLockState({ locksAt: iso(EXERCISE_COUNTDOWN_WINDOW_MS + 1) }, AT)).toBe(
      'scheduled',
    );
  });

  it('locks at the exact moment, not a second later', () => {
    /*
     * The brief's "once it is the exact time, the group automatically locks". At
     * the instant itself the exercise is closed — the deadline is the last moment
     * work is *not* accepted, not the last moment it is.
     */
    expect(exerciseLockState({ locksAt: iso(0) }, AT)).toBe('locked');
    expect(exerciseAcceptsSubmission({ locksAt: iso(0) }, AT)).toBe(false);
    expect(exerciseLockState({ locksAt: iso(1) }, AT)).toBe('closing_soon');
    expect(exerciseAcceptsSubmission({ locksAt: iso(1) }, AT)).toBe(true);
  });

  it('accepts work again once a teacher or admin reopens it', () => {
    const reopened = { locksAt: iso(-60 * 60 * 1000), unlockedAt: iso(-30 * 60 * 1000) };
    expect(exerciseLockState(reopened, AT)).toBe('reopened');
    expect(exerciseAcceptsSubmission(reopened, AT)).toBe(true);
  });

  it('ignores a reopen that predates the deadline it would have lifted', () => {
    /*
     * An exercise reopened on Monday and then given a Friday deadline is *not*
     * permanently open: the second deadline is the teacher's current intention and
     * the reopen was about the first. Without this the sequence
     * "reopen → set a later deadline" would silently never lock again.
     */
    const stale = { locksAt: iso(-60 * 1000), unlockedAt: iso(-2 * 60 * 60 * 1000) };
    expect(exerciseLockState(stale, AT)).toBe('locked');
    expect(exerciseAcceptsSubmission(stale, AT)).toBe(false);
  });

  it('accepts a Date as readily as an ISO string, because both sides call it', () => {
    // The API holds Dates from Prisma; the browser holds strings from JSON.
    expect(exerciseLockState({ locksAt: new Date(AT.getTime() + 1000) }, AT)).toBe(
      'closing_soon',
    );
  });

  it('treats an unparseable deadline as no deadline rather than as locked', () => {
    /*
     * Deliberate, and the direction matters. A corrupt value must not lock a class
     * out of work they have done — the failure that costs a child their homework is
     * worse than the one that leaves an exercise open a day too long, and the
     * second is visible to a teacher while the first is not.
     */
    expect(exerciseLockState({ locksAt: 'not a date' }, AT)).toBe('open');
    expect(exerciseAcceptsSubmission({ locksAt: 'not a date' }, AT)).toBe(true);
  });
});

describe('group exercises — the countdown', () => {
  it('never counts below zero', () => {
    expect(millisUntilLock({ locksAt: iso(-5000) }, AT)).toBe(0);
  });

  it('has nothing to count when there is no deadline', () => {
    expect(millisUntilLock({ locksAt: null }, AT)).toBeNull();
  });

  it('switches to minutes and seconds under an hour', () => {
    // Above an hour, a learner glances at it; below, they watch it.
    expect(formatCountdown(3 * 60 * 60 * 1000 + 5 * 60 * 1000)).toBe('3 h 05 m');
    expect(formatCountdown(4 * 60 * 1000 + 59 * 1000)).toBe('04:59');
    expect(formatCountdown(0)).toBe('00:00');
  });

  it('pads so the clock does not jump width as it ticks', () => {
    expect(formatCountdown(9 * 1000)).toBe('00:09');
    expect(formatCountdown(61 * 1000)).toBe('01:01');
  });
});
