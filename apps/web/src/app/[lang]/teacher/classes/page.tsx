'use client';

import { useState } from 'react';
import {
  CLASS_BANDS,
  levelName,
  subjectName,
  type ClassBand,
  type TeacherClassesResponse,
} from '@classconnect/shared';
import { useI18n } from '@/lib/i18n';
import { useCachedApi } from '@/lib/use-cached-api';
import { PageHeader } from '@/components/admin/ui';
import { TeacherGate } from '@/components/teacher/TeacherGate';

/**
 * "The teacher should see the different classes they teach … When the teacher
 * clicks on each of the classes it should show all the classes they are
 * teaching and the number of students in each class."
 *
 * So: four tiles, and one opens at a time. A band with nothing in it stays on
 * screen rather than disappearing — a teacher assigned no private learners
 * needs to see that Private Classes exists and is empty, not be left wondering
 * whether the platform lost them.
 *
 * The counts are computed by the API and re-derivable from the same shared
 * function the API used, so the tile and the list behind it cannot disagree.
 */
function TeacherClasses() {
  const { t, language } = useI18n();
  const [open, setOpen] = useState<ClassBand | null>(null);

  const { data, loading, error, refresh } = useCachedApi<TeacherClassesResponse>(
    '/teacher/classes',
    { language },
  );

  const bands = data?.bands ?? [];
  const classes = data?.classes ?? [];

  return (
    <>
      <PageHeader
        title={t('teacher.classes.title')}
        description={t('teacher.classes.description')}
      />

      {loading && <p className="text-sm text-ink-600">{t('common.loading')}</p>}

      {error && (
        <div
          role="alert"
          className="rounded-lg border border-danger-600 bg-danger-50 p-3 text-sm text-danger-600"
        >
          <p className="font-medium">{t(error.messageKey)}</p>
          <button
            type="button"
            onClick={() => void refresh()}
            className="mt-2 min-h-touch rounded-lg border border-danger-600 px-3 text-sm font-medium"
          >
            {t('common.retry')}
          </button>
        </div>
      )}

      {!loading && !error && (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {CLASS_BANDS.map((band) => {
            const summary = bands.find((b) => b.band === band);
            const isOpen = open === band;

            return (
              <button
                key={band}
                type="button"
                aria-expanded={isOpen}
                onClick={() => setOpen(isOpen ? null : band)}
                className={[
                  'rounded-xl border p-4 text-left transition',
                  isOpen
                    ? 'border-brand-600 bg-brand-50'
                    : 'border-ink-200 bg-white hover:border-ink-300',
                ].join(' ')}
              >
                <p className="text-sm font-semibold text-ink-900">
                  {t(`teacher.classes.band.${band}`)}
                </p>
                <p className="mt-2 text-2xl font-semibold tabular-nums text-ink-900">
                  {summary?.classCount ?? 0}
                </p>
                <p className="text-xs text-ink-600">
                  {t('teacher.classes.learnerCount', {
                    count: summary?.learnerCount ?? 0,
                  })}
                </p>
              </button>
            );
          })}
        </div>
      )}

      {open && (
        <section className="mt-5 rounded-xl border border-ink-200 bg-white">
          <h2 className="border-b border-ink-200 px-4 py-3 text-sm font-semibold text-ink-900">
            {t(`teacher.classes.band.${open}`)}
          </h2>

          {classes.filter((c) => c.band === open).length === 0 ? (
            <p className="px-4 py-6 text-sm text-ink-600">{t('teacher.classes.bandEmpty')}</p>
          ) : (
            <table className="w-full text-sm">
              <thead className="text-left text-xs uppercase tracking-wide text-ink-500">
                <tr className="border-b border-ink-200">
                  <th scope="col" className="px-4 py-2 font-medium">
                    {t('teacher.classes.column.name')}
                  </th>
                  <th scope="col" className="px-4 py-2 font-medium">
                    {t('teacher.classes.column.level')}
                  </th>
                  <th scope="col" className="px-4 py-2 font-medium">
                    {t('teacher.classes.column.subject')}
                  </th>
                  <th scope="col" className="px-4 py-2 text-right font-medium">
                    {t('teacher.classes.column.students')}
                  </th>
                </tr>
              </thead>
              <tbody>
                {classes
                  .filter((c) => c.band === open)
                  .map((cls) => (
                    <tr key={`${cls.kind}:${cls.id}`} className="border-b border-ink-100 last:border-0">
                      <td className="px-4 py-2 font-medium text-ink-900">{cls.name}</td>
                      <td className="px-4 py-2 text-ink-600">
                        {levelName(cls, language) ?? t('common.notRecorded')}
                      </td>
                      <td className="px-4 py-2 text-ink-600">{subjectName(cls, language)}</td>
                      <td className="px-4 py-2 text-right tabular-nums text-ink-900">
                        {cls.learnerCount}
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          )}
        </section>
      )}
    </>
  );
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
    <TeacherGate titleKey="teacherNav.classes">
      <TeacherClasses />
    </TeacherGate>
  );
}
