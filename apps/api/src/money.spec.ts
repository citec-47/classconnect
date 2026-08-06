import {
  applyPercent,
  roundHalfUpDiv,
  splitProportionally,
  toXaf,
  formatXaf,
  MoneyError,
} from '@classconnect/shared';

/**
 * CON-02 / DAT-002 / FR-LDG-005.
 *
 * NFR-MNT-002 puts payment, ledger and earnings modules at the highest coverage
 * bar in the system. These are the rules that decide what a teacher is paid, so
 * the tests are written against the requirement text rather than the code.
 */
describe('money — CON-02: XAF is a zero-decimal integer currency', () => {
  it('accepts whole francs from every input form', () => {
    expect(toXaf(15000)).toBe(15000n);
    expect(toXaf('15000')).toBe(15000n);
    expect(toXaf(15000n)).toBe(15000n);
  });

  it('refuses a fractional amount rather than silently rounding it', () => {
    // A float reaching the money layer means a bug upstream. Truncating it
    // quietly would hide the bug and lose money a franc at a time.
    expect(() => toXaf(150.5)).toThrow(MoneyError);
    expect(() => toXaf('150.5')).toThrow(MoneyError);
  });
});

describe('money — FR-LDG-005: round half-up to the nearest franc', () => {
  it('rounds a half upwards', () => {
    expect(roundHalfUpDiv(5n, 2n)).toBe(3n); // 2.5 -> 3
    expect(roundHalfUpDiv(7n, 2n)).toBe(4n); // 3.5 -> 4
  });

  it('rounds below a half downwards', () => {
    expect(roundHalfUpDiv(4n, 3n)).toBe(1n); // 1.33 -> 1
  });

  it('rounds negative values away from zero, symmetrically', () => {
    expect(roundHalfUpDiv(-5n, 2n)).toBe(-3n);
  });

  it('refuses division by zero', () => {
    expect(() => roundHalfUpDiv(1n, 0n)).toThrow(MoneyError);
  });
});

describe('money — FR-ERN-002: the teacher pool is a percentage of revenue', () => {
  it('computes 60% of a subscription exactly', () => {
    expect(applyPercent(15_000n, 60)).toBe(9_000n);
  });

  it('rounds a fractional percentage half-up', () => {
    // 10 000 x 33.333% = 3333.3 -> 3333
    expect(applyPercent(10_000n, 33.333)).toBe(3_333n);
    // 10 000 x 12.345% = 1234.5 -> 1235
    expect(applyPercent(10_000n, 12.345)).toBe(1_235n);
  });

  it('handles the whole amount and nothing', () => {
    expect(applyPercent(15_000n, 100)).toBe(15_000n);
    expect(applyPercent(15_000n, 0)).toBe(0n);
  });
});

describe('money — FR-LDG-005: split amounts always sum to the source amount', () => {
  it('splits evenly when it divides cleanly', () => {
    expect(splitProportionally(9_000n, [1n, 1n, 1n])).toEqual([3_000n, 3_000n, 3_000n]);
  });

  it('allocates the rounding remainder rather than dropping it', () => {
    // 10 000 across three equal teachers cannot divide evenly.
    const shares = splitProportionally(10_000n, [1n, 1n, 1n]);
    expect(shares.reduce((a, b) => a + b, 0n)).toBe(10_000n);
    expect(shares).toEqual([3_334n, 3_333n, 3_333n]);
  });

  it('weights by attended minutes, per FR-ERN-003', () => {
    // Three teachers taught 120, 60 and 20 minutes of a 9 000 XAF pool.
    const shares = splitProportionally(9_000n, [120n, 60n, 20n]);
    expect(shares.reduce((a, b) => a + b, 0n)).toBe(9_000n);
    expect(shares[0]).toBeGreaterThan(shares[1]!);
    expect(shares[1]).toBeGreaterThan(shares[2]!);
  });

  it('never loses or invents a franc, across many awkward splits', () => {
    // A property-style sweep: the invariant that matters is exact conservation.
    for (let total = 1; total <= 200; total++) {
      for (const weights of [[1n, 1n, 1n], [7n, 3n], [5n, 5n, 5n, 5n, 1n], [1n, 2n, 3n, 4n]]) {
        const shares = splitProportionally(BigInt(total), weights);
        expect(shares.reduce((a, b) => a + b, 0n)).toBe(BigInt(total));
        expect(shares.every((s) => s >= 0n)).toBe(true);
      }
    }
  });

  it('allocates nothing when there is no attendance to weight against', () => {
    // FR-ERN-004: where a learner attended no sessions, the pool is held in an
    // unallocated account for an Admin decision — it is never silently kept.
    expect(splitProportionally(9_000n, [0n, 0n])).toEqual([0n, 0n]);
  });

  it('is deterministic, so an audit reproduces the same allocation', () => {
    const first = splitProportionally(10_000n, [1n, 1n, 1n]);
    const second = splitProportionally(10_000n, [1n, 1n, 1n]);
    expect(first).toEqual(second);
  });
});

describe('money — UI-009: display as whole XAF with the FCFA suffix', () => {
  it('groups thousands and appends FCFA', () => {
    expect(formatXaf(15_000n)).toBe('15 000 FCFA');
    expect(formatXaf(60_000n)).toBe('60 000 FCFA');
  });

  it('renders identically in both languages', () => {
    // NFR-LOC-004 formats per locale, but the currency rendering must not
    // become ambiguous between "15,000" and "15.000".
    expect(formatXaf(15_000n, 'en')).toBe(formatXaf(15_000n, 'fr'));
  });
});
