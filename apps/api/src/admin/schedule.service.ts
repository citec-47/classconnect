import { Injectable } from '@nestjs/common';
import type { SchoolType } from '@prisma/client';
import { PLATFORM_TIMEZONE } from '@classconnect/shared';
import { PrismaService } from '../common/prisma.service';
import { AuditService } from '../audit/audit.service';

/**
 * The weekly timetable.
 *
 * An Admin picks a grouping — primary, secondary, Lower & Upper Sixth, or
 * private classes — and sees Monday to Sunday, with the time and the course
 * running in each slot.
 *
 * ## Why "private classes" sits beside the three bands
 *
 * It is not a fourth band. Primary, secondary and sixth form partition the
 * learners; private cuts across all three, because it describes how a lesson is
 * taught rather than who it is for. They share one selector because that is how
 * an operator thinks about it — "show me the sixth form timetable", "show me
 * every one-to-one" — and the filter simply applies to a different column.
 *
 * §2.4 / DAT-003: sessions are stored in UTC and the week is reckoned in
 * Africa/Douala, so a lesson at 08:00 on Monday appears on Monday for the
 * operator reading it, not on Sunday night.
 */

/** The four choices the Schedules screen offers. */
export type ScheduleGrouping = SchoolType | 'private';

@Injectable()
export class ScheduleService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /**
   * The Monday that starts the week containing `reference`, in platform local
   * time, returned as the UTC instant that local midnight corresponds to.
   *
   * Africa/Douala is a fixed UTC+1 with no daylight saving (§2.4), which is what
   * makes this arithmetic safe rather than a source of once-a-year bugs.
   */
  private weekBounds(reference: Date): { start: Date; end: Date; startsOn: string } {
    const offsetMs = 60 * 60_000; // UTC+1
    const local = new Date(reference.getTime() + offsetMs);

    // getUTCDay on the shifted instant gives the local weekday. 0 = Sunday, and
    // the week runs Monday to Sunday, so Sunday is six days after its Monday.
    const weekday = local.getUTCDay();
    const daysSinceMonday = (weekday + 6) % 7;

    const localMidnight = Date.UTC(
      local.getUTCFullYear(),
      local.getUTCMonth(),
      local.getUTCDate() - daysSinceMonday,
    );

    const start = new Date(localMidnight - offsetMs);
    return {
      start,
      end: new Date(start.getTime() + 7 * 86_400_000),
      startsOn: new Date(localMidnight).toISOString().slice(0, 10),
    };
  }

  /** Local weekday index, 0 = Monday .. 6 = Sunday. */
  private weekdayOf(instant: Date): number {
    const local = new Date(instant.getTime() + 60 * 60_000);
    return (local.getUTCDay() + 6) % 7;
  }

  /** `HH:mm` in Africa/Douala. */
  private localTime(instant: Date): string {
    return new Intl.DateTimeFormat('en-GB', {
      timeZone: PLATFORM_TIMEZONE,
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).format(instant);
  }

  /**
   * One week of lessons for one grouping, laid out Monday to Sunday.
   *
   * Cancelled lessons are included and marked rather than hidden: a timetable
   * that silently drops them makes a teacher's disappearing Tuesday invisible,
   * and that is exactly the thing an operator is looking at this screen to find.
   */
  async week(input: { grouping: ScheduleGrouping; reference?: Date; actorId: string }) {
    const { start, end, startsOn } = this.weekBounds(input.reference ?? new Date());

    const sessions = await this.prisma.session.findMany({
      where: {
        startsAtUtc: { gte: start, lt: end },
        ...(input.grouping === 'private'
          ? { type: 'one_to_one' }
          : {
              // A group lesson's band comes from its cohort's level; a
              // one-to-one's from the learner's. Either match counts.
              OR: [
                { learner: { level: { schoolType: input.grouping } } },
                { cohort: { level: { schoolType: input.grouping } } },
              ],
            }),
      },
      include: {
        teacher: { include: { user: { select: { id: true, fullName: true } } } },
        subject: { select: { id: true, code: true, nameEn: true, nameFr: true } },
        learner: {
          select: { id: true, fullName: true, level: { select: { nameEn: true, nameFr: true } } },
        },
        cohort: {
          select: {
            id: true,
            name: true,
            level: { select: { nameEn: true, nameFr: true } },
            _count: { select: { members: true } },
          },
        },
      },
      orderBy: { startsAtUtc: 'asc' },
    });

    const now = Date.now();

    const entries = sessions.map((session) => ({
      sessionId: session.id,
      weekday: this.weekdayOf(session.startsAtUtc),
      startsAtUtc: session.startsAtUtc,
      startTime: this.localTime(session.startsAtUtc),
      endTime: this.localTime(new Date(session.startsAtUtc.getTime() + session.durationMin * 60_000)),
      durationMin: session.durationMin,
      status: session.status,
      // The single fact the cell is styled from: is this happening right now.
      live: session.status === 'in_progress',
      cancelled: session.status.startsWith('cancelled') || session.status === 'voided',
      past: session.startsAtUtc.getTime() + session.durationMin * 60_000 < now,

      type: session.type,
      isPrivate: session.type === 'one_to_one',

      // "the course going on that day"
      subject: session.subject,
      teacher: {
        id: session.teacher.user.id,
        fullName: session.teacher.user.fullName,
        schoolType: session.teacher.schoolType,
      },
      level: session.learner?.level ?? session.cohort?.level ?? null,
      learner: session.learner ? { id: session.learner.id, fullName: session.learner.fullName } : null,
      cohort: session.cohort
        ? { id: session.cohort.id, name: session.cohort.name, size: session.cohort._count.members }
        : null,
    }));

    /**
     * FR-RBA-004: a timetable for a band names the learners in one-to-one
     * lessons, which is personal data. One entry for the read, as elsewhere.
     */
    await this.audit.record({
      action: 'staff.viewed_learner',
      entity: 'schedule',
      entityId: input.grouping,
      actorId: input.actorId,
      after: { grouping: input.grouping, weekStartsOn: startsOn, sessionCount: entries.length },
    });

    // Grouped by weekday so the screen renders columns without re-scanning the
    // list seven times, and so an empty day is explicitly empty rather than
    // missing.
    const days = Array.from({ length: 7 }, (_, weekday) => {
      const dayEntries = entries.filter((entry) => entry.weekday === weekday);
      return {
        weekday,
        date: new Date(start.getTime() + weekday * 86_400_000).toISOString().slice(0, 10),
        entries: dayEntries,
        count: dayEntries.length,
        liveCount: dayEntries.filter((e) => e.live).length,
      };
    });

    return {
      grouping: input.grouping,
      weekStartsOn: startsOn,
      days,
      totals: {
        sessions: entries.length,
        live: entries.filter((e) => e.live).length,
        cancelled: entries.filter((e) => e.cancelled).length,
        teachers: new Set(entries.map((e) => e.teacher.id)).size,
      },
    };
  }

  /**
   * The teacher behind a timetable slot, and what they are teaching *now*.
   *
   * "when the admin click on it, the teachers detail will be showing and the
   * current class the teacher is teaching at that moment" — so the answer is
   * two things: the standing facts about the teacher, and the live lesson if
   * there is one, which is usually a different lesson from the one clicked.
   */
  async slotDetail(sessionId: string, actorId: string) {
    const session = await this.prisma.session.findUnique({
      where: { id: sessionId },
      include: {
        teacher: {
          include: {
            user: { select: { id: true, fullName: true, phoneE164: true, email: true } },
            subjects: {
              include: {
                subject: { select: { nameEn: true, nameFr: true } },
                level: { select: { nameEn: true, nameFr: true, schoolType: true } },
              },
            },
            freezes: { where: { liftedAt: null } },
          },
        },
        subject: { select: { id: true, code: true, nameEn: true, nameFr: true } },
        learner: { select: { id: true, fullName: true } },
        cohort: { select: { id: true, name: true } },
      },
    });
    if (!session) return null;

    const teacherId = session.teacherId;
    const monthStart = new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), 1));

    const [nowTeaching, minutesAll, minutesMonth, sessionCount] = await Promise.all([
      // What this teacher is in right now — not necessarily the clicked lesson.
      this.prisma.session.findFirst({
        where: { teacherId, status: 'in_progress' },
        include: {
          subject: { select: { nameEn: true, nameFr: true } },
          learner: { select: { id: true, fullName: true } },
          cohort: { select: { id: true, name: true, _count: { select: { members: true } } } },
          participants: true,
        },
      }),
      this.prisma.sessionParticipant.aggregate({
        where: { userId: teacherId },
        _sum: { attendedMinutes: true },
      }),
      this.prisma.sessionParticipant.aggregate({
        where: { userId: teacherId, session: { startsAtUtc: { gte: monthStart } } },
        _sum: { attendedMinutes: true },
      }),
      this.prisma.session.count({
        where: { teacherId, status: { in: ['completed', 'no_show_learner'] } },
      }),
    ]);

    await this.audit.record({
      action: 'staff.viewed_learner',
      entity: 'schedule_slot',
      entityId: sessionId,
      actorId,
      after: { teacherId, liveSessionId: nowTeaching?.id ?? null },
    });

    const hours = (minutes: number) => Math.round((minutes / 60) * 10) / 10;

    return {
      // The slot that was clicked.
      slot: {
        sessionId: session.id,
        startsAtUtc: session.startsAtUtc,
        startTime: this.localTime(session.startsAtUtc),
        durationMin: session.durationMin,
        status: session.status,
        isPrivate: session.type === 'one_to_one',
        subject: session.subject,
        learner: session.learner,
        cohort: session.cohort,
      },

      // The teacher's standing detail.
      teacher: {
        id: session.teacher.user.id,
        fullName: session.teacher.user.fullName,
        phone: session.teacher.user.phoneE164,
        email: session.teacher.user.email,
        schoolType: session.teacher.schoolType,
        verificationStatus: session.teacher.verificationStatus,
        suspended: Boolean(session.teacher.suspendedAt) || session.teacher.freezes.length > 0,
        yearsExperience: session.teacher.yearsExperience,
        highestQualification: session.teacher.highestQualification,
        ratingAvg: session.teacher.ratingAvg ? Number(session.teacher.ratingAvg) : null,
        ratingCount: session.teacher.ratingCount,
        subjects: session.teacher.subjects.map((pair) => ({
          nameEn: pair.subject.nameEn,
          nameFr: pair.subject.nameFr,
          level: pair.level,
        })),
        hoursAllTime: hours(minutesAll._sum.attendedMinutes ?? 0),
        hoursThisMonth: hours(minutesMonth._sum.attendedMinutes ?? 0),
        sessionsDelivered: sessionCount,
      },

      // What they are teaching at this moment, if anything.
      nowTeaching: nowTeaching
        ? {
            sessionId: nowTeaching.id,
            subject: nowTeaching.subject,
            isPrivate: nowTeaching.type === 'one_to_one',
            startedAt: nowTeaching.startsAtUtc,
            startTime: this.localTime(nowTeaching.startsAtUtc),
            elapsedMinutes: Math.max(
              0,
              Math.round((Date.now() - nowTeaching.startsAtUtc.getTime()) / 60_000),
            ),
            learner: nowTeaching.learner,
            cohort: nowTeaching.cohort
              ? { name: nowTeaching.cohort.name, size: nowTeaching.cohort._count.members }
              : null,
            presentCount: nowTeaching.participants.filter((p) => p.firstJoinAt && !p.lastLeaveAt)
              .length,
            recordingEnabled: nowTeaching.recordingEnabled,
            // True when the clicked slot *is* the live lesson, so the screen can
            // say "this one" rather than showing the same lesson twice.
            isThisSlot: nowTeaching.id === session.id,
          }
        : null,
    };
  }
}
