'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useI18n } from '@/lib/i18n';
import { useAuth } from '@/lib/auth-context';
import { api, ApiError } from '@/lib/api';
import { Field } from '@/components/Field';
import { ErrorAlert } from '@/components/Alert';
import type { Language } from '@classconnect/shared';

type Step = 'phone' | 'code';

/**
 * FR-AUT-002: phone-first sign-in with a 6-digit code delivered by SMS.
 * FR-AUT-005: WhatsApp fallback offered where SMS delivery fails.
 * AS-07: a mobile number is the universal identifier, so this is the primary
 *        path and email/password is secondary.
 */
export default function SignIn() {
  const { language, t } = useI18n();
  const router = useRouter();
  const { signIn } = useAuth();

  const [step, setStep] = useState<Step>('phone');
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  const [expiresInMinutes, setExpiresInMinutes] = useState(5);
  const [resendIn, setResendIn] = useState(0);
  const [devCode, setDevCode] = useState<string | null>(null);

  // FR-AUT-004 rate-limits issuance; the countdown makes that visible rather
  // than letting the user hit a wall.
  useEffect(() => {
    if (resendIn <= 0) return;
    const timer = setTimeout(() => setResendIn((s) => s - 1), 1000);
    return () => clearTimeout(timer);
  }, [resendIn]);

  const requestCode = async (channel: 'sms' | 'whatsapp') => {
    setBusy(true);
    setError(null);
    try {
      const result = await api<{ expiresAt: string; devCode?: string }>('/auth/otp/request', {
        method: 'POST',
        body: { phone, purpose: 'login', channel },
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

  const verify = async () => {
    setBusy(true);
    setError(null);
    try {
      const tokens = await api<{ accessToken: string; refreshToken: string }>('/auth/otp/verify', {
        method: 'POST',
        body: {
          phone,
          code,
          purpose: 'login',
          deviceLabel: navigator.userAgent.slice(0, 60),
        },
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

  return (
    <div className="mx-auto max-w-md">
      <h1 className="text-2xl font-semibold text-ink-900">{t('auth.signIn')}</h1>
      <p className="mt-1 text-ink-600">{t('auth.signInSubtitle')}</p>

      <ErrorAlert error={error} />

      {step === 'phone' ? (
        <form
          className="mt-6"
          onSubmit={(event) => {
            event.preventDefault();
            void requestCode('sms');
          }}
        >
          <Field
            label={t('auth.phone')}
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

          <button type="submit" className="cc-btn-primary w-full" disabled={busy || !phone}>
            {busy ? t('common.loading') : t('auth.sendCode')}
          </button>
        </form>
      ) : (
        <form
          className="mt-6"
          onSubmit={(event) => {
            event.preventDefault();
            void verify();
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
            disabled={busy || code.length !== 6}
          >
            {busy ? t('common.loading') : t('auth.verify')}
          </button>

          <div className="mt-4 flex flex-col gap-2">
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
