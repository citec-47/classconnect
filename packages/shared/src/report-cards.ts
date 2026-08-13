/**
 * Report cards: the weighted average, and the position in the class.
 *
 * BUILD-PLAN Phase 6, and it lives here as pure functions for the reason that
 * file gives: "Position is the part that will be got wrong: decide explicitly how
 * ties rank, and write the test first." Nothing below touches a database, so the
 * arithmetic can be checked against a hand-computed example.
 *
 * ## The Cameroonian coefficient
 *
 * A mark out of 20 per subject, and each subject carries a coefficient — Maths at
 * 4 counts four times a subject at 1. The average is therefore
 * `Σ(mark × coefficient) / Σ(coefficient)`, not the mean of the marks. Averaging
 * the marks instead is the single most likely bug here and it is invisible on any
 * timetable where every coefficient happens to be 1.
 */

/** The default a mark is out of. Cameroonian schools mark out of 20. */
export const REPORT_MARK_MAX = 20;

export const REPORT_TERMS = ['term_1', 'term_2', 'term_3'] as const;
export type ReportTerm = (typeof REPORT_TERMS)[number];

export interface SubjectMark {
  subjectId: string;
  /** Out of `REPORT_MARK_MAX`. */
  mark: number;
  /** At least 1. A coefficient of 0 would silently drop the subject. */
  coefficient: number;
}

/**
 * `Σ(mark × coefficient) / Σ(coefficient)`, rounded to two places.
 *
 * Returns null rather than 0 for a learner with no marks. Zero is a real average
 * a child can earn, and reporting it for "nothing submitted yet" would put a
 * failing grade on a report card that should have been blank.
 */
export function weightedAverage(marks: readonly SubjectMark[]): number | null {
  const usable = marks.filter((m) => m.coefficient > 0);
  if (usable.length === 0) return null;

  const totalCoefficient = usable.reduce((sum, m) => sum + m.coefficient, 0);
  const weighted = usable.reduce((sum, m) => sum + m.mark * m.coefficient, 0);

  // Two decimal places, which is what a Cameroonian report card carries.
  return Math.round((weighted / totalCoefficient) * 100) / 100;
}

export function totalCoefficient(marks: readonly SubjectMark[]): number {
  return marks.reduce((sum, m) => sum + Math.max(0, m.coefficient), 0);
}

export interface RankedLearner {
  learnerId: string;
  average: number | null;
}

export interface RankedPosition {
  learnerId: string;
  average: number | null;
  /** 1-based. Null for a learner with no average to rank. */
  position: number | null;
  /** How many learners were ranked — the denominator on the report card. */
  classSize: number;
}

/**
 * Position in the class, highest average first.
 *
 * ## How ties rank, decided explicitly
 *
 * **Competition ranking (1, 2, 2, 4).** Two learners on 15.5 are both 2nd, and
 * the next learner is 4th, not 3rd. The alternative — dense ranking, where the
 * next learner is 3rd — would tell a family that four children finished in the
 * top three, and a Cameroonian report card is read as a statement about how many
 * pupils did better. Nobody is ahead of the 4th-placed child except three
 * children, and the number should say so.
 *
 * **A learner with no average is not ranked and does not count towards the class
 * size.** They are absent from the calculation rather than last in it: ranking a
 * child 40th out of 40 because their teachers have not submitted marks yet would
 * be a statement about the school, printed as a statement about the child.
 */
export function rankByAverage(learners: readonly RankedLearner[]): RankedPosition[] {
  const ranked = learners.filter((l) => l.average !== null);
  const classSize = ranked.length;

  const sorted = [...ranked].sort((a, b) => (b.average ?? 0) - (a.average ?? 0));

  const positionByLearner = new Map<string, number>();
  let lastAverage: number | null = null;
  let lastPosition = 0;

  sorted.forEach((learner, index) => {
    // Competition ranking: equal averages share a position, and the position
    // after a tie skips by the size of the tie.
    const position = learner.average === lastAverage ? lastPosition : index + 1;
    positionByLearner.set(learner.learnerId, position);
    lastAverage = learner.average;
    lastPosition = position;
  });

  return learners.map((learner) => ({
    learnerId: learner.learnerId,
    average: learner.average,
    position: positionByLearner.get(learner.learnerId) ?? null,
    classSize,
  }));
}

/**
 * The one-word verdict Cameroonian reports carry alongside the average.
 *
 * A message-key suffix rather than a sentence, so the wording lives in the two
 * i18n catalogues and a French report card is not an English one translated at
 * the last moment (NFR-LOC-001).
 */
export function remarkKeyFor(average: number | null): string | null {
  if (average === null) return null;
  if (average >= 18) return 'excellent';
  if (average >= 16) return 'very_good';
  if (average >= 14) return 'good';
  if (average >= 12) return 'fairly_good';
  if (average >= 10) return 'average';
  if (average >= 8) return 'weak';
  return 'very_weak';
}

/** Did this learner pass? 10/20 is the Cameroonian pass mark. */
export function isPass(average: number | null): boolean {
  return average !== null && average >= 10;
}
