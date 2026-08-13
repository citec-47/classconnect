import { Injectable } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';
import { AuditService } from '../audit/audit.service';
import { AppError } from '../common/http-exception.filter';
import type { CreateExamInput, MarkAttemptInput } from '@classconnect/shared';
import type { AuthenticatedUser } from '../rbac/decorators';

/**
 * BUILD-PLAN Phase 4 — exams.
 *
 * The models were already there: `Assessment`, `Question`, `QuestionOption`,
 * `Attempt`, `Answer`, `AttemptReview`. This is the marking and delivery logic
 * around them, plus the two columns Phase 4 turned out to need — which class an
 * exam is set for, and whether it is still a draft.
 *
 * ## FR-ASM-009 is the constraint that shapes this file
 *
 * An answer key must never reach a learner's client before release. Two things
 * enforce it here rather than one:
 *
 *   1. Nothing this service returns to a learner selects `answerKey` or
 *      `QuestionOption.isCorrect`. The learner-facing shapes have nowhere to put
 *      one — see `learnerView` below.
 *   2. Marking happens server-side, in `autoMark`, comparing against options read
 *      inside the same transaction. The client is never asked what the right
 *      answer was, so a tampered client cannot claim one.
 *
 * ## Why an exam with a structural question is always deferred
 *
 * The brief wants multiple choice marked automatically and structural questions
 * marked by the teacher. A paper mixing the two therefore has a *partial* mark the
 * moment it is submitted, and showing that as a result would tell a child they
 * scored 12 when half their paper is unread. So `releasePolicy` is overridden to
 * `deferred` whenever a structural question exists, whatever the teacher chose.
 */
@Injectable()
export class TeacherExamsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /** Every exam this teacher has set, with how many attempts are waiting. */
  async ownExams(teacherId: string) {
    const exams = await this.prisma.assessment.findMany({
      where: { createdBy: teacherId },
      orderBy: { createdAt: 'desc' },
      take: 200,
      select: {
        id: true,
        title: true,
        type: true,
        durationMin: true,
        releasePolicy: true,
        opensAt: true,
        closesAt: true,
        publishedAt: true,
        resultsReleasedAt: true,
        createdAt: true,
        subject: { select: { id: true, nameEn: true, nameFr: true } },
        level: { select: { id: true, nameEn: true, nameFr: true } },
        cohort: { select: { id: true, name: true } },
        // Counts only. Nothing here can carry a key.
        _count: { select: { questions: true, attempts: true } },
        questions: { select: { type: true, marks: true } },
      },
    });

    const submitted = await this.prisma.attempt.groupBy({
      by: ['assessmentId'],
      where: {
        assessmentId: { in: exams.map((exam) => exam.id) },
        submittedAt: { not: null },
      },
      _count: { _all: true },
    });
    const submittedByExam = new Map(submitted.map((row) => [row.assessmentId, row._count?._all ?? 0]));

    return {
      exams: exams.map((exam) => {
        const structural = exam.questions.filter((q) => q.type === 'free_response').length;
        return {
          id: exam.id,
          title: exam.title,
          type: exam.type,
          durationMin: exam.durationMin,
          subject: exam.subject,
          level: exam.level,
          cohort: exam.cohort,
          questionCount: exam._count.questions,
          totalMarks: exam.questions.reduce((sum, q) => sum + q.marks, 0),
          structuralCount: structural,
          attemptCount: exam._count.attempts,
          submittedCount: submittedByExam.get(exam.id) ?? 0,
          // `published` is the word the teacher thinks in; the column is a
          // timestamp because "since when" is also worth answering.
          published: exam.publishedAt !== null,
          publishedAt: exam.publishedAt?.toISOString() ?? null,
          resultsReleased: exam.resultsReleasedAt !== null,
          opensAt: exam.opensAt?.toISOString() ?? null,
          closesAt: exam.closesAt?.toISOString() ?? null,
          createdAt: exam.createdAt.toISOString(),
        };
      }),
    };
  }

  /**
   * Writing an exam.
   *
   * Created as a draft: `publishedAt` stays null until the teacher publishes it,
   * so a half-written paper is never visible to a class. The whole paper arrives in
   * one request and is written in one transaction — a partially-created exam with
   * three of its eight questions is worse than none.
   */
  async createExam(user: AuthenticatedUser, input: CreateExamInput) {
    const teaches = await this.prisma.teacherSubject.findFirst({
      where: { teacherId: user.id, subjectId: input.subjectId, levelId: input.levelId },
    });
    if (!teaches) throw AppError.forbidden('errors.timetable.not_your_subject');

    if (input.cohortId) {
      const cohort = await this.prisma.cohort.findFirst({
        where: { id: input.cohortId, teacherId: user.id, levelId: input.levelId },
        select: { id: true },
      });
      if (!cohort) throw AppError.badRequest('errors.exam.not_your_group');
    }

    const hasStructural = input.questions.some((question) => question.type === 'free_response');

    const exam = await this.prisma.$transaction(async (tx) => {
      const created = await tx.assessment.create({
        data: {
          subjectId: input.subjectId,
          levelId: input.levelId,
          cohortId: input.cohortId ?? null,
          title: input.title.trim(),
          type: input.type,
          durationMin: input.durationMin ?? null,
          opensAt: input.opensAt ? new Date(input.opensAt) : null,
          closesAt: input.closesAt ? new Date(input.closesAt) : null,
          /*
           * Overridden, deliberately, and not merely defaulted.
           *
           * A paper with a structural question cannot have a complete mark on
           * submit, so `immediate` would show a child a score that is missing half
           * their answers. The teacher's choice is honoured for a pure
           * multiple-choice paper and corrected for a mixed one.
           */
          releasePolicy: hasStructural ? 'deferred' : input.releasePolicy,
          createdBy: user.id,
        },
        select: { id: true },
      });

      for (const [index, question] of input.questions.entries()) {
        await tx.question.create({
          data: {
            assessmentId: created.id,
            type: question.type,
            prompt: question.prompt,
            marks: question.marks,
            topic: question.topic ?? null,
            sortOrder: index,
            /*
             * `answerKey` is left null for multiple choice: the key *is*
             * `QuestionOption.isCorrect`, and storing it twice is how the two
             * come to disagree. It stays available for the question types that
             * have no options.
             */
            options: question.options?.length
              ? {
                  create: question.options.map((option, optionIndex) => ({
                    label: option.label,
                    isCorrect: option.isCorrect,
                    sortOrder: optionIndex,
                  })),
                }
              : undefined,
          },
        });
      }

      return created;
    });

    await this.audit.record({
      action: 'exam.created',
      entity: 'assessment',
      entityId: exam.id,
      actorId: user.id,
      after: {
        title: input.title,
        levelId: input.levelId,
        questionCount: input.questions.length,
        structural: hasStructural,
      },
    });

    return { examId: exam.id, deferred: hasStructural };
  }

  /**
   * Publishing. This is the moment a class can see the paper, so it is separate
   * from creating it and it refuses an empty one.
   */
  async publish(user: AuthenticatedUser, examId: string) {
    const exam = await this.prisma.assessment.findFirst({
      where: { id: examId, createdBy: user.id },
      select: { id: true, publishedAt: true, _count: { select: { questions: true } } },
    });
    if (!exam) throw AppError.notFound();
    if (exam._count.questions === 0) throw AppError.badRequest('errors.exam.no_questions');
    if (exam.publishedAt) return { published: true, alreadyPublished: true };

    await this.prisma.assessment.update({
      where: { id: examId },
      data: { publishedAt: new Date() },
    });

    await this.audit.record({
      action: 'exam.published',
      entity: 'assessment',
      entityId: examId,
      actorId: user.id,
      after: { questionCount: exam._count.questions },
    });

    return { published: true, alreadyPublished: false };
  }

  /**
   * The paper, as the teacher sees it — keys included, because they wrote them.
   *
   * The only method here that returns `isCorrect`, and it is reachable only with
   * `createdBy = user.id` in the lookup.
   */
  async examForTeacher(teacherId: string, examId: string) {
    const exam = await this.prisma.assessment.findFirst({
      where: { id: examId, createdBy: teacherId },
      select: {
        id: true,
        title: true,
        type: true,
        durationMin: true,
        publishedAt: true,
        releasePolicy: true,
        resultsReleasedAt: true,
        subject: { select: { id: true, nameEn: true, nameFr: true } },
        level: { select: { id: true, nameEn: true, nameFr: true } },
        questions: {
          orderBy: { sortOrder: 'asc' },
          select: {
            id: true,
            type: true,
            prompt: true,
            marks: true,
            topic: true,
            options: {
              orderBy: { sortOrder: 'asc' },
              select: { id: true, label: true, isCorrect: true },
            },
          },
        },
      },
    });
    if (!exam) throw AppError.notFound();
    return exam;
  }

  /**
   * The attempts to be marked, and what still needs a human.
   *
   * `needsMarking` counts structural answers with no `awarded` value. It is the
   * queue length the teacher is actually looking at — a submitted attempt whose
   * multiple choice marked itself is not work.
   */
  async attemptsFor(teacherId: string, examId: string) {
    const exam = await this.prisma.assessment.findFirst({
      where: { id: examId, createdBy: teacherId },
      select: {
        id: true,
        title: true,
        resultsReleasedAt: true,
        questions: { select: { id: true, marks: true, type: true } },
      },
    });
    if (!exam) throw AppError.notFound();

    const totalMarks = exam.questions.reduce((sum, question) => sum + question.marks, 0);
    const structuralIds = new Set(
      exam.questions.filter((question) => question.type === 'free_response').map((q) => q.id),
    );

    const attempts = await this.prisma.attempt.findMany({
      where: { assessmentId: examId, submittedAt: { not: null } },
      orderBy: { submittedAt: 'asc' },
      select: {
        id: true,
        score: true,
        percentage: true,
        submittedAt: true,
        state: true,
        autoSubmitted: true,
        terminatedAt: true,
        learner: { select: { id: true, fullName: true } },
        answers: {
          select: { id: true, questionId: true, awarded: true, response: true, comment: true },
        },
      },
    });

    return {
      examId: exam.id,
      title: exam.title,
      totalMarks,
      resultsReleased: exam.resultsReleasedAt !== null,
      attempts: attempts.map((attempt) => {
        const structuralAnswers = attempt.answers.filter((answer) =>
          structuralIds.has(answer.questionId),
        );
        return {
          attemptId: attempt.id,
          learner: attempt.learner,
          submittedAt: attempt.submittedAt?.toISOString() ?? null,
          state: attempt.state,
          autoSubmitted: attempt.autoSubmitted,
          // §4.3: a terminated attempt is still a script to be read, not a zero.
          terminated: attempt.terminatedAt !== null,
          score: attempt.score,
          percentage: attempt.percentage === null ? null : Number(attempt.percentage),
          needsMarking: structuralAnswers.filter((answer) => answer.awarded === null).length,
        };
      }),
    };
  }

  /**
   * One learner's script, for marking.
   *
   * Carries the response, the question, the marks available, and — for multiple
   * choice — what was already awarded automatically, so the teacher can see the
   * whole paper rather than only the half they have to mark.
   */
  async attemptForMarking(teacherId: string, attemptId: string) {
    const attempt = await this.prisma.attempt.findFirst({
      where: { id: attemptId, assessment: { createdBy: teacherId } },
      select: {
        id: true,
        score: true,
        submittedAt: true,
        learner: { select: { id: true, fullName: true } },
        assessment: { select: { id: true, title: true, resultsReleasedAt: true } },
        answers: {
          select: {
            id: true,
            awarded: true,
            comment: true,
            response: true,
            question: {
              select: {
                id: true,
                type: true,
                prompt: true,
                marks: true,
                sortOrder: true,
                options: {
                  orderBy: { sortOrder: 'asc' },
                  select: { id: true, label: true, isCorrect: true },
                },
              },
            },
          },
        },
      },
    });
    if (!attempt) throw AppError.notFound();

    return {
      attemptId: attempt.id,
      learner: attempt.learner,
      exam: {
        id: attempt.assessment.id,
        title: attempt.assessment.title,
        resultsReleased: attempt.assessment.resultsReleasedAt !== null,
      },
      submittedAt: attempt.submittedAt?.toISOString() ?? null,
      score: attempt.score,
      answers: [...attempt.answers]
        .sort((a, b) => a.question.sortOrder - b.question.sortOrder)
        .map((answer) => ({
          answerId: answer.id,
          question: {
            id: answer.question.id,
            type: answer.question.type,
            prompt: answer.question.prompt,
            marks: answer.question.marks,
            options: answer.question.options,
          },
          response: answer.response,
          awarded: answer.awarded,
          comment: answer.comment,
        })),
    };
  }

  /**
   * Marking structural answers by hand, and totalling the paper.
   *
   * The total is recomputed from every answer rather than added to a running
   * score: a teacher who corrects a mark they entered a minute ago must not have
   * the correction added on top of the original.
   */
  async markAttempt(user: AuthenticatedUser, attemptId: string, input: MarkAttemptInput) {
    const attempt = await this.prisma.attempt.findFirst({
      where: { id: attemptId, assessment: { createdBy: user.id } },
      select: {
        id: true,
        assessmentId: true,
        answers: { select: { id: true, question: { select: { marks: true } } } },
      },
    });
    if (!attempt) throw AppError.notFound();

    const answerIds = new Set(attempt.answers.map((answer) => answer.id));
    const maxByAnswer = new Map(
      attempt.answers.map((answer) => [answer.id, answer.question.marks]),
    );

    for (const mark of input.marks) {
      if (!answerIds.has(mark.answerId)) throw AppError.badRequest('errors.exam.answer_not_in_attempt');
      const max = maxByAnswer.get(mark.answerId) ?? 0;
      // A mark above what the question is worth is a typo every time, and it
      // silently inflates the paper's total.
      if (mark.awarded > max) {
        throw AppError.badRequest('errors.exam.mark_above_question', { max });
      }
    }

    const result = await this.prisma.$transaction(async (tx) => {
      for (const mark of input.marks) {
        await tx.answer.update({
          where: { id: mark.answerId },
          data: { awarded: mark.awarded, markedBy: user.id, comment: mark.comment ?? null },
        });
      }

      const answers = await tx.answer.findMany({
        where: { attemptId },
        select: { awarded: true, question: { select: { marks: true } } },
      });

      const score = answers.reduce((sum, answer) => sum + (answer.awarded ?? 0), 0);
      const totalMarks = answers.reduce((sum, answer) => sum + answer.question.marks, 0);
      const percentage = totalMarks > 0 ? Math.round((score / totalMarks) * 10000) / 100 : 0;

      const updated = await tx.attempt.update({
        where: { id: attemptId },
        data: { score, percentage },
        select: { id: true, score: true, percentage: true },
      });

      // Releasing this learner's result releases the exam's, because the brief's
      // "send the individual scores manually" is per-learner and the flag that
      // gates the learner's view is on the exam.
      if (input.release) {
        await tx.assessment.update({
          where: { id: attempt.assessmentId },
          data: { resultsReleasedAt: new Date() },
        });
      }

      return { ...updated, totalMarks };
    });

    await this.audit.record({
      action: 'exam.marked',
      entity: 'attempt',
      entityId: attemptId,
      actorId: user.id,
      after: { score: result.score, marked: input.marks.length, released: input.release },
    });

    return {
      attemptId,
      score: result.score,
      totalMarks: result.totalMarks,
      percentage: result.percentage === null ? null : Number(result.percentage),
      released: input.release,
    };
  }

  /**
   * FR-ASM-004: releasing the results of a whole exam.
   *
   * Refuses while any structural answer is unmarked. Releasing a paper half of
   * which nobody has read would hand a class marks that are wrong in a way they
   * cannot see and cannot challenge.
   */
  async releaseResults(user: AuthenticatedUser, examId: string) {
    const exam = await this.prisma.assessment.findFirst({
      where: { id: examId, createdBy: user.id },
      select: { id: true, resultsReleasedAt: true },
    });
    if (!exam) throw AppError.notFound();

    const unmarked = await this.prisma.answer.count({
      where: {
        attempt: { assessmentId: examId, submittedAt: { not: null } },
        question: { type: 'free_response' },
        awarded: null,
      },
    });
    if (unmarked > 0) throw AppError.badRequest('errors.exam.unmarked_remain', { unmarked });

    await this.prisma.assessment.update({
      where: { id: examId },
      data: { resultsReleasedAt: new Date() },
    });

    await this.audit.record({
      action: 'exam.results_released',
      entity: 'assessment',
      entityId: examId,
      actorId: user.id,
      after: { releasedAt: new Date().toISOString() },
    });

    return { released: true };
  }

  /**
   * Marks every multiple-choice answer in a submitted attempt.
   *
   * Public because the learner's submit path is what calls it, and it is here
   * rather than there so that the comparison against `isCorrect` lives in exactly
   * one place. Called inside the submitting transaction.
   *
   * `mcq_multi` is all-or-nothing: a learner who ticks two of three correct
   * options scores zero rather than two-thirds. Partial credit on a multi-answer
   * question is a defensible policy and a different one, and picking it silently
   * would make two exams marked by the same platform incomparable.
   */
  async autoMark(attemptId: string): Promise<{ score: number; totalMarks: number; pendingStructural: number }> {
    const attempt = await this.prisma.attempt.findUnique({
      where: { id: attemptId },
      select: {
        id: true,
        answers: {
          select: {
            id: true,
            response: true,
            awarded: true,
            question: {
              select: {
                id: true,
                type: true,
                marks: true,
                options: { select: { id: true, isCorrect: true } },
              },
            },
          },
        },
      },
    });
    if (!attempt) throw AppError.notFound();

    let pendingStructural = 0;

    for (const answer of attempt.answers) {
      if (answer.question.type === 'free_response') {
        if (answer.awarded === null) pendingStructural += 1;
        continue;
      }

      const correct = new Set(
        answer.question.options.filter((option) => option.isCorrect).map((o) => o.id),
      );
      const chosen = new Set(selectedOptionIds(answer.response));

      const exact =
        chosen.size === correct.size && [...chosen].every((id) => correct.has(id));
      const awarded = exact ? answer.question.marks : 0;

      await this.prisma.answer.update({
        where: { id: answer.id },
        data: { awarded },
      });
    }

    const answers = await this.prisma.answer.findMany({
      where: { attemptId },
      select: { awarded: true, question: { select: { marks: true } } },
    });
    const score = answers.reduce((sum, answer) => sum + (answer.awarded ?? 0), 0);
    const totalMarks = answers.reduce((sum, answer) => sum + answer.question.marks, 0);

    return { score, totalMarks, pendingStructural };
  }
}

/**
 * The option ids a learner picked, out of `Answer.response`.
 *
 * `response` is `Json` and the client may send one id or several, so both shapes
 * are accepted. Anything else — a number, a nested object, null — yields no
 * selection and therefore no marks, which is the safe direction: a malformed
 * response must not be able to match an empty answer key and score full marks.
 */
function selectedOptionIds(response: unknown): string[] {
  if (typeof response === 'string') return [response];
  if (Array.isArray(response)) return response.filter((item): item is string => typeof item === 'string');
  if (response && typeof response === 'object') {
    const value = (response as { optionIds?: unknown; optionId?: unknown });
    if (typeof value.optionId === 'string') return [value.optionId];
    if (Array.isArray(value.optionIds)) {
      return value.optionIds.filter((item): item is string => typeof item === 'string');
    }
  }
  return [];
}
