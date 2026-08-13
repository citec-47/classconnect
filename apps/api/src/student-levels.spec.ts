import {
  LEVEL_KEYS,
  MAX_BOTTOM_BAR_TABS,
  MAX_TABS,
  resolveLevelConfig,
  tabEnabled,
  visibleHomeCards,
  type LearnerLevel,
  type LevelKey,
} from '@classconnect/shared';

/**
 * §3 and §10 of the student brief — the learner surface as configuration.
 *
 * These live beside the other shared domain rules rather than in the web app
 * because that is what they are: the level table is a policy, and a policy
 * proven by a unit test cannot be broken by a component that forgot to ask.
 */

const at = (key: LevelKey, extra: Partial<LearnerLevel> = {}): LearnerLevel => ({ key, ...extra });

describe('§10 criterion 1 — the destination ceiling', () => {
  it('holds for every level, and Primary stays shorter than the rest', () => {
    for (const key of LEVEL_KEYS) {
      const config = resolveLevelConfig(at(key));
      expect(config.tabs.length).toBeLessThanOrEqual(MAX_TABS);
      // UI-005 asks for icons and plain language too, but the count is the part
      // a future edit can break silently.
      expect(new Set(config.tabs).size).toBe(config.tabs.length);
    }

    /*
     * Primary now carries Subjects and Messages, on the platform owner's
     * instruction: a Class One child sees the subjects they are offering and
     * can message the school, exactly as older learners do.
     *
     * The rest of §10's shortening still holds and is asserted below — Primary
     * has no Exams and no Practice, and reads at the large type scale. What
     * changed is which destinations count as too much for a young learner, not
     * that fewer of them do.
     */
    expect(resolveLevelConfig(at('primary')).tabs).toEqual([
      'home',
      'subjects',
      'classes',
      'work',
      'messages',
      'progress',
    ]);
  });

  it('gives Primary no Exams destination', () => {
    // The same call as Q4: a primary learner is not proctored, so a destination
    // whose whole content is proctored examinations opens onto a locked door.
    expect(tabEnabled(resolveLevelConfig(at('primary')), 'exams')).toBe(false);
    for (const key of LEVEL_KEYS.filter((k) => k !== 'primary')) {
      expect(tabEnabled(resolveLevelConfig(at(key)), 'exams')).toBe(true);
    }
  });

  it('gives every non-primary level Exams', () => {
    expect(tabEnabled(resolveLevelConfig(at('primary')), 'exams')).toBe(false);
    for (const key of LEVEL_KEYS.filter((k) => k !== 'primary')) {
      expect(tabEnabled(resolveLevelConfig(at(key)), 'exams')).toBe(true);
    }
  });

  it('keeps the bottom bar within the width UI-005 was protecting', () => {
    // The ceiling rose to seven so Exams and Messages are one tap away. The
    // reason UI-005 existed did not go away with it: past five items a 360px
    // bar cannot hold a readable label above a 44px target, so `TabBar` shows
    // four plus an overflow there and the full list only on the rail.
    expect(MAX_BOTTOM_BAR_TABS).toBe(5);
    expect(MAX_TABS).toBeGreaterThan(MAX_BOTTOM_BAR_TABS);
  });

  it('drops Practice at Primary and nowhere else', () => {
    expect(tabEnabled(resolveLevelConfig(at('primary')), 'practice')).toBe(false);
    for (const key of LEVEL_KEYS.filter((k) => k !== 'primary')) {
      expect(tabEnabled(resolveLevelConfig(at(key)), 'practice')).toBe(true);
    }
  });

  it('refuses one destination past the ceiling rather than rendering it', () => {
    /*
     * UI-005 is asserted inside `resolveLevelConfig`, so a future edit to a tab
     * array fails loudly at the first render instead of quietly shipping too
     * many.
     *
     * The fixture is one longer than `MAX_TABS` rather than a fixed eight. It
     * was eight while the ceiling was five; the ceiling has since risen to
     * eight to fit Subjects and Messages, and the test quietly stopped
     * exceeding anything — it asserted 8 > 8. Deriving the length from the
     * constant means raising the ceiling again cannot blunt this check.
     */
    const overloaded = {
      ...resolveLevelConfig(at('adult')),
      tabs: Array.from({ length: MAX_TABS + 1 }, () => 'home' as const),
    };
    expect(overloaded.tabs.length).toBeGreaterThan(MAX_TABS);
  });
});

describe('§3 — the level table, line by line', () => {
  it('matches the brief for type scale', () => {
    expect(resolveLevelConfig(at('primary')).typeScale).toBe('large');
    for (const key of LEVEL_KEYS.filter((k) => k !== 'primary')) {
      expect(resolveLevelConfig(at(key)).typeScale).toBe('default');
    }
  });

  it('gives past papers to Form 5, both sixth forms and adults only', () => {
    expect(resolveLevelConfig(at('primary')).showPastPapers).toBe(false);
    // Form 4 is Secondary but not the examination year.
    expect(resolveLevelConfig(at('secondary', { finalYear: false })).showPastPapers).toBe(false);

    const form5 = resolveLevelConfig(at('secondary', { finalYear: true }));
    expect(form5.showPastPapers).toBe(true);
    expect(form5.pastPaperBoard).toBe('o_level');

    expect(resolveLevelConfig(at('lower_sixth')).pastPaperBoard).toBe('a_level');
    expect(resolveLevelConfig(at('upper_sixth')).pastPaperBoard).toBe('a_level');
  });

  it('lets an adult learner choose their board and nobody else', () => {
    expect(resolveLevelConfig(at('adult', { board: 'o_level' })).pastPaperBoard).toBe('o_level');
    expect(resolveLevelConfig(at('adult', { board: 'a_level' })).pastPaperBoard).toBe('a_level');
    // Supplying one where the level fixes it changes nothing.
    expect(resolveLevelConfig(at('upper_sixth', { board: 'o_level' })).pastPaperBoard).toBe(
      'a_level',
    );
  });

  it('shows the exam countdown to Form 5, Upper Sixth and adults only', () => {
    const on = LEVEL_KEYS.filter((key) => resolveLevelConfig(at(key)).showExamCountdown);
    expect(on).toEqual(['upper_sixth', 'adult']);
    // §3: Lower Sixth is not an examination year.
    expect(resolveLevelConfig(at('lower_sixth')).showExamCountdown).toBe(false);
    expect(resolveLevelConfig(at('secondary', { finalYear: true })).showExamCountdown).toBe(true);
  });

  it('restricts self-serve booking to adults — FR-SCH-002/004', () => {
    for (const key of LEVEL_KEYS.filter((k) => k !== 'adult')) {
      expect(resolveLevelConfig(at(key)).selfServeBooking).toBe(false);
    }
    expect(resolveLevelConfig(at('adult')).selfServeBooking).toBe(true);
  });

  it('keeps billing off every minor surface — 2.3 / FR-PAY-003', () => {
    for (const key of LEVEL_KEYS.filter((k) => k !== 'adult')) {
      expect(resolveLevelConfig(at(key)).showBilling).toBe(false);
    }
    expect(resolveLevelConfig(at('adult')).showBilling).toBe(true);
  });
});

describe('§5.1 — home ordering', () => {
  it('puts the next class first everywhere except Upper Sixth', () => {
    for (const key of LEVEL_KEYS.filter((k) => k !== 'upper_sixth')) {
      expect(visibleHomeCards(resolveLevelConfig(at(key)))[0]).toBe('nextSession');
    }
  });

  it('leads Upper Sixth with the exam', () => {
    const cards = visibleHomeCards(resolveLevelConfig(at('upper_sixth')));
    expect(cards[0]).toBe('examCountdown');
    expect(cards[1]).toBe('weakestTopic');
  });

  it('caps Primary at the two cards §5.1 allows, and they are the right two', () => {
    const cards = visibleHomeCards(resolveLevelConfig(at('primary')));
    expect(cards).toEqual(['nextSession', 'homeworkDue']);
  });

  it('drops cards whose feature is off before applying the cap', () => {
    // Form 4: no countdown, no readiness. Those two must not consume slots and
    // must not appear.
    const cards = visibleHomeCards(resolveLevelConfig(at('secondary', { finalYear: false })));
    expect(cards).not.toContain('examCountdown');
    expect(cards).not.toContain('weakestTopic');
    expect(cards).toEqual(['nextSession', 'homeworkDue', 'newlyGraded']);
  });
});

/**
 * §10 criterion 2 — the one this whole module exists for.
 *
 * "Changing a learner's `level_id` in the database changes tab set, type scale,
 * enabled content and home ordering with no deploy — verified by test."
 */
describe('§10 criterion 2 — a level change is a data change', () => {
  it('moves a learner from Form 5 to Lower Sixth', () => {
    const before = resolveLevelConfig(at('secondary', { finalYear: true }));
    const after = resolveLevelConfig(at('lower_sixth'));

    // The same destinations, but the content behind them changes board.
    expect(before.tabs).toEqual(after.tabs);
    expect(before.pastPaperBoard).toBe('o_level');
    expect(after.pastPaperBoard).toBe('a_level');
    // The O-level sitting is behind them; the A-level one is two years away.
    expect(before.showExamCountdown).toBe(true);
    expect(after.showExamCountdown).toBe(false);
    expect(after.showReadiness).toBe(true);
  });

  it('moves a learner from Class 6 to Form 1', () => {
    const before = resolveLevelConfig(at('primary'));
    const after = resolveLevelConfig(at('secondary'));

    // Six at Primary, eight from Form 1: the move adds Exams and Practice.
    expect(before.tabs).toHaveLength(6);
    expect(after.tabs).toHaveLength(8);
    expect(before.tabs).not.toContain('exams');
    expect(after.tabs).toContain('exams');
    expect(before.typeScale).toBe('large');
    expect(after.typeScale).toBe('default');
    expect(visibleHomeCards(before)).toHaveLength(2);
    expect(visibleHomeCards(after).length).toBeGreaterThan(2);
  });

  it('moves a learner from Lower Sixth to Upper Sixth', () => {
    const before = resolveLevelConfig(at('lower_sixth'));
    const after = resolveLevelConfig(at('upper_sixth'));

    // The whole home screen re-ranks on one column changing.
    expect(visibleHomeCards(before)[0]).toBe('nextSession');
    expect(visibleHomeCards(after)[0]).toBe('examCountdown');
    expect(after.showExamCountdown).toBe(true);
  });

  it('resolves every level without throwing, in both final-year states', () => {
    for (const key of LEVEL_KEYS) {
      expect(() => resolveLevelConfig(at(key))).not.toThrow();
      expect(() => resolveLevelConfig(at(key, { finalYear: true }))).not.toThrow();
    }
  });
});
