'use client';

import { visibleHomeCards, type HomeCardKey, type LearnerHomeDto, type TabKey } from '@classconnect/shared';
import { useI18n } from '@/lib/i18n';
import { useStudent } from '@/lib/student-context';
import { useCachedApi } from '@/lib/use-cached-api';
import Link from 'next/link';
import { HomeworkRow, SessionCard } from '@/components/student/cards';
import {
  BookIcon,
  ChartIcon,
  ExamIcon,
  FileTextIcon,
  HomeIcon,
  MessageIcon,
  PencilIcon,
  VideoIcon,
} from '@/components/student/icons';
import {
  Card,
  EmptyState,
  ErrorState,
  PageTitle,
  Pill,
  SectionHeading,
  SkeletonList,
} from '@/components/student/ui';

/**
 * §5.1 — Home. The only screen most learners will use most days.
 *
 * The card list comes from `visibleHomeCards`, which applies both the level's
 * ranking and its cap; nothing here knows that Upper Sixth is exam-led or that
 * Primary shows two cards. The data comes from one request, because five cards
 * fetched separately is five round trips at 300ms RTT before anything is
 * legible (NFR-PER-001).
 */
export default function StudentHome() {
  const { t, language } = useI18n();
  const { learner, config } = useStudent();
  const { data, loading, error, refresh } = useCachedApi<LearnerHomeDto>('/learner/home', {
    language,
  });

  if (!learner || !config) return null;
  const cards = visibleHomeCards(config);
  const large = config.typeScale === 'large';

  return (
    <>
      <PageTitle large={large}>
        {t('student.home.greeting', { name: learner.displayName })}
      </PageTitle>

      <QuickAccess language={language} tabs={config.tabs} />

      {loading && <SkeletonList rows={2} />}
      {error && !data && <ErrorState onRetry={() => void refresh()} />}

      {data && (
        <>
          {cards.map((card) => (
            <HomeCard key={card} card={card} home={data} onSubmitted={refresh} />
          ))}
          {/*
           * Past lessons, one tap from Home.
           *
           * The requirement is that a learner can always get back to a lesson
           * they missed, and the moment they want that is the moment they open
           * the app having missed one. A link on Home costs nothing and saves a
           * child hunting through a menu.
           */}
          <Link
            href="./lessons"
            className="flex min-h-touch items-center justify-between rounded-xl border border-ink-300 bg-white px-3.5 text-sm font-medium text-ink-900"
          >
            {t('student.lessons.title')}
            <span aria-hidden="true">›</span>
          </Link>

          {isEverythingEmpty(data, cards) && (
            <EmptyState
              title={t('student.home.nothingTitle')}
              body={t('student.home.nothingBody')}
            />
          )}
        </>
      )}
    </>
  );
}

const TAB_PATHS: Record<TabKey, string> = {
  home: '', subjects: '/subjects', classes: '/classes', exams: '/exams', work: '/work',
  messages: '/messages', practice: '/practice', progress: '/progress', videos: '/lessons',
};

const TAB_ICONS = {
  home: HomeIcon, subjects: BookIcon, classes: VideoIcon, exams: ExamIcon, work: PencilIcon,
  messages: MessageIcon, practice: FileTextIcon, progress: ChartIcon, videos: VideoIcon,
};

/** Visual, one-tap counterparts to every destination in the learner navigation. */
function QuickAccess({ language, tabs }: { language: string; tabs: readonly TabKey[] }) {
  const { t } = useI18n();
  return (
    <section aria-label={t('student.navLabel')} className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
      {tabs.filter((tab) => tab !== 'home').map((tab) => {
        const Icon = TAB_ICONS[tab];
        return (
          <Link
            key={tab}
            href={`/${language}/student${TAB_PATHS[tab]}`}
            className="group flex min-h-28 flex-col justify-between rounded-xl border border-ink-300 bg-white p-4 shadow-sm transition hover:-translate-y-0.5 hover:border-brand-300 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600"
          >
            <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand-50 text-brand-700 transition group-hover:bg-brand-100">
              <Icon className="h-6 w-6" />
            </span>
            <span className="mt-3 text-sm font-semibold text-ink-900">{t(`student.tab.${tab}`)}</span>
          </Link>
        );
      })}
    </section>
  );
}

/**
 * True only when every card this level shows has nothing in it.
 *
 * A learner with no class *and* no work needs one sentence explaining that,
 * rather than four cards each separately reporting emptiness.
 */
function isEverythingEmpty(home: LearnerHomeDto, cards: HomeCardKey[]): boolean {
  return cards.every((card) => {
    if (card === 'nextSession') return home.nextSession === null;
    if (card === 'homeworkDue') return home.homeworkDue.length === 0;
    if (card === 'newlyGraded') return home.newlyGraded.length === 0;
    if (card === 'examCountdown') return home.examCountdown === null;
    return home.weakestTopic === null;
  });
}

function HomeCard({
  card,
  home,
  onSubmitted,
}: {
  card: HomeCardKey;
  home: LearnerHomeDto;
  onSubmitted: () => Promise<void>;
}) {
  const { t } = useI18n();

  switch (card) {
    case 'nextSession':
      return home.nextSession ? (
        <section className="space-y-2">
          <SectionHeading>{t('student.card.nextSession')}</SectionHeading>
          <SessionCard session={home.nextSession} primary />
        </section>
      ) : null;

    case 'homeworkDue':
      return home.homeworkDue.length > 0 ? (
        <section className="space-y-2">
          <SectionHeading count={home.homeworkDue.length}>
            {t('student.card.homeworkDue')}
          </SectionHeading>
          {home.homeworkDue.map((item) => (
            <HomeworkRow key={item.id} item={item} onSubmitted={onSubmitted} />
          ))}
        </section>
      ) : null;

    case 'newlyGraded':
      return home.newlyGraded.length > 0 ? (
        <section className="space-y-2">
          <SectionHeading count={home.newlyGraded.length}>
            {t('student.card.newlyGraded')}
          </SectionHeading>
          {home.newlyGraded.map((item) => (
            <HomeworkRow key={item.id} item={item} />
          ))}
        </section>
      ) : null;

    /** FR-PRO-003 — days to the learner's own target session. */
    case 'examCountdown':
      return home.examCountdown ? (
        <Card title={t('student.card.examCountdown')}>
          <p className="text-3xl font-semibold tabular-nums text-ink-900">
            {home.examCountdown.daysRemaining <= 0
              ? t('student.exam.today')
              : home.examCountdown.daysRemaining === 1
                ? t('student.exam.dayLeft')
                : t('student.exam.daysLeft', { count: home.examCountdown.daysRemaining })}
          </p>
          <p className="mt-1 text-sm text-ink-600">{home.examCountdown.targetDate}</p>
        </Card>
      ) : null;

    /**
     * FR-GCE-005 — one topic, with somewhere to go. One rather than a ranked
     * list of nine: a learner with twenty minutes before supper needs a place
     * to start, not a leaderboard of their own weaknesses.
     */
    case 'weakestTopic':
      return home.weakestTopic ? (
        <Card title={t('student.card.weakestTopic')}>
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="truncate text-base font-semibold text-ink-900">
                {home.weakestTopic.topic}
              </p>
              <p className="truncate text-sm text-ink-600">{home.weakestTopic.subject}</p>
            </div>
            <Pill tone="neutral">
              {t('student.unit.percent', { value: home.weakestTopic.percentage })}
            </Pill>
          </div>
          {/*
           * FR-GCE-004: an estimate of preparation, never a prediction of a
           * result. The disclaimer travels with the number rather than sitting
           * in a footer nobody reads.
           */}
          <p className="mt-3 text-xs text-ink-600">{t('student.readiness.estimateOnly')}</p>
        </Card>
      ) : null;

    default:
      return null;
  }
}
