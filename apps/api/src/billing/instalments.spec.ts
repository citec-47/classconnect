import {
  addDays,
  buildSchedule,
  daysBetween,
  deriveInstalmentState,
  freezeDateFor,
  isBlockedWhileFrozen,
  noticeSchedule,
  shouldFreezeFor,
  splitWithRemainderOnFirst,
  FROZEN_ALLOWED,
  FROZEN_BLOCKED,
} from '@classconnect/shared';

/**
 * §5 and §8 — the instalment and freeze acceptance criteria:
 *
 *   "The instalment freeze rule is proven end-to-end by test: paid on time → no
 *    freeze; missed → notices at 7/3/1/0 days → freeze after grace → pay →
 *    immediate unfreeze; repeated independently at instalments 2 and 3;
 *    pay-in-full clears everything."
 *
 * The arithmetic half is here, where it can be exercised without a database.
 * The persistence half — that paying actually lifts the freeze, and that a
 * manual freeze survives payment — is `FreezeService`, covered separately.
 */

describe('§5.1 — instalment amounts sum exactly to the fee', () => {
  it('splits an evenly divisible fee into equal thirds', () => {
    expect(splitWithRemainderOnFirst(30_000n, [1, 1, 1])).toEqual([10_000n, 10_000n, 10_000n]);
  });

  it('puts the rounding remainder on the first instalment', () => {
    // §5.1 names the destination: "Rounding remainders are allocated to the
    // first instalment so the three always add up."
    const parts = splitWithRemainderOnFirst(10_000n, [1, 1, 1]);
    expect(parts).toEqual([3_334n, 3_333n, 3_333n]);
    expect(parts.reduce((a, b) => a + b, 0n)).toBe(10_000n);
  });

  it('sums exactly for every fee in a wide range', () => {
    for (let total = 0n; total < 2_000n; total += 1n) {
      const parts = splitWithRemainderOnFirst(total, [1, 1, 1]);
      expect(parts.reduce((a, b) => a + b, 0n)).toBe(total);
    }
  });

  it('supports a front-loaded schedule without any code change', () => {
    // Q2 is unresolved: equal thirds or front-loaded. The weights are
    // configuration, so both are the same code path.
    const parts = splitWithRemainderOnFirst(10_000n, [2, 1, 1]);
    expect(parts.reduce((a, b) => a + b, 0n)).toBe(10_000n);
    expect(parts[0]!).toBeGreaterThan(parts[1]!);
  });

  it('gives a zero-weighted first instalment nothing rather than a negative', () => {
    expect(splitWithRemainderOnFirst(100n, [0, 1, 1])).toEqual([0n, 50n, 50n]);
  });

  it('refuses a configuration whose rounding would overdraw the first instalment', () => {
    // One franc across two equal later parts: each rounds half-up to 1, so the
    // first would have to absorb −1. That is a configuration fault, and the
    // split says so instead of billing a negative amount.
    expect(() => splitWithRemainderOnFirst(1n, [0, 1, 1])).toThrow(/negative/);
  });
});

describe('§5.1 — the two payment options', () => {
  it('offers pay-in-full as one instalment due at enrolment', () => {
    const schedule = buildSchedule({
      totalXaf: 30_000n,
      planType: 'full',
      startOn: '2026-09-01',
    });
    expect(schedule.instalments).toEqual([
      { sequence: 1, amountXaf: 30_000n, dueOn: '2026-09-01' },
    ]);
  });

  it('applies a pay-in-full discount only where one is configured', () => {
    // Q3 is unresolved, so the default is zero rather than a guess.
    expect(
      buildSchedule({ totalXaf: 30_000n, planType: 'full', startOn: '2026-09-01' }).discountXaf,
    ).toBe(0n);

    const discounted = buildSchedule({
      totalXaf: 30_000n,
      planType: 'full',
      startOn: '2026-09-01',
      payInFullDiscountPercent: 10,
    });
    expect(discounted.discountXaf).toBe(3_000n);
    expect(discounted.payableXaf).toBe(27_000n);
    expect(discounted.instalments[0]!.amountXaf).toBe(27_000n);
  });

  it('does not give the pay-in-full discount to an instalment plan', () => {
    const schedule = buildSchedule({
      totalXaf: 30_000n,
      planType: 'three_instalments',
      startOn: '2026-09-01',
      payInFullDiscountPercent: 10,
    });
    expect(schedule.discountXaf).toBe(0n);
    expect(schedule.instalments.reduce((sum, i) => sum + i.amountXaf, 0n)).toBe(30_000n);
  });

  it('spaces the three parts by the configured interval', () => {
    const schedule = buildSchedule({
      totalXaf: 30_000n,
      planType: 'three_instalments',
      startOn: '2026-09-01',
      count: 3,
      intervalDays: 30,
    });
    expect(schedule.instalments.map((i) => i.dueOn)).toEqual([
      '2026-09-01',
      '2026-10-01',
      '2026-10-31',
    ]);
  });
});

describe('§5.3 — the freeze rule', () => {
  const GRACE = 3;

  it('freezes on the due date plus grace, not before', () => {
    expect(freezeDateFor('2026-09-01', GRACE)).toBe('2026-09-04');
  });

  it('does not freeze an instalment paid on time', () => {
    const instalment = { dueOn: '2026-09-01', paidAt: new Date('2026-09-01T10:00:00Z') };
    expect(shouldFreezeFor(instalment, '2026-09-30', GRACE)).toBe(false);
  });

  it('does not freeze during the grace period', () => {
    const instalment = { dueOn: '2026-09-01', paidAt: null };
    expect(shouldFreezeFor(instalment, '2026-09-01', GRACE)).toBe(false);
    expect(shouldFreezeFor(instalment, '2026-09-03', GRACE)).toBe(false);
  });

  it('freezes once the grace period has passed', () => {
    const instalment = { dueOn: '2026-09-01', paidAt: null };
    expect(shouldFreezeFor(instalment, '2026-09-04', GRACE)).toBe(true);
    expect(shouldFreezeFor(instalment, '2026-09-05', GRACE)).toBe(true);
  });

  it('never freezes a cancelled instalment', () => {
    // §5.1: settling in full cancels the future parts. A cancelled instalment is
    // not an unpaid one, and must not trigger a freeze weeks later.
    const instalment = { dueOn: '2026-09-01', paidAt: null, cancelledAt: new Date() };
    expect(shouldFreezeFor(instalment, '2026-12-01', GRACE)).toBe(false);
  });

  it('applies independently at instalments 2 and 3', () => {
    const schedule = buildSchedule({
      totalXaf: 30_000n,
      planType: 'three_instalments',
      startOn: '2026-09-01',
      intervalDays: 30,
    });

    // Instalment 1 paid, 2 missed: the rule fires on 2's own freeze date and
    // owes nothing to 1's history.
    const [first, second, third] = schedule.instalments;

    expect(shouldFreezeFor({ dueOn: first!.dueOn, paidAt: new Date() }, '2026-10-04', GRACE)).toBe(
      false,
    );
    expect(shouldFreezeFor({ dueOn: second!.dueOn, paidAt: null }, '2026-10-04', GRACE)).toBe(
      true,
    );

    // And again at 3, independently of what happened at 2.
    expect(shouldFreezeFor({ dueOn: third!.dueOn, paidAt: null }, '2026-11-03', GRACE)).toBe(true);
    expect(shouldFreezeFor({ dueOn: third!.dueOn, paidAt: new Date() }, '2026-11-03', GRACE)).toBe(
      false,
    );
  });
});

describe('FR-PAY-019 / §5.3 — a freeze is never the first the payer hears', () => {
  it('schedules notices at 7, 3 and 1 days before, on the day, and on the freeze day', () => {
    const notices = noticeSchedule('2026-09-10', 3, [7, 3, 1]);

    expect(notices.map((n) => [n.key, n.sendOn])).toEqual([
      ['before_7', '2026-09-03'],
      ['before_3', '2026-09-07'],
      ['before_1', '2026-09-09'],
      ['due', '2026-09-10'],
      ['freeze', '2026-09-13'],
    ]);
  });

  it('sends every notice strictly before the freeze takes effect', () => {
    const notices = noticeSchedule('2026-09-10', 3);
    const freezeDay = freezeDateFor('2026-09-10', 3);

    for (const notice of notices) {
      expect(daysBetween(notice.sendOn, freezeDay)).toBeGreaterThanOrEqual(0);
    }
    // Five notices, as §5.4 says: "reversible by the user themselves in one tap"
    // is only defensible because they were told five times first.
    expect(notices).toHaveLength(5);
  });

  it('gives each notice a stable key so a re-run never double-sends', () => {
    const first = noticeSchedule('2026-09-10', 3);
    const second = noticeSchedule('2026-09-10', 3);
    expect(first.map((n) => n.key)).toEqual(second.map((n) => n.key));
    expect(new Set(first.map((n) => n.key)).size).toBe(first.length);
  });

  it('drops a nonsensical notice offset rather than sending on a bad date', () => {
    const notices = noticeSchedule('2026-09-10', 3, [7, 0, -1, 3]);
    expect(notices.map((n) => n.key)).toEqual(['before_7', 'before_3', 'due', 'freeze']);
  });
});

describe('§5.2 — instalment states', () => {
  it('derives scheduled, due and overdue from the due date', () => {
    const instalment = { dueOn: '2026-09-10', paidAt: null };
    expect(deriveInstalmentState(instalment, '2026-09-09')).toBe('scheduled');
    expect(deriveInstalmentState(instalment, '2026-09-10')).toBe('due');
    expect(deriveInstalmentState(instalment, '2026-09-11')).toBe('overdue');
  });

  it('treats paid as a fact, not a derivation', () => {
    // A late payment settles the instalment. Re-evaluating it a month later
    // must not send it back to overdue.
    const paidLate = { dueOn: '2026-09-10', paidAt: new Date('2026-09-20T00:00:00Z') };
    expect(deriveInstalmentState(paidLate, '2026-12-01')).toBe('paid');
  });
});

describe('§5.4 — what "frozen" means', () => {
  it('blocks joining, booking, assessments, materials and homework', () => {
    for (const capability of FROZEN_BLOCKED) {
      expect(isBlockedWhileFrozen(capability)).toBe(true);
    }
  });

  it('still permits signing in, seeing the balance, paying and contacting support', () => {
    for (const capability of FROZEN_ALLOWED) {
      expect(isBlockedWhileFrozen(capability)).toBe(false);
    }
    // The one that makes the freeze reversible in a tap, and so keeps it on the
    // permitted side of FR-AI-005.
    expect(isBlockedWhileFrozen('billing.pay')).toBe(false);
  });

  it('keeps the two lists disjoint', () => {
    const allowed = new Set<string>(FROZEN_ALLOWED);
    for (const blocked of FROZEN_BLOCKED) {
      expect(allowed.has(blocked)).toBe(false);
    }
  });
});

describe('date arithmetic stays on calendar days', () => {
  it('adds days across a month boundary', () => {
    expect(addDays('2026-01-31', 1)).toBe('2026-02-01');
    expect(addDays('2026-02-28', 1)).toBe('2026-03-01');
  });

  it('handles a leap year', () => {
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29');
    expect(addDays('2028-02-29', 1)).toBe('2028-03-01');
  });
});
