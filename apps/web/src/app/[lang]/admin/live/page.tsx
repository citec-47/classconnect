'use client';

import { useCallback, useEffect, useState } from 'react';
import { schoolTypeLabelKey, type SchoolType } from '@classconnect/shared';
import { useI18n } from '@/lib/i18n';
import { api, type ApiError } from '@/lib/api';
import { useAdminShell } from '@/lib/admin-badges';
import { ErrorAlert, EmptyState } from '@/components/Alert';
import { Banner, PageHeader, StateChip, When } from '@/components/admin/ui';

/**
 * The live board: every lesson happening right now.
 *
 * Who is teaching, what subject, whether it is a private one-to-one or a group
 * class, and who has actually joined the room.
 *
 * Opening this screen is audited (FR-RBA-004) and the note at the top says so.
 * Watching a one-to-one lesson between an adult and a child is legitimate
 * safeguarding oversight — FR-SAF-004 already records those and tells everyone
 * in them — but oversight that leaves no trace is indistinguishable from
 * surveillance, so the trail and the disclosure are part of the feature.
 */

interface Attendee {
  learnerId: string;
  fullName: string;
  present: boolean;
  joined: boolean;
}

interface LiveSession {
  sessionId: string;
  live: boolean;
  startsAtUtc: string;
  startedAt: string | null;
  durationMin: number;
  elapsedMinutes: number;
  overrunMinutes: number;
  minutesUntilStart: number | null;
  type: 'one_to_one' | 'group';
  isPrivate: boolean;
  teacher: { id: string; fullName: string; schoolType: SchoolType | null; suspended: boolean };
  subject: { id: string; code: string; nameEn: string; nameFr: string };
  level: { nameEn: string; nameFr: string; schoolType: SchoolType } | null;
  cohort: { id: string; name: string } | null;
  attendees: Attendee[];
  expectedCount: number;
  presentCount: number;
  teacherPresent: boolean;
  recordingEnabled: boolean;
}

interface LiveBoard {
  now: string;
  live: LiveSession[];
  startingSoon: LiveSession[];
  counts: { live: number; private: number; group: number; learnersInLesson: number };
}

function duration(minutes: number): string {
  const h = Math.floor(Math.abs(minutes) / 60);
  const m = Math.abs(minutes) % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

function SessionCard({ session, live }: { session: LiveSession; live: boolean }) {
  const { language, t } = useI18n();

  return (
    <li
      className={[
        'rounded-lg border bg-white p-4',
        // A private lesson is marked by a heavier border as well as a label, so
        // it reads at a glance without red — which is reserved (§7).
        session.isPrivate ? 'border-brand-600 border-l-4' : 'border-ink-300',
      ].join(' ')}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            {/* The brief: the admin must see that it is a private class. */}
            <StateChip tone={session.isPrivate ? 'warn' : 'neutral'}>
              {session.isPrivate ? t('live.private') : t('live.group')}
            </StateChip>

            {live && (
              <span className="flex items-center gap-1.5 text-xs font-semibold text-success-600">
                <span aria-hidden="true" className="h-2 w-2 rounded-full bg-success-600" />
                {t('live.title')}
              </span>
            )}

            {session.recordingEnabled ? (
              <StateChip tone="good">{t('live.recordingOn')}</StateChip>
            ) : (
              <StateChip tone="neutral">{t('live.recordingOff')}</StateChip>
            )}

            {session.teacher.suspended && (
              <StateChip tone="frozen">{t('payments.stateSuspended')}</StateChip>
            )}
          </div>

          {/* The actual subject, and the teacher's name. */}
          <h3 className="mt-2 text-base font-semibold text-ink-900">
            {language === 'fr' ? session.subject.nameFr : session.subject.nameEn}
          </h3>
          <p className="text-sm text-ink-600">
            {t('live.teacher')}: <span className="text-ink-900">{session.teacher.fullName}</span>
            {session.level && (
              <>
                {' · '}
                {language === 'fr' ? session.level.nameFr : session.level.nameEn}
              </>
            )}
            {session.cohort && <> · {session.cohort.name}</>}
          </p>
        </div>

        <div className="text-right text-sm">
          {live ? (
            <>
              <p className="text-ink-900">
                {t('live.runningFor', { duration: duration(session.elapsedMinutes) })}
              </p>
              <p className="text-xs text-ink-600">
                <When value={session.startedAt ?? session.startsAtUtc} />
              </p>
              {session.overrunMinutes > 0 && (
                <p className="mt-1 text-xs font-medium text-warning-600">
                  {t('live.overrunning', { duration: duration(session.overrunMinutes) })}
                </p>
              )}
            </>
          ) : (
            <p className="text-ink-900">
              {t('live.startsIn', { duration: duration(session.minutesUntilStart ?? 0) })}
            </p>
          )}
        </div>
      </div>

      {/* Who is in the room. */}
      <div className="mt-3 border-t border-ink-300 pt-3">
        <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-ink-600">
          {t('live.attending')} ({session.presentCount}/{session.expectedCount})
        </p>
        {session.attendees.length === 0 ? (
          <p className="text-sm text-ink-600">{t('live.nobodyJoined')}</p>
        ) : (
          <ul className="flex flex-wrap gap-1.5">
            {session.attendees.map((attendee) => (
              <li key={attendee.learnerId}>
                <span
                  className={[
                    'inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-xs',
                    attendee.present
                      ? 'border-success-600 bg-success-50 text-success-600'
                      : 'border-ink-300 text-ink-600',
                  ].join(' ')}
                >
                  {/* Present or not, by shape as well as colour (UI-003). */}
                  <span aria-hidden="true">{attendee.present ? '●' : '○'}</span>
                  {attendee.fullName}
                </span>
              </li>
            ))}
          </ul>
        )}
        {!session.teacherPresent && live && (
          <p className="mt-1.5 text-xs text-warning-600">
            {t('live.teacher')}: {t('live.nobodyJoined')}
          </p>
        )}
      </div>
    </li>
  );
}

export default function LiveClasses() {
  const { t } = useI18n();
  const { language } = useI18n();
  const { counts } = useAdminShell();

  const [board, setBoard] = useState<LiveBoard | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [forbidden, setForbidden] = useState(false);

  const load = useCallback(async () => {
    try {
      setBoard(await api<LiveBoard>('/admin/live', { language }));
      setError(null);
    } catch (caught) {
      const failure = caught as ApiError;
      if (failure.status === 403) setForbidden(true);
      else setError(failure);
    }
  }, [language]);

  /**
   * Refreshed on a short interval as well as on the socket push.
   *
   * A lesson *ending* produces no announcement — nothing starts — so a board
   * that only reacted to pushes would keep showing a room that emptied ten
   * minutes ago. Twenty seconds is short enough that the board is honest and
   * long enough that it is not a load generator.
   */
  useEffect(() => {
    void load();
    const timer = setInterval(() => void load(), 20_000);
    return () => clearInterval(timer);
  }, [load]);

  // The badge moves on the socket push; re-read the detail when it does, so a
  // newly started lesson appears immediately rather than on the next tick.
  useEffect(() => {
    void load();
  }, [counts.liveClasses, load]);

  if (forbidden) {
    return (
      <>
        <PageHeader title={t('live.title')} />
        <EmptyState
          title={t('safeguarding.notDesignatedTitle')}
          body={t('safeguarding.notDesignatedBody')}
        />
      </>
    );
  }

  return (
    <>
      <PageHeader
        title={t('live.title')}
        description={t('live.subtitle')}
        actions={
          board && (
            <div className="flex gap-2 text-sm">
              <span className="rounded-lg border border-ink-300 bg-white px-3 py-1.5">
                {t('live.liveNow', { count: board.counts.live })}
              </span>
              <span className="rounded-lg border border-ink-300 bg-white px-3 py-1.5">
                {t('live.private')}: <span className="tabular-nums">{board.counts.private}</span>
              </span>
              <span className="rounded-lg border border-ink-300 bg-white px-3 py-1.5">
                {t('live.attending')}:{' '}
                <span className="tabular-nums">{board.counts.learnersInLesson}</span>
              </span>
            </div>
          )
        }
      />

      {/* FR-RBA-004 / FR-SAF-004: the watching is recorded, and everyone knows. */}
      <Banner>{t('live.watchNote')}</Banner>

      <ErrorAlert error={error} />

      {!board ? (
        <p className="text-ink-600">{t('common.loading')}</p>
      ) : board.live.length === 0 && board.startingSoon.length === 0 ? (
        <EmptyState title={t('live.emptyTitle')} body={t('live.emptyBody')} />
      ) : (
        <>
          {board.live.length > 0 && (
            <ul className="mb-6 flex flex-col gap-3">
              {board.live.map((session) => (
                <SessionCard key={session.sessionId} session={session} live />
              ))}
            </ul>
          )}

          {board.startingSoon.length > 0 && (
            <>
              <h2 className="mb-2 text-sm font-semibold text-ink-900">{t('live.startingSoon')}</h2>
              <ul className="flex flex-col gap-3">
                {board.startingSoon.map((session) => (
                  <SessionCard key={session.sessionId} session={session} live={false} />
                ))}
              </ul>
            </>
          )}
        </>
      )}
    </>
  );
}
