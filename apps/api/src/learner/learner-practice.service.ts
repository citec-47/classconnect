import { Injectable } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';
import {
  examBoardToDb,
  resolveLevelConfig,
  type ExamBoard,
  type LearnerLevel,
  type Language,
  type PracticeItemDto,
} from '@classconnect/shared';

/**
 * §5.4 — Practice.
 *
 * The listing half only: quizzes, mocks and the past-questions library. The
 * timed runner that consumes them is its own slice, and deliberately so — §5.4
 * calls it "the highest-risk component on this surface" and it deserves to be
 * built against a settled listing rather than alongside one.
 *
 * FR-ASM-009 is nonetheless already load-bearing here. Nothing this service
 * selects touches `answerKey` or `QuestionOption.isCorrect`; it counts questions
 * without reading them. §10's criterion 6 is verified by inspecting the payload,
 * and the payload has nowhere to put a key.
 */
@Injectable()
export class LearnerPracticeService {
  constructor(private readonly prisma: PrismaService) {}

  async list(
    learnerId: string,
    level: LearnerLevel,
    levelId: string | null,
    language: Language,
  ): Promise<PracticeItemDto[]> {
    const config = resolveLevelConfig(level);

    // §3: Primary has no Practice destination at all, so the honest answer to a
    // request for its contents is an empty one. The route 404s as well; this is
    // the same rule applied where the data is, per FR-RBA-002.
    if (!config.showPractice) return [];

    const subjectIds = (
      await this.prisma.learnerSubject.findMany({
        where: { learnerId },
        select: { subjectId: true },
      })
    ).map((row) => row.subjectId);

    if (subjectIds.length === 0) return [];

    const [assessments, attempts] = await Promise.all([
      this.prisma.assessment.findMany({
        where: { subjectId: { in: subjectIds } },
        orderBy: { createdAt: 'desc' },
        take: 60,
        select: {
          id: true,
          title: true,
          type: true,
          durationMin: true,
          attemptsAllowed: true,
          releasePolicy: true,
          subject: { select: { id: true, nameEn: true, nameFr: true } },
          // A count, not the questions. Nothing here can leak a key.
          _count: { select: { questions: true } },
        },
      }),
      this.prisma.attempt.findMany({
        where: { learnerId },
        select: {
          assessmentId: true,
          percentage: true,
          submittedAt: true,
        },
      }),
    ]);

    const byAssessment = new Map<string, { used: number; best: number | null }>();
    for (const attempt of attempts) {
      const entry = byAssessment.get(attempt.assessmentId) ?? { used: 0, best: null };
      entry.used += 1;
      // Only a finished attempt has a score worth showing; an abandoned one
      // must not read as a bad result.
      if (attempt.submittedAt && attempt.percentage !== null) {
        const value = Number(attempt.percentage);
        entry.best = entry.best === null ? value : Math.max(entry.best, value);
      }
      byAssessment.set(attempt.assessmentId, entry);
    }

    const items: PracticeItemDto[] = assessments.map((row) => {
      const progress = byAssessment.get(row.id);
      return {
        id: row.id,
        title: row.title,
        subject: {
          id: row.subject.id,
          name: language === 'fr' ? row.subject.nameFr : row.subject.nameEn,
        },
        kind: row.type === 'mock_exam' ? 'mock' : 'quiz',
        durationMin: row.durationMin,
        questionCount: row._count.questions,
        attemptsAllowed: row.attemptsAllowed,
        attemptsUsed: progress?.used ?? 0,
        /*
         * FR-ASM-004: a deferred-release assessment shows no score until the
         * teacher releases it. Withholding it here rather than in the component
         * means a learner cannot read it out of the network tab either.
         */
        bestPercentage: row.releasePolicy === 'immediate' ? (progress?.best ?? null) : null,
        year: null,
        paperNo: null,
      };
    });

    if (config.showPastPapers && levelId) {
      items.push(...(await this.pastPapers(levelId, subjectIds, config.pastPaperBoard, language)));
    }

    return items;
  }

  /** FR-GCE-002 — filterable by year, paper and topic. */
  private async pastPapers(
    levelId: string,
    subjectIds: string[],
    board: ExamBoard | null,
    language: Language,
  ): Promise<PracticeItemDto[]> {
    const papers = await this.prisma.pastPaper.findMany({
      where: {
        levelId,
        subjectId: { in: subjectIds },
        ...(board ? { boardLevel: examBoardToDb(board) } : {}),
        /*
         * FR-GCE-007 / AS-05: "an item with no recorded right is not
         * publishable". Both flags, not just one — `publishable` is the
         * operator's decision and `rightsStatus` is the evidence for it, and a
         * paper offered to a learner needs each.
         */
        publishable: true,
        rightsStatus: { not: 'unverified' },
      },
      orderBy: [{ year: 'desc' }, { paperNo: 'asc' }],
      take: 40,
      select: {
        id: true,
        year: true,
        paperNo: true,
        subject: { select: { id: true, nameEn: true, nameFr: true } },
      },
    });

    return papers.map((row) => {
      const subjectName = language === 'fr' ? row.subject.nameFr : row.subject.nameEn;
      return {
        id: row.id,
        // The subject and year are proper nouns and a number; the word "Paper"
        // is not, so it stays on the client where it can be translated.
        title: `${subjectName} ${row.year}`,
        subject: { id: row.subject.id, name: subjectName },
        kind: 'past_paper' as const,
        durationMin: null,
        questionCount: 0,
        attemptsAllowed: 0,
        attemptsUsed: 0,
        bestPercentage: null,
        year: row.year,
        paperNo: row.paperNo,
      };
    });
  }
}
