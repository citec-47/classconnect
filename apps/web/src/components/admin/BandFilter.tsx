'use client';

import { SCHOOL_TYPES, schoolTypeLabelKey, type SchoolType } from '@classconnect/shared';
import { useI18n } from '@/lib/i18n';

export type BandFilterValue = SchoolType | 'unclassified' | 'all';

/**
 * The band selector shared by the teacher and student rosters.
 *
 * `unclassified` is a first-class option rather than an afterthought: for
 * teachers it is the set who cannot be assigned a learner until somebody
 * chooses, which makes it the most actionable filter on the screen.
 *
 * UI-003: a radio group, so a screen reader announces it as one choice and
 * arrow keys move between the options — and the selected one is marked by more
 * than colour.
 */
export function BandFilter({
  value,
  onChange,
  counts,
  includeUnclassified = true,
}: {
  value: BandFilterValue;
  onChange: (value: BandFilterValue) => void;
  counts?: Partial<Record<string, number>>;
  includeUnclassified?: boolean;
}) {
  const { t } = useI18n();

  const options: { value: BandFilterValue; label: string }[] = [
    { value: 'all', label: t('schoolType.all') },
    ...SCHOOL_TYPES.map((band) => ({
      value: band as BandFilterValue,
      label: t(schoolTypeLabelKey(band)),
    })),
    ...(includeUnclassified
      ? [{ value: 'unclassified' as BandFilterValue, label: t('schoolType.unclassified') }]
      : []),
  ];

  return (
    <div
      role="radiogroup"
      aria-label={t('schoolType.all')}
      className="mb-4 flex flex-wrap gap-1 rounded-lg border border-ink-300 bg-white p-1"
    >
      {options.map((option) => {
        const active = value === option.value;
        const count = counts?.[option.value];

        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(option.value)}
            className={[
              'flex min-h-touch items-center gap-1.5 rounded-md px-3 text-sm transition-colors',
              active ? 'bg-brand-600 font-semibold text-white' : 'text-ink-600 hover:bg-ink-100',
            ].join(' ')}
          >
            {/* Marks the choice by shape as well as colour (UI-003). */}
            <span aria-hidden="true">{active ? '●' : '○'}</span>
            {option.label}
            {count !== undefined && (
              <span className={`tabular-nums ${active ? 'text-white/80' : 'text-ink-600'}`}>
                {count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
