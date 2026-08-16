'use client';

import { useCallback, useEffect, useState } from 'react';
import { ACADEMIC_CATEGORIES, REPORT_TERMS, type AcademicCategory } from '@classconnect/shared';
import { useI18n } from '@/lib/i18n';
import { api, ApiError } from '@/lib/api';
import { PageHeader } from '@/components/admin/ui';
import { ErrorAlert, SuccessAlert } from '@/components/Alert';

/**
 * Academic Results — category, then class, then subject, then the marks.
 *
 * ## Why it looks like General Past Classes
 *
 * Deliberately the same shape: four categories, a class, then the thing inside
 * it. An admin who has learned one drill-down has learned both, and the two
 * screens answer the same question about the same children from different sides.
 *
 * ## Why the term is chosen before anything is browsed
 *
 * A mark belongs to a term. Defaulting to "the current one" would show last
 * term's marks under this term's heading with nothing on screen to say so, and
 * the compile button would then rank a term the admin did not mean. So the term
 * and the academic year sit at the top, always visible, and travel into every
 * request.
 *
 * ## Compiling is not publishing
 *
 * Two buttons, because they are two acts. Compiling writes the sheets and ranks
 * them where only staff can see; publishing is what puts a sheet on a child's
 * dashboard. The brief asks for exactly that gap, so an admin can compile, read,
 * correct a mark and compile again before any family sees a number.
 */

interface ClassRow {
  id: string;
  nameEn: string;
  nameFr: string;
  learnerCount: number;
}

interface SubjectRow {
  id: string;
  nameEn: string;
  nameFr: string;
  learnerCount: number;
}

interface StudentRow {
  learnerId: string;
  fullName: string;
  mark: number | null;
  coefficient: number | null;
}

export default function AdminAcademicResultsPage() {
  const { t, language } = useI18n();

  const [category, setCategory] = useState<AcademicCategory | null>(null);
  const [level, setLevel] = useState<ClassRow | null>(null);
  const [subject, setSubject] = useState<SubjectRow | null>(null);

  const [term, setTerm] = useState<string>(REPORT_TERMS[0]);
  const [academicYear, setAcademicYear] = useState('2025-2026');

  const [classes, setClasses] = useState<ClassRow[] | null>(null);
  const [subjects, setSubjects] = useState<{ classSize: number; subjects: SubjectRow[] } | null>(null);
  const [students, setStudents] = useState<StudentRow[] | null>(null);

  const [error, setError] = useState<ApiError | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const name = (item: { nameEn: string; nameFr: string }) =>
    language === 'fr' ? item.nameFr : item.nameEn;

  /* Each step loads only what the step below it needs. */
  useEffect(() => {
    if (!category) return;
    setClasses(null);
    void api<{ classes: ClassRow[] }>(`/admin/academic-results/${category}/classes`, { language })
      .then((r) => setClasses(r.classes))
      .catch((e) => setError(e as ApiError));
  }, [category, language]);

  useEffect(() => {
    if (!category || !level) return;
    setSubjects(null);
    void api<{ classSize: number; subjects: SubjectRow[] }>(
      `/admin/academic-results/${category}/classes/${level.id}/subjects`,
      { language },
    )
      .then(setSubjects)
      .catch((e) => setError(e as ApiError));
  }, [category, level, language]);

  useEffect(() => {
    if (!category || !level || !subject) return;
    setStudents(null);
    void api<{ students: StudentRow[] }>(
      `/admin/academic-results/${category}/classes/${level.id}/subjects/${subject.id}/students` +
        `?term=${encodeURIComponent(term)}&academicYear=${encodeURIComponent(academicYear)}`,
      { language },
    )
      .then((r) => setStudents(r.students))
      .catch((e) => setError(e as ApiError));
  }, [category, level, subject, term, academicYear, language]);

  const compile = useCallback(
    async (publish: boolean) => {
      if (!level) return;
      setBusy(true);
      setError(null);
      setNotice(null);
      try {
        const result = await api<{ generated?: number; count?: number }>(
          '/admin/academic-results/compile',
          {
            method: 'POST',
            language,
            timeoutMs: 120_000,
            body: { levelId: level.id, term, academicYear, publish },
          },
        );
        const written = result.generated ?? result.count ?? 0;
        setNotice(
          t(publish ? 'academicResults.published' : 'academicResults.compiled', {
            count: String(written),
            class: name(level),
          }),
        );
      } catch (caught) {
        setError(caught as ApiError);
      } finally {
        setBusy(false);
      }
    },
    [level, term, academicYear, language, t],
  );

  return (
    <>
      <PageHeader
        title={t('adminNav.academicResults')}
        description={t('academicResults.description')}
      />

      <ErrorAlert error={error} />
      {notice && <SuccessAlert>{notice}</SuccessAlert>}

      {/*
        * The term travels with every request, so it is chosen once and stays
        * visible. Hidden in a submenu it would be the thing an admin forgot
        * before compiling a term they did not mean.
        */}
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <label className="text-sm text-ink-700" htmlFor="term">
          {t('academicResults.term')}
        </label>
        <select
          id="term"
          value={term}
          onChange={(event) => setTerm(event.target.value)}
          className="min-h-touch rounded-lg border border-ink-300 px-2 text-sm"
        >
          {REPORT_TERMS.map((value) => (
            <option key={value} value={value}>
              {t(`teacherReports.termName.${value}`)}
            </option>
          ))}
        </select>

        <label className="text-sm text-ink-700" htmlFor="year">
          {t('academicResults.year')}
        </label>
        <input
          id="year"
          value={academicYear}
          onChange={(event) => setAcademicYear(event.target.value)}
          placeholder="2025-2026"
          className="min-h-touch w-32 rounded-lg border border-ink-300 px-2 text-sm"
        />
      </div>

      {/* The trail back out, one button per step. */}
      {category && (
        <nav className="mb-3 flex flex-wrap items-center gap-1 text-sm">
          <button
            type="button"
            className="min-h-touch rounded-lg px-2 text-brand-700 underline"
            onClick={() => {
              setCategory(null);
              setLevel(null);
              setSubject(null);
            }}
          >
            {t('adminNav.academicResults')}
          </button>
          <span aria-hidden className="text-ink-400">/</span>
          <button
            type="button"
            className="min-h-touch rounded-lg px-2 text-brand-700 underline"
            onClick={() => {
              setLevel(null);
              setSubject(null);
            }}
          >
            {t(`adminRecordings.band.${category}`)}
          </button>
          {level && (
            <>
              <span aria-hidden className="text-ink-400">/</span>
              <button
                type="button"
                className="min-h-touch rounded-lg px-2 text-brand-700 underline"
                onClick={() => setSubject(null)}
              >
                {name(level)}
              </button>
            </>
          )}
          {subject && (
            <>
              <span aria-hidden className="text-ink-400">/</span>
              <span className="px-2 text-ink-700">{name(subject)}</span>
            </>
          )}
        </nav>
      )}

      {/* Step one: the four categories, in the order they are named everywhere. */}
      {!category && (
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {ACADEMIC_CATEGORIES.map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => setCategory(value)}
              className="min-h-touch rounded-lg border border-ink-300 p-3 text-left hover:border-brand-600"
            >
              <span className="block text-sm font-medium text-ink-900">
                {t(`adminRecordings.band.${value}`)}
              </span>
            </button>
          ))}
        </div>
      )}

      {/* Step two: the classes, empty ones included so nothing looks missing. */}
      {category && !level && (
        <div className="grid gap-2 sm:grid-cols-3 lg:grid-cols-4">
          {classes === null ? (
            <p className="text-sm text-ink-600">{t('common.loading')}</p>
          ) : (
            classes.map((row) => (
              <button
                key={row.id}
                type="button"
                onClick={() => setLevel(row)}
                className="min-h-touch rounded-lg border border-ink-300 p-3 text-left hover:border-brand-600"
              >
                <span className="block text-sm font-medium text-ink-900">{name(row)}</span>
                <span className="text-xs text-ink-600">
                  {t('academicResults.learnerCount', { count: String(row.learnerCount) })}
                </span>
              </button>
            ))
          )}
        </div>
      )}

      {/* Step three: the subjects, and the button that compiles the whole class. */}
      {category && level && !subject && (
        <>
          <div className="mb-3 flex flex-wrap items-center gap-2 rounded-lg border border-ink-200 bg-white p-3">
            <p className="mr-auto text-sm text-ink-700">
              {t('academicResults.compileHint', { class: name(level) })}
            </p>
            <button
              type="button"
              disabled={busy}
              onClick={() => void compile(false)}
              className="min-h-touch rounded-lg border border-ink-300 px-3 text-sm disabled:opacity-50"
            >
              {busy ? t('common.saving') : t('academicResults.compile')}
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => void compile(true)}
              className="min-h-touch rounded-lg bg-brand-600 px-3 text-sm font-medium text-white disabled:opacity-50"
            >
              {t('academicResults.publish')}
            </button>
          </div>

          <div className="grid gap-2 sm:grid-cols-3 lg:grid-cols-4">
            {subjects === null ? (
              <p className="text-sm text-ink-600">{t('common.loading')}</p>
            ) : subjects.subjects.length === 0 ? (
              <p className="text-sm text-ink-600">{t('academicResults.noSubjects')}</p>
            ) : (
              subjects.subjects.map((row) => (
                <button
                  key={row.id}
                  type="button"
                  onClick={() => setSubject(row)}
                  className="min-h-touch rounded-lg border border-ink-300 p-3 text-left hover:border-brand-600"
                >
                  <span className="block text-sm font-medium text-ink-900">{name(row)}</span>
                  <span className="text-xs text-ink-600">
                    {t('academicResults.offeredBy', { count: String(row.learnerCount) })}
                  </span>
                </button>
              ))
            )}
          </div>
        </>
      )}

      {/*
        * Step four: the names and the marks.
        *
        * Cards rather than a table, and one column on a phone: a mark sheet is
        * two facts per row, and a two-column table shrunk to 360px is less
        * readable than a list.
        */}
      {category && level && subject && (
        <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {students === null ? (
            <p className="text-sm text-ink-600">{t('common.loading')}</p>
          ) : students.length === 0 ? (
            <p className="text-sm text-ink-600">{t('academicResults.noStudents')}</p>
          ) : (
            students.map((row) => (
              <li
                key={row.learnerId}
                className="flex items-center justify-between gap-2 rounded-lg border border-ink-200 bg-white p-3"
              >
                <span className="min-w-0 truncate text-sm text-ink-900">{row.fullName}</span>
                {/*
                  * A missing mark says so. Shown as a blank it would read as a
                  * zero, and a zero is a very different thing to tell a family.
                  */}
                <span
                  className={
                    row.mark === null
                      ? 'shrink-0 text-xs text-warning-600'
                      : 'shrink-0 text-sm font-semibold tabular-nums text-ink-900'
                  }
                >
                  {row.mark === null ? t('academicResults.noMark') : row.mark.toFixed(2)}
                </span>
              </li>
            ))
          )}
        </ul>
      )}
    </>
  );
}
