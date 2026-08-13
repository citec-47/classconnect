'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useI18n } from '@/lib/i18n';
import { useAuth } from '@/lib/auth-context';
import { api, ApiError } from '@/lib/api';
import { fieldValue } from '@/lib/form';
import { Field } from '@/components/Field';
import { ErrorAlert } from '@/components/Alert';
import { homeFor } from '@/lib/home-for';

type Step = 'phone' | 'code';
/**
 * Credentials by default; a one-time code as the fallback.
 *
 * Anyone whose account has a password should be able to just use it. An Admin
 * creating a teacher or a student sets one and hands it over, so making the
 * code the only route would make that password meaningless — and every sign-in
 * would cost an SMS and fail whenever the network did.
 */
type Method = 'password' | 'code';

/**
 * FR-AUT-003: sign in with a password, by phone number or email.
 * FR-AUT-002: or with a 6-digit code, for an account that has no password.
 * FR-AUT-005: WhatsApp fallback offered where SMS delivery fails.
 *
 * AS-07 makes the mobile number the universal identifier, so it is what the
 * form asks for first; an email is accepted in the same box.
 */
export default function SignIn() {
  const { language, t } = useI18n();
  const router = useRouter();
  const { signIn, user, loading: sessionLoading } = useAuth();

  const [method, setMethod] = useState<Method>('password');
  const [step, setStep] = useState<Step>('phone');
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [mfaCode, setMfaCode] = useState('');
  const [needsMfa, setNeedsMfa] = useState(false);
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  const [expiresInMinutes, setExpiresInMinutes] = useState(5);
  const [resendIn, setResendIn] = useState(0);
  const [devCode, setDevCode] = useState<string | null>(null);

  /*
   * Already signed in? Go to the dashboard rather than showing the form again.
   *
   * A session survives a closed tab (the tokens are in `localStorage`), so
   * returning to the site the next morning and clicking Sign in is the ordinary
   * path — and being asked to type a password you are already past reads as
   * having been signed out. `replace` rather than `push`, so Back does not come
   * straight back to a form that will bounce again.
   *
   * Waits for `loading` to settle: acting on `user === null` while `/auth/me` is
   * still in flight would redirect nobody and, worse, would sometimes fire for a
   * signed-in person a tick before their session arrived.
   */
  useEffect(() => {
    if (sessionLoading || !user) return;
    router.replace(homeFor(user.roles, language));
  }, [sessionLoading, user, router, language]);

  // FR-AUT-004 rate-limits issuance; the countdown makes that visible rather
  // than letting the user hit a wall.
  useEffect(() => {
    if (resendIn <= 0) return;
    const timer = setTimeout(() => setResendIn((s) => s - 1), 1000);
    return () => clearTimeout(timer);
  }, [resendIn]);

  const requestCode = async (channel: 'sms' | 'whatsapp', form?: HTMLFormElement) => {
    const submittedPhone = form ? fieldValue(form, 'phone', phone) : phone;
    if (submittedPhone !== phone) setPhone(submittedPhone);

    setBusy(true);
    setError(null);
    try {
      const result = await api<{ expiresAt: string; devCode?: string }>('/auth/otp/request', {
        method: 'POST',
        body: { phone: submittedPhone, purpose: 'login', channel },
        language,
      });
      const minutes = Math.max(
        1,
        Math.round((new Date(result.expiresAt).getTime() - Date.now()) / 60000),
      );
      setExpiresInMinutes(minutes);
      setDevCode(result.devCode ?? null);
      setStep('code');
      setResendIn(60);
    } catch (caught) {
      setError(caught as ApiError);
    } finally {
      setBusy(false);
    }
  };

  const verify = async (form: HTMLFormElement) => {
    // An SMS one-time code is exactly what a browser or OS offers to fill in
    // automatically, so this path needs the same treatment as the password one.
    const submittedCode = fieldValue(form, 'code', code);

    setBusy(true);
    setError(null);
    try {
      const tokens = await api<{ accessToken: string; refreshToken: string }>('/auth/otp/verify', {
        method: 'POST',
        body: {
          phone,
          code: submittedCode,
          purpose: 'login',
          deviceLabel: navigator.userAgent.slice(0, 60),
        },
        language,
      });
      const me = await signIn(tokens);
      router.push(homeFor(me?.roles ?? [], language));
    } catch (caught) {
      setError(caught as ApiError);
    } finally {
      setBusy(false);
    }
  };

  /**
   * FR-AUT-003. The identifier box takes either a phone number or an email;
   * which one it is, is the server's business, so the user is not asked to
   * classify their own credential before they can type it.
   */
  const signInWithPassword = async (form: HTMLFormElement) => {
    // Taken from the form, so a password manager's autofill is honoured even
    // when it never fired an onChange.
    const submittedIdentifier = fieldValue(form, 'identifier', identifier);
    const submittedPassword = fieldValue(form, 'password', password);
    const submittedMfaCode = fieldValue(form, 'mfaCode', mfaCode);

    setBusy(true);
    setError(null);
    try {
      const looksLikeEmail = submittedIdentifier.includes('@');
      const tokens = await api<{ accessToken: string; refreshToken: string }>('/auth/login', {
        method: 'POST',
        body: {
          ...(looksLikeEmail
            ? { email: submittedIdentifier }
            : { phone: submittedIdentifier }),
          password: submittedPassword,
          ...(submittedMfaCode ? { mfaCode: submittedMfaCode } : {}),
          deviceLabel: navigator.userAgent.slice(0, 60),
        },
        language,
      });
      const me = await signIn(tokens);
      router.push(homeFor(me?.roles ?? [], language));
    } catch (caught) {
      const failure = caught as ApiError;
      // FR-AUT-009: staff need a second factor. Rather than refusing outright,
      // reveal the field and let them finish the same attempt.
      if (failure.messageKey === 'errors.mfa.required') {
        setNeedsMfa(true);
        setError(null);
      } else {
        setError(failure);
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto max-w-md">
      <h1 className="text-2xl font-semibold text-ink-900">{t('auth.signIn')}</h1>
      <p className="mt-1 text-ink-600">{t('auth.signInSubtitle')}</p>

      {/* Flagged on the inputs themselves, so the banner does not repeat them. */}
      <ErrorAlert error={error} handledFields={['email', 'phone', 'password', 'code']} />

      {method === 'password' ? (
        <form
          className="mt-6"
          onSubmit={(event) => {
            event.preventDefault();
            void signInWithPassword(event.currentTarget);
          }}
        >
          <Field
            label={t('auth.phoneOrEmail')}
            name="identifier"
            hint={t('auth.phoneOrEmailHint')}
            type="text"
            inputMode="email"
            autoComplete="username"
            required
            value={identifier}
            onChange={(event) => setIdentifier(event.target.value)}
            errorKey={error?.fieldError('phone') ?? error?.fieldError('email')}
            placeholder="6XX XXX XXX"
          />

          <Field
            label={t('auth.password')}
            name="password"
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            errorKey={error?.fieldError('password')}
          />

          {/* FR-AUT-009: only shown once the server says this account needs it. */}
          {needsMfa && (
            <Field
              label={t('auth.mfaCode')}
              name="mfaCode"
              hint={t('auth.mfaHint')}
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              required
              value={mfaCode}
              onChange={(event) => setMfaCode(event.target.value.replace(/\D/g, ''))}
            />
          )}

          <button
            type="submit"
            className="cc-btn-primary w-full"
            disabled={busy}
          >
            {busy ? t('common.loading') : t('auth.signIn')}
          </button>

          {/* An account registered by phone may have no password at all. */}
          <button
            type="button"
            className="cc-btn-secondary mt-3 w-full"
            onClick={() => {
              setMethod('code');
              setError(null);
            }}
          >
            {t('auth.useCodeInstead')}
          </button>
        </form>
      ) : step === 'phone' ? (
        <form
          className="mt-6"
          onSubmit={(event) => {
            event.preventDefault();
            void requestCode('sms', event.currentTarget);
          }}
        >
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

          <button type="submit" className="cc-btn-primary w-full" disabled={busy}>
            {busy ? t('common.loading') : t('auth.sendCode')}
          </button>
        </form>
      ) : (
        <form
          className="mt-6"
          onSubmit={(event) => {
            event.preventDefault();
            void verify(event.currentTarget);
          }}
        >
          <p className="mb-4 text-sm text-ink-600">
            {t('auth.codeSentTo', { destination: phone })}{' '}
            {t('auth.codeExpiresIn', { minutes: expiresInMinutes })}
          </p>

          {/* Local development only: the API returns the code when no SMS
              provider is configured, so the flow can be exercised. */}
          {devCode && (
            <p className="mb-4 rounded-lg bg-ink-100 p-2 text-center font-mono text-lg">
              {devCode}
            </p>
          )}

          <Field
            label={t('auth.enterCode')}
            name="code"
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="\d{6}"
            maxLength={6}
            required
            value={code}
            onChange={(event) => setCode(event.target.value.replace(/\D/g, ''))}
            errorKey={error?.fieldError('code')}
          />

          <button
            type="submit"
            className="cc-btn-primary w-full"
            disabled={busy}
          >
            {busy ? t('common.loading') : t('auth.verify')}
          </button>

          <div className="mt-4 flex flex-col gap-2">
            <button
              type="button"
              className="cc-btn-secondary w-full"
              onClick={() => {
                setMethod('password');
                setStep('phone');
                setError(null);
              }}
            >
              {t('auth.usePasswordInstead')}
            </button>

            <button
              type="button"
              className="cc-btn-secondary w-full"
              disabled={busy || resendIn > 0}
              onClick={() => void requestCode('sms')}
            >
              {resendIn > 0 ? t('auth.resendIn', { seconds: resendIn }) : t('auth.resendCode')}
            </button>

            {/* FR-AUT-005: WhatsApp fallback where SMS does not arrive. */}
            <button
              type="button"
              className="cc-btn-secondary w-full"
              disabled={busy}
              onClick={() => void requestCode('whatsapp')}
            >
              {t('auth.tryWhatsApp')}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
