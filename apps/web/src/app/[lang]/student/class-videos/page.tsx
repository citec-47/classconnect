'use client';

import { Suspense, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import type { RecordingLibraryDto } from '@classconnect/shared';
import { useI18n } from '@/lib/i18n';
import { useStudent } from '@/lib/student-context';
import { useCachedApi } from '@/lib/use-cached-api';
import { fullDate, timeOfDay } from '@/lib/student-format';
import { PageTitle, Pill, ScreenState, SkeletonList } from '@/components/student/ui';
import { VideoIcon } from '@/components/student/icons';
import { subjectAccent } from '@/lib/subject-accent';
import { RecordingPlayer } from '@/components/RecordingPlayer';

/**
 * My class videos.
 *
 * ## What is in this list, and why the learner never has to ask
 *
 * Everything they are entitled to and nothing else, decided on the server from
 * the lesson behind each recording (`recordings.service.ts`):
 *
 * - their class's timetabled lessons **in the subjects they offer** — a classmate
 *   who does not take maths does not see the maths lesson;
 * - the groups they belong to;
 * - a private lesson taught to them;
 * - any invited call they were actually invited to.
 *
 * The filtering is a database `where`, not something this screen does. A list
 * filtered in the browser is one view-source away from being the whole archive,
 * and these are rooms full of children.
 *
 * ## Attendance changes the badge and nothing about access
 *
 * In Cameroon a missed lesson usually means the power went out or the phone was
 * with someone else (AS-08), and a platform that withheld the recording would be
 * charging a child for the grid. So a learner who missed Tuesday is told they
 * missed Tuesday, and then told they can still watch it — in that order, because
 * the second sentence is the one that matters.
 */
export default function StudentLessonsPage() {
  /*
   * `useSearchParams` forces this route out of static rendering unless the
   * component that reads it sits under a Suspense boundary. Without one,
   * `next build` fails rather than warning.
   */
  return (
    <Suspense fallback={<SkeletonList rows={4} />}>
      <StudentClassVideos />
    </Suspense>
  );
}

function StudentClassVideos() {
  const { t, language } = useI18n();
  const { config } = useStudent();
  const params = useSearchParams();
  const [subjectId, setSubjectId] = useState<string | null>(params?.get('subject') ?? null);

  const { data, loading, error, refresh } = useCachedApi<{ recordings: RecordingLibraryDto[] }>(
    '/learner/recordings',
    { language },
  );

  const all = useMemo(() => data?.recordings ?? [], [data]);

  const subjects = useMemo(() => {
    const map = new Map<string, string>();
    for (const item of all) {
      if (!item.subject) continue;
      map.set(item.subject.id, language === 'fr' ? item.subject.nameFr : item.subject.nameEn);
    }
    return [...map.entries()];
  }, [all, language]);

  // Filtered here only for the chips the learner pressed. Entitlement was
  // settled before the response left the API.
  const shown = subjectId ? all.filter((item) => item.subject?.id === subjectId) : all;

  /*
   * Split by what each recording *is*, using the scope the server derived.
   *
   * A private lesson sits with the class lessons rather than in a section of
   * its own: from the learner's side it is a lesson in one of their subjects,
   * which is exactly how they will look for it.
   */
  const lessons = shown.filter((item) => item.scope === 'class' || item.scope === 'one-to-one');
  const groups = shown.filter((item) => item.scope === 'group');
  const invited = shown.filter((item) => item.scope === 'invite');

  /** Class lessons under their subject, each subject keeping the newest-first order. */
  const bySubject = useMemo(() => {
    const map = new Map<string, { name: string; items: RecordingLibraryDto[] }>();
    for (const item of lessons) {
      const id = item.subject?.id ?? 'none';
      const name = item.subject
        ? language === 'fr'
          ? item.subject.nameFr
          : item.subject.nameEn
        : t('common.none');
      const seen = map.get(id);
      if (seen) seen.items.push(item);
      else map.set(id, { name, items: [item] });
    }
    return [...map.entries()].sort((a, b) => a[1].name.localeCompare(b[1].name));
  }, [lessons, language, t]);

  if (!config) return null;
  const large = config.typeScale === 'large';

  return (
    <>
      <PageTitle large={large}>{t('student.lessons.title')}</PageTitle>
      {/*
       * Said once, at the top. This is the screen's promise, and a learner should
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
        isEmpty={Boolean(data && shown.length === 0)}
        emptyTitle={t('student.lessons.none')}
        emptyBody={t('student.lessons.noneBody')}
        onRetry={() => void refresh()}
      >
        {/*
         * Three sections, because the three things are not alike.
         *
         * A class lesson belongs to a subject the learner offers; a group is a
         * set of people their teacher assembled; an invited call was a
         * conversation they were asked into. Listing them together sorted only
         * by date makes a learner hunt for Tuesday's maths among calls that have
         * nothing to do with it — and the brief asks for the first two by name.
         *
         * A section with nothing in it is not rendered at all rather than
         * rendered empty: an empty "My groups" heading reads as something
         * missing, when the truth is that this learner is in no groups.
         */}
        <div className="space-y-5">
          <Section title={t('student.lessons.sectionLessons')} large={large}>
            {/*
             * Grouped by subject, and by subject only here — the date is on
             * every card. A learner revising chemistry wants the chemistry
             * lessons together, not chemistry interleaved with English because
             * of when they happened to be taught.
             */}
            {bySubject.map(([id, group]) => (
              <div key={id} className="space-y-2">
                <h3 className="text-sm font-semibold text-ink-700">{group.name}</h3>
                <VideoGrid recordings={group.items} />
              </div>
            ))}
          </Section>

          <Section title={t('student.lessons.sectionGroups')} large={large}>
            <VideoGrid recordings={groups} />
          </Section>

          <Section title={t('student.lessons.sectionInvited')} large={large}>
            <VideoGrid recordings={invited} />
          </Section>
        </div>
      </ScreenState>
    </>
  );
}

/**
 * A titled section, or nothing at all.
 *
 * Returning null on empty is the point: a heading with no cards under it reads
 * as a failure to load, and a learner in no groups has not failed at anything.
 */
function Section({
  title,
  large,
  children,
}: {
  title: string;
  large: boolean;
  children: React.ReactNode;
}) {
  const empty =
    !children ||
    (Array.isArray(children) && children.every((child) => !child || (Array.isArray(child) && child.length === 0)));
  if (empty) return null;

  return (
    <section className="space-y-2">
      <h2 className={large ? 'text-lg font-semibold text-ink-900' : 'text-base font-semibold text-ink-900'}>
        {title}
      </h2>
      {children}
    </section>
  );
}

/**
 * One column on a phone, two from `sm`.
 *
 * A three-across grid of video thumbnails is the shape this content takes on a
 * laptop and the shape it must not take at 360px, where each card would be
 * about 110px wide and the subject name would truncate to two words.
 */
function VideoGrid({ recordings }: { recordings: RecordingLibraryDto[] }) {
  if (recordings.length === 0) return null;
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {recordings.map((recording) => (
        <VideoCard key={recording.id} recording={recording} />
      ))}
    </div>
  );
}

function VideoCard({ recording }: { recording: RecordingLibraryDto }) {
  const { t, language } = useI18n();
  const startedAt = new Date(recording.startedAt);
  const subjectName = recording.subject
    ? language === 'fr'
      ? recording.subject.nameFr
      : recording.subject.nameEn
    : t('common.none');

  const accent = subjectAccent(recording.subject?.id ?? recording.id);

  return (
    <article className="overflow-hidden rounded-xl border border-ink-300 bg-white">
      {/*
       * A generated poster rather than a real video frame. A thumbnail sheet is an
       * extra image request per card on a metered connection, and a still from a
       * lesson can show a child's face — which FR-SAF-007 keeps off any surface a
       * screenshot could travel from.
       */}
      <div className={`relative flex h-24 items-center justify-center ${accent.bg}`}>
        <VideoIcon className={`h-8 w-8 ${accent.text}`} />
        {recording.state === 'ready' && (
          <span className="absolute bottom-2 right-2 rounded bg-ink-900/80 px-1.5 py-0.5 text-xs tabular-nums text-white">
            {Math.max(1, Math.round(recording.durationSec / 60))} min
          </span>
        )}
      </div>

      <div className="space-y-2 p-3.5">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-ink-900">{subjectName}</p>
            <p className="truncate text-xs text-ink-600">
              {fullDate(startedAt, language)} · {timeOfDay(startedAt, language)}
            </p>
          </div>
          {/*
           * Which guest list this came from, so a learner can tell their class
           * lesson from a group exercise from a private call at a glance.
           */}
          <Pill tone="neutral">{t(`recordings.scope.${recording.scope}`)}</Pill>
        </div>

        {recording.cohort && (
          <p className="truncate text-xs text-ink-600">{recording.cohort.name}</p>
        )}
        {recording.teacherName && (
          <p className="truncate text-xs text-ink-600">
            {t('student.subjects.taughtBy', { teacher: recording.teacherName })}
          </p>
        )}

        {/* The link is minted on the tap, and it expires. See RecordingPlayer. */}
        <RecordingPlayer
          endpoint="learner"
          recordingId={recording.id}
          state={recording.state}
          audioAvailable={recording.audioAvailable}
          audioSizeBytes={recording.audioSizeBytes}
          sizeBytes={recording.sizeBytes}
        />

        {recording.state === 'ready' && (
          <p className="text-xs text-ink-600">
            {t('student.lessons.availableUntil', {
              date: fullDate(new Date(recording.availableUntil), language),
            })}
          </p>
        )}
      </div>
    </article>
  );
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
