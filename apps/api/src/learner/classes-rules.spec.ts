import {
  CLASSES_VIEWS,
  entitlementRestored,
  joinWindow,
  missReasonFor,
  summariseStream,
  viewFor,
  type SessionState,
} from '@classconnect/shared';

/**
 * §1 and §6 — the Classes acceptance criteria.
 *
 * Criterion 1 ("no invented states") and criterion 3 (learner choice is
 * distinguishable from system-imposed degradation) are checked here, because
 * both are properties of the rule rather than of a screen.
 */

const ALL_STATES: SessionState[] = [
  'scheduled',
  'in_progress',
  'completed',
  'cancelled_by_learner',
  'cancelled_by_teacher',
  'no_show_teacher',
  'no_show_learner',
  'aborted',
  'disputed',
  'voided',
];

describe('§1 — the four Classes views', () => {
  it('routes each view from an Appendix A state, inventing none', () => {
    for (const status of ALL_STATES) {
      const view = viewFor({ status, attendedMinutes: 30 });
      if (view !== null) expect(CLASSES_VIEWS).toContain(view);
    }
  });

  it('puts an in-progress session in Live and a scheduled one in Upcoming', () => {
    expect(viewFor({ status: 'in_progress', attendedMinutes: 0 })).toBe('live');
    expect(viewFor({ status: 'scheduled', attendedMinutes: 0 })).toBe('upcoming');
  });

  it('separates a completed session by whether the learner was actually there', () => {
    expect(viewFor({ status: 'completed', attendedMinutes: 24 })).toBe('attended');
    // Completed but never joined is a miss, not an attendance worth zero.
    expect(viewFor({ status: 'completed', attendedMinutes: 0 })).toBe('missed');
  });

  it('treats every no-show and cancellation as missed', () => {
    for (const status of [
      'no_show_learner',
      'no_show_teacher',
      'cancelled_by_teacher',
      'cancelled_by_learner',
    ] as SessionState[]) {
      expect(viewFor({ status, attendedMinutes: 0 })).toBe('missed');
    }
  });

  it('shows nothing for a session still in dispute', () => {
    // Naming an unresolved billing dispute "attended" or "missed" states a
    // conclusion nobody has reached.
    for (const status of ['aborted', 'disputed', 'voided'] as SessionState[]) {
      expect(viewFor({ status, attendedMinutes: 10 })).toBeNull();
    }
  });
});

describe('§1.1 / criterion 2 — whether a miss cost the learner anything', () => {
  it('restores the entitlement when the teacher caused the miss', () => {
    expect(entitlementRestored('teacher_no_show')).toBe(true);
    expect(entitlementRestored('teacher_cancelled')).toBe(true);
  });

  it('does not restore it when the learner simply did not come', () => {
    expect(entitlementRestored('learner_no_show')).toBe(false);
    expect(entitlementRestored('learner_cancelled')).toBe(false);
  });

  it('names the reason for every missed session', () => {
    for (const status of ALL_STATES) {
      const session = { status, attendedMinutes: 0 };
      if (viewFor(session) === 'missed') expect(missReasonFor(session)).not.toBeNull();
    }
  });
});

describe('§1.3 / criterion 3 — mic and camera reporting', () => {
  const session = { onMinutes: 0, sessionMinutes: 60, offReason: null } as const;

  it('does not blame the learner when the platform switched the camera off', () => {
    // FR-LIV-009 disables learner video as bandwidth falls. Reporting that as
    // the learner's choice attributes a system decision to a child.
    expect(summariseStream({ ...session, offReason: 'system_bandwidth' })).toBe(
      'off_whole_session_by_system',
    );
    expect(summariseStream({ ...session, offReason: 'system_policy' })).toBe(
      'off_whole_session_by_system',
    );
    expect(summariseStream({ ...session, offReason: 'device_failure' })).toBe(
      'off_whole_session_by_system',
    );
  });

  it('reports a deliberate mute as the learner’s own choice', () => {
    expect(summariseStream({ ...session, offReason: 'learner_choice' })).toBe(
      'off_whole_session_by_choice',
    );
  });

  it('does not accuse the learner when the reason was never recorded', () => {
    // A gap in telemetry is not evidence of intent.
    expect(summariseStream(session)).toBe('off_whole_session_by_system');
  });

  it('distinguishes on-throughout from on-for-part', () => {
    expect(summariseStream({ onMinutes: 60, sessionMinutes: 60, offReason: null })).toBe(
      'on_throughout',
    );
    expect(summariseStream({ onMinutes: 12, sessionMinutes: 60, offReason: null })).toBe(
      'on_partly',
    );
  });
});

describe('FR-LIV-003 — the join window', () => {
  const start = new Date('2026-08-10T09:00:00Z');

  it('opens ten minutes before the start and closes at the scheduled end', () => {
    expect(joinWindow(start, 60, new Date('2026-08-10T08:50:00Z')).state).toBe('open');
    expect(joinWindow(start, 60, new Date('2026-08-10T09:59:00Z')).state).toBe('open');
    expect(joinWindow(start, 60, new Date('2026-08-10T10:01:00Z')).state).toBe('closed');
  });

  it('reports the wait rather than presenting a dead button', () => {
    // §1.1: a disabled control with no explanation reads as a broken app.
    const early = joinWindow(start, 60, new Date('2026-08-10T08:20:00Z'));
    expect(early.state).toBe('too_early');
    expect(early.opensInSeconds).toBe(30 * 60);
  });
});
