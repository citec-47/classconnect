'use client';

import { useState } from 'react';
import Link from 'next/link';
import type { LearnerSubjectsDto, TimetableSlotDto } from '@classconnect/shared';
import { useI18n } from '@/lib/i18n';
import { useStudent } from '@/lib/student-context';
import { useCachedApi } from '@/lib/use-cached-api';
import { timeOfDay } from '@/lib/student-format';
import { RatingControl } from '@/components/student/RatingControl';
import { subjectAccent } from '@/lib/subject-accent';
import {
  Card,
  PageTitle,
  Pill,
  ScreenState,
  SectionHeading,
} from '@/components/student/ui';

/**
 * Subjects, and the timetable behind them.
 *
 * The level does not appear anywhere in this file. It does not need to: a
 * learner is enrolled in the subjects their level permitted at enrolment, so
 * "the timetable for my class" is what you get by asking for "my timetable".
 * Filtering again here would be a second copy of the catalogue's rules living
 * in the client, and the two copies would disagree the first time somebody
 * changed level mid-year.
 *
 * Two views, one request. The subject cards answer "who teaches me and what do
 * I owe", the week answers "when". Both are read in the same visit, and a
 * second round trip at 300ms RTT to answer the obvious follow-up is a round
 * trip the connection cannot spare.
 */
export default function StudentSubjects() {
  const { t, language } = useI18n();
  const { learner, config } = useStudent();
  const [view, setView] = useState<'subjects' | 'timetable'>('subjects');

  const { data, loading, error, refresh } = useCachedApi<LearnerSubjectsDto>(
    '/learner/subjects',
    { language },
  );

  if (!learner || !config) return null;
  const large = config.typeScale === 'large';

  // Read arrays defensively. A payload that arrives without them is a server
  // problem, and it should surface as an empty state rather than a stack trace
  // on a learner's phone (NFR-BAN-006).
  const subjects = data?.subjects ?? [];
  const timetable = data?.timetable ?? [];

  return (
    <>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <PageTitle large={large}>{t('student.subjects.title')}</PageTitle>
        {data && (
          <span className="text-sm text-ink-600">
            {t('student.subjects.yourClass')}: {data.levelLabel}
          </span>
        )}
      </div>

      {/*
       * A segmented control rather than two tabs. Subjects and timetable are
       * two readings of one dataset, and promoting either to a destination
       * would spend a slot from a nav that is already at its ceiling.
       */}
      <div
        role="tablist"
        aria-label={t('student.subjects.title')}
        className="flex gap-1 rounded-xl bg-ink-100 p-1"
      >
        {(['subjects', 'timetable'] as const).map((key) => (
          <button
            key={key}
            role="tab"
            type="button"
            aria-selected={view === key}
            onClick={() => setView(key)}
            className={[
              'min-h-touch flex-1 rounded-lg px-3 text-sm font-medium transition-colors',
              view === key ? 'bg-white text-ink-900 shadow-sm' : 'text-ink-600',
            ].join(' ')}
          >
            {key === 'subjects' ? t('student.subjects.title') : t('student.subjects.timetable')}
          </button>
        ))}
      </div>

      <ScreenState
        loading={loading}
        error={error}
        isEmpty={Boolean(data && subjects.length === 0)}
        emptyTitle={t('student.subjects.none')}
        emptyBody={t('student.subjects.noneBody')}
        onRetry={() => void refresh()}
      >
        {data &&
          (view === 'subjects' ? (
            <div className="space-y-3">
              {subjects.map((item) => {
                const accent = subjectAccent(item.subject.id);
                return (
                <Card key={item.subject.id}>
                  <div
                    className={`-mx-3.5 -mt-3.5 mb-3 border-l-4 px-3.5 py-2 ${accent.border} ${accent.bg}`}
                  >
                    <p className={`truncate text-base font-semibold ${accent.text}`}>
                      {item.subject.name}
                    </p>
                  </div>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm text-ink-600">
                        {item.teacher
                          ? t('student.subjects.taughtBy', { teacher: item.teacher.displayName })
                          : t('student.subjects.noTeacherYet')}
                      </p>
                    </div>
                    {item.upcomingCount > 0 && (
                      <Pill tone="neutral">
                        {t('student.subjects.upcomingCount', { count: item.upcomingCount })}
                      </Pill>
                    )}
                  </div>

                  {/*
                   * The three numbers a learner actually acts on, each a link
                   * to the screen that resolves it. A count with nowhere to go
                   * is a reproach, not information.
                   */}
                  <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-sm">
                    {item.outstandingWorkCount > 0 && (
                      <Link href="./work" className="text-brand-600 underline">
                        {t('student.subjects.workCount', { count: item.outstandingWorkCount })}
                      </Link>
                    )}
                    {item.recordingCount > 0 && (
                      <Link
                        href={`./lessons?subject=${item.subject.id}`}
                        className="text-brand-600 underline"
                      >
                        {t('student.subjects.recordingCount', { count: item.recordingCount })}
                      </Link>
                    )}
                  </div>

                  {/* FR-RAT-001, and the promise that makes it safe to answer. */}
                  {item.teacher && (
                    <RatingControl
                      teacherUserId={item.teacher.id}
                      teacherName={item.teacher.displayName}
                      subjectId={item.subject.id}
                      subjectName={item.subject.name}
                      current={item.myRating}
                      onSaved={() => void refresh()}
                    />
                  )}

                  {!item.teacher && (
                    <p className="mt-3 text-sm text-ink-600">
                      {t('student.subjects.noTeacherYetBody')}
                    </p>
                  )}
                </Card>
                );
              })}
            </div>
          ) : (
            <Timetable slots={timetable} />
          ))}
      </ScreenState>
    </>
  );
}

/**
 * The week, grouped by day.
 *
 * Seven headings down one column rather than a seven-column grid: at 360px a
 * real week grid gives each day 45 pixels, which is narrower than the word
 * "Wednesday". The desktop rail has the room, but the phone is the reference
 * device and a layout that only works on the exception is the wrong layout.
 */
function Timetable({ slots }: { slots: TimetableSlotDto[] }) {
  const { t, language } = useI18n();

  const byDay = new Map<number, TimetableSlotDto[]>();
  for (const slot of slots) {
    const day = byDay.get(slot.weekday) ?? [];
    day.push(slot);
    byDay.set(slot.weekday, day);
  }

  return (
    <div className="space-y-4">
      {[1, 2, 3, 4, 5, 6, 7].map((weekday) => {
        const day = byDay.get(weekday) ?? [];
        // A day with nothing on it is still shown. A learner scanning for
        // Thursday needs to find Thursday and read "nothing", not fail to find
        // it and wonder whether the page is broken.
        return (
          <section key={weekday} className="space-y-2">
            <SectionHeading count={day.length || undefined}>
              {t(`student.weekday.${weekday}`)}
            </SectionHeading>

            {day.length === 0 ? (
              <p className="rounded-xl border border-dashed border-ink-300 px-3.5 py-3 text-sm text-ink-600">
                {t('student.subjects.noneThisWeek')}
              </p>
            ) : (
              day.map((slot) => (
                <div
                  key={slot.sessionId}
                  className={`flex items-center gap-3 rounded-xl border border-l-4 border-ink-300 bg-white p-3.5 ${subjectAccent(slot.subject.id).border}`}
                >
                  <span className="w-14 shrink-0 text-sm font-medium tabular-nums text-ink-900">
                    {timeOfDay(new Date(slot.startsAt), language)}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-ink-900">
                      {slot.subject.name}
                    </p>
                    {slot.teacher && (
                      <p className="truncate text-xs text-ink-600">
                        {t('student.subjects.taughtBy', { teacher: slot.teacher.displayName })}
                      </p>
                    )}
                  </div>
                  {slot.joinable && <Pill tone="success">{t('student.classes.liveNow')}</Pill>}
                </div>
              ))
            )}
          </section>
        );
      })}
    </div>
  );
}
