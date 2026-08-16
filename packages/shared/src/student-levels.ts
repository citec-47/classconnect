/**
 * §3 — the learner surface, as configuration.
 *
 * One dashboard, not four. Education level changes how many tabs there are, how
 * large the type is, which content sources are enabled and how the home screen
 * is ordered; it does not fork the app. Four parallel student dashboards is four
 * times the maintenance for a small team (CON07), and it breaks the moment a
 * Form 5 learner moves into Lower Sixth.
 *
 * Everything level-dependent reads from here. A component that writes
 * `if (level === 'primary')` has put a policy decision somewhere nobody will
 * think to look when the policy changes.
 *
 * The whole module is pure data and pure functions — no React, no fetch — so
 * §10's acceptance criterion 2 ("changing `level_id` changes the surface with no
 * deploy") is provable by unit test rather than by clicking through five
 * accounts.
 */

export type LevelKey = 'primary' | 'secondary' | 'lower_sixth' | 'upper_sixth' | 'adult';

export const LEVEL_KEYS: readonly LevelKey[] = [
  'primary',
  'secondary',
  'lower_sixth',
  'upper_sixth',
  'adult',
];

/**
 * The top-level destinations, in plain language, each with an icon.
 *
 * UI-005 caps this at five and did so for a good reason — the reference device
 * is a 360px phone and a bottom bar is thumb-reachable only while its targets
 * stay large. The product owner has raised the ceiling to seven so that Exams
 * and Messages are reachable in one tap rather than buried.
 *
 * That does not repeal the reason UI-005 existed, so the cost is paid in the
 * nav rather than ignored: `TabBar` keeps the five-item bottom bar on a phone
 * and moves the remainder behind an overflow, while the tablet-and-up rail —
 * which has vertical room UI-005 was never constraining — shows all of them.
 */
export type TabKey =
  | 'home'
  | 'subjects'
  | 'classes'
  | 'work'
  | 'practice'
  | 'progress'
  | 'exams'
  | 'messages'
  /** FR-LIV: the recordings of lessons this learner is entitled to. */
  | 'videos';

/** The ceiling, asserted in `resolveLevelConfig` rather than trusted. */
/*
 * Nine, because My class videos joined the list.
 *
 * The ceiling is asserted rather than trusted, so adding a destination without
 * raising it stops the app at boot instead of quietly overflowing - which is
 * the behaviour worth keeping. The bottom bar is unaffected: it still shows
 * MAX_BOTTOM_BAR_TABS and the rest live behind the overflow control.
 */
export const MAX_TABS = 9;

/**
 * How many fit across a 360px bottom bar before labels stop being readable.
 *
 * UI-005's original number, kept where it still bites. Beyond this the nav
 * overflows rather than shrinking targets below the UI-002 floor.
 */
export const MAX_BOTTOM_BAR_TABS = 5;

/** §5.1 — the home cards, ranked per level rather than fixed. */
export type HomeCardKey =
  | 'nextSession'
  | 'homeworkDue'
  | 'newlyGraded'
  | 'examCountdown'
  | 'weakestTopic';

/**
 * The GCE board a learner is working towards.
 *
 * The surface's own vocabulary, not the database's. `ExamBoardLevel` in the
 * schema spells these `gce_ordinary` and `gce_advanced`; `examBoardToDb` below
 * is the single crossing point, so a rename on either side is one edit.
 */
export type ExamBoard = 'o_level' | 'a_level';

/** The `ExamBoardLevel` enum value for a board. */
export function examBoardToDb(board: ExamBoard): 'gce_ordinary' | 'gce_advanced' {
  return board === 'a_level' ? 'gce_advanced' : 'gce_ordinary';
}

/**
 * A learner's level as the profile records it.
 *
 * `finalYear` exists because §3's table varies *within* Secondary: past papers,
 * the exam countdown and the readiness indicator are Form 5 only. Modelling that
 * as a flag rather than as a sixth `LevelKey` keeps Form 4 → Form 5 a data
 * change too, which is the same requirement one year earlier.
 */
export interface LearnerLevel {
  key: LevelKey;
  /** Form 5 — the O-level examination year within Secondary. */
  finalYear?: boolean;
  /**
   * Which board this learner sits.
   *
   * Only Adult Learners choose: §3 fixes O/L for Form 5 and A/L for the sixth
   * forms, so for every other level this is derived and ignored if supplied.
   */
  board?: ExamBoard | null;
}

export interface LevelConfig {
  /** Which of the five destinations show, in bar order. */
  tabs: readonly TabKey[];
  /** NFR-USA-005: primary-level learners get larger type. */
  typeScale: 'large' | 'default';
  showPractice: boolean;
  /** FR-GCE-002 — the past-questions library. */
  showPastPapers: boolean;
  /** Which board's papers, when there are any. */
  pastPaperBoard: ExamBoard | null;
  /** FR-PRO-003 — days to the target examination session. */
  showExamCountdown: boolean;
  /** FR-GCE-004 — the per-subject readiness indicator. */
  showReadiness: boolean;
  /** §5.1 — ranking of the home cards. */
  homeOrder: readonly HomeCardKey[];
  /**
   * §5.1: "Primary level shows at most two cards: next class, and homework.
   * Nothing else." A cap rather than a shorter `homeOrder`, so a card added to
   * the ordering later cannot quietly appear on a six-year-old's home screen.
   */
  maxHomeCards: number;
  /** FR-SCH-004 — minors are assigned teachers; only adults book their own. */
  selfServeBooking: boolean;
  /**
   * §7 / FR-PAY-003: billing belongs to the Parent surface. The Adult Learner is
   * their own payer and is the only exception — which is also what decides
   * whether §6's frozen screen may show a monetary amount.
   */
  showBilling: boolean;
}

/** §5.1's default ranking: the next class is what a learner opened the app for. */
const NEXT_CLASS_FIRST: readonly HomeCardKey[] = [
  'nextSession',
  'homeworkDue',
  'newlyGraded',
  'examCountdown',
  'weakestTopic',
];

/**
 * §3: Upper Sixth is exam-led.
 *
 * A learner four months from the A-level sitting opens the app to ask "how long
 * have I got and what am I worst at", and the next class is the answer to a
 * different question.
 */
const EXAM_LED: readonly HomeCardKey[] = [
  'examCountdown',
  'weakestTopic',
  'nextSession',
  'homeworkDue',
  'newlyGraded',
];

const ALL_TABS: readonly TabKey[] = [
  'home',
  'subjects',
  'classes',
  'work',
  'messages',
  'exams',
  'practice',
  'progress',
  'videos',
];

/**
 * §3: Primary stays shorter and drops Practice. Quizzes live inside Work.
 *
 * The learner-facing shell keeps the primary destination set to four entries so
 * the mobile tab bar remains simple and the home screen remains the most-used
 * surface.
 */
const PRIMARY_TABS: readonly TabKey[] = [
  'home',
  'subjects',
  'classes',
  'work',
  'messages',
  'progress',
  'videos',
];

/**
 * The base table from §3, before the Form 5 overlay.
 *
 * Written out per level rather than derived from defaults: a reader comparing
 * this against the SRS table should be able to do it line by line, and a
 * spread-and-override would make them hold two things in their head at once.
 */
const BASE: Record<LevelKey, LevelConfig> = {
  primary: {
    tabs: PRIMARY_TABS,
    typeScale: 'large',
    showPractice: false,
    showPastPapers: false,
    pastPaperBoard: null,
    showExamCountdown: false,
    showReadiness: false,
    homeOrder: NEXT_CLASS_FIRST,
    maxHomeCards: 2,
    selfServeBooking: false,
    showBilling: false,
  },
  secondary: {
    tabs: ALL_TABS,
    typeScale: 'default',
    showPractice: true,
    // Form 5 only — applied by the overlay below.
    showPastPapers: false,
    pastPaperBoard: null,
    showExamCountdown: false,
    showReadiness: false,
    homeOrder: NEXT_CLASS_FIRST,
    maxHomeCards: 5,
    selfServeBooking: false,
    showBilling: false,
  },
  lower_sixth: {
    tabs: ALL_TABS,
    typeScale: 'default',
    showPractice: true,
    showPastPapers: true,
    pastPaperBoard: 'a_level',
    // §3: Lower Sixth is not an examination year, so no countdown — but the
    // readiness indicator is on, because two years of preparation is exactly
    // when knowing your weakest topic is worth something.
    showExamCountdown: false,
    showReadiness: true,
    homeOrder: NEXT_CLASS_FIRST,
    maxHomeCards: 5,
    selfServeBooking: false,
    showBilling: false,
  },
  upper_sixth: {
    tabs: ALL_TABS,
    typeScale: 'default',
    showPractice: true,
    showPastPapers: true,
    pastPaperBoard: 'a_level',
    showExamCountdown: true,
    showReadiness: true,
    homeOrder: EXAM_LED,
    maxHomeCards: 5,
    selfServeBooking: false,
    showBilling: false,
  },
  adult: {
    tabs: ALL_TABS,
    typeScale: 'default',
    showPractice: true,
    showPastPapers: true,
    // The one level that chooses; resolved from the profile below.
    pastPaperBoard: 'o_level',
    showExamCountdown: true,
    showReadiness: true,
    homeOrder: NEXT_CLASS_FIRST,
    maxHomeCards: 5,
    // FR-SCH-004 / FR-SCH-013: adults book their own slots, evenings and
    // weekends included.
    selfServeBooking: true,
    // 2.3: an adult learner is their own payer, so billing is theirs to see.
    showBilling: true,
  },
};

/**
 * Resolves the surface for one learner.
 *
 * The only entry point. Components take a `LevelConfig`, never a `LevelKey`, so
 * there is nowhere for a second copy of these rules to grow.
 */
export function resolveLevelConfig(level: LearnerLevel): LevelConfig {
  const base = BASE[level.key];
  const config: LevelConfig = { ...base };

  // §3: the Form 5 overlay. An O-level year inside Secondary behaves like an
  // examination year without being a separate level.
  if (level.key === 'secondary' && level.finalYear) {
    config.showPastPapers = true;
    config.pastPaperBoard = 'o_level';
    config.showExamCountdown = true;
    config.showReadiness = true;
  }

  // The only level whose board is a choice rather than a consequence.
  if (level.key === 'adult' && level.board) {
    config.pastPaperBoard = level.board;
  }

  // UI-005, asserted rather than assumed. A future edit to a `tabs` array cannot
  // quietly put a sixth destination in front of a learner.
  if (config.tabs.length > MAX_TABS) {
    throw new Error(
      `UI-005: level "${level.key}" resolves to ${config.tabs.length} tabs; the maximum is ${MAX_TABS}.`,
    );
  }

  return config;
}

/**
 * §5.1 — which home cards to render, in order, already capped.
 *
 * Cards whose feature is off for this level are dropped before the cap, so
 * Primary's two slots go to the two cards it is meant to have rather than to
 * whichever two happened to sort first.
 */
export function visibleHomeCards(config: LevelConfig): HomeCardKey[] {
  return config.homeOrder
    .filter((card) => {
      if (card === 'examCountdown') return config.showExamCountdown;
      if (card === 'weakestTopic') return config.showReadiness;
      return true;
    })
    .slice(0, config.maxHomeCards);
}

/** Whether a destination is reachable at this level — the server-side answer too. */
export function tabEnabled(config: LevelConfig, tab: TabKey): boolean {
  return config.tabs.includes(tab);
}

/**
 * Translates a row from the `levels` table into the surface's own vocabulary.
 *
 * The catalogue and the dashboard answer different questions. `levels` is a
 * Cameroonian education taxonomy — sixteen rows, because Class 1 and Class 4 are
 * genuinely different classes to enrol a child in. `LevelKey` is five, because
 * Class 1 and Class 4 are the same *surface*.
 *
 * Collapsing the sixteen into the five here, once, is what makes §10's criterion
 * 2 true: a learner's `level_id` moves between catalogue rows and the dashboard
 * follows without a deploy, because nothing downstream knows the catalogue
 * exists.
 */
export function levelFromCatalogue(level: {
  code: string;
  category: string;
}): LearnerLevel {
  const code = level.code.toUpperCase();

  switch (level.category) {
    case 'primary':
      return { key: 'primary' };

    case 'secondary':
      // Form 5 is the O-level examination year, and §3 gives it past papers,
      // a countdown and a readiness indicator that Forms 1–4 do not get.
      return { key: 'secondary', finalYear: code === 'FORM_5' };

    case 'high_school':
      return { key: code === 'UPPER_SIXTH' ? 'upper_sixth' : 'lower_sixth' };

    /*
     * The GCE preparation rows. These are not a school year — a learner sits on
     * one to prepare for a specific paper — so each maps to the surface that
     * behaves the same way: O-level preparation is the Form 5 surface, A-level
     * preparation is the Upper Sixth one. Both are examination-facing, which is
     * the property that actually drives the configuration.
     */
    case 'exam':
      return code === 'GCE_AL'
        ? { key: 'upper_sixth' }
        : { key: 'secondary', finalYear: true };

    case 'adult':
      // The one level whose board is a choice. `ADULT_GCE` does not say which,
      // so it defaults to O-level and the profile overrides it.
      return { key: 'adult', board: code.includes('_AL') ? 'a_level' : 'o_level' };

    default:
      /*
       * An unrecognised category is a data problem, not a reason to fail a
       * learner's whole dashboard. Secondary is the safe default: five tabs, no
       * examination furniture, no self-serve booking, no billing — nothing that
       * would over-expose a minor if the guess is wrong.
       */
      return { key: 'secondary' };
  }
}
