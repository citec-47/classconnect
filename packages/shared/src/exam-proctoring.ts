/**
 * Exam proctoring decisions — §4.3 and §4.4.
 *
 * Pure, because these are the rules a human will one day be asked to justify to
 * a parent whose child's exam was stopped. They are testable here without a
 * database, a media server or a running Nest application.
 *
 * ## What the product owner decided
 *
 * The build prompt specified that three noise flags escalate to human review
 * and the attempt continues, and that the camera is degradable. The product
 * owner overruled both, in writing: three flags stop the exam, and mic and
 * camera must be on throughout. That is what this file implements.
 *
 * ## What is not negotiable, and why it survives the overrule
 *
 * Stopping an exam is not the same as deciding its outcome:
 *
 *   - FR-ASM-007 guarantees an interrupted learner keeps their answers. So a
 *     termination submits everything answered so far. Nothing is discarded.
 *   - FR-AI-005 forbids an automated final decision that materially affects a
 *     person. So a terminated attempt is `flagged_for_review` and a named human
 *     decides what it is worth. Nothing here scores, zeroes or voids a script.
 *
 * The system may end the sitting. It may not mark the paper.
 */

export type TerminationReason = 'noise_flag_limit' | 'mic_off' | 'camera_off';

export interface ProctorPolicy {
  /** Q1 — provisional until calibrated against real household recordings. */
  noiseThresholdDb: number;
  noiseSustainedMs: number;
  /** Flags before the exam stops. Three, per the product owner. */
  noiseFlagLimit: number;
  /** How long a required stream may be off before the attempt is stopped. */
  streamGraceSeconds: number;
}

// ---------------------------------------------------------------------------
// Noise
// ---------------------------------------------------------------------------

export interface NoiseSample {
  peakDb: number;
  /** How long the level was sustained. A transient bang is not a flag. */
  sustainedMs: number;
}

/**
 * Whether a sample raises a flag.
 *
 * Both conditions, never either. §4.3 is explicit that a single transient sound
 * must not trip it, and the target environment supplies transient sounds
 * constantly — a door, a generator starting, rain arriving on a metal roof.
 * With termination wired to the third flag, a detector that fires on peak alone
 * would end exams for weather.
 */
export function raisesNoiseFlag(sample: NoiseSample, policy: ProctorPolicy): boolean {
  return sample.peakDb >= policy.noiseThresholdDb && sample.sustainedMs >= policy.noiseSustainedMs;
}

export type NoiseAction =
  /** Flag 1: recorded, learner undisturbed. */
  | { kind: 'log'; sequence: number }
  /** Flag 2: a non-blocking notice. The timer keeps running. */
  | { kind: 'warn'; sequence: number }
  /** Flag 3: the exam stops, the paper is submitted, a human reviews it. */
  | { kind: 'terminate'; sequence: number; reason: TerminationReason };

/**
 * What the nth flag does.
 *
 * The ladder from §4.3, with the product owner's ending. `sequence` is the
 * flag's ordinal within this attempt, so the notice a learner actually saw is
 * reconstructable afterwards from the stored rows.
 */
export function noiseAction(sequence: number, policy: ProctorPolicy): NoiseAction {
  if (sequence >= policy.noiseFlagLimit) {
    return { kind: 'terminate', sequence, reason: 'noise_flag_limit' };
  }
  if (sequence === policy.noiseFlagLimit - 1) return { kind: 'warn', sequence };
  return { kind: 'log', sequence };
}

// ---------------------------------------------------------------------------
// Required streams
// ---------------------------------------------------------------------------

export type StreamKind = 'mic' | 'camera';

export interface StreamOutage {
  stream: StreamKind;
  offForSeconds: number;
}

/**
 * Whether an outage stops the exam.
 *
 * The grace period is the whole design. Zero tolerance would be indistinguishable,
 * from the learner's side, from the platform breaking: a camera that drops for
 * two seconds during a 3G handover has not been covered up, and ending a mock
 * over it teaches learners that the app cannot be trusted with an exam.
 *
 * Past the grace period the stream is genuinely off, and the product owner's
 * rule applies.
 */
export function outageTerminates(outage: StreamOutage, policy: ProctorPolicy): boolean {
  return outage.offForSeconds > policy.streamGraceSeconds;
}

export function terminationReasonFor(stream: StreamKind): TerminationReason {
  return stream === 'mic' ? 'mic_off' : 'camera_off';
}

// ---------------------------------------------------------------------------
// FR-ASM-007 — time, computed server-side
// ---------------------------------------------------------------------------

/**
 * Remaining seconds, from the authoritative start timestamp.
 *
 * Never from the client, and never from a client-supplied elapsed figure —
 * FR-ASM-009 puts timing, scoring and answer keys on the server, and a learner
 * who can edit the clock can extend their own exam.
 *
 * No time is credited back for a disconnection and none is lost to it beyond
 * real elapsed time: the answer is a subtraction from a fixed instant, so an
 * outage is neither punished nor rewarded. That falls out of the formula rather
 * than needing a rule of its own.
 */
export function remainingSeconds(startedAt: Date, durationMin: number, now: Date): number {
  const elapsed = Math.floor((now.getTime() - startedAt.getTime()) / 1000);
  return Math.max(0, durationMin * 60 - elapsed);
}

export function hasExpired(startedAt: Date, durationMin: number, now: Date): boolean {
  return remainingSeconds(startedAt, durationMin, now) === 0;
}

/**
 * Whether a proctored attempt is permitted at all.
 *
 * Q4 recommended that primary-level learners are not proctored, and the product
 * owner did not overrule it. Recording a seven-year-old's audio and video for
 * 90 minutes is a materially different proposition from doing so for a GCE
 * candidate, and OI-07 — the data-protection position on exactly that — is
 * still open. This returns false rather than throwing so the caller can offer
 * the unproctored alternative from §4.2.1 instead of refusing the learner.
 */
export function proctoringAllowed(input: {
  isPrimary: boolean;
  proctorPrimary: boolean;
}): boolean {
  return !input.isPrimary || input.proctorPrimary;
}
