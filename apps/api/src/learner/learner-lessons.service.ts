import { Injectable } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';
import type { PastLessonDto } from '@classconnect/shared';

/**
 * My past lessons.
 *
 * The rule that shapes this file: **a booked learner gets the recording whether
 * or not they attended.** Attendance is history, not entitlement.
 *
 * That is not a softening of access control, it is the correct reading of it.
 * The learner was booked into the session; the session is theirs. Cameroon's
 * electricity and connectivity make absence the normal case rather than the
 * exceptional one (AS-08), and a platform that punished a missed lesson by
 * withholding the recording would be punishing the grid.
 *
 * So the `where` clause below filters on *booking* — a direct learner session or
 * membership of the cohort — and never on `session_participants`. Attendance is
 * read separately, and only to decide which badge the card carries.
 */
@Injectable()
export class LearnerLessonsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(
    learnerId: string,
    userId: string,
    language: 'en' | 'fr',
    options: { subjectId?: string; take?: number } = {},
  ): Promise<PastLessonDto[]> {
    const now = new Date();

    const sessions = await this.prisma.session.findMany({
      where: {
        // Booked into it. Not "turned up to it".
        OR: [{ learnerId }, { cohort: { members: { some: { learnerId } } } }],
        ...(options.subjectId ? { subjectId: options.subjectId } : {}),
        startsAtUtc: { lt: now },
        // A cancelled lesson never happened, so it is not a past lesson.
        status: { in: ['completed', 'aborted', 'no_show_learner', 'in_progress'] },
      },
      select: {
        id: true,
        startsAtUtc: true,
        durationMin: true,
        status: true,
        endedAt: true,
        recordingEnabled: true,
        subject: { select: { id: true, nameEn: true, nameFr: true } },
        teacher: {
          select: { userId: true, user: { select: { fullName: true } } },
        },
        recordings: {
          select: {
            id: true,
            durationSec: true,
            availableUntil: true,
            sizeBytes: true,
            audioKey: true,
            audioSizeBytes: true,
          },
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
        participants: {
          where: { userId },
          select: { attendedMinutes: true, firstJoinAt: true },
        },
        reviews: {
          where: { raterId: userId },
          select: { id: true },
        },
      },
      orderBy: { startsAtUtc: 'desc' },
      take: options.take ?? 60,
    });

    return sessions.map((session) => {
      const recording = session.recordings[0] ?? null;
      const participant = session.participants[0] ?? null;
      const expired = recording ? recording.availableUntil <= now : false;

      return {
        sessionId: session.id,
        subject: {
          id: session.subject.id,
          name: language === 'fr' ? session.subject.nameFr : session.subject.nameEn,
        },
        teacher: session.teacher
          ? { id: session.teacher.userId, displayName: session.teacher.user.fullName }
          : null,
        startedAt: session.startsAtUtc.toISOString(),
        durationMin: session.durationMin,
        // FR-LIV-014: the media server's join event is the authority. A learner
        // who opened the page but never connected did not attend.
        attended: Boolean(participant?.firstJoinAt),
        attendedMinutes: participant?.attendedMinutes ?? 0,
        recording:
          recording && !expired
            ? {
                id: recording.id,
                durationSec: recording.durationSec,
                availableUntil: recording.availableUntil.toISOString(),
                estimatedBytes: recording.sizeBytes ? Number(recording.sizeBytes) : null,
                audioAvailable: Boolean(recording.audioKey),
                audioEstimatedBytes: recording.audioSizeBytes
                  ? Number(recording.audioSizeBytes)
                  : null,
              }
            : null,
        recordingState: recordingState(session, recording, expired, now),
        rated: session.reviews.length > 0,
      };
    });
  }
}

/**
 * Why there is no video, said precisely.
 *
 * "No recording" covers four different situations and a learner deserves to
 * know which one they are in: one resolves itself in an hour, one never will,
 * one already has and is gone, and one was never going to (NFR-USA-004).
 */
function recordingState(
  session: { recordingEnabled: boolean; endedAt: Date | null; startsAtUtc: Date; durationMin: number },
  recording: unknown | null,
  expired: boolean,
  now: Date,
): PastLessonDto['recordingState'] {
  if (recording && !expired) return 'ready';
  if (recording && expired) return 'expired';
  if (!session.recordingEnabled) return 'not_recorded';

  // FR-LIV-013 gives egress an hour from session end before the recording is
  // published. Inside that window it is coming; outside it, it is not.
  const ended = session.endedAt ?? new Date(session.startsAtUtc.getTime() + session.durationMin * 60_000);
  return now.getTime() - ended.getTime() < 60 * 60_000 ? 'processing' : 'not_recorded';
}
