'use client';

import type { SessionDto } from '@classconnect/shared';
import { useI18n } from '@/lib/i18n';
import { useStudent } from '@/lib/student-context';
import { useCachedApi } from '@/lib/use-cached-api';
import { SessionCard } from '@/components/student/cards';
import {
  PageTitle,
  ReportConcern,
  ScreenState,
  SectionHeading,
} from '@/components/student/ui';

interface ScheduleResponse {
  upcoming: SessionDto[];
  past: SessionDto[];
}

/**
 * §5.2 — Classes.
 *
 * Upcoming and past, joinable from here as well as from Home. The empty state is
 * level-aware because the answer to "why do I have no classes?" differs:
 * FR-SCH-002 makes assignment an administrative action for minors, so a child is
 * told that someone else books for them, while an Adult Learner is told they can
 * book (FR-SCH-004).
 */
export default function StudentClasses() {
  const { t, language } = useI18n();
  const { config } = useStudent();
  const { data, loading, error, refresh } = useCachedApi<ScheduleResponse>('/learner/schedule', {
    language,
  });

  if (!config) return null;
  const upcoming = data?.upcoming ?? [];
  const past = data?.past ?? [];

  return (
    <>
      <div className="flex items-center justify-between gap-3">
        <PageTitle large={config.typeScale === 'large'}>{t('student.classes.title')}</PageTitle>
        {/* FR-SCH-009: the timetable leaves the app as iCalendar. */}
        {upcoming.length > 0 && (
          <a
            href="/api/v1/learner/schedule.ics"
            className="inline-flex min-h-touch items-center rounded-lg border border-ink-300 px-3 text-sm font-medium text-ink-900 hover:bg-ink-100"
          >
            {t('student.classes.exportCalendar')}
          </a>
        )}
      </div>

      <ScreenState
        loading={loading}
        error={error}
        isEmpty={upcoming.length === 0 && past.length === 0}
        emptyTitle={t('student.classes.none')}
        emptyBody={
          config.selfServeBooking
            ? t('student.classes.noneBody')
            : `${t('student.classes.noneBody')} ${t('student.classes.bookingByStaff')}`
        }
        onRetry={() => void refresh()}
      >
        {upcoming.length > 0 && (
          <section className="space-y-2">
            <SectionHeading count={upcoming.length}>
              {t('student.classes.upcoming')}
            </SectionHeading>
            {upcoming.map((session, index) => (
              <SessionCard key={session.id} session={session} primary={index === 0} />
            ))}
          </section>
        )}

        {past.length > 0 && (
          <section className="mt-6 space-y-2">
            <SectionHeading count={past.length}>{t('student.classes.past')}</SectionHeading>
            {past.map((session) => (
              <SessionCard key={session.id} session={session} />
            ))}
          </section>
        )}

        {/*
         * FR-SCH-002 again, as a statement rather than a missing button. A
         * minor who cannot find a "book" control should be told why, not left
         * to conclude the app is broken.
         */}
        {!config.selfServeBooking && (
          <p className="mt-6 rounded-lg bg-ink-100 px-3 py-2 text-sm text-ink-600">
            {t('student.classes.bookingByStaff')}
          </p>
        )}
      </ScreenState>

      {/* FR-SAF-005: reachable from every session view. */}
      <div className="mt-6">
        <ReportConcern />
      </div>
    </>
  );
}
