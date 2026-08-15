'use client';

import { useEffect, useMemo, useState } from 'react';
import { useI18n } from '@/lib/i18n';
import { api, ApiError } from '@/lib/api';
import { PageHeader } from '@/components/admin/ui';
import { ErrorAlert } from '@/components/Alert';
import { TeacherGate } from '@/components/teacher/TeacherGate';
import { RecordingPlayer } from '@/components/RecordingPlayer';

interface Named {
  id: string;
  nameEn: string;
  nameFr: string;
}

interface Lesson {
  sessionId: string;
  taughtOn: string;
  subject: Named;
  cohort: { id: string; name: string } | null;
  learner: { id: string; fullName: string } | null;
  type: string;
  durationMin: number;
  attendedMinutes: number;
  recordingEnabled: boolean;
  recording: {
    id: string;
    durationSec: number;
    sizeBytes: string | null;
    availableUntil: string;
    audioAvailable: boolean;
  } | null;
  recordingState: 'ready' | 'processing' | 'in_progress' | 'not_recorded';
}

/**
 * My live classes — watching back what was taught.
 *
 * Grouped by day, which is the brief's "based on the days he has taught". Every
 * lesson appears whether or not there is a video: "no recording for Tuesday" and
 * "Tuesday never happened" are different pieces of news, and a list that showed
 * only the recorded ones would silently answer the second question with the first.
 *
 * There is no delete control here, deliberately. The brief says only an admin may
 * delete a live video, and `recording:delete` is granted to Ops and never to the
 * teacher who taught the lesson: a recording of a class containing children is
 * safeguarding evidence, and the person most motivated to remove it is exactly who
 * must not be able to.
 */
function TeacherRecordingsPage() {
  const { t, language } = useI18n();

  const [lessons, setLessons] = useState<Lesson[] | null>(null);
  const [error, setError] = useState<ApiError | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        const result = await api<{ lessons: Lesson[] }>('/teacher/recordings', { language });
        setLessons(result.lessons);
      } catch (caught) {
        setError(caught as ApiError);
        setLessons([]);
      }
    })();
  }, [language]);

  const name = (item: Named) => (language === 'fr' ? item.nameFr : item.nameEn);

  /** Grouped by calendar day, newest day first. */
  const byDay = useMemo(() => {
    const groups = new Map<string, Lesson[]>();
    for (const lesson of lessons ?? []) {
      const day = lesson.taughtOn.slice(0, 10);
      groups.set(day, [...(groups.get(day) ?? []), lesson]);
    }
    return [...groups.entries()].sort((a, b) => (a[0] < b[0] ? 1 : -1));
  }, [lessons]);

  return (
    <>
      <PageHeader
        title={t('teacherNav.recordings')}
        description={t('teacherRecordings.description')}
      />

      <ErrorAlert error={error} />

      {lessons === null ? (
        <p className="text-sm text-ink-600">{t('common.loading')}</p>
      ) : lessons.length === 0 ? (
        <p className="rounded-xl border border-ink-200 bg-white p-4 text-sm text-ink-600">
          {t('teacherRecordings.none')}
        </p>
      ) : (
        <div className="flex flex-col gap-5">
          {byDay.map(([day, dayLessons]) => (
            <section key={day}>
              <h2 className="mb-2 font-display text-base font-semibold text-ink-900">
                {new Date(`${day}T00:00:00`).toLocaleDateString(language, {
                  weekday: 'long',
                  day: 'numeric',
                  month: 'long',
                })}
              </h2>

              <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {dayLessons.map((lesson) => (
                  <li
                    key={lesson.sessionId}
                    className="rounded-xl border border-ink-200 bg-white p-3"
                  >
                    <p className="truncate text-sm font-semibold text-ink-900">
                      {name(lesson.subject)}
                    </p>
                    <p className="truncate text-xs text-ink-600">
                      {lesson.cohort?.name ?? lesson.learner?.fullName ?? '—'} ·{' '}
                      {t(`teacherRecordings.type.${lesson.type}`)}
                    </p>
                    <p className="mt-1 text-xs text-ink-600">
                      {t('teacherRecordings.attended', { minutes: lesson.attendedMinutes })}
                    </p>

                    {lesson.recording ? (
                      <div className="mt-2 space-y-1.5">
                        <p className="text-xs tabular-nums text-ink-600">
                          {t('teacherRecordings.length', {
                            minutes: Math.round(lesson.recording.durationSec / 60),
                          })}
                          {lesson.recording.sizeBytes
                            ? ` · ${megabytes(lesson.recording.sizeBytes)}`
                            : ''}
                        </p>

                        {/*
                         * The link is minted on the tap and it expires.
                         *
                         * This used to be a plain `<a href="/api/v1/teacher/...">`,
                         * which could not have worked: a browser navigation carries
                         * no `Authorization` header, so it reached the API
                         * unauthenticated — and the endpoint returns JSON describing
                         * a signed URL rather than the video itself. Both problems
                         * live in `RecordingPlayer`, once, for all three surfaces.
                         */}
                        <RecordingPlayer
                          endpoint="teacher"
                          recordingId={lesson.recording.id}
                          state="ready"
                          audioAvailable={lesson.recording.audioAvailable}
                          sizeBytes={
                            lesson.recording.sizeBytes === null
                              ? null
                              : Number(lesson.recording.sizeBytes)
                          }
                        />

                        <p className="text-xs text-ink-600">
                          {t('teacherRecordings.availableUntil', {
                            date: new Date(lesson.recording.availableUntil).toLocaleDateString(
                              language,
                            ),
                          })}
                        </p>
                      </div>
                    ) : (
                      /*
                       * Four reasons there is no video, and the teacher is told
                       * which one (NFR-USA-004).
                       */
                      <p className="mt-2 rounded-lg bg-ink-100 px-3 py-2 text-xs text-ink-600">
                        {t(`teacherRecordings.state.${lesson.recordingState}`)}
                      </p>
                    )}
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </>
  );
}

/** BigInt arrives as a string — `JSON.stringify` throws on one rather than rounding. */
function megabytes(bytes: string): string {
  const mb = Number(bytes) / (1024 * 1024);
  return mb < 1 ? '<1 MB' : `${mb.toFixed(1)} MB`;
}

/**
 * Closed until an Admin approves the application (FR-TVR-005).
 *
 * The gate wraps the screen rather than living inside it, so the component above
 * never renders — and therefore never fires the API calls that would 403 — while
 * the teacher is unapproved. See `TeacherGate`.
 */
export default function Page() {
  return (
    <TeacherGate titleKey="teacherNav.recordings">
      <TeacherRecordingsPage />
    </TeacherGate>
  );
}
