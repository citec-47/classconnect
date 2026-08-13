'use client';

import { useEffect, useState, type ReactNode } from 'react';
import type {
  HomeworkDto,
  MaterialDto,
  PracticeItemDto,
  SessionDto,
} from '@classconnect/shared';
import { useI18n } from '@/lib/i18n';
import { api } from '@/lib/api';
import {
  countdownLabel,
  durationLabel,
  fileSize,
  timeOfDay,
  whenLabel,
} from '@/lib/student-format';
import { useFrozen } from './FrozenNotice';
import { Pill } from './ui';

/**
 * The repeated rows of the learner surface.
 *
 * One component per kind of thing, used identically on Home and on the screen
 * that owns it, so a session looks the same wherever a learner meets it. §5.1's
 * cards are the same data as §5.2's list — presenting them differently would be
 * two things to maintain and one more thing to learn.
 */

/**
 * A clock that ticks, for the join countdown only.
 *
 * Everything else on this surface is static text. A per-second re-render is a
 * real cost on a 2 GB phone (2.4), so it is spent on the one number that is
 * wrong the moment it stops moving.
 */
function useNow(active: boolean, intervalMs = 30_000): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    if (!active) return;
    const timer = setInterval(() => setNow(new Date()), intervalMs);
    return () => clearInterval(timer);
  }, [active, intervalMs]);
  return now;
}

export function SessionCard({
  session,
  primary = false,
}: {
  session: SessionDto;
  primary?: boolean;
}) {
  const { t, language } = useI18n();
  const frozen = useFrozen();

  const startsAt = new Date(session.startsAt);
  const opensAt = new Date(session.joinOpensAt);
  const closesAt = new Date(session.joinClosesAt);
  const upcoming = session.status === 'scheduled' || session.status === 'in_progress';

  const now = useNow(upcoming);
  const joinable = now >= opensAt && now < closesAt;
  const ended = now >= closesAt;

  return (
    <article
      className={[
        'rounded-xl border bg-white p-4',
        primary ? 'border-brand-500 shadow-sm ring-1 ring-brand-100' : 'border-ink-300',
      ].join(' ')}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-base font-semibold text-ink-900">{session.subject.name}</p>
          {/* FR-SAF-001: a name. There is no contact detail in this payload. */}
          <p className="mt-0.5 truncate text-sm text-ink-600">
            {t('student.nextSession.with', { teacher: session.teacher.displayName })}
          </p>
        </div>
        <div className="shrink-0 text-right">
          <p className="text-sm font-semibold tabular-nums text-ink-900">
            {timeOfDay(startsAt, language)}
          </p>
          <p className="text-xs text-ink-600">{durationLabel(session.durationMin, t)}</p>
        </div>
      </div>

      <p className="mt-2 text-sm text-ink-600">{whenLabel(startsAt, language, t, now)}</p>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        {!upcoming && <Pill tone="neutral">{t(`student.sessionStatus.${session.status}`)}</Pill>}
        {/* FR-SAF-004 / FR-LIV-012: disclosed at booking and again at join. */}
        {session.recordingEnabled && upcoming && (
          <Pill tone="neutral">{t('student.recording.disclosureBooking')}</Pill>
        )}
      </div>

      {upcoming && (
        <div className="mt-3">
          {/*
           * §6 blocks joining while the account is frozen. The button is
           * replaced rather than disabled: a greyed-out control invites tapping
           * it repeatedly to find out why.
           */}
          {frozen ? (
            <p className="rounded-lg bg-ink-100 px-3 py-2 text-sm text-ink-600">
              {t('student.frozen.blockedAction')}
            </p>
          ) : joinable ? (
            <div className="flex flex-wrap items-center gap-2">
              <a
                href={`#join-${session.id}`}
                className={[
                  'inline-flex min-h-touch flex-1 items-center justify-center rounded-lg',
                  'bg-brand-600 px-4 text-sm font-semibold text-white hover:bg-brand-700',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600',
                  'focus-visible:ring-offset-2 focus-visible:ring-offset-white',
                ].join(' ')}
              >
                {t('student.nextSession.join')}
              </a>
              {/* FR-LIV-016 */}
              <a
                href={`#device-check-${session.id}`}
                className="inline-flex min-h-touch items-center rounded-lg border border-ink-300 px-3 text-sm font-medium text-ink-900 hover:bg-ink-100"
              >
                {t('student.nextSession.deviceCheck')}
              </a>
            </div>
          ) : ended ? (
            <p className="text-sm text-ink-600">{t('student.nextSession.ended')}</p>
          ) : (
            /*
             * FR-LIV-003: "before that it shows a countdown, not a dead button."
             * The window is the server's; this only renders it.
             */
            <p className="rounded-lg bg-brand-50 px-3 py-2 text-sm font-medium text-brand-700">
              {t('student.nextSession.opensIn', { time: countdownLabel(opensAt, t, now) })}
            </p>
          )}
        </div>
      )}

      {/* FR-LIV-013: the recording, and the date it goes. */}
      {session.recording && (
        <p className="mt-3 text-sm">
          {session.recording.ready ? (
            <a href={`#recording-${session.recording.id}`} className="font-medium text-brand-700 underline">
              {t('student.classes.recording')}
            </a>
          ) : (
            <span className="text-ink-600">{t('student.classes.recordingPending')}</span>
          )}
          <span className="ml-2 text-xs text-ink-600">
            {t('student.classes.recordingUntil', {
              date: new Date(session.recording.availableUntil).toLocaleDateString(language),
            })}
          </span>
        </p>
      )}
    </article>
  );
}

export function HomeworkRow({ item }: { item: HomeworkDto }) {
  const { t, language } = useI18n();
  const dueAt = new Date(item.dueAt);

  return (
    <article className="rounded-xl border border-ink-300 bg-white p-3.5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-ink-900">{item.title}</p>
          <p className="mt-0.5 truncate text-xs text-ink-600">{item.subject.name}</p>
        </div>
        {item.grade && (
          <div className="shrink-0 text-right">
            <p className="text-base font-semibold tabular-nums text-ink-900">
              {t('student.graded.score', { score: item.grade.score, max: item.grade.maxScore })}
            </p>
            {/* FR-HWK-007 */}
            {item.grade.unread && <Pill tone="brand">{t('student.graded.unread')}</Pill>}
          </div>
        )}
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
        <span className="text-ink-600">
          {t('student.homework.due', { date: whenLabel(dueAt, language, t) })}
        </span>
        {/* UI-003: lateness is a word as well as a colour. */}
        {item.isLate && item.state !== 'graded' && (
          <Pill tone="danger">{t('student.homework.late')}</Pill>
        )}
        {/* FR-HWK-006: what came back with the mark. */}
        {item.grade?.hasAudioFeedback && <Pill tone="neutral">♪</Pill>}
      </div>

      {item.grade?.feedbackText && (
        <p className="mt-2 rounded-lg bg-ink-100 px-3 py-2 text-sm text-ink-900">
          {item.grade.feedbackText}
        </p>
      )}
    </article>
  );
}

export function PracticeRow({ item }: { item: PracticeItemDto }) {
  const { t } = useI18n();
  const frozen = useFrozen();
  const exhausted = item.attemptsAllowed > 0 && item.attemptsUsed >= item.attemptsAllowed;

  return (
    <article className="rounded-xl border border-ink-300 bg-white p-3.5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-ink-900">
            {item.title}
            {item.paperNo !== null && (
              <span className="ml-2 font-normal text-ink-600">
                {t('student.unit.paperNo', { number: item.paperNo })}
              </span>
            )}
          </p>
          <p className="mt-0.5 truncate text-xs text-ink-600">{item.subject.name}</p>
        </div>
        {item.bestPercentage !== null && (
          <p className="shrink-0 text-sm font-semibold tabular-nums text-brand-700">
            {t('student.unit.best', { percent: Math.round(item.bestPercentage) })}
          </p>
        )}
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-ink-600">
        {item.durationMin !== null && <span>{durationLabel(item.durationMin, t)}</span>}
        {item.questionCount > 0 && (
          <span>{t('student.unit.questions', { count: item.questionCount })}</span>
        )}
        {item.attemptsAllowed > 0 && (
          <span>
            {t('student.unit.attempts', {
              used: item.attemptsUsed,
              allowed: item.attemptsAllowed,
            })}
          </span>
        )}
      </div>

      {/* §6 blocks starting a quiz or mock. §9 blocks it offline — the runner
          slice owns that check, because it is the thing that would break. */}
      {frozen ? (
        <p className="mt-3 rounded-lg bg-ink-100 px-3 py-2 text-sm text-ink-600">
          {t('student.frozen.blockedAction')}
        </p>
      ) : (
        !exhausted && (
          <a
            href={`#start-${item.id}`}
            className={[
              'mt-3 inline-flex min-h-touch w-full items-center justify-center rounded-lg',
              'border border-brand-600 px-4 text-sm font-semibold text-brand-700',
              'hover:bg-brand-50',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600',
              'focus-visible:ring-offset-2 focus-visible:ring-offset-white',
            ].join(' ')}
          >
            {t('student.practice.title')}
          </a>
        )
      )}
    </article>
  );
}

/**
 * A lesson or a set of notes, and the button that keeps it.
 *
 * BUILD-PLAN Phase 2. The URL is fetched on the tap and not with the list: FR-
 * FIL-003 mints a short-lived signed URL per read, and asking for one per row up
 * front would hand out live URLs for files nobody opened.
 *
 * The signed URL carries `fl_attachment`, so following it saves the file rather
 * than streaming it — which is the brief's "download to read it offline", and the
 * behaviour a learner on a metered connection is actually paying for.
 */
export function MaterialRow({ item }: { item: MaterialDto }) {
  const { t, language } = useI18n();
  const [state, setState] = useState<'idle' | 'opening' | 'failed'>('idle');

  const open = async () => {
    setState('opening');
    try {
      const result = await api<{ url: string }>(`/lessons/${item.id}/download-url`, { language });
      /*
       * A same-tab navigation rather than `window.open`.
       *
       * The URL arrives after an await, so a popup opened here is blocked by
       * every mobile browser. Navigating to an attachment URL does not leave the
       * app — the browser takes the download and stays where it is.
       */
      window.location.href = result.url;
      setState('idle');
    } catch {
      setState('failed');
    }
  };

  return (
    <article className="rounded-xl border border-ink-300 bg-white p-3.5">
      <div className="flex items-center gap-3">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-ink-900">{item.title}</p>
          <p className="mt-0.5 truncate text-xs text-ink-600">
            {item.subject.name}
            {item.topic ? ` · ${item.topic}` : ''}
          </p>
        </div>
        {/*
         * NFR-BAN-002: the size before the tap, not after. On a metered 3G
         * connection this is the difference between a considered download and an
         * accidental one.
         */}
        <span className="shrink-0 text-xs tabular-nums text-ink-600">
          {fileSize(item.sizeBytes)}
        </span>
      </div>

      <button
        type="button"
        onClick={() => void open()}
        disabled={state === 'opening'}
        className="mt-2 flex min-h-touch w-full items-center justify-center rounded-lg border border-ink-300 px-3 text-sm font-medium text-ink-900"
      >
        {state === 'opening' ? t('student.work.openingMaterial') : t('student.work.openMaterial')}
      </button>

      {state === 'failed' && (
        <p className="mt-1 text-xs text-danger-600" role="alert">
          {t('student.work.materialFailed')}
        </p>
      )}
    </article>
  );
}

/** A labelled figure. Used across Progress and the home strip. */
export function StatTile({
  label,
  value,
  sub,
}: {
  label: string;
  value: string;
  sub?: ReactNode;
}) {
  return (
    <div className="rounded-xl border border-ink-300 bg-white p-3.5">
      <p className="text-xs font-medium text-ink-600">{label}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums text-ink-900">{value}</p>
      {sub && <div className="mt-0.5 text-xs text-ink-600">{sub}</div>}
    </div>
  );
}
