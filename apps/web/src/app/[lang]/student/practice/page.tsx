'use client';

import { notFound } from 'next/navigation';
import { tabEnabled, type PracticeItemDto } from '@classconnect/shared';
import { useI18n } from '@/lib/i18n';
import { useStudent } from '@/lib/student-context';
import { useCachedApi } from '@/lib/use-cached-api';
import { PracticeRow } from '@/components/student/cards';
import { PageTitle, ScreenState, SectionHeading } from '@/components/student/ui';

interface PracticeResponse {
  quizzes: PracticeItemDto[];
  mocks: PracticeItemDto[];
  pastPapers: PracticeItemDto[];
}

/**
 * §5.4 — Practice. Hidden at Primary level.
 *
 * Hidden means gone, not greyed out: a Primary learner who reaches this URL from
 * a shared link or a stale bookmark gets a 404, the same answer the tab set
 * gives. The endpoint behind it 404s too (FR-RBA-002) — hiding the tab and
 * serving the screen anyway would make the four-tab rule a decoration.
 */
export default function StudentPractice() {
  const { t, language } = useI18n();
  const { config } = useStudent();
  const { data, loading, error, refresh } = useCachedApi<PracticeResponse>('/learner/practice', {
    language,
  });

  if (!config) return null;
  if (!tabEnabled(config, 'practice')) notFound();

  const sections = [
    { key: 'quizzes', items: data?.quizzes ?? [] },
    { key: 'mocks', items: data?.mocks ?? [] },
    // §3: the GCE library is Form 5, sixth form and adult only.
    ...(config.showPastPapers
      ? [{ key: 'pastPapers', items: data?.pastPapers ?? [] }]
      : []),
  ];

  const total = sections.reduce((sum, section) => sum + section.items.length, 0);

  return (
    <>
      <PageTitle large={config.typeScale === 'large'}>{t('student.practice.title')}</PageTitle>

      <ScreenState
        loading={loading}
        error={error}
        isEmpty={total === 0}
        emptyTitle={t('student.practice.none')}
        emptyBody={t('student.practice.noneBody')}
        onRetry={() => void refresh()}
      >
        {sections
          .filter((section) => section.items.length > 0)
          .map((section) => (
            <section key={section.key} className="space-y-2">
              <SectionHeading count={section.items.length}>
                {t(`student.practice.${section.key}`)}
              </SectionHeading>
              {section.items.map((item) => (
                <PracticeRow key={item.id} item={item} />
              ))}
            </section>
          ))}
      </ScreenState>

      {/*
       * §9: a timed assessment is never available offline, and says so before
       * the learner starts one rather than breaking halfway through. The runner
       * enforces it; this sets the expectation.
       */}
      <p className="mt-6 rounded-lg bg-ink-100 px-3 py-2 text-xs text-ink-600">
        {t('student.practice.needsConnectionBody')}
      </p>
    </>
  );
}
