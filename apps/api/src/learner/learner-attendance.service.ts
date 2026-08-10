import { Injectable } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';
import type { AttendanceSessionDto, LearnerAttendanceDto } from '@classconnect/shared';

/**
 * Attendance, as something a learner can act on.
 *
 * The progress screen already carried a single percentage. A percentage on its
 * own is a grade — it tells a child they are at 68% and gives them nothing to
 * do about it. What makes the number useful is the split: which subject is
 * slipping, and which of the last few lessons were missed.
 *
 * Counted from sessions the learner was **booked into**, matching the past
 * lessons screen, so the two never disagree. Attendance itself comes from the
 * media server's join events (FR-LIV-014), never from a self-report.
 *
 * Cancelled sessions are excluded on both sides of the fraction. A lesson the
 * teacher called off is not a lesson the learner missed, and counting it would
 * quietly blame a child for someone else's cancellation.
 */
@Injectable()
export class LearnerAttendanceService {
  constructor(private readonly prisma: PrismaService) {}

  async summary(
    learnerId: string,
    userId: string,
    language: 'en' | 'fr',
  ): Promise<LearnerAttendanceDto> {
    const sessions = await this.prisma.session.findMany({
      where: {
        OR: [{ learnerId }, { cohort: { members: { some: { learnerId } } } }],
        startsAtUtc: { lt: new Date() },
        // FR-SCH-007/011: a session nobody could attend is not a miss.
        status: { in: ['completed', 'aborted', 'no_show_learner'] },
      },
      select: {
        id: true,
        startsAtUtc: true,
        durationMin: true,
        subject: { select: { id: true, nameEn: true, nameFr: true } },
        participants: {
          where: { userId },
          select: { firstJoinAt: true, attendedMinutes: true },
        },
      },
      orderBy: { startsAtUtc: 'desc' },
      take: 200,
    });

    const rows: AttendanceSessionDto[] = sessions.map((session) => {
      const participant = session.participants[0] ?? null;
      return {
        sessionId: session.id,
        subject: {
          id: session.subject.id,
          name: language === 'fr' ? session.subject.nameFr : session.subject.nameEn,
        },
        startedAt: session.startsAtUtc.toISOString(),
        durationMin: session.durationMin,
        attended: Boolean(participant?.firstJoinAt),
        attendedMinutes: participant?.attendedMinutes ?? 0,
      };
    });

    const attended = rows.filter((row) => row.attended).length;
    const scheduled = rows.length;

    // Rows are newest first, so the streak is however far back the attendance
    // runs unbroken from today.
    let streak = 0;
    for (const row of rows) {
      if (!row.attended) break;
      streak += 1;
    }

    const bySubjectMap = new Map<
      string,
      { subject: AttendanceSessionDto['subject']; attended: number; scheduled: number }
    >();
    for (const row of rows) {
      const entry = bySubjectMap.get(row.subject.id) ?? {
        subject: row.subject,
        attended: 0,
        scheduled: 0,
      };
      entry.scheduled += 1;
      if (row.attended) entry.attended += 1;
      bySubjectMap.set(row.subject.id, entry);
    }

    return {
      attended,
      scheduled,
      percentage: percentage(attended, scheduled),
      streak,
      bySubject: [...bySubjectMap.values()]
        .map((entry) => ({ ...entry, percentage: percentage(entry.attended, entry.scheduled) }))
        .sort((a, b) => a.percentage - b.percentage),
      // Weakest subject first above, and the ten most recent lessons here: the
      // two questions a learner actually has are "where am I slipping" and
      // "what did I miss lately".
      recent: rows.slice(0, 10),
    };
  }
}

/** Whole percent, and 0 rather than NaN when nothing has been scheduled yet. */
function percentage(part: number, whole: number): number {
  return whole === 0 ? 0 : Math.round((part / whole) * 100);
}
