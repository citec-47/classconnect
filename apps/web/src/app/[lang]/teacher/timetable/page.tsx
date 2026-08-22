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
  /** A time change waiting on an admin. Null on both when nothing is pending. */
  proposedStartMinute: number | null;
  proposedEndMinute: number | null;
  /** Null means the platform rate applies to this period. */
  hourlyRateXaf: number | null;
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
  /* The platform figure, so an unpriced period can still print what it pays. */
  const [defaultRate, setDefaultRate] = useState<number | null>(null);

  const [form, setForm] = useState({ pair: '', day: '1', start: '08:00', end: '09:00' });

  const name = (item: { nameEn: string; nameFr: string }) =>
    language === 'fr' ? item.nameFr : item.nameEn;

  const load = useCallback(async () => {
    try {
      const [mine, application] = await Promise.all([
        api<{ slots: Slot[]; defaultHourlyRateXaf: number }>('/teacher/timetable', { language }),
        api<{ subjects: TeachingPair[] }>('/teachers/me/application', { language }),
      ]);
      setSlots(mine.slots);
      setDefaultRate(mine.defaultHourlyRateXaf);
      setPairs(application.subjects);
      /*
       * Nothing is chosen for the teacher.
       *
       * This used to select the first teaching pair — and since the list comes
       * back in a stable order, that meant every teacher whose first pair was
       * Mathematics opened the form on Mathematics and submitted it unless they
       * noticed the dropdown. It read as "Mathematics is the default subject for
       * all teachers", which is what it was in effect, and the period landed on
       * the admin's approval queue under the wrong subject.
       *
       * A pre-filled field that decides something on your behalf is worse than
       * an empty one that asks. `Save` stays disabled until both are picked.
       */
    } catch (caught) {
      setError(caught as ApiError);
      setSlots([]);
    }
  }, [language]);

  useEffect(() => {
    void load();
  }, [load]);

  /*
   * `form.pair` stays the single source of truth, as "subjectId:levelId".
   *
   * The two dropdowns are a view over it rather than two more pieces of state:
   * `propose` already splits this string, and a second copy of the same fact is
   * a second thing that can disagree with the first. A class chosen with no
   * subject yet is ":levelId", which is why the split tolerates an empty half.
   */
  const [subjectId = '', levelId = ''] = form.pair.split(':');

  /** Each class once, in the order the teacher's approved subjects came back. */
  const levels = pairs
    .filter((pair, index) => pairs.findIndex((p) => p.level.id === pair.level.id) === index)
    .map((pair) => pair.level);

  const subjectsForLevel = pairs.filter((pair) => pair.level.id === levelId);

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
  /*
   * An unchosen class or subject blocks the save as firmly as a clash does.
   *
   * Necessary now that nothing is pre-selected: without it the button is live
   * over an empty pair, `propose` returns silently on the split, and the teacher
   * presses Save and watches nothing happen.
   */
  const blocked = problem !== null || clashes.length > 0 || !subjectId || !levelId;

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

  /**
   * Asking to move a slot.
   *
   * A prompt rather than a dialog, deliberately: this is two numbers on a screen
   * that is already dense, and a modal here would be more machinery than the
   * change deserves. The day is not offered — moving a lesson to another day is
   * a different act, and the class would need telling either way.
   *
   * What happens next is the server's decision, not this function's. A confirmed
   * slot becomes a proposal awaiting an admin; an unconfirmed one moves at once.
   * The message afterwards reads the reloaded slot rather than predicting, so it
   * cannot claim an approval that did not happen.
   */
  const editTime = async (slot: Slot) => {
    const current = `${minutesToClock(slot.startMinute)}-${minutesToClock(slot.endMinute)}`;
    const answer = window.prompt(t('timetable.changeTimePrompt', { current }), current);
    if (!answer) return;

    /*
     * `clockToMinutes` from shared, not a parser written here.
     *
     * The form above already uses it, and two ways of reading "08:30" in one
     * file is one of them eventually disagreeing about what the teacher typed.
     */
    const parsed = answer.split('-').map((part) => part.trim());
    const start = parsed[0] ? clockToMinutes(parsed[0]) : null;
    const end = parsed[1] ? clockToMinutes(parsed[1]) : null;
    /*
     * Refused here rather than sent. A malformed time would reach the API as
     * NaN, be rejected as a validation error, and tell the teacher nothing about
     * what they typed wrongly.
     */
    if (start === null || end === null || end <= start) {
      setError({ messageKey: 'timetable.badTime' } as ApiError);
      return;
    }

    setBusy(true);
    setError(null);
    try {
      await api(`/teacher/timetable/${slot.id}`, {
        method: 'PATCH',
        language,
        timeoutMs: 120_000,
        body: { dayOfWeek: slot.dayOfWeek, startMinute: start, endMinute: end },
      });
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
              {/*
                * Class first, then the subjects taught in it.
                *
                * One combined dropdown listed every pair a teacher holds — for
                * somebody teaching four subjects across three classes that is
                * twelve entries reading "Form 4 · Mathematics", and picking the
                * wrong one is a scroll away. Choosing the class narrows the
                * second list to what is actually taught there, so the wrong
                * combination is not offered rather than merely discouraged.
                */}
              <label className="block">
                <span className="cc-label">{t('timetable.classLabel')}</span>
                <select
                  className="cc-field w-full"
                  value={levelId}
                  onChange={(e) => setForm({ ...form, pair: e.target.value ? `:${e.target.value}` : '' })}
                >
                  <option value="">{t('timetable.choose')}</option>
                  {levels.map((level) => (
                    <option key={level.id} value={level.id}>
                      {name(level)}
                    </option>
                  ))}
                </select>
              </label>

              <label className="block">
                <span className="cc-label">{t('timetable.subjectLabel')}</span>
                <select
                  className="cc-field w-full"
                  value={subjectId}
                  disabled={!levelId}
                  onChange={(e) =>
                    setForm({ ...form, pair: e.target.value ? `${e.target.value}:${levelId}` : `:${levelId}` })
                  }
                >
                  <option value="">
                    {levelId ? t('timetable.choose') : t('timetable.chooseClassFirst')}
                  </option>
                  {subjectsForLevel.map((pair) => (
                    <option key={pair.subject.id} value={pair.subject.id}>
                      {name(pair.subject)}
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
            defaultRate={defaultRate}
            onWithdraw={(id) => void withdraw(id)}
            onEdit={(slot) => void editTime(slot)}
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
  onEdit,
  busy,
  defaultRate,
}: {
  day: TimetableDay;
  slots: Slot[];
  onWithdraw: (slotId: string) => void;
  onEdit: (slot: Slot) => void;
  busy: boolean;
  /** The platform figure, for periods with no rate of their own. */
  defaultRate: number | null;
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
              {/*
                * What this hour pays.
                *
                * Shown because a rate an admin sets and the teacher cannot see
                * is a number they find out about on a payslip. A period with no
                * rate of its own prints the platform figure rather than a blank,
                * since 'nothing set here' and 'unpaid' look identical otherwise.
                */}
              {(slot.hourlyRateXaf ?? defaultRate) !== null && (
                <p className="text-[11px] tabular-nums text-ink-600">
                  {t('timetable.perHour', { amount: slot.hourlyRateXaf ?? defaultRate ?? 0 })}
                </p>
              )}
              <p
                className={`mt-1 text-[11px] font-medium ${
                  slot.state === 'confirmed' ? 'text-success-600' : 'text-warning-600'
                }`}
              >
                {t(`timetable.state.${slot.state}`)}
              </p>

              {/*
                * A change the admin has not decided yet.
                *
                * Shown against the hour that is still live, because the teacher
                * needs both facts at once: what they asked for, and what their
                * class is still turning up to. Either alone is how somebody
                * arrives an hour late to their own lesson.
                */}
              {slot.proposedStartMinute !== null && slot.proposedEndMinute !== null && (
                <p className="mt-1 rounded bg-warning-100 px-1 py-0.5 text-[11px] text-warning-700">
                  {t('timetable.pendingEdit', {
                    time: `${minutesToClock(slot.proposedStartMinute)}–${minutesToClock(slot.proposedEndMinute)}`,
                  })}
                </p>
              )}

              {/*
                * Offered on every slot, and the server decides what it means: a
                * confirmed slot becomes a proposal an admin must approve, an
                * unconfirmed one moves outright. This button does not know which,
                * and must not — two copies of that rule would drift apart.
                */}
              <button
                type="button"
                disabled={busy}
                onClick={() => onEdit(slot)}
                className="mt-1 mr-2 min-h-touch text-xs font-medium text-brand-700 underline"
              >
                {t('timetable.changeTime')}
              </button>

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
