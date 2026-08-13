'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  REPORT_TERMS,
  REPORT_MARK_MAX,
  weightedAverage,
  type ReportTerm,
} from '@classconnect/shared';
import { useI18n } from '@/lib/i18n';
import { api, ApiError } from '@/lib/api';
import { PageHeader } from '@/components/admin/ui';
import { ErrorAlert, SuccessAlert } from '@/components/Alert';
import { TeacherGate } from '@/components/teacher/TeacherGate';

interface Named {
  id: string;
  nameEn: string;
  nameFr: string;
}

interface TeachingPair {
  subject: Named;
  level: Named;
}

interface MarkRow {
  learnerId: string;
  fullName: string;
  mark: number | null;
  comment: string | null;
  submittedAt: string | null;
}

interface Readiness {
  learnerCount: number;
  subjectsWithMarks: number;
  complete: boolean;
  subjects: { id: string; nameEn: string; nameFr: string; marksEntered: number }[];
}

/**
 * BUILD-PLAN Phase 6 — the teacher's half of the report sheet.
 *
 * A grid of the class, one mark each, and one coefficient for the subject. The
 * teacher does not generate report cards here and cannot: an average and a class
 * position depend on every colleague having finished, so generation is staff's
 * (`report:generate`) and this screen shows *readiness* instead — which subjects
 * are in and which are still missing.
 *
 * That is the honest division of the brief's "after all the teachers have submitted
 * their reports, one click generates them all". The click belongs to whoever can
 * see all of them.
 */
function TeacherReportsPage() {
  const { t, language } = useI18n();

  const [pairs, setPairs] = useState<TeachingPair[]>([]);
  const [error, setError] = useState<ApiError | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [selection, setSelection] = useState({
    pair: '',
    term: REPORT_TERMS[0] as ReportTerm,
    academicYear: defaultAcademicYear(),
    coefficient: '1',
  });
  const [rows, setRows] = useState<MarkRow[] | null>(null);
  const [marks, setMarks] = useState<Record<string, string>>({});
  const [readiness, setReadiness] = useState<Readiness | null>(null);

  const name = (item: Named) => (language === 'fr' ? item.nameFr : item.nameEn);

  useEffect(() => {
    void (async () => {
      try {
        const application = await api<{ subjects: TeachingPair[] }>('/teachers/me/application', {
          language,
        });
        setPairs(application.subjects);
        if (application.subjects.length > 0) {
          const first = application.subjects[0]!;
          setSelection((current) =>
            current.pair
              ? current
              : { ...current, pair: `${first.subject.id}:${first.level.id}` },
          );
        }
      } catch (caught) {
        setError(caught as ApiError);
      }
    })();
  }, [language]);

  const loadGrid = useCallback(async () => {
    const [subjectId, levelId] = selection.pair.split(':');
    if (!subjectId || !levelId) return;

    const query = new URLSearchParams({
      subjectId,
      levelId,
      term: selection.term,
      academicYear: selection.academicYear,
    });

    try {
      const [grid, ready] = await Promise.all([
        api<{ learners: MarkRow[]; coefficient: number }>(
          `/teacher/reports/marks?${query.toString()}`,
          { language },
        ),
        api<Readiness>(
          `/teacher/reports/readiness?levelId=${levelId}&term=${selection.term}&academicYear=${selection.academicYear}`,
          { language },
        ),
      ]);
      setRows(grid.learners);
      setReadiness(ready);
      setSelection((current) => ({ ...current, coefficient: String(grid.coefficient) }));
      setMarks(
        Object.fromEntries(
          grid.learners.map((row) => [row.learnerId, row.mark === null ? '' : String(row.mark)]),
        ),
      );
    } catch (caught) {
      setError(caught as ApiError);
      setRows([]);
    }
  }, [language, selection.pair, selection.term, selection.academicYear]);

  useEffect(() => {
    void loadGrid();
  }, [loadGrid]);

  /**
   * The class average, as the teacher types.
   *
   * The same `weightedAverage` the server uses to build a report card — with one
   * subject and one coefficient it reduces to a plain mean, which is exactly what
   * a teacher wants to see while entering marks. Using the shared function rather
   * than a local mean means the two cannot drift.
   */
  const classAverage = useMemo(() => {
    const entered = Object.values(marks)
      .filter((value) => value.trim() !== '')
      .map((value) => Number(value))
      .filter((value) => Number.isFinite(value));
    if (entered.length === 0) return null;
    return weightedAverage(
      entered.map((mark, index) => ({ subjectId: String(index), mark, coefficient: 1 })),
    );
  }, [marks]);

  const save = async () => {
    const [subjectId, levelId] = selection.pair.split(':');
    if (!subjectId || !levelId || !rows) return;

    const payload = rows
      // An empty box is "not marked yet", not zero. Sending it as zero would put a
      // failing mark on a child whose paper has not been read.
      .filter((row) => marks[row.learnerId]?.trim() !== '' && marks[row.learnerId] !== undefined)
      .map((row) => ({ learnerId: row.learnerId, mark: Number(marks[row.learnerId]) }));

    if (payload.length === 0) return;

    setBusy(true);
    setError(null);
    setDone(null);
    try {
      await api('/teacher/reports/marks', {
        method: 'POST',
        body: {
          subjectId,
          levelId,
          term: selection.term,
          academicYear: selection.academicYear,
          coefficient: Number(selection.coefficient) || 1,
          marks: payload,
        },
        language,
        timeoutMs: 120_000,
      });
      setDone(t('teacherReports.saved', { count: payload.length }));
      await loadGrid();
    } catch (caught) {
      setError(caught as ApiError);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <PageHeader title={t('teacherNav.reports')} description={t('teacherReports.description')} />

      <ErrorAlert error={error} />
      {done && <SuccessAlert>{done}</SuccessAlert>}

      <section className="mb-4 rounded-xl border border-ink-200 bg-white p-4">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <label className="block">
            <span className="cc-label">{t('timetable.classAndSubject')}</span>
            <select
              className="cc-field w-full"
              value={selection.pair}
              onChange={(e) => setSelection({ ...selection, pair: e.target.value })}
            >
              {pairs.map((pair) => (
                <option
                  key={`${pair.subject.id}:${pair.level.id}`}
                  value={`${pair.subject.id}:${pair.level.id}`}
                >
                  {name(pair.level)} · {name(pair.subject)}
                </option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="cc-label">{t('teacherReports.term')}</span>
            <select
              className="cc-field w-full"
              value={selection.term}
              onChange={(e) =>
                setSelection({ ...selection, term: e.target.value as ReportTerm })
              }
            >
              {REPORT_TERMS.map((term) => (
                <option key={term} value={term}>
                  {t(`teacherReports.termName.${term}`)}
                </option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="cc-label">{t('teacherReports.academicYear')}</span>
            <input
              type="text"
              className="cc-field w-full"
              placeholder="2026-2027"
              value={selection.academicYear}
              onChange={(e) => setSelection({ ...selection, academicYear: e.target.value })}
            />
          </label>

          <label className="block">
            <span className="cc-label">{t('teacherReports.coefficient')}</span>
            <input
              type="number"
              min={1}
              max={10}
              className="cc-field w-full"
              value={selection.coefficient}
              onChange={(e) => setSelection({ ...selection, coefficient: e.target.value })}
            />
          </label>
        </div>
        {/* What a coefficient does, where it is set. */}
        <p className="cc-hint">{t('teacherReports.coefficientHint')}</p>
      </section>

      {/* Readiness across the class — the answer to "can we generate yet". */}
      {readiness && (
        <section className="mb-4 rounded-xl border border-ink-200 bg-white p-4">
          <h2 className="font-display text-base font-semibold text-ink-900">
            {t('teacherReports.readinessTitle')}
          </h2>
          <p className="mt-1 text-sm text-ink-600">
            {t('teacherReports.readinessSummary', {
              done: readiness.subjectsWithMarks,
              total: readiness.subjects.length,
              learners: readiness.learnerCount,
            })}
          </p>
          <ul className="mt-2 flex flex-wrap gap-2">
            {readiness.subjects.map((subject) => (
              <li
                key={subject.id}
                className={[
                  'rounded-full px-2 py-0.5 text-[11px] font-medium',
                  subject.marksEntered > 0
                    ? 'bg-success-50 text-success-600'
                    : 'bg-ink-100 text-ink-600',
                ].join(' ')}
              >
                {language === 'fr' ? subject.nameFr : subject.nameEn}
              </li>
            ))}
          </ul>
          <p className="cc-hint">{t('teacherReports.generationIsStaff')}</p>
        </section>
      )}

      {/* The grid. */}
      {rows === null ? (
        <p className="text-sm text-ink-600">{t('common.loading')}</p>
      ) : rows.length === 0 ? (
        <p className="rounded-xl border border-ink-200 bg-white p-4 text-sm text-ink-600">
          {t('teacherReports.noLearners')}
        </p>
      ) : (
        <section className="rounded-xl border border-ink-200 bg-white p-4">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm text-ink-600">
              {t('teacherReports.markOutOf', { max: REPORT_MARK_MAX })}
            </p>
            {classAverage !== null && (
              <p className="text-sm font-medium text-ink-900">
                {t('teacherReports.classAverage', { average: classAverage.toFixed(2) })}
              </p>
            )}
          </div>

          {/* A wide table scrolls inside its own box; the page never scrolls sideways. */}
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-ink-200 text-left">
                  <th className="py-2 font-medium text-ink-600">{t('teacherReports.learner')}</th>
                  <th className="py-2 font-medium text-ink-600">{t('teacherReports.mark')}</th>
                  <th className="py-2 font-medium text-ink-600">{t('teacherReports.status')}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.learnerId} className="border-b border-ink-100 last:border-0">
                    <td className="py-1.5 text-ink-900">{row.fullName}</td>
                    <td className="py-1.5">
                      <input
                        type="number"
                        min={0}
                        max={REPORT_MARK_MAX}
                        step={0.25}
                        className="cc-field w-24"
                        value={marks[row.learnerId] ?? ''}
                        onChange={(e) =>
                          setMarks({ ...marks, [row.learnerId]: e.target.value })
                        }
                      />
                    </td>
                    <td className="py-1.5 text-xs text-ink-600">
                      {row.submittedAt
                        ? t('teacherReports.savedAlready')
                        : t('teacherReports.notYet')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <button
            type="button"
            className="cc-btn-primary mt-3"
            disabled={busy}
            onClick={() => void save()}
          >
            {busy ? t('common.saving') : t('teacherReports.submit')}
          </button>
        </section>
      )}
    </>
  );
}

/**
 * The Cameroonian academic year, guessed from today.
 *
 * It runs September to July, so anything from September onwards belongs to the
 * year that starts now and anything before it to the year that started last
 * autumn. A guess, and the field is editable — but the right guess almost always,
 * which beats making a teacher type it every term.
 */
function defaultAcademicYear(): string {
  const now = new Date();
  const startYear = now.getMonth() >= 8 ? now.getFullYear() : now.getFullYear() - 1;
  return `${startYear}-${startYear + 1}`;
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
    <TeacherGate titleKey="teacherNav.reports">
      <TeacherReportsPage />
    </TeacherGate>
  );
}
