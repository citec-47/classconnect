'use client';

import { useId, type InputHTMLAttributes, type ReactNode } from 'react';
import { useT } from '@/lib/i18n';

/**
 * A labelled form field.
 *
 * UI-003 / NFR-USA-003: every input has a programmatically associated label,
 * hints and errors are linked via aria-describedby, and an invalid field is
 * marked with aria-invalid — so the error is identified by more than colour.
 * NFR-USA-004: the error says what went wrong and what to do next, because it
 * is rendered from a message key in the user's language.
 */
interface FieldProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'id'> {
  label: string;
  hint?: string;
  /** Message key; resolved through the catalogue so it renders in EN or FR. */
  errorKey?: string;
  errorParams?: Record<string, string | number>;
  trailing?: ReactNode;
}

export function Field({
  label,
  hint,
  errorKey,
  errorParams,
  trailing,
  required,
  ...inputProps
}: FieldProps) {
  const t = useT();
  const id = useId();
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;

  const describedBy = [hint ? hintId : null, errorKey ? errorId : null]
    .filter(Boolean)
    .join(' ');

  return (
    <div className="mb-4">
      <label htmlFor={id} className="cc-label">
        {label}
        {required ? (
          <span className="ml-1 text-danger-600" aria-hidden="true">
            *
          </span>
        ) : (
          <span className="ml-1 font-normal text-ink-600">({t('common.optional')})</span>
        )}
      </label>

      <div className="relative">
        <input
          id={id}
          className={`cc-field ${errorKey ? 'cc-field-invalid' : ''}`}
          aria-invalid={errorKey ? true : undefined}
          aria-describedby={describedBy || undefined}
          aria-required={required}
          {...inputProps}
        />
        {trailing}
      </div>

      {hint && (
        <p id={hintId} className="cc-hint">
          {hint}
        </p>
      )}

      {errorKey && (
        <p id={errorId} className="cc-error" role="alert">
          {/* An icon alongside the text, so the error is not colour-only. */}
          <span aria-hidden="true">⚠</span>
          <span>{t(errorKey, errorParams)}</span>
        </p>
      )}
    </div>
  );
}
