'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  exerciseLockState,
  millisUntilLock,
  formatCountdown,
  type ExerciseLockState,
} from '@classconnect/shared';
import { useI18n } from '@/lib/i18n';
import { api, ApiError } from '@/lib/api';
import { PageHeader } from '@/components/admin/ui';
import { ErrorAlert, SuccessAlert } from '@/components/Alert';
import { TeacherGate } from '@/components/teacher/TeacherGate';

interface Named {
  id: string;
  nameEn: string;
  nameFr: string;
}

interface Exercise {
  id: string;
  title: string;
  instructions: string;
  dueAt: string;
  locksAt: string | null;
  maxScore: number;
  submissionCount: number;
  lockState: ExerciseLockState;
  groupScore: number | null;
}

interface Group {
  id: string;
  name: string;
  capacity: number;
  active: boolean;
  subject: Named;
  level: Named;
  learnerCount: number;
  members: { id: string; fullName: string }[];
  exercises: Exercise[];
}

interface TeachingPair {
  subject: Named;
  level: Named;
}

interface Candidate {
  learnerId: string;
  fullName: string;
  member: boolean;
}

/**
 * BUILD-PLAN Phase 3 — groups and the exercises set in them.
 *
 * The countdown is the only thing on this surface that ticks, and it ticks once a
 * second only while something is inside its window. Everything else here is
 * static, and a per-second re-render of a page holding forty names is a real cost
 * on a 2 GB phone.
 *
 * It is also, deliberately, *only* a countdown. The badge it drives comes from
 * `exerciseLockState` in `packages/shared`, which the API runs against its own
 * clock when a learner submits — so a phone that is twenty minutes slow shows the
 * wrong number of seconds and cannot buy twenty extra minutes.
 */
function TeacherGroupsPage() {
  const { t, language } = useI18n();

  const [groups, setGroups] = useState<Group[] | null>(null);
  const [pairs, setPairs] = useState<TeachingPair[]>([]);
  const [error, setError] = useState<ApiError | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [groupForm, setGroupForm] = useState({ name: '', pair: '', capacity: '40' });
  const [openGroup, setOpenGroup] = useState<string | null>(null);
  const [candidates, setCandidates] = useState<Candidate[] | null>(null);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [exerciseFor, setExerciseFor] = useState<string | null>(null);
  const [exerciseForm, setExerciseForm] = useState({
    title: '',
    instructions: '',
    dueAt: '',
    locksAt: '',
    maxScore: '20',
  });

  const name = (item: Named) => (language === 'fr' ? item.nameFr : item.nameEn);

  const load = useCallback(async () => {
    try {
      const [mine, application] = await Promise.all([
        api<{ groups: Group[] }>('/teacher/groups', { language }),
        api<{ subjects: TeachingPair[] }>('/teachers/me/application', { language }),
      ]);
      setGroups(mine.groups);
      setPairs(application.subjects);
      setGroupForm((current) =>
        current.pair || application.subjects.length === 0
          ? current
          : {
              ...current,
              pair: `${application.subjects[0]!.subject.id}:${application.subjects[0]!.level.id}`,
            },
      );
    } catch (caught) {
      setError(caught as ApiError);
      setGroups([]);
    }
  }, [language]);

  useEffect(() => {
    void load();
  }, [load]);

  /*
   * One clock for the page, and only while it is needed.
   *
   * `now` is state so the countdowns re-render; the interval is not armed at all
   * unless some exercise is inside its window, so a page of settled groups costs
   * nothing.
   */
  const [now, setNow] = useState(() => new Date());
  const counting = (groups ?? []).some((group) =>
    group.exercises.some((exercise) => exerciseLockState(exercise, now) === 'closing_soon'),
  );
  useEffect(() => {
    if (!counting) return;
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, [counting]);

  const createGroup = async () => {
    const [subjectId, levelId] = groupForm.pair.split(':');
    if (!subjectId || !levelId || groupForm.name.trim().length < 2) return;
    setBusy(true);
    setError(null);
    setDone(null);
    try {
      await api('/teacher/groups', {
        method: 'POST',
        body: {
          name: groupForm.name.trim(),
          subjectId,
          levelId,
          capacity: Number(groupForm.capacity) || 40,
        },
        language,
        timeoutMs: 120_000,
      });
      setDone(t('teacherGroups.created'));
      setGroupForm((current) => ({ ...current, name: '' }));
      await load();
    } catch (caught) {
      setError(caught as ApiError);
    } finally {
      setBusy(false);
    }
  };

  const openMembers = async (groupId: string) => {
    setOpenGroup(groupId);
    setCandidates(null);
    try {
      const result = await api<{ candidates: Candidate[] }>(
        `/teacher/groups/${groupId}/candidates`,
        { language },
      );
      setCandidates(result.candidates);
      setPicked(
        new Set(result.candidates.filter((c) => c.member).map((c) => c.learnerId)),
      );
    } catch (caught) {
      setError(caught as ApiError);
    }
  };

  const saveMembers = async () => {
    if (!openGroup) return;
    setBusy(true);
    setError(null);
    try {
      await api(`/teacher/groups/${openGroup}/members`, {
        method: 'POST',
        body: { learnerIds: [...picked] },
        language,
        timeoutMs: 120_000,
      });
      setDone(t('teacherGroups.membersSaved'));
      setOpenGroup(null);
      await load();
    } catch (caught) {
      setError(caught as ApiError);
    } finally {
      setBusy(false);
    }
  };

  const createExercise = async () => {
    if (!exerciseFor || !exerciseForm.dueAt) return;
    setBusy(true);
    setError(null);
    try {
      await api('/teacher/exercises', {
        method: 'POST',
        body: {
          cohortId: exerciseFor,
          title: exerciseForm.title.trim(),
          instructions: exerciseForm.instructions.trim() || '—',
          // `datetime-local` gives a local wall-clock string with no zone. The
          // API stores UTC, so the conversion happens here, once.
          dueAt: new Date(exerciseForm.dueAt).toISOString(),
          ...(exerciseForm.locksAt
            ? { locksAt: new Date(exerciseForm.locksAt).toISOString() }
            : {}),
          maxScore: Number(exerciseForm.maxScore) || 20,
        },
        language,
        timeoutMs: 120_000,
      });
      setDone(t('teacherGroups.exerciseCreated'));
      setExerciseFor(null);
      setExerciseForm({ title: '', instructions: '', dueAt: '', locksAt: '', maxScore: '20' });
      await load();
    } catch (caught) {
      setError(caught as ApiError);
    } finally {
      setBusy(false);
    }
  };

  const unlock = async (exerciseId: string) => {
    const reason = window.prompt(t('teacherGroups.unlockReason'));
    // A reason is mandatory server-side and audited. Cancelling the prompt is a
    // decision not to reopen, not a reason of "".
    if (!reason || reason.trim().length < 4) return;
    setBusy(true);
    setError(null);
    try {
      await api(`/teacher/exercises/${exerciseId}/unlock`, {
        method: 'POST',
        body: { reason: reason.trim() },
        language,
        timeoutMs: 120_000,
      });
      setDone(t('teacherGroups.unlocked'));
      await load();
    } catch (caught) {
      setError(caught as ApiError);
    } finally {
      setBusy(false);
    }
  };

  const score = async (exerciseId: string, cohortId: string, maxScore: number) => {
    const entered = window.prompt(t('teacherGroups.scorePrompt', { maxScore }));
    if (entered === null) return;
    const value = Number(entered);
    if (!Number.isFinite(value) || value < 0 || value > maxScore) {
      setError(new ApiError(400, 'teacherGroups.scoreOutOfRange', { maxScore }));
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await api(`/teacher/exercises/${exerciseId}/group-score`, {
        method: 'POST',
        body: { cohortId, score: Math.round(value) },
        language,
        timeoutMs: 120_000,
      });
      setDone(t('teacherGroups.scored'));
      await load();
    } catch (caught) {
      setError(caught as ApiError);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <PageHeader title={t('teacherNav.groups')} description={t('teacherGroups.description')} />

      <ErrorAlert error={error} />
      {done && <SuccessAlert>{done}</SuccessAlert>}

      {/* Creating a group. */}
      <section className="mb-6 rounded-xl border border-ink-200 bg-white p-4">
        <h2 className="mb-3 font-display text-base font-semibold text-ink-900">
          {t('teacherGroups.createTitle')}
        </h2>
        {pairs.length === 0 ? (
          <p className="text-sm text-ink-600">{t('teacherGroups.noSubjects')}</p>
        ) : (
          <>
            <div className="grid gap-3 sm:grid-cols-3">
              <label className="block">
                <span className="cc-label">{t('teacherGroups.groupName')}</span>
                <input
                  type="text"
                  className="cc-field w-full"
                  maxLength={200}
                  value={groupForm.name}
                  placeholder={t('teacherGroups.groupNamePlaceholder')}
                  onChange={(e) => setGroupForm({ ...groupForm, name: e.target.value })}
                />
              </label>
              <label className="block">
                <span className="cc-label">{t('timetable.classAndSubject')}</span>
                <select
                  className="cc-field w-full"
                  value={groupForm.pair}
                  onChange={(e) => setGroupForm({ ...groupForm, pair: e.target.value })}
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
                <span className="cc-label">{t('teacherGroups.capacity')}</span>
                <input
                  type="number"
                  min={1}
                  max={200}
                  className="cc-field w-full"
                  value={groupForm.capacity}
                  onChange={(e) => setGroupForm({ ...groupForm, capacity: e.target.value })}
                />
              </label>
            </div>
            <button
              type="button"
              className="cc-btn-primary mt-3"
              disabled={busy || groupForm.name.trim().length < 2}
              onClick={() => void createGroup()}
            >
              {busy ? t('common.saving') : t('teacherGroups.create')}
            </button>
          </>
        )}
      </section>

      {/* The groups. */}
      {groups === null ? (
        <p className="text-sm text-ink-600">{t('common.loading')}</p>
      ) : groups.length === 0 ? (
        <p className="rounded-xl border border-ink-200 bg-white p-4 text-sm text-ink-600">
          {t('teacherGroups.none')}
        </p>
      ) : (
        <div className="flex flex-col gap-4">
          {groups.map((group) => (
            <section key={group.id} className="rounded-xl border border-ink-200 bg-white p-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <h3 className="font-display text-base font-semibold text-ink-900">
                    {group.name}
                  </h3>
                  <p className="text-xs text-ink-600">
                    {name(group.level)} · {name(group.subject)} ·{' '}
                    {t('teacherGroups.learnerCount', {
                      count: group.learnerCount,
                      capacity: group.capacity,
                    })}
                  </p>
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    className="cc-btn-secondary"
                    onClick={() => void openMembers(group.id)}
                  >
                    {t('teacherGroups.members')}
                  </button>
                  <button
                    type="button"
                    className="cc-btn-secondary"
                    onClick={() =>
                      setExerciseFor(exerciseFor === group.id ? null : group.id)
                    }
                  >
                    {t('teacherGroups.setExercise')}
                  </button>
                </div>
              </div>

              {/* The membership picker, inline. */}
              {openGroup === group.id && (
                <div className="mt-3 rounded-lg border border-brand-600 bg-brand-50 p-3">
                  <p className="mb-2 text-sm font-medium text-brand-700">
                    {t('teacherGroups.pickMembers')}
                  </p>
                  {candidates === null ? (
                    <p className="text-sm text-ink-600">{t('common.loading')}</p>
                  ) : candidates.length === 0 ? (
                    <p className="text-sm text-ink-600">{t('teacherGroups.noCandidates')}</p>
                  ) : (
                    <>
                      <ul className="grid max-h-64 gap-1 overflow-y-auto sm:grid-cols-2 lg:grid-cols-3">
                        {candidates.map((candidate) => (
                          <li key={candidate.learnerId}>
                            <label className="flex min-h-touch items-center gap-2 text-sm text-ink-900">
                              <input
                                type="checkbox"
                                checked={picked.has(candidate.learnerId)}
                                onChange={(event) => {
                                  const next = new Set(picked);
                                  if (event.target.checked) next.add(candidate.learnerId);
                                  else next.delete(candidate.learnerId);
                                  setPicked(next);
                                }}
                              />
                              <span className="truncate">{candidate.fullName}</span>
                            </label>
                          </li>
                        ))}
                      </ul>
                      <div className="mt-2 flex gap-2">
                        <button
                          type="button"
                          className="cc-btn-primary"
                          disabled={busy}
                          onClick={() => void saveMembers()}
                        >
                          {t('teacherGroups.saveMembers', { count: picked.size })}
                        </button>
                        <button
                          type="button"
                          className="cc-btn-secondary"
                          onClick={() => setOpenGroup(null)}
                        >
                          {t('common.cancel')}
                        </button>
                      </div>
                    </>
                  )}
                </div>
              )}

              {/* Setting an exercise, inline. */}
              {exerciseFor === group.id && (
                <div className="mt-3 rounded-lg border border-ink-300 bg-ink-100/50 p-3">
                  <div className="grid gap-3 sm:grid-cols-2">
                    <label className="block">
                      <span className="cc-label">{t('teacherGroups.exerciseTitle')}</span>
                      <input
                        type="text"
                        className="cc-field w-full"
                        value={exerciseForm.title}
                        onChange={(e) =>
                          setExerciseForm({ ...exerciseForm, title: e.target.value })
                        }
                      />
                    </label>
                    <label className="block">
                      <span className="cc-label">{t('teacherGroups.maxScore')}</span>
                      <input
                        type="number"
                        min={1}
                        className="cc-field w-full"
                        value={exerciseForm.maxScore}
                        onChange={(e) =>
                          setExerciseForm({ ...exerciseForm, maxScore: e.target.value })
                        }
                      />
                    </label>
                    <label className="block">
                      <span className="cc-label">{t('teacherGroups.dueAt')}</span>
                      <input
                        type="datetime-local"
                        className="cc-field w-full"
                        value={exerciseForm.dueAt}
                        onChange={(e) =>
                          setExerciseForm({ ...exerciseForm, dueAt: e.target.value })
                        }
                      />
                    </label>
                    <label className="block">
                      <span className="cc-label">
                        {t('teacherGroups.locksAt')}
                        <span className="ml-1 font-normal text-ink-600">
                          ({t('common.optional')})
                        </span>
                      </span>
                      <input
                        type="datetime-local"
                        className="cc-field w-full"
                        value={exerciseForm.locksAt}
                        onChange={(e) =>
                          setExerciseForm({ ...exerciseForm, locksAt: e.target.value })
                        }
                      />
                    </label>
                    <label className="block sm:col-span-2">
                      <span className="cc-label">{t('teacherGroups.instructions')}</span>
                      <textarea
                        rows={3}
                        className="cc-field w-full"
                        value={exerciseForm.instructions}
                        onChange={(e) =>
                          setExerciseForm({ ...exerciseForm, instructions: e.target.value })
                        }
                      />
                    </label>
                  </div>
                  {/* What the lock actually does, said where it is set. */}
                  <p className="cc-hint">{t('teacherGroups.locksAtHint')}</p>
                  <button
                    type="button"
                    className="cc-btn-primary mt-2"
                    disabled={busy || !exerciseForm.dueAt || exerciseForm.title.trim().length < 2}
                    onClick={() => void createExercise()}
                  >
                    {busy ? t('common.saving') : t('teacherGroups.createExercise')}
                  </button>
                </div>
              )}

              {/* The exercises. */}
              {group.exercises.length > 0 && (
                <ul className="mt-3 flex flex-col gap-2">
                  {group.exercises.map((exercise) => {
                    const state = exerciseLockState(exercise, now);
                    const remaining = millisUntilLock(exercise, now);
                    return (
                      <li
                        key={exercise.id}
                        className="flex flex-wrap items-center gap-3 rounded-lg border border-ink-200 p-2"
                      >
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium text-ink-900">
                            {exercise.title}
                          </p>
                          <p className="text-xs text-ink-600">
                            {t('teacherGroups.submissions', {
                              count: exercise.submissionCount,
                            })}
                            {exercise.groupScore !== null
                              ? ` · ${t('teacherGroups.groupScoreIs', {
                                  score: exercise.groupScore,
                                  maxScore: exercise.maxScore,
                                })}`
                              : ''}
                          </p>
                        </div>

                        <span
                          className={[
                            'shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium',
                            state === 'locked'
                              ? 'bg-danger-50 text-danger-600'
                              : state === 'closing_soon'
                                ? 'bg-warning-50 text-warning-600'
                                : 'bg-ink-100 text-ink-600',
                          ].join(' ')}
                        >
                          {t(`teacherGroups.lockState.${state}`)}
                          {/*
                           * The countdown itself, only while it is running down.
                           * A clock on a settled exercise is noise.
                           */}
                          {state === 'closing_soon' && remaining !== null
                            ? ` · ${formatCountdown(remaining)}`
                            : ''}
                        </span>

                        {state === 'locked' && (
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => void unlock(exercise.id)}
                            className="shrink-0 text-xs font-medium text-brand-700 underline"
                          >
                            {t('teacherGroups.unlock')}
                          </button>
                        )}
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => void score(exercise.id, group.id, exercise.maxScore)}
                          className="shrink-0 text-xs font-medium text-brand-700 underline"
                        >
                          {t('teacherGroups.groupScore')}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>
          ))}
        </div>
      )}
    </>
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
    <TeacherGate titleKey="teacherNav.groups">
      <TeacherGroupsPage />
    </TeacherGate>
  );
}
