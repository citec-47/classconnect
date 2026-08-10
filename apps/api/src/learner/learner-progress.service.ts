import { Injectable } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';
import {
  PAST_SESSION_STATUSES,
  resolveLevelConfig,
  type LearnerLevel,
  type Language,
  type ProgressDto,
  type TopicScoreDto,
} from '@classconnect/shared';

/**
 * §5.5 — Progress, and the readiness indicator.
 *
 * FR-GCE-004 is the constraint that shapes this file: the figure is "an estimate
 * of preparation" and "never a prediction of an official examination outcome".
 * So it is computed from things the learner has actually done — attendance,
 * homework returned on time, practice scores — and never from anything
 * resembling a forecast. `drivers` ships alongside it because the requirement is
 * a plain-language explanation of what moves the number, and a figure that
 * cannot account for itself is the one that gets quoted back at you in August.
 */

/** How the three inputs combine. Deliberately visible and deliberately simple. */
const READINESS_WEIGHTS = {
  practice: 0.5,
  homework: 0.3,
  attendance: 0.2,
} as const;

@Injectable()
export class LearnerProgressService {
  constructor(private readonly prisma: PrismaService) {}

  async summary(
    learnerId: string,
    level: LearnerLevel,
    language: Language,
  ): Promise<ProgressDto> {
    const config = resolveLevelConfig(level);
    const cohorts = (
      await this.prisma.cohortMember.findMany({
        where: { learnerId, leftAt: null },
        select: { cohortId: true },
      })
    ).map((row) => row.cohortId);

    const [sessions, attendance, assignments, submissions, attempts] = await Promise.all([
      this.prisma.session.count({
        where: {
          OR: [{ learnerId }, { cohortId: { in: cohorts } }],
          status: { in: [...PAST_SESSION_STATUSES] },
        },
      }),
      this.prisma.sessionParticipant.count({
        where: { user: { learnerProfile: { id: learnerId } }, attendedMinutes: { gt: 0 } },
      }),
      this.prisma.workAssignment.count({
        where: { OR: [{ targetLearnerId: learnerId }, { targetCohortId: { in: cohorts } }] },
      }),
      this.prisma.submission.findMany({
        where: { learnerId },
        select: {
          isLate: true,
          submittedAt: true,
          grade: { select: { score: true, gradedAt: true, feedbackText: true } },
          assignment: {
            select: {
              maxScore: true,
              subject: { select: { nameEn: true, nameFr: true } },
              teacher: { select: { user: { select: { fullName: true } } } },
            },
          },
        },
        orderBy: { submittedAt: 'desc' },
        take: 50,
      }),
      this.prisma.attempt.findMany({
        where: { learnerId, submittedAt: { not: null } },
        select: {
          percentage: true,
          submittedAt: true,
          perTopicJson: true,
          assessment: { select: { subject: { select: { nameEn: true, nameFr: true } } } },
        },
        orderBy: { submittedAt: 'desc' },
        take: 50,
      }),
    ]);

    const name = (subject: { nameEn: string; nameFr: string }) =>
      language === 'fr' ? subject.nameFr : subject.nameEn;

    const graded = submissions.filter((row) => row.grade !== null);
    const onTime = submissions.filter((row) => !row.isLate).length;

    const scores = [
      ...attempts
        .filter((row) => row.percentage !== null && row.submittedAt)
        .map((row) => ({
          at: (row.submittedAt as Date).toISOString(),
          subject: name(row.assessment.subject),
          percentage: Number(row.percentage),
        })),
      ...graded.map((row) => ({
        at: (row.grade as { gradedAt: Date }).gradedAt.toISOString(),
        subject: name(row.assignment.subject),
        percentage: Math.round(
          ((row.grade as { score: number }).score / Math.max(row.assignment.maxScore, 1)) * 100,
        ),
      })),
    ]
      .sort((a, b) => b.at.localeCompare(a.at))
      .slice(0, 20);

    const topics = topicScores(attempts, name);

    const attendancePct = percentage(attendance, sessions);
    const homeworkPct = percentage(graded.length, assignments);
    const onTimePct = percentage(onTime, submissions.length);
    const practicePct = average(attempts.map((row) => Number(row.percentage ?? 0)));

    return {
      attendance: { attended: attendance, scheduled: sessions, percentage: attendancePct },
      homework: {
        completed: submissions.length,
        issued: assignments,
        onTimePercentage: onTimePct,
      },
      scores,
      // Highest first for strengths, lowest first for weaknesses. Three of each:
      // enough to act on, few enough to read on a 360px screen.
      strengths: [...topics].sort((a, b) => b.percentage - a.percentage).slice(0, 3),
      weaknesses: [...topics].sort((a, b) => a.percentage - b.percentage).slice(0, 3),
      teacherComments: graded
        .filter((row) => (row.grade as { feedbackText: string | null }).feedbackText)
        .slice(0, 10)
        .map((row) => ({
          at: (row.grade as { gradedAt: Date }).gradedAt.toISOString(),
          // §10 criterion 10 again: a name, never a way to reach them.
          teacher: { displayName: row.assignment.teacher.user.fullName },
          subject: { id: '', name: name(row.assignment.subject) },
          comment: (row.grade as { feedbackText: string }).feedbackText,
        })),
      readiness: config.showReadiness
        ? [
            {
              subject: { id: '', name: '' },
              percentage: Math.round(
                practicePct * READINESS_WEIGHTS.practice +
                  homeworkPct * READINESS_WEIGHTS.homework +
                  attendancePct * READINESS_WEIGHTS.attendance,
              ),
              /*
               * The three inputs, as numbers the learner can check against what
               * they see elsewhere on this screen. FR-GCE-004 asks for a plain
               * explanation; the wording is a translation key on the client, and
               * these are the values it interpolates.
               */
              drivers: [
                { key: 'practice', value: Math.round(practicePct) },
                { key: 'homework', value: homeworkPct },
                { key: 'attendance', value: attendancePct },
              ],
            },
          ]
        : null,
    };
  }

  /** §5.1's card: the single topic worth twenty minutes tonight. FR-GCE-005. */
  async weakestTopic(learnerId: string, language: Language): Promise<TopicScoreDto | null> {
    const attempts = await this.prisma.attempt.findMany({
      where: { learnerId, submittedAt: { not: null } },
      select: {
        perTopicJson: true,
        assessment: { select: { subject: { select: { nameEn: true, nameFr: true } } } },
      },
      take: 50,
    });

    const topics = topicScores(attempts, (subject) =>
      language === 'fr' ? subject.nameFr : subject.nameEn,
    );
    if (topics.length === 0) return null;

    return topics.sort((a, b) => a.percentage - b.percentage)[0] ?? null;
  }
}

interface AttemptRow {
  perTopicJson: unknown;
  assessment: { subject: { nameEn: string; nameFr: string } };
}

/**
 * Folds every attempt's per-topic breakdown into one score per topic.
 *
 * `perTopicJson` is written by the marking pipeline as `{ topic: { correct,
 * total } }`. It is read defensively because it is JSON in a column: a shape
 * that changed under us should cost a missing topic, never a 500 on the whole
 * progress screen.
 */
function topicScores(
  attempts: AttemptRow[],
  subjectName: (subject: { nameEn: string; nameFr: string }) => string,
): TopicScoreDto[] {
  const tally = new Map<string, { subject: string; correct: number; total: number }>();

  for (const attempt of attempts) {
    const perTopic = attempt.perTopicJson;
    if (!perTopic || typeof perTopic !== 'object') continue;

    for (const [topic, raw] of Object.entries(perTopic as Record<string, unknown>)) {
      if (!raw || typeof raw !== 'object') continue;
      const { correct, total } = raw as { correct?: unknown; total?: unknown };
      if (typeof correct !== 'number' || typeof total !== 'number' || total <= 0) continue;

      const key = `${subjectName(attempt.assessment.subject)}::${topic}`;
      const entry = tally.get(key) ?? {
        subject: subjectName(attempt.assessment.subject),
        correct: 0,
        total: 0,
      };
      entry.correct += correct;
      entry.total += total;
      tally.set(key, entry);
    }
  }

  return [...tally.entries()].map(([key, entry]) => ({
    topic: key.split('::')[1] ?? key,
    subject: entry.subject,
    percentage: percentage(entry.correct, entry.total),
    answered: entry.total,
  }));
}

/** Zero rather than NaN: a learner with no history has done 0%, not undefined. */
function percentage(part: number, whole: number): number {
  return whole <= 0 ? 0 : Math.round((part / whole) * 100);
}

function average(values: number[]): number {
  return values.length === 0 ? 0 : values.reduce((a, b) => a + b, 0) / values.length;
}
