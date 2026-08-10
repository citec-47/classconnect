'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useI18n } from '@/lib/i18n';
import { useAuth } from '@/lib/auth-context';
import { api, ApiError } from '@/lib/api';
import { fieldValue } from '@/lib/form';
import { Field } from '@/components/Field';
import { ErrorAlert } from '@/components/Alert';
import { SchoolTypePicker, type SchoolType } from '@/components/SchoolTypePicker';
import { LanguagesPicker } from '@/components/LanguagePicker';
import type { Language } from '@classconnect/shared';

/**
 * FR-AUT-001: registration as Parent, Adult Learner or Teacher. A Student
 * account for a minor is created by a Parent from the children screen, so it is
 * deliberately absent from this choice.
 * NFR-USA-001: a new parent should reach a paid subscription in under 8 minutes,
 *              so this asks for the minimum and defers the rest.
 */
/**
 * FR-AUT-001. `student` is absent by design: a Student account for a minor is
 * created by an Admin, never by the child, and the API refuses the role here
 * regardless of what this form sends.
 */
type Role = 'parent' | 'adult_learner' | 'teacher';

interface Level {
  id: string;
  nameEn: string;
  nameFr: string;
  schoolType: SchoolType;
  subjects: { id: string; nameEn: string; nameFr: string }[];
}

export default function Register() {
  const { language, t } = useI18n();
  const router = useRouter();
  const { signIn } = useAuth();

  const [role, setRole] = useState<Role | null>(null);
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [dob, setDob] = useState('');
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  // Optional at registration, but it is what lets them sign in later without
  // waiting on an SMS that costs money and fails on a bad signal.
  const [password, setPassword] = useState('');
  const [devCode, setDevCode] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);

  // FR-TVR-001: a teacher states what they teach as they apply.
  const [levels, setLevels] = useState<Level[]>([]);
  const [schoolType, setSchoolType] = useState<SchoolType | null>(null);
  const [levelId, setLevelId] = useState('');
  const [pairs, setPairs] = useState<{ subjectId: string; levelId: string }[]>([]);
  // Seeded from the interface language as a sensible default, but editable:
  // reading the site in English says nothing about what you teach in.
  const [teachingLanguages, setTeachingLanguages] = useState<Language[]>([language]);

  // Only the teacher path needs the catalogue, so it is not fetched until
  // that role is chosen — a parent signing up pays nothing for it.
  useEffect(() => {
    if (role !== 'teacher' || levels.length > 0) return;
    void api<Level[]>('/catalogue/levels', { language })
      .then(setLevels)
      .catch((caught) => setError(caught as ApiError));
  }, [role, levels.length, language]);

  const classesForSchool = useMemo(
    () => (schoolType ? levels.filter((l) => l.schoolType === schoolType) : []),
    [levels, schoolType],
  );
  const selectedLevel = levels.find((l) => l.id === levelId);
  const name = (item: { nameEn: string; nameFr: string }) =>
    language === 'fr' ? item.nameFr : item.nameEn;

  const submit = async (form: HTMLFormElement) => {
    if (!role) return;

    // Chrome's address autofill fills name and phone together and does not
    // always fire React's onChange, so the form is read rather than the state.
    const submittedFullName = fieldValue(form, 'fullName', fullName);
    const submittedPhone = fieldValue(form, 'phone', phone);
    const submittedPassword = fieldValue(form, 'password', password);
    setBusy(true);
    setError(null);
    try {
      const result = await api<{ userId: string; requiresOtp: boolean; devCode?: string }>(
        '/auth/register',
        {
          method: 'POST',
          body: {
            role,
            fullName: submittedFullName,
            phone: submittedPhone,
            preferredLanguage: language,
            acceptedTerms,
            ...(submittedPassword ? { password: submittedPassword } : {}),
            ...(role === 'adult_learner' ? { dob } : {}),
            ...(role === 'teacher' ? { schoolType, subjects: pairs, teachingLanguages } : {}),
          },
          language,
        },
      );
      // Kept so the OTP step, which posts to the same number, has it.
      if (submittedPhone !== phone) setPhone(submittedPhone);
      setDevCode(result.devCode ?? '');
    } catch (caught) {
      setError(caught as ApiError);
    } finally {
      setBusy(false);
    }
  };

  const verify = async (form: HTMLFormElement) => {
    const submittedCode = fieldValue(form, 'code', code);

    setBusy(true);
    setError(null);
    try {
      const tokens = await api<{ accessToken: string; refreshToken: string }>('/auth/otp/verify', {
        method: 'POST',
        body: { phone, code: submittedCode, purpose: 'registration', deviceLabel: navigator.userAgent.slice(0, 60) },
        language,
      });
      await signIn(tokens);
      router.push(`/${language}`);
    } catch (caught) {
      setError(caught as ApiError);
    } finally {
      setBusy(false);
    }
  };

  // Step 3: verify the phone (FR-AUT-002).
  if (devCode !== null) {
    return (
      <div className="mx-auto max-w-md">
        <h1 className="text-2xl font-semibold">{t('auth.enterCode')}</h1>
        <p className="mt-1 text-sm text-ink-600">{t('auth.codeSentTo', { destination: phone })}</p>
        <ErrorAlert error={error} />

        {devCode && (
          <p className="my-4 rounded-lg bg-ink-100 p-2 text-center font-mono text-lg">{devCode}</p>
        )}

        <form
          onSubmit={(event) => {
            event.preventDefault();
            void verify(event.currentTarget);
          }}
        >
          <Field
            label={t('auth.enterCode')}
            name="code"
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            required
            value={code}
            onChange={(event) => setCode(event.target.value.replace(/\D/g, ''))}
          />
          <button type="submit" className="cc-btn-primary w-full" disabled={busy}>
            {busy ? t('common.loading') : t('auth.verify')}
          </button>
        </form>
      </div>
    );
  }

  // Step 1: choose a role.
  if (!role) {
    const options: { value: Role; label: string; hint: string; icon: string }[] = [
      { value: 'parent', label: t('auth.roleParent'), hint: t('auth.roleParentHint'), icon: '👨‍👩‍👧' },
      {
        value: 'adult_learner',
        label: t('auth.roleAdultLearner'),
        hint: t('auth.roleAdultLearnerHint'),
        icon: '🎓',
      },
      {
        value: 'teacher',
        label: t('auth.roleTeacher'),
        hint: t('auth.roleTeacherHint'),
        icon: '📚',
      },
    ];

    return (
      <div className="mx-auto max-w-md">
        <h1 className="text-2xl font-semibold">{t('auth.chooseRole')}</h1>
        <ul className="mt-6 flex flex-col gap-3">
          {options.map((option) => (
            <li key={option.value}>
              <button
                type="button"
                onClick={() => setRole(option.value)}
                className="cc-card flex w-full items-start gap-3 text-left hover:bg-ink-100"
              >
                <span aria-hidden="true" className="text-2xl">
                  {option.icon}
                </span>
                <span>
                  <span className="block font-medium text-ink-900">{option.label}</span>
                  <span className="mt-0.5 block text-sm text-ink-600">{option.hint}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>

        <p className="mt-6 text-center text-sm text-ink-600">
          <Link href={`/${language}/sign-in`} className="font-medium text-brand-700 underline">
            {t('auth.signIn')}
          </Link>
        </p>
      </div>
    );
  }

  // Step 2: the details.
  return (
    <div className="mx-auto max-w-md">
      <h1 className="text-2xl font-semibold">{t('auth.signUp')}</h1>
      <ErrorAlert error={error} />

      <form
        className="mt-6"
        onSubmit={(event) => {
          event.preventDefault();
          void submit(event.currentTarget);
        }}
      >
        <Field
          label={t('auth.fullName')}
          name="fullName"
          type="text"
          autoComplete="name"
          required
          value={fullName}
          onChange={(event) => setFullName(event.target.value)}
          errorKey={error?.fieldError('fullName')}
        />

        <Field
          label={t('auth.phone')}
          name="phone"
          hint={t('auth.phoneHint')}
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          required
          value={phone}
          onChange={(event) => setPhone(event.target.value)}
          errorKey={error?.fieldError('phone')}
          placeholder="6XX XXX XXX"
        />

        {/* §1.3: an Adult Learner is 18+, which the API verifies from this. */}
        {role === 'adult_learner' && (
          <Field
            label={t('auth.dob')}
            type="date"
            required
            value={dob}
            onChange={(event) => setDob(event.target.value)}
            errorKey={error?.fieldError('dob')}
          />
        )}

        {/*
          FR-TVR-001: what this teacher teaches, stated up front.

          School type narrows the classes, and the class narrows the subjects,
          so a primary teacher is never offered A-Level Further Maths. The
          server re-checks the pair against the catalogue regardless
          (FR-PRO-002) — this only keeps the form honest.
        */}
        {role === 'teacher' && (
          <>
            <SchoolTypePicker
              value={schoolType}
              onChange={(value) => {
                setSchoolType(value);
                // The class and its subjects belong to the previous school
                // type; carrying them over would submit a mismatched pair.
                setLevelId('');
                setPairs([]);
              }}
            />

            {schoolType && (
              <fieldset className="mb-4">
                <legend className="cc-label">{t('teacher.subjectsTaught')}</legend>
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

                <p className="cc-hint">
                  {pairs.length > 0
                    ? t('admin.subjectsSelected', { count: pairs.length })
                    : t('errors.teacher.subjects_required')}
                </p>
              </fieldset>
            )}

            <LanguagesPicker
              value={teachingLanguages}
              onChange={setTeachingLanguages}
              label={t('teacher.teachingLanguages')}
              hint={t('teacher.teachingLanguagesHint')}
            />

            {/* FR-TVR-003: set the expectation before they sign up, not after. */}
            <p className="mb-4 rounded-lg bg-brand-50 p-3 text-sm text-brand-700">
              {t('auth.teacherVerificationNote')}
            </p>
          </>
        )}

        <Field
          label={t('auth.setPassword')}
          hint={t('auth.setPasswordHint')}
          type="password"
          autoComplete="new-password"
          name="password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          errorKey={error?.fieldError('password')}
        />

        {/* NFR-PRV-002: acceptance of the notice and terms is recorded. */}
        <div className="mb-4 flex items-start gap-3">
          <input
            id="terms"
            type="checkbox"
            required
            checked={acceptedTerms}
            onChange={(event) => setAcceptedTerms(event.target.checked)}
            className="mt-1 h-6 w-6 rounded border-ink-300"
          />
          <label htmlFor="terms" className="text-sm text-ink-900">
            {t('auth.acceptTerms')}
          </label>
        </div>

        <button
          type="submit"
          className="cc-btn-primary w-full"
          disabled={
            busy ||
            // NFR-PRV-002: consent is an explicit act, and the checkbox is on
            // screen, so gating on it explains itself. Empty name and phone are
            // left to the browser's own 'required' handling — they are
            // autofillable, and a dead button would be the result otherwise.
            !acceptedTerms ||
            // FR-TVR-001: a teacher cannot apply without saying what they teach.
            (role === 'teacher' &&
              (!schoolType || pairs.length === 0 || teachingLanguages.length === 0))
          }
        >
          {busy ? t('common.loading') : t('common.continue')}
        </button>

        <button type="button" className="cc-btn-secondary mt-3 w-full" onClick={() => setRole(null)}>
          {t('common.back')}
        </button>
      </form>
    </div>
  );
}
