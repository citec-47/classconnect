'use client';

import {
  PLATFORM_TIMEZONE,
  formatLocal,
  type HomeCardKey,
  type LevelConfig,
} from '@classconnect/shared';
import { useI18n } from '@/lib/i18n';
import { useStudent } from '@/lib/student-context';
import { Card, EmptyState } from './ui';

/**
 * §5.1 — the home cards.
 *
 * One component per card, selected by key, so `homeOrder` in the level config is
 * the only thing that decides what appears and in what order. Adding a card
 * means adding a `HomeCardKey` and an entry here; it does not mean editing the
 * home screen.
 *
 * Every card currently renders its designed empty state (UI-008), because the
 * learner API modules are the next slice. That is deliberate rather than
 * temporary scaffolding: the empty state is the state a newly approved learner
 * genuinely sees on their first morning, and it is the one most often left
 * until last.
 */

/**
 * Whole days between now and the target date, counted in Africa/Douala.
 *
 * Counted from calendar dates rather than from elapsed milliseconds: a learner
 * looking at this at 23:00 the night before their examination must read "1 day
 * to go", not "0", and `Math.floor` over a duration gives them the second one.
 */
export function daysUntil(targetIso: string, now: Date = new Date()): number {
  const dayIn = (value: Date) =>
    new Intl.DateTimeFormat('en-CA', { timeZone: PLATFORM_TIMEZONE }).format(value);
  const today = Date.parse(`${dayIn(now)}T00:00:00Z`);
  const target = Date.parse(`${targetIso.slice(0, 10)}T00:00:00Z`);
  return Math.round((target - today) / 86_400_000);
}

function NextSessionCard() {
  const { t } = useI18n();
  return (
    <Card title={t('student.card.nextSession')}>
      <EmptyState
        title={t('student.nextSession.none')}
        body={t('student.nextSession.noneBody')}
      />
    </Card>
  );
}

function HomeworkDueCard() {
  const { t } = useI18n();
  return (
    <Card title={t('student.card.homeworkDue')}>
      <EmptyState title={t('student.homework.none')} body={t('student.homework.noneBody')} />
    </Card>
  );
}

function NewlyGradedCard() {
  const { t } = useI18n();
  return (
    <Card title={t('student.card.newlyGraded')}>
      <EmptyState title={t('student.graded.none')} body={t('student.graded.noneBody')} />
    </Card>
  );
}

/** FR-PRO-003 — drawn from the learner's own target examination date. */
function ExamCountdownCard() {
  const { t, language } = useI18n();
  const { learner } = useStudent();
  const target = learner?.targetExamDate ?? null;

  if (!target) {
    return (
      <Card title={t('student.card.examCountdown')}>
        <EmptyState title={t('student.exam.noDate')} body={t('student.exam.noDateBody')} />
      </Card>
    );
  }

  const days = daysUntil(target);
  const headline =
    days <= 0
      ? t('student.exam.today')
      : days === 1
        ? t('student.exam.dayLeft')
        : t('student.exam.daysLeft', { count: days });

  return (
    <Card title={t('student.card.examCountdown')}>
      <p className="text-2xl font-semibold tabular-nums text-ink-900">{headline}</p>
      {/* 2.4: every time on this surface is rendered in Africa/Douala. */}
      <p className="mt-1 text-sm text-ink-600">
        {formatLocal(new Date(target), language, { dateStyle: 'long' })}
      </p>
    </Card>
  );
}

/**
 * FR-GCE-005 — one topic, with a way straight to material for it.
 *
 * One, not a ranked list of nine. A learner with twenty minutes before supper
 * needs somewhere to start, and a leaderboard of their own weaknesses is not it.
 */
function WeakestTopicCard() {
  const { t } = useI18n();
  return (
    <Card title={t('student.card.weakestTopic')}>
      <EmptyState title={t('student.progress.none')} body={t('student.progress.noneBody')} />
      {/*
       * FR-GCE-004: presented as an estimate of preparation, never as a
       * prediction of an official examination outcome. The disclaimer travels
       * with the number, not in a footer nobody reads.
       */}
      <p className="mt-3 text-xs text-ink-600">{t('student.readiness.estimateOnly')}</p>
    </Card>
  );
}

const CARDS: Record<HomeCardKey, () => React.ReactElement> = {
  nextSession: NextSessionCard,
  homeworkDue: HomeworkDueCard,
  newlyGraded: NewlyGradedCard,
  examCountdown: ExamCountdownCard,
  weakestTopic: WeakestTopicCard,
};

export function HomeCard({ card }: { card: HomeCardKey; config: LevelConfig }) {
  const Component = CARDS[card];
  return <Component />;
}
