'use client';

import Link from 'next/link';
import { useI18n } from '@/lib/i18n';
import { useAuth } from '@/lib/auth-context';
import { useCachedApi } from '@/lib/use-cached-api';
import { PageHeader } from '@/components/admin/ui';
import { TeacherGate } from '@/components/teacher/TeacherGate';

/** Only the parts of the application this screen shows. */
interface Profile {
  status: string;
  languages: string[];
  highestQualification: string | null;
  institution: string | null;
  qualificationYear: number | null;
  yearsExperience: number;
  payoutMethod: string | null;
  payoutWalletPreview: string | null;
  walletVerified: boolean;
  subjects: {
    subject: { nameEn: string; nameFr: string };
    level: { nameEn: string; nameFr: string };
  }[];
}

/**
 * The teacher's own record, as it stands.
 *
 * This route was in `TEACHER_NAV` marked `implemented: true` with nothing behind
 * it, so the sidebar linked to a 404 — the one failure the nav file's
 * `implemented` flag exists to prevent, caused by the flag being wrong.
 *
 * Read-only on purpose. Every field here is evidence an Admin verified
 * (FR-TVR-005), so it is corrected through the verification form, which reopens
 * when a reviewer asks for more — not edited in place behind their back.
 */
function TeacherProfilePage() {
  const { t, language } = useI18n();
  const { user } = useAuth();

  const { data, loading } = useCachedApi<Profile>('/teachers/me/application', { language });

  const name = (item: { nameEn: string; nameFr: string }) =>
    language === 'fr' ? item.nameFr : item.nameEn;

  return (
    <>
      <PageHeader
        title={t('teacherNav.profile')}
        description={t('teacher.profile.description')}
      />

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="rounded-xl border border-ink-200 bg-white p-4">
          <h2 className="mb-3 font-display text-base font-semibold text-ink-900">
            {t('teacher.profile.account')}
          </h2>
          {/*
           * Only what the session actually carries.
           *
           * `SessionUser` holds the identity the app needs to render, not the
           * contact details — those are personal data with no reason to sit in
           * a token. The verification flags are here instead, because they are
           * the part a teacher can act on.
           */}
          <dl className="grid grid-cols-2 gap-2 text-sm">
            <dt className="text-ink-600">{t('auth.fullName')}</dt>
            <dd className="text-ink-900">{user?.fullName ?? '—'}</dd>
            <dt className="text-ink-600">{t('teacher.teachingLanguages')}</dt>
            <dd className="text-ink-900">
              {(data?.languages ?? []).map((code) => t(`language.${code}`)).join(', ') || '—'}
            </dd>
            <dt className="text-ink-600">{t('auth.phone')}</dt>
            <dd className="text-ink-900">
              {user?.phoneVerified ? t('teacher.profile.verified') : t('teacher.profile.unverified')}
            </dd>
          </dl>
        </section>

        <section className="rounded-xl border border-ink-200 bg-white p-4">
          <h2 className="mb-3 font-display text-base font-semibold text-ink-900">
            {t('teacher.profile.teaching')}
          </h2>
          {loading ? (
            <div className="h-24 animate-pulse rounded-lg bg-ink-100" />
          ) : (
            <dl className="grid grid-cols-2 gap-2 text-sm">
              <dt className="text-ink-600">{t('teacher.qualification')}</dt>
              <dd className="text-ink-900">
                {data?.highestQualification ?? t('common.notRecorded')}
              </dd>
              <dt className="text-ink-600">{t('teacher.institution')}</dt>
              <dd className="text-ink-900">{data?.institution ?? t('common.notRecorded')}</dd>
              <dt className="text-ink-600">{t('teacher.year')}</dt>
              <dd className="text-ink-900">
                {data?.qualificationYear ?? t('common.notRecorded')}
              </dd>
              <dt className="text-ink-600">{t('teacher.experience')}</dt>
              <dd className="text-ink-900">{data?.yearsExperience ?? 0}</dd>
              {/* FR-PRO-005: a masked confirmation, never the number itself. */}
              <dt className="text-ink-600">{t('teacher.payoutDetails')}</dt>
              <dd className="font-mono text-ink-900">
                {data?.payoutWalletPreview ?? t('common.notRecorded')}
              </dd>
            </dl>
          )}
        </section>

        <section className="rounded-xl border border-ink-200 bg-white p-4 lg:col-span-2">
          <h2 className="mb-3 font-display text-base font-semibold text-ink-900">
            {t('teacher.subjectsTaught')}
          </h2>
          {data && data.subjects.length > 0 ? (
            <ul className="flex flex-wrap gap-1.5">
              {data.subjects.map((pair, index) => (
                <li key={index} className="cc-badge bg-ink-100 text-ink-600">
                  {name(pair.subject)} · {name(pair.level)}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-ink-600">{t('common.notRecorded')}</p>
          )}
        </section>
      </div>

      {/*
       * One route back to where these facts can actually be changed.
       *
       * Without it this reads as a form that refuses to be edited rather than a
       * summary of a record somebody else verified.
       */}
      <p className="mt-4 text-sm text-ink-600">
        {t('teacher.profile.changeHint')}{' '}
        <Link
          href={`/${language}/teacher/verification`}
          className="font-medium text-brand-700 underline"
        >
          {t('teacherNav.verification')}
        </Link>
      </p>
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
    <TeacherGate titleKey="teacherNav.profile">
      <TeacherProfilePage />
    </TeacherGate>
  );
}
