import { Injectable } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';
import { AppError } from '../common/http-exception.filter';
import type { Language } from '@classconnect/shared';

/**
 * My lessons — the materials a teacher published to this learner's class.
 *
 * Distinct from `LearnerLessonsService`, which despite its name serves the
 * *recordings* of lessons that happened. That collision reached the URL bar —
 * `/student/lessons` showed class videos — and is why this one is named for the
 * table it reads rather than for the word on the screen.
 *
 * ## What a learner may see
 *
 * The same rule the rest of the learner surface applies, and it is applied here
 * rather than trusted from the caller: the material sits at their level, has
 * passed the virus scan, and is either published to the whole level, addressed
 * to them, or addressed to a cohort they belong to. On top of that, the subject
 * has to be one they are actually enrolled in — a Form 4 learner who does not
 * take Chemistry has no business being shown the Chemistry worksheets, even
 * though they sit at the same level.
 *
 * ## Unread
 *
 * Counted as "materials I can see, minus the ones I have opened". There is no
 * row until a learner opens something, so a lesson published to a class of
 * thirty writes nothing, and a learner who joins the class next week correctly
 * finds it unread rather than needing rows backfilled for them.
 */
@Injectable()
export class LearnerMaterialsService {
  constructor(private readonly prisma: PrismaService) {}

  private async cohortIds(learnerId: string): Promise<string[]> {
    const rows = await this.prisma.cohortMember.findMany({
      where: { learnerId, leftAt: null },
      select: { cohortId: true },
    });
    return rows.map((row) => row.cohortId);
  }

  /**
   * The `where` every read here shares.
   *
   * One definition, used by the list, the counts and the entitlement check on
   * marking something read — so a material that is invisible in the list cannot
   * be marked read by guessing its id, and the three cannot drift apart.
   */
  private async visible(learnerId: string, levelId: string, subjectIds: string[]) {
    const cohorts = await this.cohortIds(learnerId);
    return {
      levelId,
      subjectId: { in: subjectIds },
      // FR-FIL-004: nothing unscanned is ever offered to a child.
      scanStatus: 'clean',
      /*
       * A draft is the teacher's, not the class's.
       *
       * Enforced in the `where` rather than filtered afterwards, so an unpublished
       * lesson is not merely hidden — it is not in the result, cannot be counted
       * towards an unread badge, and cannot be reached by its id.
       */
      publishedAt: { not: null },
      OR: [
        { visibilityScope: 'level' },
        { targetLearnerId: learnerId },
        { targetCohortId: { in: cohorts } },
      ],
    };
  }

  /** The subjects this learner takes, and how much is waiting in each. */
  private async enrolledSubjectIds(learnerId: string): Promise<string[]> {
    const rows = await this.prisma.learnerSubject.findMany({
      where: { learnerId },
      select: { subjectId: true },
    });
    return rows.map((row) => row.subjectId);
  }

  /**
   * The sidebar list: one row per subject, with an unread count for the badge.
   *
   * Subjects with nothing in them are still listed. A learner opening My
   * lessons and finding four of their seven subjects missing would reasonably
   * conclude the app had lost them; "nothing yet" is information, an absence is
   * a bug report.
   */
  async subjects(
    learnerId: string,
    userId: string,
    levelId: string | null,
    language: Language,
  ) {
    if (!levelId) return [];

    const subjectIds = await this.enrolledSubjectIds(learnerId);
    if (subjectIds.length === 0) return [];

    const where = await this.visible(learnerId, levelId, subjectIds);

    const [subjects, materials, reads] = await Promise.all([
      this.prisma.subject.findMany({
        where: { id: { in: subjectIds } },
        select: { id: true, nameEn: true, nameFr: true },
        orderBy: { nameEn: 'asc' },
      }),
      this.prisma.material.findMany({ where, select: { id: true, subjectId: true } }),
      /*
       * Every read row for this learner, fetched once.
       *
       * The alternative is a count query per subject, which is one round trip
       * per subject to a database in another region — seven subjects is seven
       * times 235ms before the page can paint. The set is small: it holds one
       * row per material this learner has ever opened.
       */
      this.prisma.materialRead.findMany({
        where: { userId },
        select: { materialId: true },
      }),
    ]);

    const readIds = new Set(reads.map((row) => row.materialId));
    const counts = new Map<string, { total: number; unread: number }>();
    for (const material of materials) {
      const entry = counts.get(material.subjectId) ?? { total: 0, unread: 0 };
      entry.total += 1;
      if (!readIds.has(material.id)) entry.unread += 1;
      counts.set(material.subjectId, entry);
    }

    return subjects.map((subject) => ({
      id: subject.id,
      name: language === 'fr' ? subject.nameFr : subject.nameEn,
      total: counts.get(subject.id)?.total ?? 0,
      unread: counts.get(subject.id)?.unread ?? 0,
    }));
  }

  /** Everything published in one subject, newest first, each flagged read or not. */
  async bySubject(
    learnerId: string,
    userId: string,
    levelId: string | null,
    subjectId: string,
    language: Language,
  ) {
    if (!levelId) return [];

    const subjectIds = await this.enrolledSubjectIds(learnerId);
    /*
     * Not enrolled is "nothing here", not "forbidden".
     *
     * A 403 on a subject id confirms the subject exists and that this learner is
     * not in it. An empty list says the same thing to the person who is meant to
     * be here and nothing at all to anyone else.
     */
    if (!subjectIds.includes(subjectId)) return [];

    const where = await this.visible(learnerId, levelId, [subjectId]);

    const [materials, reads] = await Promise.all([
      this.prisma.material.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: 200,
        include: { subject: { select: { id: true, nameEn: true, nameFr: true } } },
      }),
      this.prisma.materialRead.findMany({ where: { userId }, select: { materialId: true } }),
    ]);

    const readIds = new Set(reads.map((row) => row.materialId));

    return materials.map((row) => ({
      id: row.id,
      title: row.title,
      subject: {
        id: row.subject.id,
        name: language === 'fr' ? row.subject.nameFr : row.subject.nameEn,
      },
      topic: row.topic,
      mimeType: row.mimeType,
      // NFR-BAN-002: the size is shown before any download on a metered
      // connection, so a learner decides rather than discovers.
      sizeBytes: row.sizeBytes,
      createdAt: row.createdAt.toISOString(),
      read: readIds.has(row.id),
    }));
  }

  /**
   * Opening a lesson marks it read.
   *
   * Entitlement is re-checked here against the same `visible` clause the list
   * uses, so the badge cannot be cleared for a material this learner was never
   * shown — an unread count is a small thing to protect, but the check also
   * stops a guessed id proving that a material exists.
   *
   * Idempotent, and keeps the first read rather than the last: `skipDuplicates`
   * makes a second open a no-op, because "when did this child first see it" is
   * the question a teacher asks, and re-reading is not a new event.
   */
  async markRead(
    learnerId: string,
    userId: string,
    levelId: string | null,
    materialId: string,
  ): Promise<{ read: true }> {
    if (!levelId) throw AppError.notFound();

    const subjectIds = await this.enrolledSubjectIds(learnerId);
    if (subjectIds.length === 0) throw AppError.notFound();

    const where = await this.visible(learnerId, levelId, subjectIds);
    const material = await this.prisma.material.findFirst({
      where: { ...where, id: materialId },
      select: { id: true },
    });
    if (!material) throw AppError.notFound();

    await this.prisma.materialRead.createMany({
      data: [{ materialId, userId }],
      skipDuplicates: true,
    });

    return { read: true };
  }
}
