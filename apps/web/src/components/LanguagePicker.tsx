'use client';

import { useId } from 'react';
import { LANGUAGES, type Language } from '@classconnect/shared';
import { useT } from '@/lib/i18n';

/**
 * Choosing a language of instruction.
 *
 * This is not the same thing as the interface language, and conflating the two
 * is a real bug: a teacher reading the site in English still teaches in French,
 * and a French-speaking child can be enrolled by an English-speaking
 * administrator. Copying the UI language onto the record silently records the
 * wrong answer and leaves no way to correct it.
 *
 * FR-TVR-001 makes languages part of a teacher's application, FR-PRO-003 makes
 * it part of a learner profile, and FR-PRO-006 lets families filter teachers by
 * it — so the value has to be asked for, not inferred.
 *
 * UI-002: every target clears 44px. UI-003: rendered as a real fieldset with a
 * legend, so the group is announced as one question.
 */

const LABEL_KEY: Record<Language, string> = {
  en: 'common.english',
  fr: 'common.french',
};

/** One or more languages, for a teacher. */
export function LanguagesPicker({
  value,
  onChange,
  label,
  hint,
}: {
  value: Language[];
  onChange: (value: Language[]) => void;
  label: string;
  hint?: string;
}) {
  const t = useT();

  return (
    <fieldset className="mb-4">
      <legend className="cc-label">{label}</legend>
      {hint && <p className="cc-hint mb-2">{hint}</p>}

      <div className="flex flex-wrap gap-2">
        {LANGUAGES.map((language) => {
          const checked = value.includes(language);
          return (
            <label
              key={language}
              lang={language}
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
                  onChange(
                    event.target.checked
                      ? [...value, language]
                      : value.filter((entry) => entry !== language),
                  )
                }
              />
              {t(LABEL_KEY[language])}
            </label>
          );
        })}
      </div>

      {value.length === 0 && <p className="cc-hint">{t('errors.language.required')}</p>}
    </fieldset>
  );
}

/** Exactly one language, for a learner's preferred language of instruction. */
export function PreferredLanguagePicker({
  value,
  onChange,
  label,
  hint,
}: {
  value: Language;
  onChange: (value: Language) => void;
  label: string;
  hint?: string;
}) {
  const t = useT();
  const id = useId();

  return (
    <div className="mb-4">
      <label htmlFor={id} className="cc-label">
        {label}
      </label>
      {hint && <p className="cc-hint mb-1">{hint}</p>}
      <select
        id={id}
        className="cc-field"
        value={value}
        onChange={(event) => onChange(event.target.value as Language)}
      >
        {LANGUAGES.map((language) => (
          <option key={language} value={language} lang={language}>
            {t(LABEL_KEY[language])}
          </option>
        ))}
      </select>
    </div>
  );
}
