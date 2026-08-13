'use client';

import { useCallback, useEffect, useState } from 'react';
import { TIMETABLE_DAY_KEYS, minutesToClock, type TimetableDay } from '@classconnect/shared';
import { useI18n } from '@/lib/i18n';
import { api, ApiError } from '@/lib/api';
import { ErrorAlert, EmptyState } from '@/components/Alert';
import { PageHeader } from '@/components/admin/ui';

interface PendingSlot {
  id: string;
  dayOfWeek: number;
  startMinute: number;
  endMinute: number;
  state: string;
  level: { id: string; nameEn: string; nameFr: string };
  subject: { id: string; nameEn: string; nameFr: string };
  cohort: { id: string; name: string } | null;
  teacher: { userId: string; user: { fullName: string } };
}

/**
 * BUILD-PLAN Phase 1 — the staff half of the timetable.
 *
 * Confirmation is what makes a slot count: a live session starts from a
 * confirmed slot and earnings are counted inside one. So this screen is the
 * control, and it is deliberately one decision at a time — the same reasoning
 * as the verification queue, where a bulk action would make the check
 * meaningless.
 */
export default function AdminTimetablePage() {
  const { t, language } = useI18n();

  const [pending, setPending] = useState<PendingSlot[] | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [notes, setNotes] = useState<Record<string, string>>({});

  const name = (item: { nameEn: string; nameFr: string }) =>
    language === 'fr' ? item.nameFr : item.nameEn;

  const load = useCallback(async () => {
    setError(null);
    try {
      const data = await api<{ slots: PendingSlot[] }>('/admin/timetable/pending', { language });
      setPending(data.slots);
    } catch (caught) {
      setError(caught as ApiError);
      setPending([]);
    }
  }, [language]);

  useEffect(() => {
    void load();
  }, [load]);

  const decide = async (slotId: string, decision: 'confirmed' | 'rejected') => {
    setBusyId(slotId);
    setError(null);
    try {
      await api(`/admin/timetable/${slotId}/decision`, {
        method: 'POST',
        body: { decision, ...(decision === 'rejected' ? { note: notes[slotId] ?? '' } : {}) },
        language,
        timeoutMs: 120_000,
      });
      // Drop it in place rather than refetching — the reviewer is working down
      // a list and a reload would move everything under them.
      setPending((current) => (current ? current.filter((slot) => slot.id !== slotId) : current));
    } catch (caught) {
      setError(caught as ApiError);
    } finally {
      setBusyId(null);
    }
  };

  if (pending === null) return <p className="text-ink-600">{t('common.loading')}</p>;

  return (
    <div>
      <PageHeader
        title={t('timetable.adminTitle')}
        description={t('timetable.adminDescription')}
      />

      <ErrorAlert error={error} />

      {pending.length === 0 ? (
        <EmptyState title={t('timetable.adminTitle')} body={t('timetable.nonePending')} />
      ) : (
        <ul className="flex flex-col gap-3">
          {pending.map((slot) => (
            <li key={slot.id} className="cc-card">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="font-medium text-ink-900">{slot.teacher.user.fullName}</p>
                  <p className="text-sm text-ink-600">
                    {name(slot.level)} · {name(slot.subject)}
                    {slot.cohort ? ` · ${slot.cohort.name}` : ''}
                  </p>
                </div>
                <span className="cc-badge bg-warning-50 text-warning-600">
                  {t(`timetable.day.${TIMETABLE_DAY_KEYS[slot.dayOfWeek as TimetableDay]}`)}{' '}
                  {minutesToClock(slot.startMinute)}–{minutesToClock(slot.endMinute)}
                </span>
              </div>

              {/*
               * A refusal needs a reason; a confirmation does not.
               * The teacher is told either way, and "no" without a cause is not
               * something they can act on.
               */}
              <input
                type="text"
                value={notes[slot.id] ?? ''}
                onChange={(e) => setNotes({ ...notes, [slot.id]: e.target.value })}
                placeholder={t('timetable.notePlaceholder')}
                className="cc-field mt-3 w-full"
                aria-label={t('timetable.notePlaceholder')}
              />

              <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                <button
                  type="button"
                  className="cc-btn-primary w-full"
                  disabled={busyId === slot.id}
                  onClick={() => void decide(slot.id, 'confirmed')}
                >
                  {busyId === slot.id ? t('common.saving') : t('timetable.confirm')}
                </button>
                <button
                  type="button"
                  className="w-full rounded-lg border border-danger-600 px-3 py-2 text-sm font-medium text-danger-600 disabled:opacity-50"
                  disabled={busyId === slot.id || !(notes[slot.id] ?? '').trim()}
                  onClick={() => void decide(slot.id, 'rejected')}
                >
                  {t('timetable.reject')}
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
