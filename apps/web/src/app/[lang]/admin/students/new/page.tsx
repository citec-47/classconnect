'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useI18n } from '@/lib/i18n';
import { api, ApiError } from '@/lib/api';
import { Field } from '@/components/Field';
import { ErrorAlert } from '@/components/Alert';
import { SchoolTypePicker, type SchoolType } from '@/components/SchoolTypePicker';
import { PreferredLanguagePicker } from '@/components/LanguagePicker';
import type { Language } from '@classconnect/shared';

interface Level {
  id: string;
  code: string;
  nameEn: string;
  nameFr: string;
  schoolType: SchoolType;
  subjects: { id: string; nameEn: string; nameFr: string }[];
}

/**
 * Admin creates a Student account.
 *
 * The flow follows the decision order: school type, then the class within it,
 * then the subjects that class offers. Each step narrows the next, so the Admin
 * cannot enrol a Class 2 pupil in A-Level Further Maths — the option is never
 * shown, and the server refuses it regardless (FR-PRO-002).
 */
export default function NewStudent() {
  const { language, t } = useI18n();
  const router = useRouter();

  const [levels, setLevels] = useState<Level[]>([]);
  const [schoolType, setSchoolType] = useState<SchoolType | null>(null);
  const [levelId, setLevelId] = useState('');
  const [subjectIds, setSubjectIds] = useState<string[]>([]);

  const [fullName, setFullName] = useState('');
  const [dob, setDob] = useState('');
  const [guardianPhone, setGuardianPhone] = useState('');
  // FR-PRO-003: the learner's preferred language of instruction, which is not
  // whatever language the administrator happens to be using.
  const [preferredLanguage, setPreferredLanguage] = useState<Language>(language);
  const [givesSignIn, setGivesSignIn] = useState(false);
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);

  useEffect(() => {
    void api<Level[]>('/catalogue/levels', { language })
      .then(setLevels)
      .catch((caught) => setError(caught as ApiError));
  }, [language]);

  const classesForSchool = useMemo(
    () => (schoolType ? levels.filter((level) => level.schoolType === schoolType) : []),
    [levels, schoolType],
  );
  const selectedLevel = levels.find((level) => level.id === levelId);

  const name = (item: { nameEn: string; nameFr: string }) =>
    language === 'fr' ? item.nameFr : item.nameEn;

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      await api('/admin/accounts/students', {
        method: 'POST',
        body: {
          fullName,
          dob,
          schoolType,
          levelId,
          subjectIds,
          preferredLanguage,
          ...(guardianPhone ? { guardianPhone } : {}),
          ...(givesSignIn ? { phone, password } : {}),
        },
        language,
      });
      router.push(`/${language}/admin/students`);
    } catch (caught) {
      setError(caught as ApiError);
      setBusy(false);
    }
  };

  const ready = Boolean(fullName && dob && schoolType && levelId && subjectIds.length > 0);

  return (
    <div className="mx-auto max-w-md">
      <h1 className="text-2xl font-semibold text-ink-900">{t('admin.newStudent')}</h1>
      <p className="mt-1 text-sm text-ink-600">{t('admin.newStudentIntro')}</p>

      <ErrorAlert error={error} />

      <form
        className="mt-6"
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
      >
        <Field
          label={t('family.childName')}
          required
          value={fullName}
          onChange={(event) => setFullName(event.target.value)}
          errorKey={error?.fieldError('fullName')}
        />

        {/* FR-FAM-006: minor status and the §4.10 safeguarding controls follow
            from this, so it is required rather than optional. */}
        <Field
          label={t('family.childDob')}
          type="date"
          required
          max={new Date().toISOString().slice(0, 10)}
          value={dob}
          onChange={(event) => setDob(event.target.value)}
          errorKey={error?.fieldError('dob')}
        />

        <SchoolTypePicker
          value={schoolType}
          onChange={(value) => {
            setSchoolType(value);
            // The class and its subjects belong to the old school type; keeping
            // them would silently submit a mismatched pair.
            setLevelId('');
            setSubjectIds([]);
          }}
        />

        {schoolType && (
          <div className="mb-4">
            <label htmlFor="level" className="cc-label">
              {t('admin.chooseClass')}
            </label>
            <select
              id="level"
              className="cc-field"
              required
              value={levelId}
              onChange={(event) => {
                setLevelId(event.target.value);
                setSubjectIds([]);
              }}
            >
              <option value="">{t('admin.chooseClass')}</option>
              {classesForSchool.map((level) => (
                <option key={level.id} value={level.id}>
                  {name(level)}
                </option>
              ))}
            </select>
          </div>
        )}

        {selectedLevel && (
          <fieldset className="mb-4">
            <legend className="cc-label">{t('admin.chooseSubjects')}</legend>
            <p className="cc-hint mb-2">{t('admin.chooseSubjectsHint')}</p>
            <div className="flex flex-wrap gap-2">
              {selectedLevel.subjects.map((subject) => {
                const checked = subjectIds.includes(subject.id);
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
                        setSubjectIds((current) =>
                          event.target.checked
                            ? [...current, subject.id]
                            : current.filter((id) => id !== subject.id),
                        )
                      }
                    />
                    {name(subject)}
                  </label>
                );
              })}
            </div>
            {subjectIds.length === 0 && (
              <p className="cc-hint">{t('errors.student.subjects_required')}</p>
            )}
          </fieldset>
        )}

        <PreferredLanguagePicker
          value={preferredLanguage}
          onChange={setPreferredLanguage}
          label={t('family.preferredLanguage')}
          hint={t('family.preferredLanguageHint')}
        />

        {/* FR-FAM-001: link the student to the Guardian who is responsible for
            them, and who pays. */}
        <Field
          label={t('admin.guardianPhone')}
          hint={t('admin.guardianPhoneHint')}
          type="tel"
          inputMode="tel"
          value={guardianPhone}
          onChange={(event) => setGuardianPhone(event.target.value)}
          errorKey={error?.fieldError('guardianPhone')}
          placeholder="6XX XXX XXX"
        />

        {/* FR-FAM-003: the student's own sign-in is optional and revocable. */}
        <div className="mb-4 flex items-start gap-3">
          <input
            id="own-signin"
            type="checkbox"
            checked={givesSignIn}
            onChange={(event) => setGivesSignIn(event.target.checked)}
            className="mt-1 h-6 w-6 rounded border-ink-300"
          />
          <label htmlFor="own-signin" className="text-sm text-ink-900">
            {t('admin.giveOwnSignIn')}
            <span className="mt-0.5 block text-ink-600">{t('admin.giveOwnSignInHint')}</span>
          </label>
        </div>

        {givesSignIn && (
          <>
            <Field
              label={t('auth.phone')}
              type="tel"
              inputMode="tel"
              required
              value={phone}
              onChange={(event) => setPhone(event.target.value)}
              errorKey={error?.fieldError('phone')}
              placeholder="6XX XXX XXX"
            />
            <Field
              label={t('auth.password')}
              hint={t('auth.passwordHint')}
              type="text"
              required
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              errorKey={error?.fieldError('password')}
            />
          </>
        )}

        <button type="submit" className="cc-btn-primary w-full" disabled={busy || !ready}>
          {busy ? t('common.saving') : t('admin.createStudent')}
        </button>
      </form>
    </div>
  );
}
