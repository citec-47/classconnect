'use client';

import { useI18n } from '@/lib/i18n';
import { useStudent } from '@/lib/student-context';
import { PageTitle, ScreenState, SectionHeading } from '@/components/student/ui';
import { useCachedApi } from '@/lib/use-cached-api';
import type { PracticeItemDto } from '@classconnect/shared';

interface ExamsResponse {
  upcoming: PracticeItemDto[];
  past: PracticeItemDto[];
}

export default function StudentExams() {
  const { t, language } = useI18n();
  const { config } = useStudent();
  const { data, loading, error, refresh } = useCachedApi<ExamsResponse>('/learner/practice', {
    language,
  });

  if (!config) return null;

  const upcoming = (data?.upcoming ?? []).filter((item) => item.kind !== 'past_paper');
  const past = (data?.past ?? []).filter((item) => item.kind !== 'past_paper');

  return (
    <>
      <PageTitle large={config.typeScale === 'large'}>{t('student.exams.title')}</PageTitle>

      <ScreenState
        loading={loading}
        error={error}
        isEmpty={upcoming.length === 0 && past.length === 0}
        emptyTitle={t('student.exams.none')}
        emptyBody={t('student.exams.noneBody')}
        onRetry={() => void refresh()}
      >
        {upcoming.length > 0 && (
          <section className="space-y-2">
            <SectionHeading count={upcoming.length}>{t('student.exams.available')}</SectionHeading>
            {upcoming.map((item) => (
              <article key={item.id} className="rounded-xl border border-ink-300 bg-white p-3.5">
                <p className="text-sm font-semibold text-ink-900">{item.title}</p>
                <p className="mt-1 text-xs text-ink-600">{item.subject.name}</p>
              </article>
            ))}
          </section>
        )}

        {past.length > 0 && (
          <section className="mt-6 space-y-2">
            <SectionHeading count={past.length}>{t('student.exams.history')}</SectionHeading>
            {past.map((item) => (
              <article key={item.id} className="rounded-xl border border-ink-300 bg-white p-3.5">
                <p className="text-sm font-semibold text-ink-900">{item.title}</p>
                <p className="mt-1 text-xs text-ink-600">{item.subject.name}</p>
              </article>
            ))}
          </section>
        )}
      </ScreenState>
    </>
  );
}
