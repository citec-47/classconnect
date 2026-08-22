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
 * A confirmed slot whose teacher has asked to move it.
 *
 * Carries both times, because the decision is a comparison: what the class is
 * turning up to now, against what it would become. An approval screen showing
 * only the proposal asks the admin to agree to a change they cannot see.
 */
interface PendingEdit extends PendingSlot {
  proposedStartMinute: number;
  proposedEndMinute: number;
  proposedAt: string | null;
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
  /**
   * What each period will pay, per hour, as typed.
   *
   * Held as the raw string rather than a number so that an empty box stays
   * empty. Parsed to a number it becomes `NaN` or `0`, and both would have to be
   * translated back into "the admin did not type anything" — which is exactly
   * the distinction that decides whether a teacher is paid the platform default
   * or nothing at all.
   */
  const [rates, setRates] = useState<Record<string, string>>({});
  /*
   * Time changes are a second, separate queue.
   *
   * A slot awaiting first confirmation has told nobody anything; a confirmed
   * slot awaiting a move has a class already turning up at an hour. Mixing them
   * into one list would make those look like the same decision, and they carry
   * very different consequences.
   */
  const [edits, setEdits] = useState<PendingEdit[] | null>(null);

  const name = (item: { nameEn: string; nameFr: string }) =>
    language === 'fr' ? item.nameFr : item.nameEn;

  const load = useCallback(async () => {
    setError(null);
    try {
      const [data, editData] = await Promise.all([
        api<{ slots: PendingSlot[] }>('/admin/timetable/pending', { language }),
        api<{ edits: PendingEdit[] }>('/admin/timetable/pending-edits', { language }),
      ]);
      setPending(data.slots);
      setEdits(editData.edits);
    } catch (caught) {
      setError(caught as ApiError);
      setPending([]);
    }
  }, [language]);

  useEffect(() => {
    void load();
  }, [load]);

  /** Approving or refusing a move. The clash rule is re-checked on approval. */
  const decideEdit = async (slotId: string, approve: boolean) => {
    setBusyId(slotId);
    setError(null);
    try {
      await api(`/admin/timetable/${slotId}/edit-decision`, {
        method: 'POST',
        body: { approve },
        language,
        timeoutMs: 120_000,
      });
      await load();
    } catch (caught) {
      setError(caught as ApiError);
    } finally {
      setBusyId(null);
    }
  };

  const decide = async (slotId: string, decision: 'confirmed' | 'rejected') => {
    setBusyId(slotId);
    setError(null);
    try {
      /*
       * The rate travels with the approval.
       *
       * "Admin sets the teacher's hourly rate after timetable approval" is one
       * intention, and splitting it across two actions means an admin who
       * approves twenty periods on a Monday has to come back and price twenty
       * periods on a Tuesday, from a screen that no longer lists them.
       *
       * Left blank it is omitted entirely, not sent as zero — an unpriced period
       * pays the platform default, and a zero would silently mean this teacher
       * works this hour for nothing.
       */
      const typed = (rates[slotId] ?? '').trim();
      const hourlyRateXaf = typed === '' ? undefined : Number(typed);

      await api(`/admin/timetable/${slotId}/decision`, {
        method: 'POST',
        body: {
          decision,
          ...(decision === 'rejected' ? { note: notes[slotId] ?? '' } : {}),
          ...(hourlyRateXaf !== undefined && Number.isFinite(hourlyRateXaf)
            ? { hourlyRateXaf }
            : {}),
        },
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

      {/*
        * Time changes first, and only when there are any.
        *
        * Above the confirmation queue because it is the more urgent of the two:
        * a class is already meeting at the old hour, and every day this waits is
        * a day the teacher and their students may disagree about when to turn
        * up. An empty section is not rendered — a heading with nothing under it
        * reads as something failing to load.
        */}
      {edits && edits.length > 0 && (
        <section className="mb-4">
          <h2 className="mb-2 text-base font-semibold text-ink-900">
            {t('timetable.pendingEditsTitle')}
          </h2>
          <ul className="flex flex-col gap-3">
            {edits.map((slot) => (
              <li key={slot.id} className="rounded-xl border border-warning-600 bg-warning-50 p-3">
                <p className="text-sm font-semibold text-ink-900">
                  {name(slot.subject)} · {name(slot.level)}
                </p>
                <p className="text-xs text-ink-600">{slot.teacher.user.fullName}</p>

                {/* The comparison the decision actually is. */}
                <p className="mt-2 text-sm tabular-nums text-ink-900">
                  <span className="text-ink-600 line-through">
                    {minutesToClock(slot.startMinute)}–{minutesToClock(slot.endMinute)}
                  </span>
                  {' → '}
                  <span className="font-semibold">
                    {minutesToClock(slot.proposedStartMinute)}–
                    {minutesToClock(slot.proposedEndMinute)}
                  </span>
                </p>
                <p className="text-xs text-ink-600">
                  {t(`timetable.day.${TIMETABLE_DAY_KEYS[slot.dayOfWeek as 1]}`)}
                </p>

                <div className="mt-2 flex flex-wrap gap-2">
                  <button
                    type="button"
                    disabled={busyId === slot.id}
                    onClick={() => void decideEdit(slot.id, true)}
                    className="min-h-touch rounded-lg bg-brand-600 px-3 text-sm font-medium text-white disabled:opacity-50"
                  >
                    {t('timetable.approveEdit')}
                  </button>
                  <button
                    type="button"
                    disabled={busyId === slot.id}
                    onClick={() => void decideEdit(slot.id, false)}
                    className="min-h-touch rounded-lg border border-ink-300 px-3 text-sm disabled:opacity-50"
                  >
                    {t('timetable.refuseEdit')}
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

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

              {/*
                * What this period pays. Optional, and blank means the platform
                * rate — said on the label, because an empty money field on an
                * approval screen otherwise reads as "unpaid".
                */}
              <label className="mt-3 block">
                <span className="cc-label">{t('timetable.rateLabel')}</span>
                <input
                  type="number"
                  inputMode="numeric"
                  min={0}
                  step={100}
                  className="cc-field w-full"
                  value={rates[slot.id] ?? ''}
                  onChange={(e) => setRates({ ...rates, [slot.id]: e.target.value })}
                  placeholder={t('timetable.ratePlaceholder')}
                  aria-label={t('timetable.rateLabel')}
                />
                <span className="mt-0.5 block text-xs text-ink-600">
                  {t('timetable.rateHint')}
                </span>
              </label>

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
