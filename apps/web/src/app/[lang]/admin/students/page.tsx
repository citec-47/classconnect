'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useI18n } from '@/lib/i18n';
import { useAutoRecover } from '@/lib/use-auto-recover';
import { api, ApiError } from '@/lib/api';
import { ErrorAlert, EmptyState } from '@/components/Alert';
import type { SchoolType } from '@/components/SchoolTypePicker';

interface Student {
  id: string;
  fullName: string;
  dob: string;
  isMinor: boolean;
  schoolType: SchoolType | null;
  enrolmentType: 'school' | 'private';
  level: { id: string; nameEn: string; nameFr: string } | null;
  subjects: { id: string; nameEn: string; nameFr: string }[];
  hasOwnSignIn: boolean;
  /** The account, not the learner. Null when they have no sign-in of their own. */
  userId: string | null;
  guardians: string[];
}

/**
 * The four bands are not one dimension.
 *
 * Primary, Secondary and Sixth Form come from the learner's level. Private is an
 * `EnrolmentType` and can be true of a learner at any of them — a private Class
 * One learner sits at the Primary Class One level and is not in that class. So
 * the filter is one row with two independent groups rather than five mutually
 * exclusive chips pretending otherwise.
 */
type Band = 'all' | SchoolType | 'private';

/** Admin's view of every student account, filterable by band. */
export default function AdminStudents() {
  const { language, t } = useI18n();

  const [students, setStudents] = useState<Student[] | null>(null);
  const [filter, setFilter] = useState<Band>('all');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const query =
        filter === 'all'
          ? ''
          : filter === 'private'
            ? '?enrolment=private'
            : `?schoolType=${filter}`;
      setStudents(await api<Student[]>(`/admin/accounts/students${query}`, { language }));
      /*
       * Selection is cleared when the list changes underneath it. Keeping ticks
       * across a filter change would mean pressing Delete on a list that no
       * longer shows everything it is about to remove.
       */
      setSelected(new Set());
      setConfirming(false);
    } catch (caught) {
      setError(caught as ApiError);
      setStudents([]);
    }
  }, [language, filter]);

  useEffect(() => {
    void load();
  }, [load]);

  /*
   * AS-08: a screen that failed while the API was restarting must not stay
   * failed once it answers again. Retries on reconnect, on refocus, and
   * slowly while the error stands.
   */
  useAutoRecover(load, error !== null);

  const name = (item: { nameEn: string; nameFr: string }) =>
    language === 'fr' ? item.nameFr : item.nameEn;

  /** Only accounts can be deleted; a learner with no sign-in has none. */
  const deletable = (students ?? []).filter((student) => student.userId !== null);

  const toggle = (userId: string) => {
    setConfirming(false);
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(userId)) next.delete(userId);
      else next.add(userId);
      return next;
    });
  };

  const toggleAll = () => {
    setConfirming(false);
    setSelected((current) =>
      current.size === deletable.length
        ? new Set()
        : new Set(deletable.map((student) => student.userId!)),
    );
  };

  const remove = async () => {
    if (selected.size === 0 || deleting) return;
    setDeleting(true);
    setError(null);
    try {
      await api('/admin/people/delete', {
        method: 'POST',
        body: { userIds: [...selected] },
        language,
        // Deleting thirty accounts is thirty soft deletes and an audit row each.
        timeoutMs: 120_000,
      });
      await load();
    } catch (caught) {
      setError(caught as ApiError);
    } finally {
      setDeleting(false);
    }
  };

  const bandLabel = (student: Student) =>
    student.enrolmentType === 'private'
      ? t('admin.schoolPrivate')
      : student.schoolType === 'primary'
        ? t('admin.schoolPrimary')
        : student.schoolType === 'sixth_form'
          ? t('admin.schoolSixthForm')
          : t('admin.schoolSecondary');

  return (
    <div>
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold text-ink-900">{t('admin.students')}</h1>
        <Link href={`/${language}/admin/students/new`} className="cc-btn-primary">
          {t('admin.newStudent')}
        </Link>
      </div>

      <div className="mt-4 flex flex-wrap gap-2" role="group" aria-label={t('admin.schoolType')}>
        {(['all', 'primary', 'secondary', 'sixth_form', 'private'] as const).map((value) => (
          <button
            key={value}
            type="button"
            onClick={() => setFilter(value)}
            aria-pressed={filter === value}
            className={`min-h-touch rounded-lg border px-3 text-sm font-medium ${
              filter === value
                ? 'border-brand-600 bg-brand-600 text-white'
                : 'border-ink-300 text-ink-900'
            }`}
          >
            {value === 'all'
              ? t('admin.allSchools')
              : value === 'primary'
                ? t('admin.schoolPrimary')
                : value === 'secondary'
                  ? t('admin.schoolSecondary')
                  : value === 'sixth_form'
                    ? t('admin.schoolSixthForm')
                    : t('admin.schoolPrivate')}
          </button>
        ))}
      </div>

      <ErrorAlert error={error} />

      {/*
        * The selection bar appears only once something is ticked, so the
        * ordinary reason to open this page — looking at the roster — is not
        * shadowed by a destructive control.
        */}
      {selected.size > 0 && (
        <div className="mt-4 flex flex-wrap items-center gap-3 rounded-lg border border-danger-600 bg-danger-50 p-3">
          <span className="text-sm font-medium text-ink-900">
            {t('admin.selectedCount', { count: selected.size })}
          </span>
          <button
            type="button"
            onClick={() => setSelected(new Set())}
            className="min-h-touch rounded-lg border border-ink-300 bg-white px-3 text-sm"
          >
            {t('common.cancel')}
          </button>

          {/*
            * Two presses, and the second one names the number.
            *
            * This ends accounts belonging to children. A single click beside a
            * list of checkboxes is one slip away from removing thirty of them,
            * and the undo is a database restore.
            */}
          {confirming ? (
            <button
              type="button"
              onClick={() => void remove()}
              disabled={deleting}
              className="min-h-touch rounded-lg bg-danger-600 px-4 text-sm font-semibold text-white disabled:opacity-60"
            >
              {deleting
                ? t('common.saving')
                : t('admin.confirmDelete', { count: selected.size })}
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setConfirming(true)}
              className="min-h-touch rounded-lg border border-danger-600 px-4 text-sm font-semibold text-danger-600"
            >
              {t('admin.deleteSelected')}
            </button>
          )}
        </div>
      )}

      {students === null ? (
        <p className="mt-6 text-ink-600">{t('common.loading')}</p>
      ) : students.length === 0 ? (
        <div className="mt-6">
          <EmptyState
            title={t('admin.noStudentsTitle')}
            body={t('admin.noStudentsBody')}
            action={
              <Link href={`/${language}/admin/students/new`} className="cc-btn-primary">
                {t('admin.newStudent')}
              </Link>
            }
          />
        </div>
      ) : (
        <>
          {deletable.length > 0 && (
            <label className="mt-6 flex items-center gap-2 text-sm text-ink-700">
              <input
                type="checkbox"
                checked={selected.size === deletable.length && deletable.length > 0}
                onChange={toggleAll}
                className="h-4 w-4"
              />
              {t('admin.selectAll', { count: deletable.length })}
            </label>
          )}

          <ul className="mt-3 flex flex-col gap-3">
            {students.map((student) => (
              <li key={student.id} className="cc-card">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex min-w-0 items-start gap-3">
                    {/*
                      * A learner with no sign-in has no account to delete, so
                      * the checkbox is absent rather than disabled — an
                      * unavailable control invites a click and explains nothing.
                      */}
                    {student.userId && (
                      <input
                        type="checkbox"
                        checked={selected.has(student.userId)}
                        onChange={() => toggle(student.userId!)}
                        aria-label={student.fullName}
                        className="mt-1 h-4 w-4 shrink-0"
                      />
                    )}
                    <div className="min-w-0">
                      <p className="font-medium text-ink-900">{student.fullName}</p>
                      <p className="text-sm text-ink-600">
                        {student.level ? name(student.level) : t('common.none')}
                      </p>
                    </div>
                  </div>
                  <span
                    className={`cc-badge ${
                      student.enrolmentType === 'private'
                        ? 'bg-warning-50 text-warning-600'
                        : student.schoolType === 'primary'
                          ? 'bg-brand-50 text-brand-700'
                          : 'bg-ink-100 text-ink-600'
                    }`}
                  >
                    {bandLabel(student)}
                  </span>
                </div>

                {student.subjects.length > 0 && (
                  <ul className="mt-3 flex flex-wrap gap-1.5">
                    {student.subjects.map((subject) => (
                      <li key={subject.id} className="cc-badge bg-ink-100 text-ink-600">
                        {name(subject)}
                      </li>
                    ))}
                  </ul>
                )}

                <p className="mt-3 text-xs text-ink-600">
                  {student.guardians.length > 0
                    ? t('admin.guardianIs', { name: student.guardians.join(', ') })
                    : t('admin.noGuardian')}
                  {student.hasOwnSignIn ? ` · ${t('admin.hasOwnSignIn')}` : ''}
                </p>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
