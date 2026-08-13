import {
  weightedAverage,
  totalCoefficient,
  rankByAverage,
  remarkKeyFor,
  isPass,
  REPORT_MARK_MAX,
} from '@classconnect/shared';

/**
 * BUILD-PLAN Phase 6: "Weighted average and class position computed in
 * `packages/shared/` as a pure function, so it is testable without a database.
 * Position is the part that will be got wrong: decide explicitly how ties rank,
 * and write the test first."
 *
 * This is that test. Every case below is hand-computable, and the tie cases are
 * the reason the file exists.
 */
describe('report cards — the weighted average', () => {
  it('weights by coefficient rather than averaging the marks', () => {
    /*
     * The bug this catches is invisible when every coefficient is 1, which is why
     * the case is deliberately lopsided: Maths at 4 and Sport at 1.
     *
     *   (18 × 4 + 8 × 1) / 5 = 80 / 5 = 16
     *
     * The mean of the marks would be 13, and a report card carrying 13 where the
     * school's own arithmetic says 16 is the kind of error a family notices before
     * the platform does.
     */
    const average = weightedAverage([
      { subjectId: 'maths', mark: 18, coefficient: 4 },
      { subjectId: 'sport', mark: 8, coefficient: 1 },
    ]);
    expect(average).toBe(16);
    expect(average).not.toBe(13);
  });

  it('rounds to two places, which is what a report card carries', () => {
    // (15 × 3 + 12 × 2) / 5 = 69 / 5 = 13.8
    expect(
      weightedAverage([
        { subjectId: 'a', mark: 15, coefficient: 3 },
        { subjectId: 'b', mark: 12, coefficient: 2 },
      ]),
    ).toBe(13.8);

    // 1/3 of a mark: (10 + 11 + 13) / 3 = 11.333…
    expect(
      weightedAverage([
        { subjectId: 'a', mark: 10, coefficient: 1 },
        { subjectId: 'b', mark: 11, coefficient: 1 },
        { subjectId: 'c', mark: 13, coefficient: 1 },
      ]),
    ).toBe(11.33);
  });

  it('returns null rather than 0 for a learner with no marks', () => {
    /*
     * Zero is a real average a child can earn. Reporting it for "nothing submitted
     * yet" would print a failing grade on a report card that should be blank.
     */
    expect(weightedAverage([])).toBeNull();
    expect(weightedAverage([{ subjectId: 'a', mark: 15, coefficient: 0 }])).toBeNull();
  });

  it('keeps a genuine zero distinct from an absent mark', () => {
    expect(weightedAverage([{ subjectId: 'a', mark: 0, coefficient: 1 }])).toBe(0);
  });

  it('ignores a zero coefficient rather than dividing by it', () => {
    // Only the weighted subject counts; no NaN, no Infinity.
    expect(
      weightedAverage([
        { subjectId: 'a', mark: 16, coefficient: 2 },
        { subjectId: 'b', mark: 4, coefficient: 0 },
      ]),
    ).toBe(16);
  });

  it('totals the coefficients for the report card footer', () => {
    expect(
      totalCoefficient([
        { subjectId: 'a', mark: 10, coefficient: 4 },
        { subjectId: 'b', mark: 10, coefficient: 3 },
      ]),
    ).toBe(7);
  });
});

describe('report cards — the class position, and how ties rank', () => {
  it('ranks highest average first', () => {
    const ranked = rankByAverage([
      { learnerId: 'c', average: 11 },
      { learnerId: 'a', average: 17 },
      { learnerId: 'b', average: 14 },
    ]);

    expect(position(ranked, 'a')).toBe(1);
    expect(position(ranked, 'b')).toBe(2);
    expect(position(ranked, 'c')).toBe(3);
  });

  it('uses competition ranking — 1, 2, 2, 4 — so a tie does not shorten the list', () => {
    /*
     * The explicit decision BUILD-PLAN asked for.
     *
     * Two learners on 15.5 are both 2nd, and the next is **4th**, not 3rd. Dense
     * ranking would make the next learner 3rd and so tell a family that four
     * children finished in the top three. A Cameroonian report card is read as a
     * statement about how many pupils did better, and 4th is the true answer:
     * three children did.
     */
    const ranked = rankByAverage([
      { learnerId: 'first', average: 18 },
      { learnerId: 'tieA', average: 15.5 },
      { learnerId: 'tieB', average: 15.5 },
      { learnerId: 'fourth', average: 12 },
    ]);

    expect(position(ranked, 'first')).toBe(1);
    expect(position(ranked, 'tieA')).toBe(2);
    expect(position(ranked, 'tieB')).toBe(2);
    expect(position(ranked, 'fourth')).toBe(4);
    expect(position(ranked, 'fourth')).not.toBe(3);
  });

  it('handles a three-way tie at the top', () => {
    const ranked = rankByAverage([
      { learnerId: 'a', average: 16 },
      { learnerId: 'b', average: 16 },
      { learnerId: 'c', average: 16 },
      { learnerId: 'd', average: 9 },
    ]);

    expect(position(ranked, 'a')).toBe(1);
    expect(position(ranked, 'b')).toBe(1);
    expect(position(ranked, 'c')).toBe(1);
    expect(position(ranked, 'd')).toBe(4);
  });

  it('does not rank a learner with no average, and leaves them out of the class size', () => {
    /*
     * A child whose teachers have not submitted marks is absent from the
     * calculation rather than last in it. Ranking them 40th of 40 would be a
     * statement about the school printed as a statement about the child.
     */
    const ranked = rankByAverage([
      { learnerId: 'a', average: 15 },
      { learnerId: 'b', average: 10 },
      { learnerId: 'unmarked', average: null },
    ]);

    expect(position(ranked, 'unmarked')).toBeNull();
    expect(ranked.every((row) => row.classSize === 2)).toBe(true);
  });

  it('reports a class size of zero when nobody has an average', () => {
    const ranked = rankByAverage([{ learnerId: 'a', average: null }]);
    expect(ranked[0]!.classSize).toBe(0);
    expect(ranked[0]!.position).toBeNull();
  });

  it('preserves the input order in the result, so callers can zip it', () => {
    const input = [
      { learnerId: 'z', average: 9 },
      { learnerId: 'y', average: 19 },
    ];
    expect(rankByAverage(input).map((row) => row.learnerId)).toEqual(['z', 'y']);
  });
});

describe('report cards — the remark and the pass mark', () => {
  it('maps an average to a message key, never to a sentence', () => {
    // Keys, so the wording lives in both i18n catalogues (NFR-LOC-001).
    expect(remarkKeyFor(19)).toBe('excellent');
    expect(remarkKeyFor(16)).toBe('very_good');
    expect(remarkKeyFor(14)).toBe('good');
    expect(remarkKeyFor(12)).toBe('fairly_good');
    expect(remarkKeyFor(10)).toBe('average');
    expect(remarkKeyFor(8)).toBe('weak');
    expect(remarkKeyFor(3)).toBe('very_weak');
  });

  it('gives no remark where there is no average', () => {
    expect(remarkKeyFor(null)).toBeNull();
  });

  it('treats 10 out of 20 as the pass mark, inclusively', () => {
    expect(isPass(10)).toBe(true);
    expect(isPass(9.99)).toBe(false);
    expect(isPass(null)).toBe(false);
  });

  it('marks out of 20, the Cameroonian scale', () => {
    expect(REPORT_MARK_MAX).toBe(20);
  });
});

function position(
  ranked: readonly { learnerId: string; position: number | null }[],
  learnerId: string,
): number | null {
  return ranked.find((row) => row.learnerId === learnerId)?.position ?? null;
}
