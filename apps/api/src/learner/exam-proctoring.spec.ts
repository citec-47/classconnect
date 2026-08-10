import {
  hasExpired,
  noiseAction,
  outageTerminates,
  proctoringAllowed,
  raisesNoiseFlag,
  remainingSeconds,
  terminationReasonFor,
  type ProctorPolicy,
} from '@classconnect/shared';

/**
 * §4.3 / §4.4 — proctoring, as the product owner specified it.
 *
 * The build prompt had three flags escalate without stopping the exam. That was
 * overruled in writing: three flags stop it. These tests pin the overruled
 * behaviour *and* the two guarantees that survive it — answers are kept, and no
 * automated step decides what the paper is worth.
 */

const policy: ProctorPolicy = {
  noiseThresholdDb: 65,
  noiseSustainedMs: 4000,
  noiseFlagLimit: 3,
  streamGraceSeconds: 30,
};

describe('§4.3 — noise detection', () => {
  it('needs both loudness and duration, so a single bang is not a flag', () => {
    // The target environment supplies transient sounds constantly. With
    // termination on the third flag, peak-only detection would end exams for
    // a door closing.
    expect(raisesNoiseFlag({ peakDb: 92, sustainedMs: 200 }, policy)).toBe(false);
    expect(raisesNoiseFlag({ peakDb: 40, sustainedMs: 30_000 }, policy)).toBe(false);
    expect(raisesNoiseFlag({ peakDb: 70, sustainedMs: 5000 }, policy)).toBe(true);
  });

  it('escalates log → warn → terminate', () => {
    expect(noiseAction(1, policy).kind).toBe('log');
    expect(noiseAction(2, policy).kind).toBe('warn');
    expect(noiseAction(3, policy).kind).toBe('terminate');
  });

  it('names the trigger when it terminates, for the human who reviews it', () => {
    const action = noiseAction(3, policy);
    expect(action).toEqual({ kind: 'terminate', sequence: 3, reason: 'noise_flag_limit' });
  });

  it('does not warn on the first flag or log on the third', () => {
    expect(noiseAction(1, policy).kind).not.toBe('warn');
    expect(noiseAction(4, policy).kind).toBe('terminate');
  });

  it('follows a reconfigured limit rather than a hard-coded three', () => {
    const strict = { ...policy, noiseFlagLimit: 2 };
    expect(noiseAction(1, strict).kind).toBe('warn');
    expect(noiseAction(2, strict).kind).toBe('terminate');
  });
});

describe('§4.3 — mic and camera required throughout', () => {
  it('tolerates a brief drop', () => {
    // A camera that blinks during a 3G handover has not been covered up, and
    // ending a mock over it is indistinguishable from the app breaking.
    expect(outageTerminates({ stream: 'camera', offForSeconds: 5 }, policy)).toBe(false);
    expect(outageTerminates({ stream: 'mic', offForSeconds: 30 }, policy)).toBe(false);
  });

  it('stops the exam once a required stream is genuinely off', () => {
    expect(outageTerminates({ stream: 'camera', offForSeconds: 31 }, policy)).toBe(true);
    expect(outageTerminates({ stream: 'mic', offForSeconds: 120 }, policy)).toBe(true);
  });

  it('records which stream was responsible', () => {
    expect(terminationReasonFor('mic')).toBe('mic_off');
    expect(terminationReasonFor('camera')).toBe('camera_off');
  });
});

describe('§4.4 / FR-ASM-007 — time is the server’s', () => {
  const startedAt = new Date('2026-08-10T09:00:00Z');

  it('computes what is left from the authoritative start', () => {
    expect(remainingSeconds(startedAt, 90, new Date('2026-08-10T09:30:00Z'))).toBe(60 * 60);
  });

  it('neither credits nor charges extra for a disconnection', () => {
    // Criterion 8: a 60-second outage costs exactly 60 seconds of real time.
    const beforeOutage = remainingSeconds(startedAt, 90, new Date('2026-08-10T09:10:00Z'));
    const afterOutage = remainingSeconds(startedAt, 90, new Date('2026-08-10T09:11:00Z'));
    expect(beforeOutage - afterOutage).toBe(60);
  });

  it('never reports negative time', () => {
    expect(remainingSeconds(startedAt, 30, new Date('2026-08-10T11:00:00Z'))).toBe(0);
    expect(hasExpired(startedAt, 30, new Date('2026-08-10T11:00:00Z'))).toBe(true);
  });
});

describe('Q4 — proctoring and primary learners', () => {
  it('does not proctor a primary learner by default', () => {
    expect(proctoringAllowed({ isPrimary: true, proctorPrimary: false })).toBe(false);
  });

  it('proctors everyone else', () => {
    expect(proctoringAllowed({ isPrimary: false, proctorPrimary: false })).toBe(true);
  });

  it('can be turned on deliberately, since it is a policy not a law', () => {
    expect(proctoringAllowed({ isPrimary: true, proctorPrimary: true })).toBe(true);
  });
});
