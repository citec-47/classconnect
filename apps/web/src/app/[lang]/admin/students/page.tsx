'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useI18n } from '@/lib/i18n';
import { api, ApiError } from '@/lib/api';
import { ErrorAlert, EmptyState } from '@/components/Alert';
import type { SchoolType } from '@/components/SchoolTypePicker';

interface Student {
  id: string;
  fullName: string;
  dob: string;
  isMinor: boolean;
  schoolType: SchoolType | null;
  level: { id: string; nameEn: string; nameFr: string } | null;
  subjects: { id: string; nameEn: string; nameFr: string }[];
  hasOwnSignIn: boolean;
  guardians: string[];
}

/** Admin's view of every student account, filterable by school type. */
export default function AdminStudents() {
  const { language, t } = useI18n();

  const [students, setStudents] = useState<Student[] | null>(null);
  const [filter, setFilter] = useState<SchoolType | 'all'>('all');
  const [error, setError] = useState<ApiError | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const query = filter === 'all' ? '' : `?schoolType=${filter}`;
      setStudents(await api<Student[]>(`/admin/accounts/students${query}`, { language }));
    } catch (caught) {
      setError(caught as ApiError);
      setStudents([]);
    }
  }, [language, filter]);

  useEffect(() => {
    void load();
  }, [load]);

  const name = (item: { nameEn: string; nameFr: string }) =>
    language === 'fr' ? item.nameFr : item.nameEn;

  return (
    <div>
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold text-ink-900">{t('admin.students')}</h1>
        <Link href={`/${language}/admin/students/new`} className="cc-btn-primary">
          {t('admin.newStudent')}
        </Link>
      </div>

      <div className="mt-4 flex gap-2" role="group" aria-label={t('admin.schoolType')}>
        {(['all', 'primary', 'secondary'] as const).map((value) => (
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
                : t('admin.schoolSecondary')}
          </button>
        ))}
      </div>

      <ErrorAlert error={error} />

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
        <ul className="mt-6 flex flex-col gap-3">
          {students.map((student) => (
            <li key={student.id} className="cc-card">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-medium text-ink-900">{student.fullName}</p>
                  <p className="text-sm text-ink-600">
                    {student.level ? name(student.level) : t('common.none')}
                  </p>
                </div>
                <span
                  className={`cc-badge ${
                    student.schoolType === 'primary'
                      ? 'bg-brand-50 text-brand-700'
                      : 'bg-ink-100 text-ink-600'
                  }`}
                >
                  {student.schoolType === 'primary'
                    ? t('admin.schoolPrimary')
                    : t('admin.schoolSecondary')}
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
      )}
    </div>
  );
}
