import { toSessionDto } from './learner-schedule.service';
import { PAST_SESSION_STATUSES, type SessionDto } from '@classconnect/shared';

/**
 * §5.2 and FR-LIV-003 — the join window.
 *
 * The window is computed server-side and sent to the client, because the device
 * it will be read on is a shared family phone whose clock nobody has checked
 * (2.4). These pin the arithmetic; the component only renders what arrives.
 */

const WINDOWS = { joinEarlyMinutes: 10, cancelNoticeHours: 12 };
const START = new Date('2026-08-09T15:00:00.000Z');

function row(over: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'session-1',
    startsAtUtc: START,
    durationMin: 60,
    type: 'one_to_one',
    status: 'scheduled',
    recordingEnabled: true,
    subject: { id: 'subject-1', nameEn: 'Chemistry', nameFr: 'Chimie' },
    teacher: { user: { fullName: 'Paul Tabi' } },
    recordings: [],
    ...over,
  } as Parameters<typeof toSessionDto>[0];
}

describe('FR-LIV-003 — the join window', () => {
  it('opens ten minutes before the start and closes at the end', () => {
    const dto = toSessionDto(row(), 'en', WINDOWS);
    expect(dto.joinOpensAt).toBe('2026-08-09T14:50:00.000Z');
    expect(dto.joinClosesAt).toBe('2026-08-09T16:00:00.000Z');
  });

  it('follows the configured window rather than a hard-coded ten', () => {
    // Operations can widen this without a deploy; the DTO must follow.
    const dto = toSessionDto(row(), 'en', { ...WINDOWS, joinEarlyMinutes: 30 });
    expect(dto.joinOpensAt).toBe('2026-08-09T14:30:00.000Z');
  });
});

describe('FR-SCH-007 / UI-007 — the cancellation consequence', () => {
  it('states the deadline after which the class is used up', () => {
    const dto = toSessionDto(row(), 'en', WINDOWS);
    expect(dto.cancellation).toEqual({
      noticeHours: 12,
      freeUntil: '2026-08-09T03:00:00.000Z',
    });
  });

  it('offers no cancellation on a session that has already happened', () => {
    for (const status of PAST_SESSION_STATUSES) {
      expect(toSessionDto(row({ status }), 'en', WINDOWS).cancellation).toBeNull();
    }
  });
});

describe('§10 criterion 10 — the teacher reference', () => {
  it('carries a display name and nothing else', () => {
    const dto = toSessionDto(row(), 'en', WINDOWS);
    expect(dto.teacher).toEqual({ displayName: 'Paul Tabi' });
    // Asserted on the serialised form, which is what criterion 10 is about.
    expect(JSON.stringify(dto)).not.toMatch(/phone|email|address/i);
  });
});

describe('NFR-LOC-002 — the bilingual catalogue', () => {
  it('resolves the subject name server-side', () => {
    expect(toSessionDto(row(), 'en', WINDOWS).subject.name).toBe('Chemistry');
    expect(toSessionDto(row(), 'fr', WINDOWS).subject.name).toBe('Chimie');
  });
});

describe('FR-LIV-013 — the recording', () => {
  const recording = {
    id: 'rec-1',
    durationSec: 3480,
    availableUntil: new Date('2026-11-07T16:00:00.000Z'),
    createdAt: new Date('2026-08-09T16:05:00.000Z'),
  };

  it('reports a fresh recording as not yet ready', () => {
    // Published "within 60 minutes of session end" — a link offered before then
    // is a 404 waiting to happen.
    const justEnded = new Date(Date.now() - 5 * 60_000);
    const dto: SessionDto = toSessionDto(
      row({
        startsAtUtc: new Date(justEnded.getTime() - 60 * 60_000),
        status: 'completed',
        recordings: [recording],
      }),
      'en',
      WINDOWS,
    );
    expect(dto.recording?.ready).toBe(false);
  });

  it('reports an older recording as ready, and says when it goes', () => {
    const dto = toSessionDto(
      row({
        startsAtUtc: new Date(Date.now() - 5 * 60 * 60 * 1000),
        status: 'completed',
        recordings: [recording],
      }),
      'en',
      WINDOWS,
    );
    expect(dto.recording?.ready).toBe(true);
    // The learner is told the expiry, so its disappearance is not a surprise.
    expect(dto.recording?.availableUntil).toBe('2026-11-07T16:00:00.000Z');
  });
});
