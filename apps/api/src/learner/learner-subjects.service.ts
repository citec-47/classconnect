import { Injectable } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';
import {
  PLATFORM_TIMEZONE,
  type LearnerSubjectDto,
  type LearnerSubjectsDto,
  type TimetableSlotDto,
} from '@classconnect/shared';

/**
 * Subjects, and the timetable that hangs off them.
 *
 * The learner's *level* is not a filter applied here. It is already true of the
 * data: a learner is enrolled in subjects through `learner_subjects`, and those
 * rows were only offerable because `level_subjects` permitted them at
 * enrolment. Re-deriving "which subjects suit Form 3" at read time would put a
 * second copy of the catalogue's rules somewhere nobody maintains, and the two
 * copies would disagree the first time a learner changed level mid-year.
 *
 * So the level shapes the timetable by having already shaped the enrolment, and
 * this service reports what is true rather than recomputing what should be.
 */
@Injectable()
export class LearnerSubjectsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(
    learnerId: string,
    language: 'en' | 'fr',
    userId: string,
  ): Promise<LearnerSubjectsDto> {
    const { weekStart, weekEnd } = currentWeek();

    const [learner, enrolments, sessions] = await Promise.all([
      // `findUnique`, not `findUniqueOrThrow`: the controller has already
      // resolved this learner, so a miss here is a race rather than a request
      // error, and an empty class label beats a 500 on a learner's phone.
      this.prisma.learner.findUnique({
        where: { id: learnerId },
        select: { level: { select: { nameEn: true, nameFr: true } } },
      }),
      this.prisma.learnerSubject.findMany({
        where: { learnerId },
        select: {
          subject: {
            select: { id: true, code: true, nameEn: true, nameFr: true, sortOrder: true },
          },
        },
      }),
      // The week's sessions, one query rather than one per subject.
      this.prisma.session.findMany({
        where: {
          startsAtUtc: { gte: weekStart, lt: weekEnd },
          status: { notIn: ['cancelled_by_learner', 'cancelled_by_teacher'] },
          OR: [{ learnerId }, { cohort: { members: { some: { learnerId } } } }],
        },
        select: {
          id: true,
          startsAtUtc: true,
          durationMin: true,
          type: true,
          subject: { select: { id: true, nameEn: true, nameFr: true } },
          teacher: {
            select: {
              userId: true,
              user: { select: { fullName: true } },
            },
          },
        },
        orderBy: { startsAtUtc: 'asc' },
      }),
    ]);

    const subjectIds = enrolments.map((row) => row.subject.id);

    const [assignments, counts, ratings] = await Promise.all([
      this.prisma.assignment.findMany({
        where: { learnerId, subjectId: { in: subjectIds }, status: 'accepted', endedAt: null },
        select: {
          subjectId: true,
          teacher: {
            select: { userId: true, user: { select: { fullName: true } } },
          },
        },
      }),
      this.counts(learnerId, subjectIds),
      this.prisma.review.findMany({
        where: { raterId: userId, session: { subjectId: { in: subjectIds } } },
        select: { stars: true, session: { select: { subjectId: true } } },
        orderBy: { createdAt: 'desc' },
      }),
    ]);

    const teacherBySubject = new Map(assignments.map((a) => [a.subjectId, a.teacher]));
    const ratingBySubject = new Map<string, number>();
    for (const review of ratings) {
      // Ordered newest first, so the first one wins and later ones are history.
      if (!ratingBySubject.has(review.session.subjectId)) {
        ratingBySubject.set(review.session.subjectId, review.stars);
      }
    }

    const subjects: LearnerSubjectDto[] = enrolments
      .sort((a, b) => a.subject.sortOrder - b.subject.sortOrder)
      .map(({ subject }) => {
        const teacher = teacherBySubject.get(subject.id);
        return {
          subject: {
            id: subject.id,
            name: language === 'fr' ? subject.nameFr : subject.nameEn,
          },
          teacher: teacher
            ? { id: teacher.userId, displayName: teacher.user.fullName }
            : null,
          upcomingCount: counts.upcoming.get(subject.id) ?? 0,
          recordingCount: counts.recordings.get(subject.id) ?? 0,
          outstandingWorkCount: counts.work.get(subject.id) ?? 0,
          myRating: ratingBySubject.get(subject.id) ?? null,
          // FR-RAT-001 is about a *completed* session, and there is nothing to
          // rate about a teacher who has not been assigned yet.
          canRate: Boolean(teacher),
        };
      });

    const now = Date.now();
    const timetable: TimetableSlotDto[] = sessions.map((session) => ({
      sessionId: session.id,
      subject: {
        id: session.subject.id,
        name: language === 'fr' ? session.subject.nameFr : session.subject.nameEn,
      },
      teacher: session.teacher
        ? { id: session.teacher.userId, displayName: session.teacher.user.fullName }
        : null,
      startsAt: session.startsAtUtc.toISOString(),
      durationMin: session.durationMin,
      type: session.type === 'group' ? 'group' : 'one_to_one',
      weekday: doualaWeekday(session.startsAtUtc),
      // FR-LIV-003: from 10 minutes before the start until the scheduled end.
      joinable:
        now >= session.startsAtUtc.getTime() - 10 * 60_000 &&
        now <= session.startsAtUtc.getTime() + session.durationMin * 60_000,
    }));

    return {
      /*
       * `Learner.level` is nullable — a record can exist before an Admin has
       * set a class. An empty label is the honest answer; guessing a level
       * would change the whole surface on a guess.
       */
      levelLabel:
        (language === 'fr' ? learner?.level?.nameFr : learner?.level?.nameEn) ?? '',
      subjects,
      timetable,
      weekStart: weekStart.toISOString().slice(0, 10),
    };
  }

  /**
   * The three badge numbers, grouped in the database rather than in memory.
   *
   * Three `groupBy` calls beat one query per subject: a Lower Sixth learner has
   * four subjects and an Adult Learner has two, but a Form 3 learner has nine,
   * and nine round trips at 300ms RTT is three seconds of nothing (NFR-PER-003).
   */
  private async counts(learnerId: string, subjectIds: string[]) {
    const now = new Date();

    // Needed by the work query, which targets cohorts by id rather than by
    // relation. One extra round trip, and it is the only place that needs it.
    const cohortIds = (
      await this.prisma.cohortMember.findMany({
        where: { learnerId },
        select: { cohortId: true },
      })
    ).map((row) => row.cohortId);

    const [upcoming, recordings, work] = await Promise.all([
      this.prisma.session.groupBy({
        by: ['subjectId'],
        where: {
          subjectId: { in: subjectIds },
          startsAtUtc: { gte: now },
          status: 'scheduled',
          OR: [{ learnerId }, { cohort: { members: { some: { learnerId } } } }],
        },
        _count: { _all: true },
      }),
      this.prisma.session.groupBy({
        by: ['subjectId'],
        where: {
          subjectId: { in: subjectIds },
          recordings: { some: { availableUntil: { gt: now } } },
          OR: [{ learnerId }, { cohort: { members: { some: { learnerId } } } }],
        },
        _count: { _all: true },
      }),
      /*
       * `WorkAssignment` targets a learner or a cohort by its own columns
       * rather than by relation, so the reach test spells them out. Same rule
       * as everywhere else on this surface: issued to me directly, or to a
       * cohort I belong to.
       */
      this.prisma.workAssignment.groupBy({
        by: ['subjectId'],
        where: {
          subjectId: { in: subjectIds },
          OR: [
            { targetLearnerId: learnerId },
            { targetCohortId: { in: cohortIds } },
          ],
          submissions: { none: { learnerId } },
        },
        _count: { _all: true },
      }),
    ]);

    const toMap = (rows: { subjectId: string; _count: { _all: number } | unknown }[]) =>
      new Map(
        rows.map((row) => [
          row.subjectId,
          (row._count as { _all: number } | undefined)?._all ?? 0,
        ]),
      );

    return { upcoming: toMap(upcoming), recordings: toMap(recordings), work: toMap(work) };
  }
}

/** Monday 00:00 Africa/Douala, as a UTC instant, and the Monday after it. */
function currentWeek(): { weekStart: Date; weekEnd: Date } {
  const now = new Date();
  const douala = new Date(now.getTime() + OFFSET_MS);
  // getUTCDay on the shifted clock reads as local Douala time. 0 = Sunday.
  const daysSinceMonday = (douala.getUTCDay() + 6) % 7;
  const midnight = Date.UTC(
    douala.getUTCFullYear(),
    douala.getUTCMonth(),
    douala.getUTCDate() - daysSinceMonday,
  );
  const weekStart = new Date(midnight - OFFSET_MS);
  return { weekStart, weekEnd: new Date(weekStart.getTime() + 7 * 86_400_000) };
}

/** 1 = Monday … 7 = Sunday, in Africa/Douala. */
function doualaWeekday(instant: Date): number {
  const shifted = new Date(instant.getTime() + OFFSET_MS);
  return ((shifted.getUTCDay() + 6) % 7) + 1;
}

/**
 * Africa/Douala is UTC+1 and does not observe daylight saving (§2.4), so a
 * fixed offset is correct here rather than merely convenient. `PLATFORM_TIMEZONE`
 * is imported so this constant is impossible to read without meeting the name
 * it belongs to.
 */
const OFFSET_MS = 60 * 60 * 1000;
void PLATFORM_TIMEZONE;
