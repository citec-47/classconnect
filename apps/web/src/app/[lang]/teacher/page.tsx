'use client';

import Link from 'next/link';
import { teacherNavItems, type TeacherClassesResponse } from '@classconnect/shared';
import { useI18n } from '@/lib/i18n';
import { useAuth } from '@/lib/auth-context';
import { useCachedApi } from '@/lib/use-cached-api';
import { useTeacherApproval } from '@/lib/use-teacher-approval';
import { PageHeader } from '@/components/admin/ui';

interface Progress {
  week: {
    timetabledMinutes: number;
    taughtMinutes: number;
    extraMinutes: number;
    percent: number | null;
    confirmedSlots: number;
    proposedSlots: number;
  };
  built: { groups: number; lessons: number; exams: number };
  awaitingMarking: number;
  rating: { average: number | null; count: number; minBeforePublic: number };
}

/**
 * The teacher's overview.
 *
 * Now that the teaching screens exist it summarises them: the week's progress, what
 * the teacher has built, and the one thing that is a call to action rather than a
 * figure — work handed in and not yet marked (FR-HWK-008).
 *
 * Until an Admin approves the application (FR-TVR-005) this is a waiting room:
 * the figures are withheld rather than shown as zero, and the only thing to do
 * is finish verification.
 */
export default function TeacherHome() {
  const { t, language } = useI18n();
  const { user } = useAuth();
  const { approved, status, loading } = useTeacherApproval(language);

  /*
   * Nothing is asked for until the surface is open.
   *
   * `useCachedApi` skips the request entirely on a null path, so an unapproved
   * teacher does not sit through a call whose answer the page will not show —
   * and the API is not asked for a roster on behalf of someone who has none.
   */
  const { data } = useCachedApi<TeacherClassesResponse>(approved ? '/teacher/classes' : null, {
    language,
  });
  const { data: progress } = useCachedApi<Progress>(approved ? '/teacher/progress' : null, {
    language,
  });

  const totalClasses = data?.classes.length ?? 0;
  const totalLearners = data?.classes.reduce((sum, c) => sum + c.learnerCount, 0) ?? 0;

  if (!approved && !loading) {
    return (
      <>
        <PageHeader
          title={t('teacher.home.title', { name: user?.fullName ?? '' })}
          description={t('teacher.locked.description')}
        />

        {/* The one action available, stated as an action rather than a status. */}
        <div className="rounded-xl border border-brand-600 bg-brand-50 p-4">
          <h2 className="font-display text-lg font-semibold text-brand-700">
            {t('teacher.locked.title')}
          </h2>
          <p className="mt-1 max-w-prose text-sm text-ink-900">
            {t(`teacher.locked.status.${status ?? 'draft'}`)}
          </p>
          <Link
            href={`/${language}/teacher/verification`}
            className="cc-btn-primary mt-3 inline-flex"
          >
            {t('teacher.locked.action')}
          </Link>
        </div>

        {/*
         * The closed surface, shown rather than hidden.
         *
         * A teacher who can see what they are working towards understands the
         * wait; one shown an empty dashboard concludes the product is empty.
         * These are labels, not links — there is nothing behind them yet.
         *
         * Derived from `TEACHER_NAV` rather than listed here. The list used to be
         * six ids typed by hand, and it was six of twelve by the time the surface
         * was finished — so a teacher waiting for approval was shown half of what
         * they were waiting for. A screen added later now appears here on its own.
         */}
        <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {teacherNavItems()
            .filter((item) => !item.availableBeforeApproval)
            .map((item) => (
              <div
                key={item.id}
                aria-disabled="true"
                className="rounded-xl border border-dashed border-ink-300 bg-white/60 p-4"
              >
                <p className="text-xs font-medium uppercase tracking-wide text-ink-400">
                  {t(`teacherNav.${item.id}`)}
                </p>
                <p className="mt-1 text-sm text-ink-400">{t('teacherNav.lockedHint')}</p>
              </div>
            ))}
        </div>
      </>
    );
  }

  return (
    <>
      <PageHeader
        title={t('teacher.home.title', { name: user?.fullName ?? '' })}
        description={t('teacher.home.description')}
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        <div className="rounded-xl border border-ink-200 bg-white p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-ink-500">
            {t('teacher.home.classes')}
          </p>
          <p className="mt-1 text-3xl font-semibold tabular-nums text-ink-900">{totalClasses}</p>
          <Link
            href={`/${language}/teacher/classes`}
            className="mt-2 inline-flex min-h-touch items-center text-sm font-medium text-brand-700 hover:underline"
          >
            {t('teacher.home.viewClasses')}
          </Link>
        </div>

        <div className="rounded-xl border border-ink-200 bg-white p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-ink-500">
            {t('teacher.home.learners')}
          </p>
          <p className="mt-1 text-3xl font-semibold tabular-nums text-ink-900">{totalLearners}</p>
        </div>

        {/* FR-HWK-008: the only figure here that is a job rather than a summary. */}
        {progress && progress.awaitingMarking > 0 && (
          <div className="rounded-xl border border-warning-600 bg-warning-50 p-4">
            <p className="text-xs font-medium uppercase tracking-wide text-warning-600">
              {t('teacher.home.awaitingMarking')}
            </p>
            <p className="mt-1 text-3xl font-semibold tabular-nums text-ink-900">
              {progress.awaitingMarking}
            </p>
            <Link
              href={`/${language}/teacher/groups`}
              className="mt-2 inline-flex min-h-touch items-center text-sm font-medium text-brand-700 hover:underline"
            >
              {t('teacher.home.goMark')}
            </Link>
          </div>
        )}
      </div>

      {/*
       * The progress bar.
       *
       * Its measure is the confirmed timetable: hours taught against hours
       * timetabled this week. Not a performance score, and not a proportion of
       * anything unverified — see `teacher-progress.service.ts` for why that choice
       * rather than an invented one.
       */}
      {progress && (
        <section className="mt-4 rounded-xl border border-ink-200 bg-white p-4">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="font-display text-base font-semibold text-ink-900">
              {t('teacher.progress.title')}
            </h2>
            <p className="text-sm text-ink-600">
              {t('teacher.progress.hours', {
                taught: hours(progress.week.taughtMinutes),
                timetabled: hours(progress.week.timetabledMinutes),
              })}
            </p>
          </div>

          {progress.week.percent === null ? (
            /*
             * No confirmed hours means no denominator, so there is no bar to draw.
             * A 0% bar would read as "you have taught none of your week" rather
             * than "your week has not been agreed yet", which is the actual state
             * and the one with an action attached.
             */
            <p className="mt-2 text-sm text-ink-600">
              {progress.week.proposedSlots > 0
                ? t('teacher.progress.awaitingConfirmation', {
                    count: progress.week.proposedSlots,
                  })
                : t('teacher.progress.noTimetable')}
            </p>
          ) : (
            <>
              <div
                role="progressbar"
                aria-valuenow={progress.week.percent}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-label={t('teacher.progress.title')}
                className="mt-2 h-3 overflow-hidden rounded-full bg-ink-100"
              >
                <div
                  className="h-full rounded-full bg-brand-600 transition-[width]"
                  style={{ width: `${progress.week.percent}%` }}
                />
              </div>
              <p className="mt-1 text-sm tabular-nums text-ink-900">
                {t('teacher.progress.percent', { percent: progress.week.percent })}
              </p>
            </>
          )}

          {progress.week.extraMinutes > 0 && (
            <p className="mt-1 text-xs text-ink-600">
              {t('teacher.progress.extra', { hours: hours(progress.week.extraMinutes) })}
            </p>
          )}

          <div className="mt-3 grid gap-2 sm:grid-cols-3">
            <Built label={t('teacherNav.groups')} value={progress.built.groups} />
            <Built label={t('teacherNav.lessons')} value={progress.built.lessons} />
            <Built label={t('teacherNav.exams')} value={progress.built.exams} />
          </div>

          {/*
           * FR-RAT-002: an average from two ratings is noise, and publishing it as
           * a score would let one bad afternoon define a teacher. Below the
           * threshold the count is shown and the average is not.
           */}
          <p className="mt-3 text-sm text-ink-600">
            {progress.rating.count >= progress.rating.minBeforePublic &&
            progress.rating.average !== null
              ? t('teacher.progress.rating', {
                  average: progress.rating.average.toFixed(1),
                  count: progress.rating.count,
                })
              : t('teacher.progress.ratingPending', {
                  count: progress.rating.count,
                  needed: progress.rating.minBeforePublic,
                })}
          </p>
        </section>
      )}
    </>
  );
}

function Built({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-ink-200 p-2">
      <p className="text-xs font-medium uppercase tracking-wide text-ink-500">{label}</p>
      <p className="mt-0.5 text-xl font-semibold tabular-nums text-ink-900">{value}</p>
    </div>
  );
}

/** Minutes as hours to one place — `90` reads as `1.5`, not `1 h 30 min`. */
function hours(minutes: number): string {
  return (minutes / 60).toFixed(1);
}
