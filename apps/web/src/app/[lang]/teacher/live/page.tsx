'use client';

import { useCallback, useEffect, useState } from 'react';
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

interface LiveSession {
  sessionId: string;
  roomId: string | null;
  subject: Named;
  cohort: { id: string; name: string } | null;
  learner: { id: string; fullName: string } | null;
  type: string;
  startedAt: string;
  elapsedMinutes: number;
  recordingEnabled: boolean;
  countsTowardEarnings: boolean;
  insideTimetableSlot: boolean;
  presentCount: number;
  attendedMinutesRecorded: number;
  pendingHands: number;
}

interface Slot {
  id: string;
  subject: Named;
  level: Named;
  cohort: { id: string; name: string } | null;
  clock: string;
  startableNow: boolean;
  minutesUntilStart: number;
}

interface GroupOption {
  id: string;
  name: string;
  subject: Named;
  level: Named;
  learnerCount: number;
}

interface Board {
  now: string;
  minSessionMinutes: number;
  hourlyRateXaf: number;
  live: LiveSession[];
  todaySlots: Slot[];
  groups: GroupOption[];
}

interface RoomState {
  sessionId: string;
  roomId: string | null;
  recordingEnabled: boolean;
  roster: { learnerId: string; userId: string | null; fullName: string; present: boolean }[];
  floor: {
    requestId: string;
    learnerUserId: string;
    fullName: string;
    state: string;
    screenShare: boolean;
  }[];
  speakers: string[];
}

/**
 * BUILD-PLAN Phase 5a — the teacher's live screen.
 *
 * ## What works, and what is waiting on a media server
 *
 * Everything on this page is real: starting a lesson, the register, the raised
 * hands, granting and revoking the floor, the elapsed clock, and whether the
 * lesson is inside a confirmed timetable slot. All of it is database state, and the
 * learner's and admin's live screens read the same rows.
 *
 * What is *not* here is audio and video. Carrying a Cameroonian class needs an SFU
 * (LiveKit, Janus or a hosted equivalent) and that choice has not been made — see
 * `teacher-live.service.ts`. So the room id is issued and the permissions are
 * authoritative, and this screen says plainly that there is no stream yet rather
 * than showing a black rectangle and letting a teacher conclude their camera is
 * broken.
 *
 * The same honesty applies to the minutes. The elapsed clock is wall-clock; the
 * *attended* minutes that earnings and ratings depend on come from the media
 * server's join and leave events, and read zero until it is connected. Both are on
 * screen, labelled differently, because conflating them is how a teacher comes to
 * expect money that will not arrive.
 */
function TeacherLivePage() {
  const { t, language } = useI18n();

  const [board, setBoard] = useState<Board | null>(null);
  const [room, setRoom] = useState<RoomState | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [groupId, setGroupId] = useState('');

  const name = (item: Named) => (language === 'fr' ? item.nameFr : item.nameEn);

  const load = useCallback(async () => {
    try {
      const result = await api<Board>('/teacher/live', { language });
      setBoard(result);
      if (result.live.length === 0) setRoom(null);
      setGroupId((current) => current || (result.groups[0]?.id ?? ''));
    } catch (caught) {
      setError(caught as ApiError);
      setBoard(null);
    }
  }, [language]);

  useEffect(() => {
    void load();
  }, [load]);

  const loadRoom = useCallback(
    async (sessionId: string) => {
      try {
        setRoom(await api<RoomState>(`/teacher/live/${sessionId}`, { language }));
      } catch (caught) {
        setError(caught as ApiError);
      }
    },
    [language],
  );

  /*
   * Polling, and only while a lesson is live.
   *
   * A raised hand has to appear without the teacher refreshing, and ten seconds is
   * the slowest interval that still feels immediate to a child waiting to speak.
   * When the SFU lands this becomes a subscription and the poll goes away; until
   * then it is armed only when there is something to poll for, so an idle screen
   * costs nothing on a metered connection.
   */
  const liveSession = board?.live[0] ?? null;
  useEffect(() => {
    if (!liveSession) return;
    const id = setInterval(() => {
      void load();
      void loadRoom(liveSession.sessionId);
    }, 10_000);
    return () => clearInterval(id);
  }, [liveSession, load, loadRoom]);

  useEffect(() => {
    if (liveSession && !room) void loadRoom(liveSession.sessionId);
  }, [liveSession, room, loadRoom]);

  const goLive = async (options: { slotId?: string; cohortId: string; subjectId: string }) => {
    setBusy(true);
    setError(null);
    setDone(null);
    try {
      await api('/teacher/live', {
        method: 'POST',
        body: {
          subjectId: options.subjectId,
          cohortId: options.cohortId,
          ...(options.slotId ? { timetableSlotId: options.slotId } : {}),
          durationMin: 60,
        },
        language,
        timeoutMs: 120_000,
      });
      setDone(t('teacherLive.started'));
      await load();
    } catch (caught) {
      setError(caught as ApiError);
    } finally {
      setBusy(false);
    }
  };

  const endLive = async (sessionId: string) => {
    setBusy(true);
    setError(null);
    try {
      const result = await api<{ wallClockMinutes: number; eligibleForEarnings: boolean }>(
        `/teacher/live/${sessionId}/end`,
        { method: 'POST', language, timeoutMs: 120_000 },
      );
      setDone(
        result.eligibleForEarnings
          ? t('teacherLive.endedEligible', { minutes: result.wallClockMinutes })
          : t('teacherLive.endedIneligible', { minutes: result.wallClockMinutes }),
      );
      setRoom(null);
      await load();
    } catch (caught) {
      setError(caught as ApiError);
    } finally {
      setBusy(false);
    }
  };

  const decideFloor = async (
    sessionId: string,
    requestId: string,
    decision: 'approved' | 'dismissed' | 'revoked',
  ) => {
    setBusy(true);
    setError(null);
    try {
      await api(`/teacher/live/${sessionId}/floor/${requestId}`, {
        method: 'POST',
        body: { decision, screenShare: false },
        language,
        timeoutMs: 120_000,
      });
      await loadRoom(sessionId);
      await load();
    } catch (caught) {
      setError(caught as ApiError);
    } finally {
      setBusy(false);
    }
  };

  const invite = async (sessionId: string, learnerUserId: string) => {
    setBusy(true);
    setError(null);
    try {
      await api(`/teacher/live/${sessionId}/invite`, {
        method: 'POST',
        body: { learnerUserId, screenShare: false },
        language,
        timeoutMs: 120_000,
      });
      await loadRoom(sessionId);
    } catch (caught) {
      setError(caught as ApiError);
    } finally {
      setBusy(false);
    }
  };

  const selectedGroup = board?.groups.find((group) => group.id === groupId) ?? null;

  return (
    <>
      <PageHeader title={t('teacherNav.live')} description={t('teacherLive.description')} />

      <ErrorAlert error={error} />
      {done && <SuccessAlert>{done}</SuccessAlert>}

      {/*
       * The limitation, stated once at the top and not repeated.
       *
       * A teacher who reads this knows why there is no picture. One who does not
       * would file a bug against their own webcam.
       */}
      <div className="mb-4 rounded-xl border border-warning-600 bg-warning-50 p-3">
        <p className="text-sm font-medium text-warning-600">{t('teacherLive.noMediaTitle')}</p>
        <p className="mt-1 text-sm text-ink-900">{t('teacherLive.noMediaBody')}</p>
      </div>

      {board === null ? (
        <p className="text-sm text-ink-600">{t('common.loading')}</p>
      ) : (
        <>
          {/* The lesson in progress. */}
          {board.live.map((session) => (
            <section
              key={session.sessionId}
              className="mb-6 rounded-xl border border-success-600 bg-success-50 p-4"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-success-600">
                    {t('teacherLive.liveNow')}
                  </p>
                  <h2 className="font-display text-lg font-semibold text-ink-900">
                    {name(session.subject)}
                    {session.cohort ? ` · ${session.cohort.name}` : ''}
                    {session.learner ? ` · ${session.learner.fullName}` : ''}
                  </h2>
                  <p className="mt-1 text-sm text-ink-900">
                    {t('teacherLive.elapsed', { minutes: session.elapsedMinutes })}
                  </p>
                </div>
                <button
                  type="button"
                  className="cc-btn-primary"
                  disabled={busy}
                  onClick={() => void endLive(session.sessionId)}
                >
                  {t('teacherLive.end')}
                </button>
              </div>

              <div className="mt-3 grid gap-2 sm:grid-cols-3">
                <Fact
                  label={t('teacherLive.earningsFloor')}
                  value={
                    session.countsTowardEarnings
                      ? t('teacherLive.pastFloor', { minutes: board.minSessionMinutes })
                      : t('teacherLive.beforeFloor', { minutes: board.minSessionMinutes })
                  }
                />
                <Fact
                  label={t('teacherLive.timetableSlot')}
                  value={
                    session.insideTimetableSlot
                      ? t('teacherLive.insideSlot')
                      : t('teacherLive.outsideSlot')
                  }
                />
                <Fact
                  label={t('teacherLive.recording')}
                  value={
                    session.recordingEnabled ? t('common.yes') : t('common.no')
                  }
                />
              </div>

              {/*
               * Two minute counts, side by side and named differently.
               *
               * The wall clock is what the teacher sees ticking. The attended
               * minutes are what earnings are computed from, and they come from the
               * media server — so they read zero until it is connected, and saying
               * so here is the only way that is not a surprise later.
               */}
              <p className="mt-2 text-xs text-ink-600">
                {t('teacherLive.attendedRecorded', {
                  minutes: session.attendedMinutesRecorded,
                })}
              </p>

              {/* The register and the raised hands. */}
              {room && room.sessionId === session.sessionId && (
                <div className="mt-4 grid gap-3 lg:grid-cols-2">
                  <div className="rounded-lg border border-ink-200 bg-white p-3">
                    <h3 className="mb-2 text-sm font-semibold text-ink-900">
                      {t('teacherLive.roster', { present: session.presentCount })}
                    </h3>
                    {room.roster.length === 0 ? (
                      <p className="text-sm text-ink-600">{t('teacherLive.noRoster')}</p>
                    ) : (
                      <ul className="flex max-h-56 flex-col gap-1 overflow-y-auto">
                        {room.roster.map((member) => (
                          <li
                            key={member.learnerId}
                            className="flex items-center gap-2 text-sm text-ink-900"
                          >
                            <span
                              aria-hidden="true"
                              className={
                                member.present
                                  ? 'h-2 w-2 shrink-0 rounded-full bg-success-600'
                                  : 'h-2 w-2 shrink-0 rounded-full bg-ink-300'
                              }
                            />
                            <span className="min-w-0 flex-1 truncate">{member.fullName}</span>
                            <span className="text-xs text-ink-600">
                              {member.present
                                ? t('teacherLive.present')
                                : t('teacherLive.absent')}
                            </span>
                            {/*
                             * The brief's "select any random student to say
                             * something". Only offered for a learner with a sign-in
                             * of their own — a parent-managed child has no user to
                             * grant the floor to.
                             */}
                            {member.userId && (
                              <button
                                type="button"
                                disabled={busy || room.speakers.includes(member.userId)}
                                onClick={() => void invite(session.sessionId, member.userId!)}
                                className="text-xs font-medium text-brand-700 underline disabled:no-underline disabled:opacity-50"
                              >
                                {room.speakers.includes(member.userId)
                                  ? t('teacherLive.speaking')
                                  : t('teacherLive.letSpeak')}
                              </button>
                            )}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>

                  <div className="rounded-lg border border-ink-200 bg-white p-3">
                    <h3 className="mb-2 text-sm font-semibold text-ink-900">
                      {t('teacherLive.hands', { count: session.pendingHands })}
                    </h3>
                    {room.floor.filter((request) => request.state === 'pending').length === 0 ? (
                      <p className="text-sm text-ink-600">{t('teacherLive.noHands')}</p>
                    ) : (
                      <ul className="flex flex-col gap-2">
                        {room.floor
                          .filter((request) => request.state === 'pending')
                          .map((request) => (
                            <li key={request.requestId} className="flex items-center gap-2">
                              <span className="min-w-0 flex-1 truncate text-sm text-ink-900">
                                {request.fullName}
                              </span>
                              <button
                                type="button"
                                disabled={busy}
                                className="cc-btn-primary"
                                onClick={() =>
                                  void decideFloor(session.sessionId, request.requestId, 'approved')
                                }
                              >
                                {t('teacherLive.grant')}
                              </button>
                              <button
                                type="button"
                                disabled={busy}
                                className="cc-btn-secondary"
                                onClick={() =>
                                  void decideFloor(
                                    session.sessionId,
                                    request.requestId,
                                    'dismissed',
                                  )
                                }
                              >
                                {t('teacherLive.dismiss')}
                              </button>
                            </li>
                          ))}
                      </ul>
                    )}

                    {/* Who currently holds the floor, and how to take it back. */}
                    {room.floor.filter((request) => request.state === 'approved').length > 0 && (
                      <>
                        <h4 className="mt-3 text-xs font-medium uppercase tracking-wide text-ink-500">
                          {t('teacherLive.speakers')}
                        </h4>
                        <ul className="mt-1 flex flex-col gap-1">
                          {room.floor
                            .filter((request) => request.state === 'approved')
                            .map((request) => (
                              <li key={request.requestId} className="flex items-center gap-2">
                                <span className="min-w-0 flex-1 truncate text-sm text-ink-900">
                                  {request.fullName}
                                </span>
                                <button
                                  type="button"
                                  disabled={busy}
                                  onClick={() =>
                                    void decideFloor(
                                      session.sessionId,
                                      request.requestId,
                                      'revoked',
                                    )
                                  }
                                  className="text-xs font-medium text-danger-600 underline"
                                >
                                  {t('teacherLive.revoke')}
                                </button>
                              </li>
                            ))}
                        </ul>
                      </>
                    )}
                  </div>
                </div>
              )}
            </section>
          ))}

          {/* Starting from the timetable — the brief's preferred route. */}
          {board.live.length === 0 && (
            <>
              <section className="mb-6 rounded-xl border border-ink-200 bg-white p-4">
                <h2 className="mb-1 font-display text-base font-semibold text-ink-900">
                  {t('teacherLive.fromTimetable')}
                </h2>
                <p className="mb-3 text-sm text-ink-600">
                  {t('teacherLive.fromTimetableHint', {
                    rate: board.hourlyRateXaf.toLocaleString(),
                  })}
                </p>

                {board.todaySlots.length === 0 ? (
                  <p className="text-sm text-ink-600">{t('teacherLive.nothingToday')}</p>
                ) : (
                  <ul className="flex flex-col gap-2">
                    {board.todaySlots.map((slot) => (
                      <li
                        key={slot.id}
                        className="flex flex-wrap items-center gap-3 rounded-lg border border-ink-200 p-2"
                      >
                        <span className="text-sm font-semibold tabular-nums text-ink-900">
                          {slot.clock}
                        </span>
                        <span className="min-w-0 flex-1 truncate text-sm text-ink-900">
                          {name(slot.level)} · {name(slot.subject)}
                          {slot.cohort ? ` · ${slot.cohort.name}` : ''}
                        </span>
                        {slot.startableNow ? (
                          <button
                            type="button"
                            className="cc-btn-primary"
                            disabled={busy || !slot.cohort}
                            onClick={() =>
                              slot.cohort &&
                              void goLive({
                                slotId: slot.id,
                                cohortId: slot.cohort.id,
                                subjectId: slot.subject.id,
                              })
                            }
                          >
                            {t('teacherLive.goLive')}
                          </button>
                        ) : (
                          <span className="text-xs text-ink-600">
                            {t('teacherLive.startsIn', { minutes: slot.minutesUntilStart })}
                          </span>
                        )}
                        {/*
                         * A slot with no group has nobody to teach. The brief has
                         * customer service assign the class; until they have, the
                         * button would open an empty room.
                         */}
                        {!slot.cohort && (
                          <span className="text-xs text-warning-600">
                            {t('teacherLive.slotNeedsGroup')}
                          </span>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </section>

              {/* Going live outside the timetable, with the consequence stated. */}
              <section className="rounded-xl border border-ink-200 bg-white p-4">
                <h2 className="mb-1 font-display text-base font-semibold text-ink-900">
                  {t('teacherLive.adHocTitle')}
                </h2>
                <p className="mb-3 text-sm text-ink-600">{t('teacherLive.adHocHint')}</p>

                {board.groups.length === 0 ? (
                  <p className="text-sm text-ink-600">{t('teacherLive.noGroups')}</p>
                ) : (
                  <div className="flex flex-wrap items-end gap-3">
                    <label className="block">
                      <span className="cc-label">{t('teacherLive.group')}</span>
                      <select
                        className="cc-field"
                        value={groupId}
                        onChange={(e) => setGroupId(e.target.value)}
                      >
                        {board.groups.map((group) => (
                          <option key={group.id} value={group.id}>
                            {group.name} · {name(group.subject)} ({group.learnerCount})
                          </option>
                        ))}
                      </select>
                    </label>
                    <button
                      type="button"
                      className="cc-btn-secondary"
                      disabled={busy || !selectedGroup}
                      onClick={() =>
                        selectedGroup &&
                        void goLive({
                          cohortId: selectedGroup.id,
                          subjectId: selectedGroup.subject.id,
                        })
                      }
                    >
                      {t('teacherLive.goLiveAnyway')}
                    </button>
                  </div>
                )}
              </section>
            </>
          )}
        </>
      )}
    </>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-ink-200 bg-white p-2">
      <p className="text-xs font-medium uppercase tracking-wide text-ink-500">{label}</p>
      <p className="mt-0.5 text-sm text-ink-900">{value}</p>
    </div>
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
    <TeacherGate titleKey="teacherNav.live">
      <TeacherLivePage />
    </TeacherGate>
  );
}
