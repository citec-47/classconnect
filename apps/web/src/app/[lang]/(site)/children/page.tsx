'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useI18n } from '@/lib/i18n';
import { api, ApiError } from '@/lib/api';
import { ErrorAlert, EmptyState } from '@/components/Alert';
import type { Language } from '@classconnect/shared';

interface Learner {
  id: string;
  fullName: string;
  dob: string;
  isMinor: boolean;
  daysUntil18: number;
  level: { id: string; nameEn: string; nameFr: string } | null;
  subjects: { id: string; nameEn: string; nameFr: string }[];
  hasOwnSignIn: boolean;
}

/**
 * FR-FAM-001/002: the linked Student profiles and the child selector.
 * FR-FAM-006: a learner approaching 18 is surfaced here, because the SRS
 *             requires both parties to be notified and offered conversion.
 */
export default function Children() {
  const { language, t } = useI18n();

  const [learners, setLearners] = useState<Learner[] | null>(null);
  const [error, setError] = useState<ApiError | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      setLearners(await api<Learner[]>('/learners', { language }));
    } catch (caught) {
      setError(caught as ApiError);
      setLearners([]);
    }
  }, [language]);

  useEffect(() => {
    void load();
  }, [load]);

  if (learners === null) return <p className="text-ink-600">{t('common.loading')}</p>;

  return (
    <div>
      {/* A parent no longer adds a child: Student accounts are created by an
          Admin, who links them to the parent. So there is no "add" action here,
          and the empty state tells the parent what to do instead of offering a
          button that would only fail (UI-008). */}
      <h1 className="text-2xl font-semibold text-ink-900">{t('family.myChildren')}</h1>

      <ErrorAlert error={error} />

      {learners.length === 0 ? (
        <div className="mt-6">
          <EmptyState
            title={t('family.noChildrenTitle')}
            body={t('family.noChildrenBody')}
          />
        </div>
      ) : (
        <ul className="mt-6 flex flex-col gap-3">
          {learners.map((learner) => (
            <li key={learner.id} className="cc-card">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-medium text-ink-900">{learner.fullName}</p>
                  <p className="text-sm text-ink-600">
                    {learner.level
                      ? language === 'fr'
                        ? learner.level.nameFr
                        : learner.level.nameEn
                      : t('common.none')}
                  </p>
                </div>
                {learner.hasOwnSignIn && (
                  <span className="cc-badge bg-brand-50 text-brand-700">
                    {language === 'fr' ? 'Accès personnel' : 'Own sign-in'}
                  </span>
                )}
              </div>

              {learner.subjects.length > 0 && (
                <ul className="mt-3 flex flex-wrap gap-1.5">
                  {learner.subjects.map((subject) => (
                    <li key={subject.id} className="cc-badge bg-ink-100 text-ink-600">
                      {language === 'fr' ? subject.nameFr : subject.nameEn}
                    </li>
                  ))}
                </ul>
              )}

              {/* FR-FAM-006: the 18th-birthday transition is announced ahead of
                  time rather than arriving as a surprise. */}
              {learner.isMinor && learner.daysUntil18 <= 60 && learner.daysUntil18 > 0 && (
                <div className="mt-3 rounded-lg bg-warning-50 p-3 text-sm text-warning-600">
                  <p className="font-medium">
                    {t('family.turns18Title', { name: learner.fullName })}
                  </p>
                  <p className="mt-0.5">{t('family.turns18Body', { name: learner.fullName })}</p>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
