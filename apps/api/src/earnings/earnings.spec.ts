import {
  computeDeductions,
  computePool,
  configVersion,
  distributePool,
  netPayable,
  payoutAllowed,
  payoutBlockers,
  sessionCountsTowardEarnings,
  type LearnerContribution,
  type PoolConfig,
} from '@classconnect/shared';

/**
 * §4.7.5 and §8 — the earnings acceptance criterion, in full:
 *
 *   "Teacher earnings reconcile: pool = 60% of recognised revenue, distributed
 *    by attended minutes, and the sum of all teacher shares plus the unallocated
 *    account equals the pool exactly, to the franc, with no rounding drift."
 *
 * The last clause is what these tests are really for. Any proportional split
 * gets the easy cases right; the value is in the cases designed to produce a
 * remainder — three teachers on a prime pool, weights that do not divide, a
 * learner who attended nothing.
 */

const DEFAULT_CONFIG: PoolConfig = {
  teacherPoolPercent: 60,
  basis: 'net_of_fees_and_tax',
  oneToOneFactor: 1.0,
  groupFactor: 1.0,
  minPresencePercent: 80,
};

describe('FR-ERN-002 — the teacher pool', () => {
  it('is 60% of revenue net of fees and tax by default', () => {
    const pool = computePool(
      { recognisedRevenueXaf: 100_000n, providerFeesXaf: 2_000n, taxXaf: 3_000n },
      DEFAULT_CONFIG,
    );
    // (100 000 − 2 000 − 3 000) x 60% = 57 000
    expect(pool).toBe(57_000n);
  });

  it('takes the gross basis when configured to', () => {
    const pool = computePool(
      { recognisedRevenueXaf: 100_000n, providerFeesXaf: 2_000n, taxXaf: 3_000n },
      { ...DEFAULT_CONFIG, basis: 'gross' },
    );
    expect(pool).toBe(60_000n);
  });

  it('rounds half-up to a whole franc, never to a fraction', () => {
    // 1 001 x 60% = 600.6 -> 601
    const pool = computePool(
      { recognisedRevenueXaf: 1_001n, providerFeesXaf: 0n, taxXaf: 0n },
      { ...DEFAULT_CONFIG, basis: 'gross' },
    );
    expect(pool).toBe(601n);
    expect(typeof pool).toBe('bigint');
  });

  it('refuses a basis that fees and tax have driven negative', () => {
    expect(() =>
      computePool(
        { recognisedRevenueXaf: 1_000n, providerFeesXaf: 900n, taxXaf: 200n },
        DEFAULT_CONFIG,
      ),
    ).toThrow(/negative/);
  });

  it('records the configuration it used, so OI-02 stays reproducible', () => {
    expect(configVersion(DEFAULT_CONFIG)).toBe(
      'pool=60;basis=net_of_fees_and_tax;o2o=1;grp=1;presence=80',
    );
    expect(configVersion({ ...DEFAULT_CONFIG, teacherPoolPercent: 55 })).not.toBe(
      configVersion(DEFAULT_CONFIG),
    );
  });
});

describe('FR-ERN-003/004 — distribution reconciles to the franc', () => {
  it('splits by attended minutes across the teachers who taught a learner', () => {
    const learners: LearnerContribution[] = [
      {
        learnerId: 'L1',
        recognisedRevenueXaf: 10_000n,
        attribution: [
          { teacherId: 'T1', sessionType: 'one_to_one', attendedMinutes: 60 },
          { teacherId: 'T2', sessionType: 'one_to_one', attendedMinutes: 30 },
        ],
      },
    ];

    const result = distributePool(6_000n, learners, DEFAULT_CONFIG);

    // 60:30 of 6 000 is 4 000 / 2 000.
    expect(result.teacherShares).toEqual([
      expect.objectContaining({ teacherId: 'T1', amountXaf: 4_000n }),
      expect.objectContaining({ teacherId: 'T2', amountXaf: 2_000n }),
    ]);
    expect(result.unallocatedXaf).toBe(0n);
  });

  it('sends a non-attending learner’s share to the unallocated account', () => {
    const learners: LearnerContribution[] = [
      {
        learnerId: 'L1',
        recognisedRevenueXaf: 5_000n,
        attribution: [{ teacherId: 'T1', sessionType: 'one_to_one', attendedMinutes: 60 }],
      },
      // FR-ERN-004: attended nothing. Their share is held, not redistributed to
      // T1 and not quietly kept by the platform.
      { learnerId: 'L2', recognisedRevenueXaf: 5_000n, attribution: [] },
    ];

    const result = distributePool(6_000n, learners, DEFAULT_CONFIG);

    expect(result.teacherShares).toHaveLength(1);
    expect(result.teacherShares[0]!.amountXaf).toBe(3_000n);
    expect(result.unallocatedXaf).toBe(3_000n);
    expect(result.unallocated).toEqual([
      { learnerId: 'L2', amountXaf: 3_000n, reason: 'no_attendance' },
    ]);
  });

  it('reconciles exactly when the split does not divide evenly', () => {
    // A prime pool across three equal claims: 100 / 3 = 33.33...
    const learners: LearnerContribution[] = [
      {
        learnerId: 'L1',
        recognisedRevenueXaf: 100n,
        attribution: [
          { teacherId: 'T1', sessionType: 'one_to_one', attendedMinutes: 10 },
          { teacherId: 'T2', sessionType: 'one_to_one', attendedMinutes: 10 },
          { teacherId: 'T3', sessionType: 'one_to_one', attendedMinutes: 10 },
        ],
      },
    ];

    const result = distributePool(100n, learners, DEFAULT_CONFIG);

    const total = result.teacherShares.reduce((sum, s) => sum + s.amountXaf, 0n);
    expect(total + result.unallocatedXaf).toBe(100n);
    // 34 + 33 + 33 — the odd franc is allocated, not dropped.
    expect(result.teacherShares.map((s) => s.amountXaf).sort()).toEqual([33n, 33n, 34n]);
  });

  it('reconciles across many awkward pools, learners and teachers', () => {
    // The acceptance criterion is "to the franc, with no rounding drift", which
    // is a claim about every case rather than a chosen one. This sweeps a range
    // of pool sizes and shapes designed to produce remainders at both levels of
    // the split.
    for (const pool of [1n, 7n, 99n, 101n, 1_000n, 12_345n, 999_983n]) {
      for (const teacherCount of [1, 2, 3, 7]) {
        const learners: LearnerContribution[] = [1, 2, 3].map((index) => ({
          learnerId: `L${index}`,
          // Deliberately coprime-ish weights so the first split leaves a remainder.
          recognisedRevenueXaf: BigInt(index * 7 + 1),
          attribution:
            // Every third learner attends nothing, exercising FR-ERN-004 inside
            // the same reconciliation.
            index === 3
              ? []
              : Array.from({ length: teacherCount }, (_, t) => ({
                  teacherId: `T${t}`,
                  sessionType: (t % 2 === 0 ? 'one_to_one' : 'group') as 'one_to_one' | 'group',
                  attendedMinutes: t * 13 + 5,
                })),
        }));

        const result = distributePool(pool, learners, DEFAULT_CONFIG);
        const distributed = result.teacherShares.reduce((sum, s) => sum + s.amountXaf, 0n);

        expect(distributed + result.unallocatedXaf).toBe(pool);
      }
    }
  });

  it('weights group minutes differently when configured to', () => {
    const learners: LearnerContribution[] = [
      {
        learnerId: 'L1',
        recognisedRevenueXaf: 1_000n,
        attribution: [
          { teacherId: 'T1', sessionType: 'one_to_one', attendedMinutes: 60 },
          { teacherId: 'T2', sessionType: 'group', attendedMinutes: 60 },
        ],
      },
    ];

    const equal = distributePool(1_000n, learners, DEFAULT_CONFIG);
    expect(equal.teacherShares.map((s) => s.amountXaf)).toEqual([500n, 500n]);

    // FR-ERN-003: the session-type factor is configuration, so halving the group
    // weight must change the outcome without any code change.
    const weighted = distributePool(1_000n, learners, { ...DEFAULT_CONFIG, groupFactor: 0.5 });
    expect(weighted.teacherShares.map((s) => s.amountXaf)).toEqual([667n, 333n]);
    expect(weighted.teacherShares.reduce((sum, s) => sum + s.amountXaf, 0n)).toBe(1_000n);
  });

  it('holds the whole pool unallocated when nobody attended anything', () => {
    const result = distributePool(
      5_000n,
      [{ learnerId: 'L1', recognisedRevenueXaf: 100n, attribution: [] }],
      DEFAULT_CONFIG,
    );
    expect(result.unallocatedXaf).toBe(5_000n);
    expect(result.teacherShares).toHaveLength(0);
  });

  it('keeps the per-learner basis so a teacher can be told why', () => {
    const result = distributePool(
      1_000n,
      [
        {
          learnerId: 'L1',
          recognisedRevenueXaf: 500n,
          attribution: [{ teacherId: 'T1', sessionType: 'one_to_one', attendedMinutes: 30 }],
        },
        {
          learnerId: 'L2',
          recognisedRevenueXaf: 500n,
          attribution: [{ teacherId: 'T1', sessionType: 'one_to_one', attendedMinutes: 30 }],
        },
      ],
      DEFAULT_CONFIG,
    );

    // FR-ERN-006: one teacher, two learners, and the trail names both.
    expect(result.teacherShares).toHaveLength(1);
    expect(result.teacherShares[0]!.fromLearners).toEqual([
      { learnerId: 'L1', amountXaf: 500n, attendedMinutes: 30 },
      { learnerId: 'L2', amountXaf: 500n, attendedMinutes: 30 },
    ]);
    expect(result.teacherShares[0]!.attendedMinutes).toBe(60);
  });
});

describe('FR-ERN-005 — which sessions count', () => {
  it('counts a session where the teacher met the presence threshold', () => {
    expect(
      sessionCountsTowardEarnings(
        { scheduledMinutes: 60, teacherPresentMinutes: 48, status: 'completed' },
        80,
      ),
    ).toBe(true);
  });

  it('does not count one where they fell short', () => {
    expect(
      sessionCountsTowardEarnings(
        { scheduledMinutes: 60, teacherPresentMinutes: 47, status: 'completed' },
        80,
      ),
    ).toBe(false);
  });

  it('counts a learner no-show, because the teacher waited', () => {
    // FR-SCH-012: the teacher turned up and waited the required period. Paying
    // them is the point of the rule.
    expect(
      sessionCountsTowardEarnings(
        { scheduledMinutes: 60, teacherPresentMinutes: 15, status: 'no_show_learner' },
        80,
      ),
    ).toBe(true);
  });
});

describe('§4.7.3 — deductions', () => {
  it('withholds nothing while OI-07 is unresolved', () => {
    const deductions = computeDeductions(10_000n, { taxWithholdingPercent: 0 });
    expect(deductions.totalXaf).toBe(0n);
    expect(netPayable(10_000n, deductions)).toBe(10_000n);
  });

  it('applies a configured withholding rate on whole francs', () => {
    const deductions = computeDeductions(10_000n, { taxWithholdingPercent: 5.5 });
    expect(deductions.taxWithheldXaf).toBe(550n);
    expect(netPayable(10_000n, deductions)).toBe(9_450n);
  });

  it('refuses deductions that exceed the gross', () => {
    expect(() =>
      computeDeductions(1_000n, { taxWithholdingPercent: 50, providerFeeXaf: 600n }),
    ).toThrow(/exceed/);
  });
});

describe('FR-ERN-010 — payouts are refused, not merely hidden', () => {
  const payable = {
    walletVerified: true,
    kycComplete: true,
    suspended: false,
    netPayableXaf: 20_000n,
    minimumXaf: 10_000n,
  };

  it('allows a payout that clears every condition', () => {
    expect(payoutAllowed(payable)).toBe(true);
    expect(payoutBlockers(payable)).toEqual([]);
  });

  it('blocks an unverified wallet', () => {
    expect(payoutBlockers({ ...payable, walletVerified: false })).toContain('wallet_unverified');
  });

  it('blocks incomplete KYC', () => {
    expect(payoutBlockers({ ...payable, kycComplete: false })).toContain('kyc_incomplete');
  });

  it('blocks a suspended teacher', () => {
    expect(payoutBlockers({ ...payable, suspended: true })).toContain('teacher_suspended');
  });

  it('blocks below the configured minimum', () => {
    expect(payoutBlockers({ ...payable, netPayableXaf: 9_999n })).toContain('below_minimum');
  });

  it('reports every blocker at once, so fixing one does not reveal the next', () => {
    // §4.7.4: "show the specific blocking reason on the row; do not just grey
    // out the button." An admin chasing a KYC document should learn about the
    // unverified wallet now, not after the next attempt.
    const blockers = payoutBlockers({
      ...payable,
      walletVerified: false,
      kycComplete: false,
      suspended: true,
    });
    expect(blockers).toEqual(
      expect.arrayContaining(['wallet_unverified', 'kyc_incomplete', 'teacher_suspended']),
    );
  });

  it('distinguishes nothing-payable from below-minimum', () => {
    // Different remedies: one waits for next month, the other is a data fault.
    expect(payoutBlockers({ ...payable, netPayableXaf: 0n })).toEqual(['nothing_payable']);
    expect(payoutBlockers({ ...payable, netPayableXaf: 1n })).toEqual(['below_minimum']);
  });
});
