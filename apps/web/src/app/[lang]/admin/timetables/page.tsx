'use client';

import { useState } from 'react';
import { schoolTypeLabelKey, TIMETABLE_DAY_KEYS, type TimetableDay } from '@classconnect/shared';
import { useI18n } from '@/lib/i18n';
import { useCachedApi } from '@/lib/use-cached-api';
import { ErrorAlert, EmptyState } from '@/components/Alert';
import { PageHeader, StateChip } from '@/components/admin/ui';

interface OverviewSlot {
  id: string;
  startMinute: number;
  endMinute: number;
  clock: string;
  session: string;
  onHold: boolean;
  subject: { id: string; nameEn: string; nameFr: string };
  teacher: { id: string; fullName: string };
}

interface OverviewLevel {
  id: string;
  code: string;
  nameEn: string;
  nameFr: string;
  slotCount: number;
  days: { dayOfWeek: number; slots: OverviewSlot[] }[];
}

interface Overview {
  days: number[];
  categories: Record<string, OverviewLevel[]>;
}

/**
 * Every class's week, in one place.
 *
 * The brief asks the admin to be able to "look across the whole school from one
 * place" — so this is one screen with every category on it, not a picker that
 * shows one class at a time and makes comparing two of them a navigation
 * exercise.
 *
 * Each class is drawn the same way whether it has a full week or nothing at
 * all. A class with no timetable is the thing an admin is scanning for, so it
 * is listed and labelled rather than omitted.
 */
export default function TimetableOverview() {
  const { t, language } = useI18n();
  const { data, error } = useCachedApi<Overview>('/admin/timetable/overview', { language });

  /*
   * Collapsed by default, opened one category at a time.
   *
   * Sixteen classes × six days is a lot of table, and an admin arrives looking
   * for one of them. Primary opens first because it is the top of the list, not
   * because it matters most.
   */
  const [open, setOpen] = useState<string | null>(null);

  const name = (item: { nameEn: string; nameFr: string }) =>
    language === 'fr' ? item.nameFr : item.nameEn;

  if (error) {
    return (
      <>
        <PageHeader title={t('adminNav.timetableOverview')} />
        <ErrorAlert error={error} />
      </>
    );
  }

  if (!data) {
    return (
      <>
        <PageHeader title={t('adminNav.timetableOverview')} />
        <p className="text-ink-600">{t('common.loading')}</p>
      </>
    );
  }

  const categories = Object.entries(data.categories);

  return (
    <>
      <PageHeader
        title={t('adminNav.timetableOverview')}
        description={t('timetableOverview.description')}
      />

      {categories.length === 0 ? (
        <EmptyState
          title={t('adminNav.timetableOverview')}
          body={t('timetableOverview.empty')}
        />
      ) : (
        categories.map(([category, levels]) => {
          const isOpen = open === category;
          const timetabled = levels.filter((level) => level.slotCount > 0).length;

          return (
            <section key={category} className="mb-3 rounded-xl border border-ink-200 bg-white">
              <button
                type="button"
                onClick={() => setOpen(isOpen ? null : category)}
                aria-expanded={isOpen}
                className="flex min-h-touch w-full items-center justify-between px-4 text-left"
              >
                <span className="font-display text-base font-semibold text-ink-900">
                  {t(schoolTypeLabelKey(category as never))}
                </span>
                <span className="flex items-center gap-2 text-sm text-ink-600">
                  {t('timetableOverview.classesTimetabled', {
                    done: timetabled,
                    total: levels.length,
                  })}
                  <span aria-hidden="true">{isOpen ? '−' : '+'}</span>
                </span>
              </button>

              {isOpen && (
                <div className="border-t border-ink-200 p-3">
                  {levels.map((level) => (
                    <div key={level.id} className="mb-4 last:mb-0">
                      <div className="mb-1 flex items-center gap-2">
                        <h3 className="font-medium text-ink-900">{name(level)}</h3>
                        {level.slotCount === 0 && (
                          // The row an admin is looking for.
                          <StateChip tone="warn">{t('timetableOverview.noTimetable')}</StateChip>
                        )}
                      </div>

                      {/*
                       * Scrolls inside its own container: six days of periods is
                       * wider than a phone, and the page itself must not scroll
                       * sideways.
                       */}
                      <div className="overflow-x-auto">
                        <table className="w-full min-w-[720px] table-fixed border-collapse text-sm">
                          <thead>
                            <tr>
                              {data.days.map((day) => (
                                <th
                                  key={day}
                                  scope="col"
                                  className="border border-ink-200 bg-ink-100/60 p-2 text-left text-xs font-semibold uppercase tracking-wide text-ink-600"
                                >
                                  {t(`timetable.day.${TIMETABLE_DAY_KEYS[day as TimetableDay]}`)}
                                </th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            <tr>
                              {level.days.map((day) => (
                                <td
                                  key={day.dayOfWeek}
                                  className="border border-ink-200 p-1 align-top"
                                >
                                  {day.slots.length === 0 ? (
                                    <span className="block p-1 text-xs text-ink-400">—</span>
                                  ) : (
                                    <ul className="flex flex-col gap-1">
                                      {day.slots.map((slot) => (
                                        <li
                                          key={slot.id}
                                          className={`rounded-lg p-1.5 ${
                                            slot.onHold
                                              ? 'bg-warning-50'
                                              : slot.session === 'evening'
                                                ? 'bg-brand-50'
                                                : 'bg-ink-100/60'
                                          }`}
                                        >
                                          <span className="block font-mono text-[11px] text-ink-600">
                                            {slot.clock}
                                          </span>
                                          <span className="block text-xs font-medium text-ink-900">
                                            {slot.onHold
                                              ? t('timetableOverview.freePeriod')
                                              : name(slot.subject)}
                                          </span>
                                          <span className="block text-[11px] text-ink-600">
                                            {slot.teacher.fullName}
                                          </span>
                                        </li>
                                      ))}
                                    </ul>
                                  )}
                                </td>
                              ))}
                            </tr>
                          </tbody>
                        </table>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>
          );
        })
      )}
    </>
  );
}
