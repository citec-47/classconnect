/**
 * The four Classes views, and how a session lands in one of them.
 *
 * §1 of the student brief. The rule lives here rather than in a query so that
 * the API and the UI cannot disagree about which bucket a session is in, and so
 * that "no invented states" (acceptance criterion 1) is checkable: every input
 * this file accepts is a member of the SRS Appendix A session state model.
 */

/** SRS Appendix A. Mirrors the `SessionStatus` enum in the schema exactly. */
export type SessionState =
  | 'scheduled'
  | 'in_progress'
  | 'completed'
  | 'cancelled_by_learner'
  | 'cancelled_by_teacher'
  | 'no_show_teacher'
  | 'no_show_learner'
  | 'aborted'
  | 'disputed'
  | 'voided';

export type ClassesView = 'live' | 'upcoming' | 'attended' | 'missed';

export const CLASSES_VIEWS: readonly ClassesView[] = ['live', 'upcoming', 'attended', 'missed'];

/**
 * Why a class was missed, as a key rather than a sentence.
 *
 * NFR-LOC-002 puts the wording in the catalogues; §1.1 fixes the tone. Each of
 * these has a neutral phrasing in both languages, because three of the four are
 * not the learner's doing and a child reading "you missed this" about a class
 * their teacher cancelled has been told something untrue.
 */
export type MissReason =
  | 'learner_no_show'
  | 'teacher_cancelled'
  | 'teacher_no_show'
  | 'learner_cancelled'
  | 'attended_none';

export interface ClassifiableSession {
  status: SessionState;
  /** From the media server's join/leave events (FR-LIV-014), never self-reported. */
  attendedMinutes: number;
}

/**
 * Which view a session belongs to, or null when it belongs to none.
 *
 * `aborted`, `disputed` and `voided` deliberately return null. They are real
 * states in Appendix A but they are administrative outcomes mid-dispute, and
 * showing a learner a class in an unresolved billing dispute as either
 * "attended" or "missed" would state a conclusion nobody has reached yet.
 */
export function viewFor(session: ClassifiableSession): ClassesView | null {
  switch (session.status) {
    case 'in_progress':
      return 'live';
    case 'scheduled':
      return 'upcoming';
    case 'completed':
      // §1: attended means minutes > 0. A completed session the learner never
      // joined is a miss, not an attendance with a zero on it.
      return session.attendedMinutes > 0 ? 'attended' : 'missed';
    case 'no_show_learner':
    case 'no_show_teacher':
    case 'cancelled_by_teacher':
    case 'cancelled_by_learner':
      return 'missed';
    default:
      return null;
  }
}

/** The reason shown on a Missed card. Null when the session is not a miss. */
export function missReasonFor(session: ClassifiableSession): MissReason | null {
  if (viewFor(session) !== 'missed') return null;

  switch (session.status) {
    case 'no_show_learner':
      return 'learner_no_show';
    case 'no_show_teacher':
      return 'teacher_no_show';
    case 'cancelled_by_teacher':
      return 'teacher_cancelled';
    case 'cancelled_by_learner':
      return 'learner_cancelled';
    default:
      // `completed` with no attended minutes.
      return 'attended_none';
  }
}

/**
 * Whether the learner's entitlement came back.
 *
 * FR-SCH-007 / FR-SCH-011. §1.1 requires the card to say so, and the reason is
 * plain: a learner and their guardian both need to know whether a missed class
 * cost them anything. Where the platform or the teacher caused the miss, it did
 * not; where the learner simply did not turn up, it did.
 */
export function entitlementRestored(reason: MissReason): boolean {
  return reason === 'teacher_cancelled' || reason === 'teacher_no_show';
}

// ---------------------------------------------------------------------------
// §1.3 — mic and camera reporting
// ---------------------------------------------------------------------------

/** Mirrors the `StreamOffReason` enum in the schema. */
export type StreamOffReason =
  | 'learner_choice'
  | 'system_bandwidth'
  | 'system_policy'
  | 'device_failure';

export interface StreamUsage {
  onMinutes: number;
  sessionMinutes: number;
  offReason: StreamOffReason | null;
}

/**
 * How a stream's usage should be described.
 *
 * `off_whole_session_by_system` and `off_whole_session_by_choice` are separate
 * outcomes on purpose, and §1.3 is unusually direct about why: FR-LIV-009 has
 * the classroom switch learner video off as bandwidth falls, and attributing
 * that to the learner is called a defect rather than a wording preference.
 *
 * The learner on a shared 3G connection did not hide. The platform hid them.
 */
export type StreamSummary =
  | 'on_throughout'
  | 'on_partly'
  | 'off_whole_session_by_choice'
  | 'off_whole_session_by_system';

export function summariseStream(usage: StreamUsage): StreamSummary {
  if (usage.onMinutes <= 0) {
    // Absent a recorded reason, the honest answer is the one that does not
    // accuse: a missing reason is a gap in our telemetry, not evidence of
    // intent, so it is not reported as the learner's choice.
    return usage.offReason === 'learner_choice'
      ? 'off_whole_session_by_choice'
      : 'off_whole_session_by_system';
  }
  return usage.onMinutes >= usage.sessionMinutes ? 'on_throughout' : 'on_partly';
}

// ---------------------------------------------------------------------------
// FR-LIV-003 — the join window
// ---------------------------------------------------------------------------

/** Opens 10 minutes before the scheduled start. */
export const JOIN_OPENS_MINUTES_BEFORE = 10;

export type JoinState = 'too_early' | 'open' | 'closed';

export interface JoinWindow {
  state: JoinState;
  /** Seconds until the window opens. Zero unless `too_early`. */
  opensInSeconds: number;
}

/**
 * FR-LIV-003: joinable from 10 minutes before the start until the scheduled end.
 *
 * §1.1 requires the control to show the remaining time rather than a dead
 * button before the window — a disabled control with no explanation reads as a
 * broken app, and the learner's next move is to contact support.
 */
export function joinWindow(
  startsAt: Date,
  durationMin: number,
  now: Date,
): JoinWindow {
  const opensAt = startsAt.getTime() - JOIN_OPENS_MINUTES_BEFORE * 60_000;
  const closesAt = startsAt.getTime() + durationMin * 60_000;
  const millis = now.getTime();

  if (millis < opensAt) {
    return { state: 'too_early', opensInSeconds: Math.ceil((opensAt - millis) / 1000) };
  }
  if (millis > closesAt) return { state: 'closed', opensInSeconds: 0 };
  return { state: 'open', opensInSeconds: 0 };
}
