'use client';

import type { LearnerAttendanceDto } from '@classconnect/shared';
import { useI18n } from '@/lib/i18n';
import { useStudent } from '@/lib/student-context';
import { useCachedApi } from '@/lib/use-cached-api';
import { fullDate } from '@/lib/student-format';
import { subjectAccent } from '@/lib/subject-accent';
import {
  Card,
  Meter,
  PageTitle,
  Pill,
  ScreenState,
  SectionHeading,
} from '@/components/student/ui';

/**
 * Attendance.
 *
 * A single percentage is a grade — it tells a child they are at 68% and gives
 * them nothing to do about it. So the number is broken into the two questions a
 * learner actually has: which subject am I slipping in, and what did I miss
 * lately.
 *
 * The tone matters as much as the data. In Cameroon a missed lesson is usually
 * the power or a shared phone, not a choice (AS-08), so nothing here is phrased
 * as a reproach and every missed lesson carries the reminder that the recording
 * is still there.
 */
export default function StudentAttendance() {
  const { t, language } = useI18n();
  const { config } = useStudent();
  const { data, loading, error, refresh } = useCachedApi<LearnerAttendanceDto>(
    '/learner/attendance',
    { language },
  );

  if (!config) return null;
  const large = config.typeScale === 'large';
  const bySubject = data?.bySubject ?? [];
  const recent = data?.recent ?? [];

  return (
    <>
      <PageTitle large={large}>{t('student.attendance.title')}</PageTitle>
      <p className="text-sm text-ink-600">{t('student.attendance.subtitle')}</p>

      <ScreenState
        loading={loading}
        error={error}
        isEmpty={Boolean(data && data.scheduled === 0)}
        emptyTitle={t('student.attendance.none')}
        emptyBody={t('student.attendance.noneBody')}
        onRetry={() => void refresh()}
      >
        {data && data.scheduled > 0 && (
          <>
            <Card title={t('student.attendance.overall')}>
              <p className="text-3xl font-semibold tabular-nums text-ink-900">
                {t('student.unit.percent', { value: data.percentage })}
              </p>
              <p className="mt-1 text-sm text-ink-600">
                {t('student.attendance.attendedOf', {
                  attended: data.attended,
                  scheduled: data.scheduled,
                })}
              </p>
              {/*
               * A streak is the one framing of attendance that reads as
               * encouragement rather than surveillance, so it is the only
               * emphasis on this card.
               */}
              {data.streak > 0 && (
                <p className="mt-2">
                  <Pill tone="success">
                    {data.streak === 1
                      ? t('student.attendance.streakOne')
                      : t('student.attendance.streak', { count: data.streak })}
                  </Pill>
                </p>
              )}
            </Card>

            {bySubject.length > 0 && (
              <section className="space-y-2">
                <SectionHeading>{t('student.attendance.bySubject')}</SectionHeading>
                <Card>
                  <div className="space-y-3">
                    {/* Weakest first — the list is a prompt, not a league table. */}
                    {bySubject.map((row) => (
                      <div
                        key={row.subject.id}
                        className={`rounded-lg border-l-4 pl-3 ${subjectAccent(row.subject.id).border}`}
                      >
                        <Meter
                          label={`${row.subject.name} · ${row.attended}/${row.scheduled}`}
                          percentage={row.percentage}
                        />
                      </div>
                    ))}
                  </div>
                </Card>
              </section>
            )}

            <section className="space-y-2">
              <SectionHeading count={recent.length}>
                {t('student.attendance.recent')}
              </SectionHeading>

              <ul className="space-y-2">
                {recent.map((row) => (
                  <li
                    key={row.sessionId}
                    className="flex items-center gap-3 rounded-xl border border-ink-300 bg-white p-3.5"
                  >
                    <span
                      aria-hidden="true"
                      className={`h-8 w-1 shrink-0 rounded-full ${subjectAccent(row.subject.id).border} border-l-4`}
                    />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-ink-900">
                        {row.subject.name}
                      </p>
                      <p className="truncate text-xs text-ink-600">
                        {fullDate(new Date(row.startedAt), language)}
                        {row.attended && row.attendedMinutes > 0 && (
                          <> · {t('student.attendance.minutes', { count: row.attendedMinutes })}</>
                        )}
                      </p>
                    </div>
                    <Pill tone={row.attended ? 'success' : 'neutral'}>
                      {row.attended
                        ? t('student.attendance.present')
                        : t('student.attendance.absent')}
                    </Pill>
                  </li>
                ))}
              </ul>

              {recent.some((row) => !row.attended) && (
                <p className="rounded-lg bg-ink-100 px-3 py-2 text-xs text-ink-600">
                  {t('student.attendance.encourage')}
                </p>
              )}
            </section>
          </>
        )}
      </ScreenState>
    </>
  );
}
