'use client';

import { Suspense, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import type { PastLessonDto } from '@classconnect/shared';
import { useI18n } from '@/lib/i18n';
import { useStudent } from '@/lib/student-context';
import { useCachedApi } from '@/lib/use-cached-api';
import { fileSize, fullDate, timeOfDay } from '@/lib/student-format';
import { PageTitle, Pill, ScreenState, SkeletonList } from '@/components/student/ui';
import { VideoIcon } from '@/components/student/icons';
import { subjectAccent } from '@/lib/subject-accent';

/**
 * My past lessons.
 *
 * The organising idea, and the reason this is its own screen rather than a
 * filter inside Classes: **every lesson is here whether or not the learner
 * attended.** In Cameroon a missed lesson usually means the power went out or
 * the phone was with someone else (AS-08), and a platform that withheld the
 * recording would be charging a child for the grid.
 *
 * So attendance changes the badge on the card and nothing about access. A
 * learner who missed Tuesday is told they missed Tuesday, and then told they
 * can still watch it — in that order, because the second sentence is the one
 * that matters.
 */
/**
 * `useSearchParams` forces this route out of static rendering unless the
 * component that reads it sits under a Suspense boundary. Without one,
 * `next build` fails rather than warning, so the boundary is part of the page
 * rather than something to remember later.
 */
export default function StudentLessonsPage() {
  return (
    <Suspense fallback={<SkeletonList rows={4} />}>
      <StudentLessons />
    </Suspense>
  );
}

function StudentLessons() {
  const { t, language } = useI18n();
  const { config } = useStudent();
  const params = useSearchParams();
  const subjectParam = params.get('subject');
  const [subjectId, setSubjectId] = useState<string | null>(subjectParam);

  const path = subjectId ? `/learner/lessons?subjectId=${subjectId}` : '/learner/lessons';
  const { data, loading, error, refresh } = useCachedApi<PastLessonDto[]>(path, { language });

  const subjects = useMemo(() => {
    const map = new Map<string, string>();
    for (const lesson of data ?? []) map.set(lesson.subject.id, lesson.subject.name);
    return [...map.entries()];
  }, [data]);

  if (!config) return null;
  const large = config.typeScale === 'large';

  return (
    <>
      <PageTitle large={large}>{t('student.lessons.title')}</PageTitle>
      {/*
       * Said once, at the top. This is the screen's promise and a learner should
       * not have to infer it from a card they were afraid to open.
       */}
      <p className="text-sm text-ink-600">{t('student.lessons.subtitle')}</p>

      {subjects.length > 1 && (
        <div className="flex flex-wrap gap-2">
          <FilterChip
            label={t('student.lessons.filterAll')}
            active={subjectId === null}
            onClick={() => setSubjectId(null)}
          />
          {subjects.map(([id, name]) => (
            <FilterChip
              key={id}
              label={name}
              active={subjectId === id}
              onClick={() => setSubjectId(id)}
            />
          ))}
        </div>
      )}

      <ScreenState
        loading={loading}
        error={error}
        isEmpty={Boolean(data && data.length === 0)}
        emptyTitle={t('student.lessons.none')}
        emptyBody={t('student.lessons.noneBody')}
        onRetry={() => void refresh()}
      >
        {/*
         * One column on a phone, two from `sm`. A three-across grid of video
         * thumbnails is the shape this content takes on a laptop and the shape
         * it must not take on 360px, where each card would be 110px wide.
         */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {(data ?? []).map((lesson) => (
            <LessonCard key={lesson.sessionId} lesson={lesson} />
          ))}
        </div>
      </ScreenState>
    </>
  );
}

function LessonCard({ lesson }: { lesson: PastLessonDto }) {
  const { t, language } = useI18n();
  const startedAt = new Date(lesson.startedAt);
  const ready = lesson.recordingState === 'ready' && lesson.recording;

  return (
    <article className="overflow-hidden rounded-xl border border-ink-300 bg-white">
      {/*
       * A generated poster rather than a real video frame. A thumbnail sheet is
       * an extra image request per card on a metered connection, and a still
       * from a lesson can show a child's face — which FR-SAF-007 keeps off any
       * surface a screenshot could travel from.
       */}
      {/* Tinted by subject, so a wall of lesson cards is scannable. */}
      <div
        className={`relative flex h-24 items-center justify-center ${subjectAccent(lesson.subject.id).bg}`}
      >
        <VideoIcon className={`h-8 w-8 ${subjectAccent(lesson.subject.id).text}`} />
        {ready && lesson.recording && (
          <span className="absolute bottom-2 right-2 rounded bg-ink-900/80 px-1.5 py-0.5 text-xs tabular-nums text-white">
            {Math.round(lesson.recording.durationSec / 60)} min
          </span>
        )}
      </div>

      <div className="space-y-2 p-3.5">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-ink-900">{lesson.subject.name}</p>
            <p className="truncate text-xs text-ink-600">
              {fullDate(startedAt, language)} · {timeOfDay(startedAt, language)}
            </p>
          </div>
          <Pill tone={lesson.attended ? 'success' : 'neutral'}>
            {lesson.attended ? t('student.lessons.attended') : t('student.lessons.missed')}
          </Pill>
        </div>

        {lesson.teacher && (
          <p className="truncate text-xs text-ink-600">
            {t('student.subjects.taughtBy', { teacher: lesson.teacher.displayName })}
          </p>
        )}

        {/* The reassurance goes with the bad news, not on a help page. */}
        {!lesson.attended && ready && (
          <p className="text-xs text-ink-600">{t('student.lessons.missedBody')}</p>
        )}

        {ready && lesson.recording ? (
          <div className="space-y-1.5">
            <a
              href={`/api/v1/learner/recordings/${lesson.recording.id}`}
              className="flex min-h-touch items-center justify-center rounded-lg bg-brand-600 px-3 text-sm font-medium text-white"
            >
              {t('student.lessons.watch')}
              {lesson.recording.estimatedBytes && (
                <span className="ml-2 text-xs font-normal text-white/80">
                  {t('student.data.estimate', {
                    size: fileSize(lesson.recording.estimatedBytes),
                  })}
                </span>
              )}
            </a>

            {/*
             * NFR-BAN-001/002: audio is roughly a twelfth of the bytes. On a
             * metered 3G connection this is the difference between a learner
             * revising and a learner deciding they cannot afford to.
             */}
            {lesson.recording.audioAvailable && (
              <a
                href={`/api/v1/learner/recordings/${lesson.recording.id}?audio=1`}
                className="flex min-h-touch items-center justify-center rounded-lg border border-ink-300 px-3 text-sm text-ink-700"
              >
                {t('student.lessons.watchAudio')}
                {lesson.recording.audioEstimatedBytes && (
                  <span className="ml-2 text-xs text-ink-600">
                    {t('student.data.estimate', {
                      size: fileSize(lesson.recording.audioEstimatedBytes),
                    })}
                  </span>
                )}
              </a>
            )}

            <p className="text-xs text-ink-600">
              {t('student.lessons.availableUntil', {
                date: fullDate(new Date(lesson.recording.availableUntil), language),
              })}
            </p>
          </div>
        ) : (
          /*
           * NFR-USA-004: four different reasons there is no video, and the
           * learner is told which one. "Ready in an hour" and "gone for good"
           * are not the same news.
           */
          <p className="rounded-lg bg-ink-100 px-3 py-2 text-xs text-ink-600">
            {t(`student.lessons.${camel(lesson.recordingState)}`)}
          </p>
        )}
      </div>
    </article>
  );
}

function camel(state: PastLessonDto['recordingState']): string {
  return state === 'not_recorded' ? 'notRecorded' : state;
}

function FilterChip({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={[
        'min-h-touch rounded-full border px-3 text-sm',
        active ? 'border-brand-600 bg-brand-50 text-brand-700' : 'border-ink-300 text-ink-600',
      ].join(' ')}
    >
      {label}
    </button>
  );
}
