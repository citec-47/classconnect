'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  TIMETABLE_DAYS,
  TIMETABLE_DAY_KEYS,
  minutesToClock,
  clockToMinutes,
  findClashes,
  validateTimetableSlot,
  confirmedWeeklyMinutes,
  type TimetableDay,
} from '@classconnect/shared';
import { useI18n } from '@/lib/i18n';
import { api, ApiError } from '@/lib/api';
import { PageHeader } from '@/components/admin/ui';
import { ErrorAlert, SuccessAlert } from '@/components/Alert';
import { TeacherGate } from '@/components/teacher/TeacherGate';

interface Slot {
  id: string;
  dayOfWeek: number;
  startMinute: number;
  endMinute: number;
  state: 'proposed' | 'confirmed' | 'rejected';
  decisionNote: string | null;
  level: { id: string; nameEn: string; nameFr: string };
  subject: { id: string; nameEn: string; nameFr: string };
  cohort: { id: string; name: string } | null;
}

interface TeachingPair {
  subject: { id: string; nameEn: string; nameFr: string };
  level: { id: string; nameEn: string; nameFr: string };
}

/**
 * BUILD-PLAN Phase 1 — the teacher's week.
 *
 * They choose the hours; staff confirm them. Everything on this screen is one
 * of those two states, said plainly, because "proposed" and "confirmed" are the
 * difference between an intention and a class a child will turn up to.
 */
function TeacherTimetablePage() {
  const { t, language } = useI18n();

  const [slots, setSlots] = useState<Slot[] | null>(null);
  const [pairs, setPairs] = useState<TeachingPair[]>([]);
  const [error, setError] = useState<ApiError | null>(null);
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);

  const [form, setForm] = useState({ pair: '', day: '1', start: '08:00', end: '09:00' });

  const name = (item: { nameEn: string; nameFr: string }) =>
    language === 'fr' ? item.nameFr : item.nameEn;

  const load = useCallback(async () => {
    try {
      const [mine, application] = await Promise.all([
        api<{ slots: Slot[] }>('/teacher/timetable', { language }),
        api<{ subjects: TeachingPair[] }>('/teachers/me/application', { language }),
      ]);
      setSlots(mine.slots);
      setPairs(application.subjects);
      setForm((current) =>
        current.pair || application.subjects.length === 0
          ? current
          : {
              ...current,
              pair: `${application.subjects[0]!.subject.id}:${application.subjects[0]!.level.id}`,
            },
      );
    } catch (caught) {
      setError(caught as ApiError);
      setSlots([]);
    }
  }, [language]);

  useEffect(() => {
    void load();
  }, [load]);

  const startMinute = clockToMinutes(form.start);
  const endMinute = clockToMinutes(form.end);
  const dayOfWeek = Number(form.day);

  /*
   * The same rule the API will apply, run as the teacher types.
   *
   * `validateTimetableSlot` and `findClashes` live in `packages/shared`, so this
   * warning and the server's refusal cannot disagree — the alternative is a
   * form that says the hour is fine and a save that says it is not.
   */
  const draft =
    startMinute !== null && endMinute !== null
      ? { dayOfWeek, startMinute, endMinute }
      : null;
  const problem = draft ? validateTimetableSlot(draft) : 'errors.timetable.reversed';
  const clashes = draft && slots ? findClashes(draft, slots) : [];
  const blocked = problem !== null || clashes.length > 0;

  const propose = async () => {
    if (!draft || blocked) return;
    const [subjectId, levelId] = form.pair.split(':');
    if (!subjectId || !levelId) return;

    setBusy(true);
    setError(null);
    setSaved(false);
    try {
      await api('/teacher/timetable', {
        method: 'POST',
        body: { subjectId, levelId, ...draft },
        language,
        timeoutMs: 120_000,
      });
      setSaved(true);
      await load();
    } catch (caught) {
      setError(caught as ApiError);
    } finally {
      setBusy(false);
    }
  };

  const withdraw = async (slotId: string) => {
    setBusy(true);
    try {
      await api(`/teacher/timetable/${slotId}`, { method: 'DELETE', language, timeoutMs: 120_000 });
      await load();
    } catch (caught) {
      setError(caught as ApiError);
    } finally {
      setBusy(false);
    }
  };

  const weeklyMinutes = confirmedWeeklyMinutes(slots ?? []);

  return (
    <>
      <PageHeader
        title={t('teacherNav.timetable')}
        description={t('timetable.teacherDescription')}
      />

      <ErrorAlert error={error} />
      {saved && <SuccessAlert>{t('timetable.proposed')}</SuccessAlert>}

      <div className="mb-4 rounded-xl border border-brand-600 bg-brand-50 p-4">
        <p className="text-xs font-medium uppercase tracking-wide text-brand-700">
          {t('timetable.confirmedHours')}
        </p>
        <p className="mt-1 text-3xl font-semibold tabular-nums text-brand-700">
          {Math.floor(weeklyMinutes / 60)} h {weeklyMinutes % 60 ? `${weeklyMinutes % 60} min` : ''}
        </p>
        <p className="mt-1 text-sm text-ink-900">{t('timetable.confirmedHoursHint')}</p>
      </div>

      {/* Choosing hours. The brief's "teachers just select and choose the hours". */}
      <section className="mb-6 rounded-xl border border-ink-200 bg-white p-4">
        <h2 className="mb-3 font-display text-base font-semibold text-ink-900">
          {t('timetable.addTitle')}
        </h2>

        {pairs.length === 0 ? (
          <p className="text-sm text-ink-600">{t('timetable.noSubjects')}</p>
        ) : (
          <>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <label className="block">
                <span className="cc-label">{t('timetable.classAndSubject')}</span>
                <select
                  className="cc-field w-full"
                  value={form.pair}
                  onChange={(e) => setForm({ ...form, pair: e.target.value })}
                >
                  {pairs.map((pair) => (
                    <option
                      key={`${pair.subject.id}:${pair.level.id}`}
                      value={`${pair.subject.id}:${pair.level.id}`}
                    >
                      {name(pair.level)} · {name(pair.subject)}
                    </option>
                  ))}
                </select>
              </label>

              <label className="block">
                <span className="cc-label">{t('timetable.dayLabel')}</span>
                <select
                  className="cc-field w-full"
                  value={form.day}
                  onChange={(e) => setForm({ ...form, day: e.target.value })}
                >
                  {TIMETABLE_DAYS.map((day) => (
                    <option key={day} value={day}>
                      {t(`timetable.day.${TIMETABLE_DAY_KEYS[day]}`)}
                    </option>
                  ))}
                </select>
              </label>

              <label className="block">
                <span className="cc-label">{t('timetable.from')}</span>
                <input
                  type="time"
                  className="cc-field w-full"
                  value={form.start}
                  onChange={(e) => setForm({ ...form, start: e.target.value })}
                />
              </label>

              <label className="block">
                <span className="cc-label">{t('timetable.to')}</span>
                <input
                  type="time"
                  className="cc-field w-full"
                  value={form.end}
                  onChange={(e) => setForm({ ...form, end: e.target.value })}
                />
              </label>
            </div>

            {/* The clash rule, explained before it refuses anything. */}
            {problem && <p className="cc-error mt-2">{t(problem)}</p>}
            {!problem && clashes.length > 0 && (
              <div className="mt-2 rounded-lg border border-warning-600 bg-warning-50 p-3">
                <p className="text-sm font-medium text-warning-600">
                  {t('timetable.clashTitle')}
                </p>
                <ul className="mt-1 list-disc pl-5 text-sm text-ink-900">
                  {clashes.map((slot) => (
                    <li key={slot.id}>
                      {name(slot.subject)} · {minutesToClock(slot.startMinute)}–
                      {minutesToClock(slot.endMinute)}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <button
              type="button"
              className="cc-btn-primary mt-3"
              disabled={busy || blocked}
              onClick={() => void propose()}
            >
              {busy ? t('common.saving') : t('timetable.propose')}
            </button>
          </>
        )}
      </section>

      {/* The week itself, Monday to Friday as the brief describes. */}
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
        {TIMETABLE_DAYS.map((day) => (
          <DayColumn
            key={day}
            day={day}
            slots={(slots ?? []).filter((slot) => slot.dayOfWeek === day)}
            onWithdraw={(id) => void withdraw(id)}
            busy={busy}
          />
        ))}
      </div>
    </>
  );
}

function DayColumn({
  day,
  slots,
  onWithdraw,
  busy,
}: {
  day: TimetableDay;
  slots: Slot[];
  onWithdraw: (slotId: string) => void;
  busy: boolean;
}) {
  const { t, language } = useI18n();
  const name = (item: { nameEn: string; nameFr: string }) =>
    language === 'fr' ? item.nameFr : item.nameEn;

  return (
    <section className="rounded-xl border border-ink-200 bg-white p-3">
      <h3 className="mb-2 text-sm font-semibold text-ink-900">
        {t(`timetable.day.${TIMETABLE_DAY_KEYS[day]}`)}
      </h3>
      {slots.length === 0 ? (
        <p className="text-xs text-ink-400">{t('timetable.free')}</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {slots.map((slot) => (
            <li
              key={slot.id}
              className={`rounded-lg border-l-4 p-2 ${
                slot.state === 'confirmed'
                  ? 'border-l-success-600 bg-success-50'
                  : 'border-l-warning-600 bg-warning-50'
              }`}
            >
              <p className="text-sm font-semibold tabular-nums text-ink-900">
                {minutesToClock(slot.startMinute)}–{minutesToClock(slot.endMinute)}
              </p>
              <p className="text-xs text-ink-900">{name(slot.subject)}</p>
              <p className="text-xs text-ink-600">{name(slot.level)}</p>
              <p
                className={`mt-1 text-[11px] font-medium ${
                  slot.state === 'confirmed' ? 'text-success-600' : 'text-warning-600'
                }`}
              >
                {t(`timetable.state.${slot.state}`)}
              </p>
              {slot.state === 'proposed' && (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => onWithdraw(slot.id)}
                  className="mt-1 text-xs font-medium text-danger-600 underline"
                >
                  {t('timetable.withdraw')}
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/**
 * Closed until an Admin approves the application (FR-TVR-005).
 *
 * The gate wraps the screen rather than living inside it, so the component above
 * never renders — and therefore never fires the API calls that would 403 — while
 * the teacher is unapproved. See `TeacherGate`.
 */
export default function Page() {
  return (
    <TeacherGate titleKey="teacherNav.timetable">
      <TeacherTimetablePage />
    </TeacherGate>
  );
}
