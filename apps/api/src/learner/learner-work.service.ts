import { Injectable } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';
import { AppError } from '../common/http-exception.filter';
import type { GradeDto, HomeworkDto, Language, MaterialDto } from '@classconnect/shared';

/**
 * §5.3 — Work: two lists and a library.
 *
 * Homework reaches a learner two ways, exactly as sessions do: addressed to them
 * personally, or to a cohort they belong to. Both are folded together here so
 * the learner sees one list of what they owe rather than a structural detail of
 * how it was set.
 */
@Injectable()
export class LearnerWorkService {
  constructor(private readonly prisma: PrismaService) {}

  private async cohortIds(learnerId: string): Promise<string[]> {
    const rows = await this.prisma.cohortMember.findMany({
      where: { learnerId, leftAt: null },
      select: { cohortId: true },
    });
    return rows.map((row) => row.cohortId);
  }

  /**
   * Handing work in.
   *
   * This did not exist. `Submission` was read by the learner's work list, the
   * progress screen, the teacher's marking screen and the admin dashboard — and
   * nothing anywhere created one, so every learner's work was permanently "to
   * do" and every teacher's marking queue was permanently empty. The read paths
   * were all correct and all fed by nothing.
   *
   * ## Entitlement is the same rule the list uses
   *
   * An assignment reaches a learner by naming them or by naming a cohort they
   * belong to. That is exactly the filter `all()` applies, so it is applied here
   * too rather than trusting that the id came from a list this learner saw — a
   * work id in a URL is not permission, and a classmate's assignment id is easy
   * to guess from one's own.
   *
   * ## Lateness and locking are decided here, not sent
   *
   * `isLate` is computed from the server clock against `dueAt`, because a
   * client-reported timestamp is a number the person being marked late chooses.
   * `locksAt` refuses the hand-in outright: FR-HWK-004 accepts late work and
   * marks it late, and the brief's "the group automatically locks" is what stops
   * it entirely.
   *
   * ## Versions rather than overwrites
   *
   * FR-HWK-005 retains every version, so a resubmission is a new row with the
   * next version number. The learner's current state is the latest one, which is
   * what every read above already assumes.
   */
  async submit(
    learnerId: string,
    assignmentId: string,
    bodyText: string,
  ): Promise<{ submissionId: string; version: number; isLate: boolean }> {
    const cohorts = await this.cohortIds(learnerId);

    const assignment = await this.prisma.workAssignment.findFirst({
      where: {
        id: assignmentId,
        OR: [{ targetLearnerId: learnerId }, { targetCohortId: { in: cohorts } }],
      },
      select: { id: true, dueAt: true, locksAt: true },
    });
    /*
     * Not found rather than forbidden: a 403 would confirm the assignment exists
     * to a learner with no business knowing it does.
     */
    if (!assignment) throw AppError.notFound();

    const now = new Date();
    if (assignment.locksAt && assignment.locksAt.getTime() <= now.getTime()) {
      throw AppError.badRequest('errors.work.locked');
    }

    const latest = await this.prisma.submission.findFirst({
      where: { assignmentId, learnerId },
      orderBy: { version: 'desc' },
      select: { version: true },
    });

    const created = await this.prisma.submission.create({
      data: {
        assignmentId,
        learnerId,
        bodyText,
        submittedAt: now,
        isLate: now.getTime() > assignment.dueAt.getTime(),
        version: (latest?.version ?? 0) + 1,
      },
      select: { id: true, version: true, isLate: true },
    });

    return { submissionId: created.id, version: created.version, isLate: created.isLate };
  }

  /**
   * Everything issued to this learner, with their own submission attached.
   *
   * One query rather than three. The three lists §5.3 asks for — to do, handed
   * in, marked — are three *states* of the same row, and splitting them at the
   * database would make "submitted but not yet marked" and "never started" into
   * separate concepts they are not.
   */
  async all(learnerId: string, language: Language): Promise<HomeworkDto[]> {
    const cohorts = await this.cohortIds(learnerId);

    const assignments = await this.prisma.workAssignment.findMany({
      where: {
        OR: [{ targetLearnerId: learnerId }, { targetCohortId: { in: cohorts } }],
      },
      orderBy: { dueAt: 'asc' },
      include: {
        subject: { select: { id: true, nameEn: true, nameFr: true } },
        // §10 criterion 10: the name only, selected explicitly.
        teacher: { select: { user: { select: { fullName: true } } } },
        submissions: {
          where: { learnerId },
          // FR-HWK-005 retains every version; the learner's current state is
          // the latest one.
          orderBy: { version: 'desc' },
          take: 1,
          include: { grade: true },
        },
      },
    });

    return assignments.map((row) => {
      const submission = row.submissions[0];
      const grade = submission?.grade ?? null;

      return {
        id: row.id,
        title: row.title,
        subject: {
          id: row.subject.id,
          name: language === 'fr' ? row.subject.nameFr : row.subject.nameEn,
        },
        teacher: { displayName: row.teacher.user.fullName },
        dueAt: row.dueAt.toISOString(),
        maxScore: row.maxScore,
        isLate: submission
          ? submission.isLate
          : // Nothing handed in and the deadline gone: late now, not late once
            // someone gets round to marking it.
            row.dueAt.getTime() < Date.now(),
        state: grade ? 'graded' : submission ? 'submitted' : 'to_do',
        submittedAt: submission?.submittedAt.toISOString() ?? null,
        grade: grade ? toGradeDto(grade, row.maxScore) : null,
      } satisfies HomeworkDto;
    });
  }

  /** §5.1's card: what is owed, soonest first. FR-HWK-004. */
  async due(learnerId: string, language: Language, limit = 5): Promise<HomeworkDto[]> {
    const all = await this.all(learnerId, language);
    return all.filter((item) => item.state === 'to_do').slice(0, limit);
  }

  /** §5.1's card: FR-HWK-007, marked since the learner last looked. */
  async newlyGraded(learnerId: string, language: Language, limit = 5): Promise<HomeworkDto[]> {
    const all = await this.all(learnerId, language);
    return all
      .filter((item) => item.grade !== null)
      .sort((a, b) => (b.grade?.gradedAt ?? '').localeCompare(a.grade?.gradedAt ?? ''))
      .slice(0, limit);
  }

  /**
   * FR-MAT-002 — the library, filtered to what this learner may see.
   *
   * FR-FIL-005 gives every file a visibility scope, and FR-FIL-001 quarantines
   * anything the malware scan has not cleared. Both are applied here rather than
   * being left to the download endpoint: a title in a list is already a
   * disclosure, and an item that cannot be opened should not be offered.
   */
  async materials(
    learnerId: string,
    levelId: string | null,
    language: Language,
  ): Promise<MaterialDto[]> {
    if (!levelId) return [];
    const cohorts = await this.cohortIds(learnerId);

    const materials = await this.prisma.material.findMany({
      where: {
        levelId,
        scanStatus: 'clean',
        // A draft belongs to the teacher until they release it. The same rule as
        // `learner-materials.service.ts`; both learner-facing reads carry it,
        // because a lesson leaking through the Work screen is the same leak.
        publishedAt: { not: null },
        OR: [
          { visibilityScope: 'level' },
          { targetLearnerId: learnerId },
          { targetCohortId: { in: cohorts } },
        ],
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
      include: { subject: { select: { id: true, nameEn: true, nameFr: true } } },
    });

    return materials.map((row) => ({
      id: row.id,
      title: row.title,
      subject: {
        id: row.subject.id,
        name: language === 'fr' ? row.subject.nameFr : row.subject.nameEn,
      },
      topic: row.topic,
      mimeType: row.mimeType,
      // NFR-BAN-002: the client shows this before any download.
      sizeBytes: row.sizeBytes,
      createdAt: row.createdAt.toISOString(),
    }));
  }
}

function toGradeDto(
  grade: {
    score: number;
    feedbackText: string | null;
    feedbackAudioKey: string | null;
    annotationsKey: string | null;
    gradedAt: Date;
  },
  maxScore: number,
): GradeDto {
  return {
    score: grade.score,
    maxScore,
    feedbackText: grade.feedbackText,
    /*
     * Presence flags rather than the storage keys themselves. A key is a
     * capability — anything holding one can ask for the file — and the list
     * screen only needs to know whether to draw an icon. The keys are issued as
     * signed URLs by the files module when something is actually opened.
     */
    hasAudioFeedback: grade.feedbackAudioKey !== null,
    hasAnnotations: grade.annotationsKey !== null,
    gradedAt: grade.gradedAt.toISOString(),
    /*
     * FR-HWK-007 wants "since last visit". There is no per-learner read marker
     * in the schema yet, so this approximates it with a recency window rather
     * than inventing a column in a slice that is not about that. A grade less
     * than a week old reads as new, which is the right answer far more often
     * than always-new or never-new.
     */
    unread: Date.now() - grade.gradedAt.getTime() < 7 * 24 * 60 * 60 * 1000,
  };
}
