'use client';

import { SCHOOL_TYPES, schoolTypeLabelKey, type SchoolType } from '@classconnect/shared';
import { useT } from '@/lib/i18n';

export type { SchoolType };

/**
 * The Admin's first choice when creating an account: which of the three
 * teaching bands this person belongs to. Everything downstream — which classes
 * are offered, which subjects, which levels a teacher may be given — narrows
 * from this.
 *
 * The options come from SCHOOL_TYPES so the picker, the roster filters and the
 * API's enum can never disagree about how many bands there are.
 *
 * UI-002: each option is a full-width control well above the 44px minimum.
 * UI-003: rendered as a radio group so a screen reader announces it as one
 *         choice, and arrow keys move between the options.
 */
export function SchoolTypePicker({
  value,
  onChange,
  disabled,
}: {
  value: SchoolType | null;
  onChange: (value: SchoolType) => void;
  disabled?: boolean;
}) {
  const t = useT();

  const icons: Record<SchoolType, string> = {
    primary: '🎒',
    secondary: '📗',
    sixth_form: '🎓',
  };

  const options = SCHOOL_TYPES.map((value) => ({
    value,
    label: t(schoolTypeLabelKey(value)),
    hint: t(`${schoolTypeLabelKey(value)}Hint`),
    icon: icons[value],
  }));

  return (
    <fieldset className="mb-4" disabled={disabled}>
      <legend className="cc-label">{t('admin.schoolType')}</legend>
      <div className="flex flex-col gap-2" role="radiogroup" aria-label={t('admin.schoolType')}>
        {options.map((option) => {
          const selected = value === option.value;
          return (
            <label
              key={option.value}
              className={`flex min-h-touch cursor-pointer items-start gap-3 rounded-lg border p-3 ${
                selected ? 'border-brand-600 bg-brand-50' : 'border-ink-300'
              }`}
            >
              <input
                type="radio"
                name="schoolType"
                className="mt-1 h-5 w-5"
                checked={selected}
                onChange={() => onChange(option.value)}
              />
              <span>
                <span className="flex items-center gap-2 font-medium text-ink-900">
                  <span aria-hidden="true">{option.icon}</span>
                  {option.label}
                </span>
                <span className="mt-0.5 block text-sm text-ink-600">{option.hint}</span>
              </span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}
