import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../common/prisma.service';
import { PlatformConfigService } from '../common/platform-config.service';
import {
  CONFIG_KEYS,
  PAST_SESSION_STATUSES,
  type Language,
  type RecordingDto,
  type SessionDto,
} from '@classconnect/shared';

/**
 * §5.2 — the learner's timetable.
 *
 * Every session this learner is in, whether one-to-one or through a cohort. The
 * cohort case matters: a group class has `learnerId` null and reaches the
 * learner through `cohort_members`, so a query that only looked at `learnerId`
 * would silently show an empty timetable to every learner in a group class.
 */

/**
 * The two windows this screen turns on, both already platform configuration:
 * FR-LIV-003's join-early minutes and FR-SCH-007's cancellation notice. Reading
 * them rather than hard-coding 10 and 12 is what lets operations change either
 * without a deploy — the brief's "default 12 h" is a default, not a law.
 */
interface Windows {
  joinEarlyMinutes: number;
  cancelNoticeHours: number;
}

/**
 * Shared by the upcoming and past queries so both return the same shape.
 *
 * `Prisma.validator` rather than a bare object literal: it type-checks the
 * include against the model *and* preserves the literal types Prisma needs to
 * infer the relations onto the result. A plain object widens `'desc'` to
 * `string` and the relations quietly fall off the returned type.
 *
 * FR-SAF-001 / §10 criterion 10 live in the teacher branch: the display name and
 * nothing else, selected explicitly rather than included wholesale, so a contact
 * column added to the model tomorrow does not silently appear on this wire.
 */
const SESSION_INCLUDE = Prisma.validator<Prisma.SessionInclude>()({
  subject: { select: { id: true, nameEn: true, nameFr: true } },
  teacher: { select: { user: { select: { fullName: true } } } },
  recordings: {
    orderBy: { createdAt: 'desc' },
    take: 1,
    select: { id: true, durationSec: true, availableUntil: true, createdAt: true },
  },
});

/** How long after the end FR-LIV-013 allows for publication. */
const RECORDING_READY_AFTER_MS = 60 * 60 * 1000;

/**
 * How far back a still-joinable session stays on the upcoming list.
 *
 * A session that started an hour ago is not "upcoming", but one that started
 * four minutes ago is still in progress and must not vanish off the top of the
 * screen while the learner is looking for the Join button.
 */
const STILL_RUNNING_GRACE_MS = 3 * 60 * 60 * 1000;

@Injectable()
export class LearnerScheduleService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: PlatformConfigService,
  ) {}

  private windows(): Windows {
    return {
      joinEarlyMinutes: this.config.getNumber(CONFIG_KEYS.SESSION_JOIN_EARLY_MINUTES),
      cancelNoticeHours: this.config.getNumber(CONFIG_KEYS.CANCELLATION_NOTICE_HOURS),
    };
  }

  /** Every cohort this learner currently sits in. */
  private async cohortIds(learnerId: string): Promise<string[]> {
    const rows = await this.prisma.cohortMember.findMany({
      where: { learnerId, leftAt: null },
      select: { cohortId: true },
    });
    return rows.map((row) => row.cohortId);
  }

  async upcoming(learnerId: string, language: Language, limit = 20): Promise<SessionDto[]> {
    const cohorts = await this.cohortIds(learnerId);

    const sessions = await this.prisma.session.findMany({
      where: {
        OR: [{ learnerId }, { cohortId: { in: cohorts } }],
        status: { in: ['scheduled', 'in_progress'] },
        startsAtUtc: { gte: new Date(Date.now() - STILL_RUNNING_GRACE_MS) },
      },
      orderBy: { startsAtUtc: 'asc' },
      take: limit,
      include: SESSION_INCLUDE,
    });

    const windows = this.windows();
    return sessions.map((session) => toSessionDto(session, language, windows));
  }

  /** The next one only — what the home screen's primary card is about. */
  async next(learnerId: string, language: Language): Promise<SessionDto | null> {
    const [first] = await this.upcoming(learnerId, language, 1);
    return first ?? null;
  }

  async past(learnerId: string, language: Language, limit = 20): Promise<SessionDto[]> {
    const cohorts = await this.cohortIds(learnerId);

    const sessions = await this.prisma.session.findMany({
      where: {
        OR: [{ learnerId }, { cohortId: { in: cohorts } }],
        status: { in: [...PAST_SESSION_STATUSES] },
      },
      orderBy: { startsAtUtc: 'desc' },
      take: limit,
      include: SESSION_INCLUDE,
    });

    const windows = this.windows();
    return sessions.map((session) => toSessionDto(session, language, windows));
  }
}

interface SessionRow {
  id: string;
  startsAtUtc: Date;
  durationMin: number;
  type: string;
  status: string;
  recordingEnabled: boolean;
  subject: { id: string; nameEn: string; nameFr: string };
  teacher: { user: { fullName: string } };
  recordings: Array<{
    id: string;
    durationSec: number;
    availableUntil: Date;
    createdAt: Date;
  }>;
}

export function toSessionDto(
  session: SessionRow,
  language: Language,
  windows: Windows,
): SessionDto {
  const startsAt = session.startsAtUtc;
  const endsAt = new Date(startsAt.getTime() + session.durationMin * 60_000);
  const recording = session.recordings[0];

  return {
    id: session.id,
    subject: {
      id: session.subject.id,
      // NFR-LOC-002: subjects are bilingual in the catalogue, so the name is
      // resolved here rather than shipping both and choosing on the client.
      name: language === 'fr' ? session.subject.nameFr : session.subject.nameEn,
    },
    teacher: { displayName: session.teacher.user.fullName },
    startsAt: startsAt.toISOString(),
    durationMin: session.durationMin,
    type: session.type as SessionDto['type'],
    status: session.status as SessionDto['status'],
    /*
     * FR-LIV-003, computed from the server's clock. A shared family phone's
     * clock is not something to hang the start of a lesson on, so the client is
     * told the window rather than asked to work it out.
     *
     * Both ends were hard-coded to a quarter of an hour around the start, and
     * both were wrong. `SESSION_JOIN_EARLY_MINUTES` was read from
     * `PlatformConfig`, threaded all the way down to here as
     * `windows.joinEarlyMinutes`, and then not used — so operations could widen
     * the window, see the value saved, and change nothing a learner experiences.
     *
     * And the window closed fifteen minutes after the start rather than at the
     * end of the lesson, which locked out the learner whose connection dropped
     * twenty minutes in. Being late is not the same as being finished.
     */
    joinOpensAt: new Date(
      startsAt.getTime() - windows.joinEarlyMinutes * 60_000,
    ).toISOString(),
    joinClosesAt: endsAt.toISOString(),
    recordingEnabled: session.recordingEnabled,
    // FR-SCH-007 / UI-007: the consequence, in a form the client can state
    // plainly before it asks for confirmation.
    cancellation:
      session.status === 'scheduled'
        ? {
            noticeHours: windows.cancelNoticeHours,
            freeUntil: new Date(
              startsAt.getTime() - windows.cancelNoticeHours * 3_600_000,
            ).toISOString(),
          }
        : null,
    recording: recording ? toRecordingDto(recording, endsAt) : null,
  };
}

function toRecordingDto(
  recording: { id: string; durationSec: number; availableUntil: Date; createdAt: Date },
  sessionEndedAt: Date,
): RecordingDto {
  return {
    id: recording.id,
    durationSec: recording.durationSec,
    // FR-LIV-013: shown to the learner, so nobody is surprised when it goes.
    availableUntil: recording.availableUntil.toISOString(),
    // FR-LIV-013 promises publication within the hour. "Ready within an hour"
    // is a better answer than a link that 404s.
    ready: Date.now() >= sessionEndedAt.getTime() + RECORDING_READY_AFTER_MS,
  };
}
