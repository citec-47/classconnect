'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useI18n } from '@/lib/i18n';
import { api, ApiError } from '@/lib/api';
import { Field } from '@/components/Field';
import { ErrorAlert } from '@/components/Alert';
import { SchoolTypePicker, type SchoolType } from '@/components/SchoolTypePicker';
import { LanguagesPicker } from '@/components/LanguagePicker';
import type { Language } from '@classconnect/shared';

interface Level {
  id: string;
  nameEn: string;
  nameFr: string;
  schoolType: SchoolType;
  subjects: { id: string; nameEn: string; nameFr: string }[];
}

interface ChecklistItem {
  key: string;
  labelKey: string;
  mandatory: boolean;
}

/**
 * Admin creates a Teacher account.
 *
 * FR-TVR-005 survives the change of who creates the account: approval still
 * requires every mandatory checklist item to be affirmatively recorded. Because
 * the Admin is now the creator, the checklist is part of this form — the
 * account is created and verified in one recorded action.
 *
 * Leaving items unticked is allowed and creates the account `under_review`;
 * FR-TVR-003 then keeps that teacher unlistable, unassignable and unpaid until
 * someone finishes the checks.
 */
export default function NewTeacher() {
  const { language, t } = useI18n();
  const router = useRouter();

  const [levels, setLevels] = useState<Level[]>([]);
  const [checklistDef, setChecklistDef] = useState<ChecklistItem[]>([]);

  const [schoolType, setSchoolType] = useState<SchoolType | null>(null);
  const [pairs, setPairs] = useState<{ subjectId: string; levelId: string }[]>([]);
  const [levelId, setLevelId] = useState('');

  const [form, setForm] = useState({
    fullName: '',
    phone: '',
    email: '',
    password: '',
    yearsExperience: '',
    highestQualification: '',
    institution: '',
    qualificationYear: '',
    nationalId: '',
    payoutWallet: '',
    bio: '',
  });
  const [payoutMethod, setPayoutMethod] = useState<'mtn_momo' | 'orange_money'>('mtn_momo');
  const [teachingLanguages, setTeachingLanguages] = useState<Language[]>([language]);
  const [checks, setChecks] = useState<Record<string, { verified: boolean; findings: string }>>({});

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);

  useEffect(() => {
    void Promise.all([
      api<Level[]>('/catalogue/levels', { language }),
      api<ChecklistItem[]>('/admin/verification/checklist', { language }),
    ])
      .then(([catalogue, checklist]) => {
        setLevels(catalogue);
        setChecklistDef(checklist);
      })
      .catch((caught) => setError(caught as ApiError));
  }, [language]);

  const classesForSchool = useMemo(
    () => (schoolType ? levels.filter((level) => level.schoolType === schoolType) : []),
    [levels, schoolType],
  );
  const selectedLevel = levels.find((level) => level.id === levelId);

  const name = (item: { nameEn: string; nameFr: string }) =>
    language === 'fr' ? item.nameFr : item.nameEn;

  const mandatoryDone = checklistDef
    .filter((item) => item.mandatory)
    .every((item) => checks[item.key]?.verified);

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      const result = await api<{ status: string; assignable: boolean }>(
        '/admin/accounts/teachers',
        {
          method: 'POST',
          body: {
            fullName: form.fullName,
            phone: form.phone,
            ...(form.email ? { email: form.email } : {}),
            password: form.password,
            preferredLanguage: language,
            schoolType,
            subjects: pairs,
            ...(form.bio ? { bio: form.bio } : {}),
            yearsExperience: Number(form.yearsExperience),
            highestQualification: form.highestQualification,
            institution: form.institution,
            qualificationYear: Number(form.qualificationYear),
            nationalId: form.nationalId,
            languages: teachingLanguages,
            payoutMethod,
            payoutWallet: form.payoutWallet,
            checklist: checklistDef.map((item) => ({
              itemKey: item.key,
              verified: checks[item.key]?.verified ?? false,
              findings: checks[item.key]?.findings || undefined,
            })),
          },
          language,
        },
      );
      router.push(`/${language}/admin/verification?created=${result.status}`);
    } catch (caught) {
      setError(caught as ApiError);
      setBusy(false);
    }
  };

  const ready = Boolean(
    form.fullName &&
      form.phone &&
      form.password &&
      schoolType &&
      pairs.length > 0 &&
      form.highestQualification &&
      form.institution &&
      form.qualificationYear &&
      form.nationalId &&
      form.payoutWallet &&
      teachingLanguages.length > 0,
  );

  const set = (key: keyof typeof form) => (event: { target: { value: string } }) =>
    setForm((current) => ({ ...current, [key]: event.target.value }));

  return (
    <div className="mx-auto max-w-md">
      <h1 className="text-2xl font-semibold text-ink-900">{t('admin.newTeacher')}</h1>
      <p className="mt-1 text-sm text-ink-600">{t('admin.newTeacherIntro')}</p>

      <ErrorAlert error={error} />

      <form
        className="mt-6"
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
      >
        <Field
          label={t('auth.fullName')}
          required
          value={form.fullName}
          onChange={set('fullName')}
          errorKey={error?.fieldError('fullName')}
        />
        <Field
          label={t('auth.phone')}
          hint={t('admin.teacherPhoneHint')}
          type="tel"
          inputMode="tel"
          required
          value={form.phone}
          onChange={set('phone')}
          errorKey={error?.fieldError('phone')}
          placeholder="6XX XXX XXX"
        />
        <Field
          label={t('auth.email')}
          type="email"
          value={form.email}
          onChange={set('email')}
          errorKey={error?.fieldError('email')}
        />
        <Field
          label={t('auth.password')}
          hint={t('admin.teacherPasswordHint')}
          type="text"
          required
          value={form.password}
          onChange={set('password')}
          errorKey={error?.fieldError('password')}
        />

        <SchoolTypePicker
          value={schoolType}
          onChange={(value) => {
            setSchoolType(value);
            setPairs([]);
            setLevelId('');
          }}
        />

        {schoolType && (
          <fieldset className="mb-4">
            <legend className="cc-label">{t('admin.chooseTeachingSubjects')}</legend>
            <p className="cc-hint mb-2">{t('admin.chooseTeachingSubjectsHint')}</p>

            <select
              className="cc-field mb-2"
              value={levelId}
              onChange={(event) => setLevelId(event.target.value)}
              aria-label={t('admin.chooseClass')}
            >
              <option value="">{t('admin.chooseClass')}</option>
              {classesForSchool.map((level) => (
                <option key={level.id} value={level.id}>
                  {name(level)}
                </option>
              ))}
            </select>

            {selectedLevel && (
              <div className="flex flex-wrap gap-2">
                {selectedLevel.subjects.map((subject) => {
                  const checked = pairs.some(
                    (pair) => pair.subjectId === subject.id && pair.levelId === levelId,
                  );
                  return (
                    <label
                      key={subject.id}
                      className={`flex min-h-touch cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm ${
                        checked
                          ? 'border-brand-600 bg-brand-50 text-brand-700'
                          : 'border-ink-300 text-ink-900'
                      }`}
                    >
                      <input
                        type="checkbox"
                        className="h-5 w-5"
                        checked={checked}
                        onChange={(event) =>
                          setPairs((current) =>
                            event.target.checked
                              ? [...current, { subjectId: subject.id, levelId }]
                              : current.filter(
                                  (pair) =>
                                    !(pair.subjectId === subject.id && pair.levelId === levelId),
                                ),
                          )
                        }
                      />
                      {name(subject)}
                    </label>
                  );
                })}
              </div>
            )}

            {pairs.length > 0 && (
              <p className="cc-hint">{t('admin.subjectsSelected', { count: pairs.length })}</p>
            )}
          </fieldset>
        )}

        <h2 className="mt-6 text-lg font-semibold text-ink-900">{t('teacher.qualification')}</h2>
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
            className="cc-field mb-2"
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

        {/* FR-TVR-005: each item confirmed individually, with findings. */}
        <h2 className="mt-6 text-lg font-semibold text-ink-900">{t('admin.checklist')}</h2>
        <p className="cc-hint mb-3">{t('admin.checklistHint')}</p>

        <ul className="flex flex-col gap-3">
          {checklistDef.map((item) => (
            <li key={item.key}>
              <label className="flex items-start gap-3">
                <input
                  type="checkbox"
                  className="mt-1 h-6 w-6"
                  checked={checks[item.key]?.verified ?? false}
                  onChange={(event) =>
                    setChecks((current) => ({
                      ...current,
                      [item.key]: {
                        verified: event.target.checked,
                        findings: current[item.key]?.findings ?? '',
                      },
                    }))
                  }
                />
                <span className="text-sm text-ink-900">
                  {t(item.labelKey)}
                  {!item.mandatory && (
                    <span className="ml-1 text-ink-600">({t('common.optional')})</span>
                  )}
                </span>
              </label>
              <input
                type="text"
                className="cc-field mt-1.5 text-sm"
                placeholder={t('admin.findings')}
                value={checks[item.key]?.findings ?? ''}
                onChange={(event) =>
                  setChecks((current) => ({
                    ...current,
                    [item.key]: {
                      verified: current[item.key]?.verified ?? false,
                      findings: event.target.value,
                    },
                  }))
                }
              />
            </li>
          ))}
        </ul>

        {/* Be explicit about the consequence rather than blocking submission:
            creating an unverified teacher is allowed, it just leaves them
            unassignable (FR-TVR-003). */}
        <p
          className={`mt-4 rounded-lg p-3 text-sm ${
            mandatoryDone
              ? 'bg-success-50 text-success-600'
              : 'bg-warning-50 text-warning-600'
          }`}
          role="status"
        >
          {mandatoryDone ? t('admin.willBeApproved') : t('admin.willBeUnderReview')}
        </p>

        <button type="submit" className="cc-btn-primary mt-4 w-full" disabled={busy || !ready}>
          {busy ? t('common.saving') : t('admin.createTeacher')}
        </button>
      </form>
    </div>
  );
}
