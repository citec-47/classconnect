'use client';

import { useCallback, useEffect, useState } from 'react';
import { useI18n } from '@/lib/i18n';
import { api, ApiError } from '@/lib/api';
import { Field } from '@/components/Field';
import { ErrorAlert } from '@/components/Alert';
import { LanguagesPicker } from '@/components/LanguagePicker';
import type { Language } from '@classconnect/shared';
import { DocumentUpload, type UploadedDocument } from '@/components/DocumentUpload';

interface Application {
  status: 'draft' | 'submitted' | 'under_review' | 'approved' | 'rejected' | 'more_info_required';
  submittedAt: string | null;
  rejectionReason: string | null;
  payoutWalletPreview: string | null;
  walletVerified: boolean;
  highestQualification: string | null;
  institution: string | null;
  qualificationYear: number | null;
  yearsExperience: number;
  subjects: {
    subject: { id: string; nameEn: string; nameFr: string };
    level: { id: string; nameEn: string; nameFr: string };
  }[];
  documents: {
    id: string;
    type: string;
    fileName: string;
    scanStatus: string;
    expiresOn: string | null;
  }[];
}

const STATUS_STYLES: Record<string, string> = {
  draft: 'bg-ink-100 text-ink-600',
  submitted: 'bg-brand-50 text-brand-700',
  under_review: 'bg-brand-50 text-brand-700',
  approved: 'bg-success-50 text-success-600',
  rejected: 'bg-danger-50 text-danger-600',
  more_info_required: 'bg-warning-50 text-warning-600',
};

const STATUS_LABEL: Record<string, string> = {
  draft: 'teacher.statusDraft',
  submitted: 'teacher.statusSubmitted',
  under_review: 'teacher.statusUnderReview',
  approved: 'teacher.statusApproved',
  rejected: 'teacher.statusRejected',
  more_info_required: 'teacher.statusMoreInfo',
};

const STATUS_HINT: Record<string, string> = {
  draft: 'teacher.statusDraftHint',
  submitted: 'teacher.statusSubmittedHint',
  under_review: 'teacher.statusUnderReviewHint',
  approved: 'teacher.statusApprovedHint',
  more_info_required: 'teacher.statusMoreInfoHint',
};

/**
 * The teacher's own record.
 *
 * Read-only as far as credentials go: an Admin created this account and
 * recorded the verification, so there is no application form here. What a
 * teacher can still do is supply documents — FR-TVR-007 requires
 * re-verification before a credential expires, and FR-TVR-002 governs what may
 * be uploaded.
 */
export default function Teach() {
  const { language, t } = useI18n();

  const [application, setApplication] = useState<Application | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [busy, setBusy] = useState(false);
  const [payoutMethod, setPayoutMethod] = useState<'mtn_momo' | 'orange_money'>('mtn_momo');
  const [teachingLanguages, setTeachingLanguages] = useState<Language[]>([language]);
  const [form, setForm] = useState({
    highestQualification: '',
    institution: '',
    qualificationYear: '',
    yearsExperience: '',
    nationalId: '',
    payoutWallet: '',
  });

  const set = (key: keyof typeof form) => (event: { target: { value: string } }) =>
    setForm((current) => ({ ...current, [key]: event.target.value }));

  const load = useCallback(async () => {
    try {
      setApplication(await api<Application>('/teachers/me/application', { language }));
    } catch (caught) {
      setError(caught as ApiError);
    }
  }, [language]);

  useEffect(() => {
    void load();
  }, [load]);

  // Seed the form from whatever is already recorded, so editing means
  // correcting rather than retyping.
  useEffect(() => {
    if (!application) return;
    setForm({
      highestQualification: application.highestQualification ?? '',
      institution: application.institution ?? '',
      qualificationYear: application.qualificationYear?.toString() ?? '',
      yearsExperience: application.yearsExperience?.toString() ?? '',
      nationalId: '',
      payoutWallet: '',
    });
  }, [application]);

  /** FR-TVR-001: submit or correct the credentials an Admin will check. */
  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      await api('/teachers/me/application', {
        method: 'POST',
        body: {
          yearsExperience: Number(form.yearsExperience),
          highestQualification: form.highestQualification,
          institution: form.institution,
          qualificationYear: Number(form.qualificationYear),
          nationalId: form.nationalId,
          languages: teachingLanguages,
          // Registration already recorded these; the API keeps them when the
          // payload repeats what is stored.
          subjects: application!.subjects.map((pair) => ({
            subjectId: pair.subject.id,
            levelId: pair.level.id,
          })),
          payoutMethod,
          payoutWallet: form.payoutWallet,
        },
        language,
      });
      await load();
    } catch (caught) {
      setError(caught as ApiError);
    } finally {
      setBusy(false);
    }
  };

  const name = (item: { nameEn: string; nameFr: string }) =>
    language === 'fr' ? item.nameFr : item.nameEn;

  /**
   * The application is editable while it is still open. Once an Admin has
   * approved or rejected it, the record becomes the evidence for that decision
   * (FR-TVR-010) and stops being a form.
   */
  const editable =
    application !== null &&
    ['draft', 'submitted', 'under_review', 'more_info_required'].includes(application.status);

  if (!application) {
    return (
      <div className="mx-auto max-w-md">
        <ErrorAlert error={error} />
        {!error && <p className="text-ink-600">{t('common.loading')}</p>}
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-md">
      <h1 className="text-2xl font-semibold text-ink-900">{t('teacher.myAccount')}</h1>

      <div className="mt-4 cc-card">
        <span className={`cc-badge ${STATUS_STYLES[application.status]}`}>
          {t(STATUS_LABEL[application.status] ?? 'teacher.statusDraft')}
        </span>
        <p className="mt-2 text-sm text-ink-600">
          {t(STATUS_HINT[application.status] ?? 'teacher.statusDraftHint')}
        </p>

        {/* FR-TVR-006: where more is needed, the reason is shown. */}
        {application.rejectionReason && (
          <p className="mt-3 rounded-lg bg-warning-50 p-3 text-sm text-warning-600">
            {application.rejectionReason}
          </p>
        )}
      </div>


      {/*
        FR-TVR-001: the credentials an Admin will check.

        Editable while the application is open. Registration captured who they
        are and what they teach; this is what verification actually examines, so
        a teacher can complete or correct it without queueing for staff time.
      */}
      {editable ? (
        <form
          className="mt-4 cc-card"
          onSubmit={(event) => {
            event.preventDefault();
            void save();
          }}
        >
          <h2 className="font-medium text-ink-900">{t('teacher.qualification')}</h2>
          <p className="cc-hint mb-3">{t('teacher.applicationIntro')}</p>

          <Field
            label={t('teacher.qualification')}
            required
            value={form.highestQualification}
            onChange={set('highestQualification')}
            errorKey={error?.fieldError('highestQualification')}
          />
          <Field
            label={t('teacher.institution')}
            required
            value={form.institution}
            onChange={set('institution')}
            errorKey={error?.fieldError('institution')}
          />
          <Field
            label={t('teacher.year')}
            type="number"
            required
            value={form.qualificationYear}
            onChange={set('qualificationYear')}
            errorKey={error?.fieldError('qualificationYear')}
          />
          <Field
            label={t('teacher.experience')}
            type="number"
            required
            value={form.yearsExperience}
            onChange={set('yearsExperience')}
            errorKey={error?.fieldError('yearsExperience')}
          />
          <LanguagesPicker
            value={teachingLanguages}
            onChange={setTeachingLanguages}
            label={t('teacher.teachingLanguages')}
            hint={t('teacher.teachingLanguagesHint')}
          />

          <Field
            label={t('teacher.identityDocument')}
            required
            value={form.nationalId}
            onChange={set('nationalId')}
            errorKey={error?.fieldError('nationalId')}
          />

          <div className="mb-4">
            <label htmlFor="payout-method" className="cc-label">
              {t('teacher.payoutDetails')}
            </label>
            <select
              id="payout-method"
              className="cc-field"
              value={payoutMethod}
              onChange={(event) =>
                setPayoutMethod(event.target.value as 'mtn_momo' | 'orange_money')
              }
            >
              <option value="mtn_momo">MTN Mobile Money</option>
              <option value="orange_money">Orange Money</option>
            </select>
          </div>
          <Field
            label={t('admin.payoutWallet')}
            hint={t('teacher.payoutHint')}
            type="tel"
            required
            value={form.payoutWallet}
            onChange={set('payoutWallet')}
            errorKey={error?.fieldError('payoutWallet')}
          />

          <button type="submit" className="cc-btn-primary w-full" disabled={busy}>
            {busy ? t('common.saving') : t('teacher.submitApplication')}
          </button>
        </form>
      ) : (
      <div className="mt-4 cc-card">
        <h2 className="font-medium text-ink-900">{t('teacher.qualification')}</h2>
        <dl className="mt-2 grid grid-cols-2 gap-2 text-sm">
          <dt className="text-ink-600">{t('teacher.qualification')}</dt>
          <dd className="text-ink-900">{application.highestQualification ?? t('common.notRecorded')}</dd>
          <dt className="text-ink-600">{t('teacher.institution')}</dt>
          <dd className="text-ink-900">{application.institution ?? t('common.notRecorded')}</dd>
          <dt className="text-ink-600">{t('teacher.year')}</dt>
          <dd className="text-ink-900">{application.qualificationYear ?? t('common.notRecorded')}</dd>
          <dt className="text-ink-600">{t('teacher.experience')}</dt>
          <dd className="text-ink-900">{application.yearsExperience}</dd>
          {/* FR-PRO-005: a masked confirmation, never the value itself. */}
          {application.payoutWalletPreview && (
            <>
              <dt className="text-ink-600">{t('teacher.payoutDetails')}</dt>
              <dd className="font-mono text-ink-900">{application.payoutWalletPreview}</dd>
            </>
          )}
        </dl>

        {application.subjects.length > 0 && (
          <>
            <h3 className="mt-4 text-sm font-medium text-ink-900">{t('teacher.subjectsTaught')}</h3>
            <ul className="mt-2 flex flex-wrap gap-1.5">
              {application.subjects.map((pair, index) => (
                <li key={index} className="cc-badge bg-ink-100 text-ink-600">
                  {name(pair.subject)} · {name(pair.level)}
                </li>
              ))}
            </ul>
          </>
        )}

      </div>
      )}

      <ErrorAlert error={error} />

      {/* FR-TVR-002 / FR-TVR-007: supporting documents and re-verification. */}
      <div className="mt-4">
        <DocumentUpload
          language={language}
          onUploaded={(document: UploadedDocument) =>
            setApplication((current) =>
              current
                ? {
                    ...current,
                    documents: [
                      ...current.documents,
                      {
                        id: document.id,
                        type: document.type,
                        fileName: document.fileName,
                        scanStatus: document.scanStatus,
                        expiresOn: null,
                      },
                    ],
                  }
                : current,
            )
          }
        />

        {application.documents.length > 0 && (
          <ul className="mt-3 flex flex-col gap-2">
            {application.documents.map((document) => (
              <li
                key={document.id}
                className="flex items-start justify-between gap-3 rounded-lg border border-ink-300 p-3"
              >
                <div>
                  <p className="text-sm font-medium text-ink-900">{document.fileName}</p>
                  <p className="text-xs text-ink-600">
                    {t(`teacher.documentType.${document.type}`)}
                  </p>
                  {/* FR-FIL-001: say plainly why a file cannot be opened yet. */}
                  {document.scanStatus !== 'clean' && (
                    <p className="mt-1 text-xs text-warning-600">
                      {document.scanStatus === 'quarantined'
                        ? t('teacher.documentQuarantined')
                        : t('teacher.documentPendingScan')}
                    </p>
                  )}
                </div>
                <span
                  className={`cc-badge ${
                    document.scanStatus === 'clean'
                      ? 'bg-success-50 text-success-600'
                      : document.scanStatus === 'quarantined'
                        ? 'bg-danger-50 text-danger-600'
                        : 'bg-warning-50 text-warning-600'
                  }`}
                >
                  {document.scanStatus}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
