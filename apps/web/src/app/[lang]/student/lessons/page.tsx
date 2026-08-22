'use client';

import { useCallback, useState } from 'react';
import { useI18n } from '@/lib/i18n';
import { useStudent } from '@/lib/student-context';
import { useCachedApi } from '@/lib/use-cached-api';
import { api } from '@/lib/api';
import { fullDate } from '@/lib/student-format';
import { Card, PageTitle, ScreenState } from '@/components/student/ui';

/**
 * My lessons — the materials a teacher published to this learner's class.
 *
 * ## Not the same screen as My class videos
 *
 * That one is the recording of a lesson that happened; this is what was handed
 * out to read. They were briefly the same route — `/student/lessons` rendered
 * class videos — which is the kind of thing a learner notices once and then
 * stops trusting the navigation over. The two now own the words they mean.
 *
 * ## What is in the list
 *
 * Decided on the server, in `learner-materials.service.ts`: the learner's own
 * level, a subject they are enrolled in, scanned clean, and either published to
 * the class or addressed to them. A Form 4 learner who does not take Chemistry
 * is not shown the Chemistry worksheets even though they sit at the same level.
 * None of that is filtered here — a list narrowed in the browser is one
 * view-source away from being the whole archive.
 *
 * ## Two screens, one route
 *
 * Subjects, then the lessons in one of them, selected by local state rather
 * than a nested route. The learner is going one level down and straight back
 * up; a URL for the second level would be a link nobody shares and a back
 * button that leaves the app on the third press.
 */
interface SubjectRow {
  id: string;
  name: string;
  total: number;
  unread: number;
}

interface MaterialRow {
  id: string;
  title: string;
  subject: { id: string; name: string };
  topic: string | null;
  mimeType: string;
  sizeBytes: number;
  createdAt: string;
  read: boolean;
}

/** Bytes as something a learner on a metered connection can act on. */
function megabytes(bytes: number): string {
  return `${Math.max(1, Math.round(bytes / 1_000_00) / 10)} MB`;
}

export default function StudentLessons() {
  const { t, language } = useI18n();
  const { config } = useStudent();
  const [openSubject, setOpenSubject] = useState<SubjectRow | null>(null);

  const subjects = useCachedApi<SubjectRow[]>('/learner/materials', { language });
  const lessons = useCachedApi<MaterialRow[]>(
    openSubject ? `/learner/materials/${openSubject.id}` : null,
    { language },
  );

  /**
   * Opening a lesson marks it read, then fetches the signed URL.
   *
   * In that order, and both awaited before the window opens: a popup blocker
   * cares about the gesture, not the await, and getting the URL first would
   * leave a learner on a slow connection looking at a tab that opened before
   * anything was ready. The read is recorded even if the download then fails —
   * they did open it, and a badge that reappears after a dropped connection is
   * worse than one cleared slightly early.
   */
  const open = useCallback(
    async (material: MaterialRow) => {
      try {
        await api(`/learner/materials/${material.id}/read`, { method: 'POST', language });
      } catch {
        // The badge is not worth failing the open over.
      }
      try {
        const signed = await api<{ url: string }>(
          `/lessons/${material.id}/download-url`,
          { language },
        );
        window.open(signed.url, '_blank', 'noopener,noreferrer');
      } catch {
        // `api()` has already turned this into a message key; the list below
        // re-renders from the refresh either way.
      }
      void subjects.refresh();
      void lessons.refresh();
    },
    [language, subjects, lessons],
  );

  if (!config) return null;
  const large = config.typeScale === 'large';

  // ---- one subject -------------------------------------------------------
  if (openSubject) {
    return (
      <>
        <button
          type="button"
          onClick={() => setOpenSubject(null)}
          className="mb-2 text-sm text-brand-700 underline"
        >
          ← {t('student.myLessons.back')}
        </button>
        <PageTitle large={large}>{openSubject.name}</PageTitle>

        <ScreenState
          loading={lessons.loading}
          error={lessons.error}
          isEmpty={(lessons.data ?? []).length === 0}
          emptyTitle={t('student.myLessons.nothingInSubject')}
          emptyBody={t('student.myLessons.noneBody')}
          onRetry={() => void lessons.refresh()}
        >
          <ul className="flex flex-col gap-2">
              {(lessons.data ?? []).map((material) => (
                <li key={material.id}>
                  <Card>
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="font-medium text-ink-900">{material.title}</p>
                        {material.topic && (
                          <p className="text-sm text-ink-600">{material.topic}</p>
                        )}
                        <p className="mt-0.5 text-xs text-ink-600">
                          {t('student.myLessons.published', {
                            date: fullDate(new Date(material.createdAt), language),
                          })}
                        </p>
                      </div>
                      {/* The dot, not a word: it repeats for every unread row
                          and a sentence there would shout. */}
                      {!material.read && (
                        <span
                          aria-label={t('student.myLessons.unread', { count: 1 })}
                          className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full bg-danger-600"
                        />
                      )}
                    </div>

                    <button
                      type="button"
                      onClick={() => void open(material)}
                      className="mt-2 min-h-touch rounded-lg bg-brand-700 px-4 text-sm font-semibold text-white"
                    >
                      {t('student.myLessons.open')} · {megabytes(material.sizeBytes)}
                    </button>
                  </Card>
                </li>
              ))}
          </ul>
        </ScreenState>
      </>
    );
  }

  // ---- the subject list --------------------------------------------------
  return (
    <>
      <PageTitle large={large}>{t('student.myLessons.title')}</PageTitle>
      <p className="mb-3 text-sm text-ink-600">{t('student.myLessons.subtitle')}</p>

      <ScreenState
        loading={subjects.loading}
        error={subjects.error}
        isEmpty={(subjects.data ?? []).length === 0}
        emptyTitle={t('student.myLessons.none')}
        emptyBody={t('student.myLessons.noneBody')}
        onRetry={() => void subjects.refresh()}
      >
        <ul className="flex flex-col gap-2">
            {(subjects.data ?? []).map((subject) => (
              <li key={subject.id}>
                {/*
                  * A subject with nothing in it is still listed and still
                  * openable. A learner who finds four of their seven subjects
                  * missing concludes the app lost them; "nothing yet" is
                  * information, an absence is a bug report.
                  */}
                <button
                  type="button"
                  onClick={() => setOpenSubject(subject)}
                  className="w-full text-left"
                >
                  <Card>
                    <div className="flex items-center justify-between gap-3">
                      <span className="font-medium text-ink-900">{subject.name}</span>
                      {subject.unread > 0 ? (
                        <span className="shrink-0 rounded-full bg-danger-600 px-2 py-0.5 text-xs font-semibold text-white">
                          {t('student.myLessons.unread', { count: subject.unread })}
                        </span>
                      ) : (
                        <span className="shrink-0 text-xs text-ink-600">
                          {subject.total === 0
                            ? t('student.myLessons.nothingInSubject')
                            : t('student.myLessons.allRead')}
                        </span>
                      )}
                    </div>
                  </Card>
                </button>
              </li>
            ))}
        </ul>
      </ScreenState>
    </>
  );
}
