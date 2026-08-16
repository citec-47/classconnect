import { Injectable } from '@nestjs/common';
import { academicCategoryOf, type AcademicCategory, type EnrolmentTypeValue } from '@classconnect/shared';
import { PrismaService } from '../common/prisma.service';
import { TeacherReportsService } from '../teachers/teacher-reports.service';
import type { AuthenticatedUser } from '../rbac/decorators';
import type { GenerateReportCardsInput } from '@classconnect/shared';

/**
 * Academic Results — the admin's view of marks, by category, class and subject.
 *
 * ## What this adds, and what it reuses
 *
 * The compiling was already written. `TeacherReportsService.generate` reads
 * `SubjectTermMark`, averages by coefficient, ranks with competition ranking and
 * upserts one `ReportCard` per learner — so compiling twice corrects rather than
 * duplicates, and `publishedAt` stays null until somebody publishes. None of that
 * is rewritten here; this is the admin's way into it, plus the browsing the brief
 * asks for.
 *
 * ## Why a category is not a query
 *
 * Three of the four categories come from the level and the fourth from the
 * learner's enrolment, so a "category" cannot be a `where` clause on its own.
 * Learners are fetched for the level and then partitioned by
 * `academicCategoryOf` — the same function every other surface uses, so a learner
 * cannot be Primary here and Secondary in the recording library.
 *
 * A private learner at Class One is therefore invisible in Primary Class One and
 * present in Private classes, which is what the brief requires: the two never mix.
 */
@Injectable()
export class AcademicResultsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly reports: TeacherReportsService,
  ) {}

  /**
   * The classes in one category, with how many learners each holds.
   *
   * Levels come from the catalogue rather than from the learners, so a class with
   * nobody in it still appears. An admin looking for Class Two should find it and
   * be told it is empty, not be left wondering whether the screen is broken.
   */
  async classes(category: AcademicCategory) {
    const levels = await this.prisma.level.findMany({
      where: { active: true },
      orderBy: { sortOrder: 'asc' },
      select: { id: true, nameEn: true, nameFr: true, schoolType: true },
    });

    const learners = await this.prisma.learner.findMany({
      where: { status: 'active', levelId: { not: null } },
      select: { id: true, levelId: true, enrolmentType: true, level: { select: { schoolType: true } } },
    });

    const countByLevel = new Map<string, number>();
    for (const learner of learners) {
      if (this.categoryFor(learner) !== category) continue;
      countByLevel.set(learner.levelId!, (countByLevel.get(learner.levelId!) ?? 0) + 1);
    }

    /*
     * Private covers every level from Class One to Upper Sixth, so its class list
     * is the whole catalogue. The school categories show only their own band.
     */
    const relevant =
      category === 'private'
        ? levels
        : levels.filter((level) => level.schoolType === category);

    return {
      classes: relevant.map((level) => ({
        id: level.id,
        nameEn: level.nameEn,
        nameFr: level.nameFr,
        learnerCount: countByLevel.get(level.id) ?? 0,
      })),
    };
  }

  /**
   * The subjects taught in one class, with how many of its learners offer each.
   *
   * Read from what learners actually offer rather than from the curriculum: a
   * subject nobody in this class takes opens onto an empty list, and offering it
   * would promise a page with nothing on it.
   */
  async subjects(category: AcademicCategory, levelId: string) {
    const learners = await this.learnersIn(category, levelId);
    const ids = learners.map((l) => l.id);

    const offered = await this.prisma.learnerSubject.findMany({
      where: { learnerId: { in: ids } },
      select: { subjectId: true, subject: { select: { nameEn: true, nameFr: true } } },
    });

    const byId = new Map<string, { id: string; nameEn: string; nameFr: string; learnerCount: number }>();
    for (const row of offered) {
      const seen = byId.get(row.subjectId);
      if (seen) seen.learnerCount += 1;
      else byId.set(row.subjectId, { id: row.subjectId, ...row.subject, learnerCount: 1 });
    }

    return {
      classSize: learners.length,
      subjects: [...byId.values()].sort((a, b) => a.nameEn.localeCompare(b.nameEn)),
    };
  }

  /**
   * Every learner in this class who offers this subject, with their mark.
   *
   * The mark is null when the teacher has not entered one yet, and that is shown
   * rather than hidden: a blank against a name is the reason a compile would be
   * wrong, and an admin about to press the button should see it first.
   */
  async students(
    category: AcademicCategory,
    levelId: string,
    subjectId: string,
    term: string,
    academicYear: string,
  ) {
    const learners = await this.learnersIn(category, levelId);
    const ids = learners.map((l) => l.id);

    const [offers, marks] = await Promise.all([
      this.prisma.learnerSubject.findMany({
        where: { learnerId: { in: ids }, subjectId },
        select: { learnerId: true },
      }),
      this.prisma.subjectTermMark.findMany({
        where: { learnerId: { in: ids }, subjectId, term, academicYear },
        select: { learnerId: true, mark: true, coefficient: true, teacherId: true },
      }),
    ]);

    const offering = new Set(offers.map((o) => o.learnerId));
    const markBy = new Map(marks.map((m) => [m.learnerId, m]));

    return {
      students: learners
        .filter((learner) => offering.has(learner.id))
        .map((learner) => {
          const mark = markBy.get(learner.id);
          return {
            learnerId: learner.id,
            fullName: learner.fullName,
            mark: mark ? Number(mark.mark) : null,
            coefficient: mark?.coefficient ?? null,
          };
        })
        .sort((a, b) => a.fullName.localeCompare(b.fullName)),
    };
  }

  /**
   * Compiles the class, which is the button the brief describes.
   *
   * Delegated rather than reimplemented: the averaging, the competition ranking
   * and the upsert all live in `TeacherReportsService.generate`, and a second
   * implementation of a ranking is two rankings free to disagree about a child's
   * position.
   *
   * `publish` is what reaches a learner. Generating leaves `publishedAt` null, so
   * an admin can compile, look, correct a mark and compile again before anything
   * appears on a dashboard — and compiling again replaces rather than duplicates.
   */
  async compile(user: AuthenticatedUser, input: GenerateReportCardsInput) {
    return this.reports.generate(user, input);
  }

  /** The learners of one class *in one category*, which is not the same thing. */
  private async learnersIn(category: AcademicCategory, levelId: string) {
    const learners = await this.prisma.learner.findMany({
      where: { status: 'active', levelId },
      select: {
        id: true,
        fullName: true,
        enrolmentType: true,
        level: { select: { schoolType: true } },
      },
      orderBy: { fullName: 'asc' },
    });
    return learners.filter((learner) => this.categoryFor(learner) === category);
  }

  private categoryFor(learner: {
    enrolmentType: string;
    level: { schoolType: string } | null;
  }): AcademicCategory | null {
    return academicCategoryOf({
      enrolmentType: learner.enrolmentType as EnrolmentTypeValue,
      schoolType: learner.level?.schoolType,
    });
  }
}
