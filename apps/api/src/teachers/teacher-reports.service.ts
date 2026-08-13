import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../common/prisma.service';
import { AuditService } from '../audit/audit.service';
import { AppError } from '../common/http-exception.filter';
import {
  weightedAverage,
  totalCoefficient,
  rankByAverage,
  remarkKeyFor,
  type SubmitTermMarksInput,
  type GenerateReportCardsInput,
  type SubjectMark,
} from '@classconnect/shared';
import type { AuthenticatedUser } from '../rbac/decorators';

/**
 * BUILD-PLAN Phase 6 — report sheets.
 *
 * Two acts, deliberately separate, because the brief separates them: a teacher
 * submits their subject's marks, and then — "after all the teachers have submitted
 * their reports" — one click generates every report card in the class.
 *
 * They cannot be the same act. An average and a class position depend on every
 * subject being in; computing either as each teacher saves would publish a
 * position that changes under a family's feet every time a colleague finishes
 * marking.
 *
 * The arithmetic lives in `packages/shared/src/report-cards.ts` as pure functions,
 * per BUILD-PLAN's instruction, so the weighting and the tie rule are testable
 * without a database. This file is the queries around them.
 */
@Injectable()
export class TeacherReportsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /**
   * The class list for one subject and term, with any mark already entered.
   *
   * This is the screen's whole data: a teacher marking Form 3 Maths wants the
   * forty names and what they typed last time, not an empty grid they have to
   * re-key after a dropped connection.
   */
  async classMarks(
    teacherId: string,
    query: { subjectId: string; levelId: string; term: string; academicYear: string },
  ) {
    const teaches = await this.prisma.teacherSubject.findFirst({
      where: { teacherId, subjectId: query.subjectId, levelId: query.levelId },
    });
    if (!teaches) throw AppError.forbidden('errors.timetable.not_your_subject');

    const [learners, existing] = await Promise.all([
      this.prisma.learner.findMany({
        where: {
          levelId: query.levelId,
          approvalState: 'approved',
          archivedAt: null,
          // Only learners actually taking the subject. A report card line for a
          // subject a child does not sit is a mark nobody can explain.
          subjects: { some: { subjectId: query.subjectId } },
        },
        orderBy: { fullName: 'asc' },
        select: { id: true, fullName: true },
      }),
      this.prisma.subjectTermMark.findMany({
        where: {
          subjectId: query.subjectId,
          levelId: query.levelId,
          term: query.term,
          academicYear: query.academicYear,
        },
        select: { learnerId: true, mark: true, coefficient: true, comment: true, updatedAt: true },
      }),
    ]);

    const byLearner = new Map(existing.map((row) => [row.learnerId, row]));

    return {
      subjectId: query.subjectId,
      levelId: query.levelId,
      term: query.term,
      academicYear: query.academicYear,
      // The coefficient belongs to the subject, so it is read back from whatever
      // was saved rather than asked for again per learner.
      coefficient: existing[0]?.coefficient ?? 1,
      learners: learners.map((learner) => {
        const saved = byLearner.get(learner.id);
        return {
          learnerId: learner.id,
          fullName: learner.fullName,
          mark: saved ? Number(saved.mark) : null,
          comment: saved?.comment ?? null,
          submittedAt: saved?.updatedAt.toISOString() ?? null,
        };
      }),
    };
  }

  /**
   * Submitting a subject's marks for a class.
   *
   * Upsert, in one transaction. A teacher correcting one mark re-sends the grid
   * and the correction replaces rather than adding a second row — the unique index
   * on (learner, subject, term, year) is what makes that true rather than hoped
   * for.
   */
  async submitMarks(user: AuthenticatedUser, input: SubmitTermMarksInput) {
    const teaches = await this.prisma.teacherSubject.findFirst({
      where: { teacherId: user.id, subjectId: input.subjectId, levelId: input.levelId },
    });
    if (!teaches) throw AppError.forbidden('errors.timetable.not_your_subject');

    /*
     * Every learner must be at this level.
     *
     * The grid was built from a level query, so this only fires on a tampered or
     * stale request — but without it a mark could be written against a child in
     * another class, and it would appear on their report card looking perfectly
     * ordinary.
     */
    const learnerIds = input.marks.map((mark) => mark.learnerId);
    const eligible = await this.prisma.learner.count({
      where: { id: { in: learnerIds }, levelId: input.levelId },
    });
    if (eligible !== new Set(learnerIds).size) {
      throw AppError.badRequest('errors.report.learner_not_at_level');
    }

    await this.prisma.$transaction(
      input.marks.map((mark) =>
        this.prisma.subjectTermMark.upsert({
          where: {
            learnerId_subjectId_term_academicYear: {
              learnerId: mark.learnerId,
              subjectId: input.subjectId,
              term: input.term,
              academicYear: input.academicYear,
            },
          },
          create: {
            learnerId: mark.learnerId,
            subjectId: input.subjectId,
            teacherId: user.id,
            levelId: input.levelId,
            term: input.term,
            academicYear: input.academicYear,
            mark: new Prisma.Decimal(mark.mark),
            coefficient: input.coefficient,
            comment: mark.comment ?? null,
          },
          update: {
            mark: new Prisma.Decimal(mark.mark),
            coefficient: input.coefficient,
            comment: mark.comment ?? null,
            teacherId: user.id,
          },
        }),
      ),
    );

    await this.audit.record({
      action: 'report.marks_submitted',
      entity: 'subject_term_mark',
      entityId: null,
      actorId: user.id,
      after: {
        subjectId: input.subjectId,
        levelId: input.levelId,
        term: input.term,
        academicYear: input.academicYear,
        learnerCount: input.marks.length,
        coefficient: input.coefficient,
      },
    });

    return { saved: input.marks.length };
  }

  /**
   * Which subjects at this level have had their marks submitted, and which have
   * not.
   *
   * The answer to "can we generate yet". Shown before the button rather than
   * discovered afterwards: a report card generated with two subjects missing is
   * wrong in a way that looks right, and it is the position that goes wrong.
   */
  async readiness(levelId: string, term: string, academicYear: string) {
    const [offered, submitted, learnerCount] = await Promise.all([
      this.prisma.levelSubject.findMany({
        where: { levelId },
        select: { subject: { select: { id: true, nameEn: true, nameFr: true } } },
      }),
      this.prisma.subjectTermMark.groupBy({
        by: ['subjectId'],
        where: { levelId, term, academicYear },
        _count: { _all: true },
      }),
      this.prisma.learner.count({
        where: { levelId, approvalState: 'approved', archivedAt: null },
      }),
    ]);

    const countBySubject = new Map(submitted.map((row) => [row.subjectId, row._count?._all ?? 0]));

    const subjects = offered.map((row) => ({
      id: row.subject.id,
      nameEn: row.subject.nameEn,
      nameFr: row.subject.nameFr,
      marksEntered: countBySubject.get(row.subject.id) ?? 0,
    }));

    return {
      levelId,
      term,
      academicYear,
      learnerCount,
      subjects,
      subjectsWithMarks: subjects.filter((subject) => subject.marksEntered > 0).length,
      // Advisory, not a gate. A subject genuinely not taught this term would
      // otherwise block the whole class for ever, so the decision stays the
      // operator's and this is what they decide with.
      complete: subjects.every((subject) => subject.marksEntered > 0),
    };
  }

  /**
   * One click: every report card for a class, ranked.
   *
   * ## Why this is one transaction and not a background job
   *
   * BUILD-PLAN suggested a background job, on the grounds that forty learners with
   * eight subjects each is not a request. It is, in fact: the whole calculation is
   * two queries and arithmetic in memory — no per-learner round trip and no work
   * proportional to anything but the row count. What made it look like a job was
   * the assumption of a query per child.
   *
   * The write is a transaction because a half-generated class is the one outcome
   * that must not survive: positions computed against a subset are wrong, and they
   * are wrong invisibly.
   */
  async generate(user: AuthenticatedUser, input: GenerateReportCardsInput) {
    const marks = await this.prisma.subjectTermMark.findMany({
      where: {
        levelId: input.levelId,
        term: input.term,
        academicYear: input.academicYear,
      },
      select: {
        learnerId: true,
        subjectId: true,
        teacherId: true,
        mark: true,
        coefficient: true,
        comment: true,
      },
    });

    if (marks.length === 0) throw AppError.badRequest('errors.report.no_marks');

    // Group in memory. One pass, and it is the only place the shape changes.
    const byLearner = new Map<string, SubjectMark[]>();
    const lineData = new Map<string, typeof marks>();
    for (const mark of marks) {
      const list = byLearner.get(mark.learnerId) ?? [];
      list.push({
        subjectId: mark.subjectId,
        mark: Number(mark.mark),
        coefficient: mark.coefficient,
      });
      byLearner.set(mark.learnerId, list);

      const lines = lineData.get(mark.learnerId) ?? [];
      lines.push(mark);
      lineData.set(mark.learnerId, lines);
    }

    const averages = [...byLearner.entries()].map(([learnerId, subjectMarks]) => ({
      learnerId,
      average: weightedAverage(subjectMarks),
    }));

    // The tie rule and the class size live in `report-cards.ts`, tested there.
    const ranked = rankByAverage(averages);
    const rankByLearner = new Map(ranked.map((row) => [row.learnerId, row]));

    const generatedAt = new Date();
    const publishedAt = input.publish ? generatedAt : null;

    const written = await this.prisma.$transaction(async (tx) => {
      const ids: string[] = [];

      for (const [learnerId, subjectMarks] of byLearner.entries()) {
        const position = rankByLearner.get(learnerId);
        const average = position?.average ?? null;

        const card = await tx.reportCard.upsert({
          where: {
            learnerId_term_academicYear: {
              learnerId,
              term: input.term,
              academicYear: input.academicYear,
            },
          },
          create: {
            learnerId,
            levelId: input.levelId,
            term: input.term,
            academicYear: input.academicYear,
            averageMark: average === null ? null : new Prisma.Decimal(average),
            totalCoefficient: totalCoefficient(subjectMarks),
            classPosition: position?.position ?? null,
            classSize: position?.classSize ?? null,
            remark: remarkKeyFor(average),
            generatedBy: user.id,
            generatedAt,
            publishedAt,
          },
          update: {
            levelId: input.levelId,
            averageMark: average === null ? null : new Prisma.Decimal(average),
            totalCoefficient: totalCoefficient(subjectMarks),
            classPosition: position?.position ?? null,
            classSize: position?.classSize ?? null,
            remark: remarkKeyFor(average),
            generatedBy: user.id,
            generatedAt,
            // A regeneration does not silently unpublish a card a family has
            // already seen; publishing is only ever set, never cleared, here.
            ...(publishedAt ? { publishedAt } : {}),
          },
          select: { id: true },
        });

        /*
         * Lines are replaced wholesale.
         *
         * A subject dropped between two generations would otherwise leave its line
         * behind, and the average — computed from the marks — would no longer
         * match the lines printed under it.
         */
        await tx.reportCardLine.deleteMany({ where: { reportCardId: card.id } });
        await tx.reportCardLine.createMany({
          data: (lineData.get(learnerId) ?? []).map((mark) => ({
            reportCardId: card.id,
            subjectId: mark.subjectId,
            mark: mark.mark,
            coefficient: mark.coefficient,
            teacherId: mark.teacherId,
            comment: mark.comment,
          })),
        });

        ids.push(card.id);
      }

      return ids;
    });

    await this.audit.record({
      action: input.publish ? 'report.cards_published' : 'report.cards_generated',
      entity: 'report_card',
      entityId: null,
      actorId: user.id,
      after: {
        levelId: input.levelId,
        term: input.term,
        academicYear: input.academicYear,
        cardCount: written.length,
        published: input.publish,
      },
    });

    return {
      generated: written.length,
      published: input.publish,
      classSize: ranked[0]?.classSize ?? 0,
    };
  }

  /** The generated cards for a class, for the checking screen. */
  async cardsForLevel(levelId: string, term: string, academicYear: string) {
    const cards = await this.prisma.reportCard.findMany({
      where: { levelId, term, academicYear },
      orderBy: [{ classPosition: 'asc' }, { learner: { fullName: 'asc' } }],
      select: {
        id: true,
        averageMark: true,
        classPosition: true,
        classSize: true,
        remark: true,
        publishedAt: true,
        generatedAt: true,
        learner: { select: { id: true, fullName: true } },
        lines: {
          select: {
            mark: true,
            coefficient: true,
            subject: { select: { id: true, nameEn: true, nameFr: true } },
          },
        },
      },
    });

    return {
      cards: cards.map((card) => ({
        id: card.id,
        learner: card.learner,
        average: card.averageMark === null ? null : Number(card.averageMark),
        position: card.classPosition,
        classSize: card.classSize,
        remarkKey: card.remark,
        published: card.publishedAt !== null,
        generatedAt: card.generatedAt.toISOString(),
        lines: card.lines.map((line) => ({
          subject: line.subject,
          mark: Number(line.mark),
          coefficient: line.coefficient,
        })),
      })),
    };
  }
}
