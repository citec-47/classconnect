'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  SCHOOL_TYPES,
  formatLocal,
  schoolTypeLabelKey,
  type SchoolType,
} from '@classconnect/shared';
import { useI18n } from '@/lib/i18n';
import { useAutoRecover } from '@/lib/use-auto-recover';
import { api, type ApiError } from '@/lib/api';
import { ErrorAlert, EmptyState } from '@/components/Alert';
import { PageHeader, StateChip, When } from '@/components/admin/ui';

/**
 * §Schedules — the weekly timetable.
 *
 * Four groupings: the three teaching bands, plus private classes. Private is not
 * a fourth band — it cuts across all three — but it sits in the same selector
 * because that is how an operator asks the question: "show me the sixth form
 * timetable", "show me every one-to-one".
 *
 * Monday to Sunday, each day a column of lessons with their time and course.
 * Clicking one opens the teacher behind it and, separately, whatever they are
 * teaching at this moment — usually a different lesson from the one clicked.
 */

type Grouping = SchoolType | 'private';

interface Entry {
  sessionId: string;
  weekday: number;
  startsAtUtc: string;
  startTime: string;
  endTime: string;
  durationMin: number;
  status: string;
  live: boolean;
  cancelled: boolean;
  past: boolean;
  isPrivate: boolean;
  subject: { id: string; nameEn: string; nameFr: string };
  teacher: { id: string; fullName: string; schoolType: SchoolType | null };
  level: { nameEn: string; nameFr: string } | null;
  learner: { id: string; fullName: string } | null;
  cohort: { id: string; name: string; size: number } | null;
}

interface Day {
  weekday: number;
  date: string;
  entries: Entry[];
  count: number;
  liveCount: number;
}

interface Week {
  grouping: Grouping;
  weekStartsOn: string;
  days: Day[];
  totals: { sessions: number; live: number; cancelled: number; teachers: number };
}

interface SlotDetail {
  slot: {
    sessionId: string;
    startTime: string;
    durationMin: number;
    status: string;
    isPrivate: boolean;
    subject: { nameEn: string; nameFr: string };
    learner: { id: string; fullName: string } | null;
    cohort: { id: string; name: string } | null;
  };
  teacher: {
    id: string;
    fullName: string;
    phone: string | null;
    email: string | null;
    schoolType: SchoolType | null;
    verificationStatus: string;
    suspended: boolean;
    yearsExperience: number;
    highestQualification: string | null;
    ratingAvg: number | null;
    ratingCount: number;
    subjects: { nameEn: string; nameFr: string; level: { nameEn: string; nameFr: string } }[];
    hoursAllTime: number;
    hoursThisMonth: number;
    sessionsDelivered: number;
  };
  nowTeaching: {
    sessionId: string;
    subject: { nameEn: string; nameFr: string };
    isPrivate: boolean;
    startTime: string;
    elapsedMinutes: number;
    learner: { id: string; fullName: string } | null;
    cohort: { name: string; size: number } | null;
    presentCount: number;
    recordingEnabled: boolean;
    isThisSlot: boolean;
  } | null;
}

const DAY_KEYS = [
  'schedule.monday',
  'schedule.tuesday',
  'schedule.wednesday',
  'schedule.thursday',
  'schedule.friday',
  'schedule.saturday',
  'schedule.sunday',
];

function duration(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

export default function Schedules() {
  const { language, t } = useI18n();

  const [grouping, setGrouping] = useState<Grouping>('secondary');
  const [weekOffset, setWeekOffset] = useState(0);
  const [week, setWeek] = useState<Week | null>(null);
  const [error, setError] = useState<ApiError | null>(null);

  const [openSlot, setOpenSlot] = useState<string | null>(null);
  const [detail, setDetail] = useState<SlotDetail | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const reference = new Date();
      reference.setDate(reference.getDate() + weekOffset * 7);
      const params = new URLSearchParams({ grouping, week: reference.toISOString() });
      setWeek(await api<Week>(`/admin/schedule?${params}`, { language }));
    } catch (caught) {
      setError(caught as ApiError);
      setWeek(null);
    }
  }, [language, grouping, weekOffset]);

  useEffect(() => {
    void load();
  }, [load]);

  /*
   * AS-08: a screen that failed while the API was restarting must not stay
   * failed once it answers again. Retries on reconnect, on refocus, and
   * slowly while the error stands.
   */
  useAutoRecover(load, error !== null);

  const openDetail = async (entry: Entry) => {
    if (openSlot === entry.sessionId) {
      setOpenSlot(null);
      return;
    }
    setOpenSlot(entry.sessionId);
    setDetail(null);
    try {
      setDetail(
        await api<SlotDetail>(`/admin/schedule/slots/${entry.sessionId}`, { language }),
      );
    } catch (caught) {
      setError(caught as ApiError);
    }
  };

  const todayIso = new Date().toISOString().slice(0, 10);

  const groupings: { value: Grouping; label: string }[] = [
    ...SCHOOL_TYPES.map((band) => ({
      value: band as Grouping,
      label: t(schoolTypeLabelKey(band)),
    })),
    { value: 'private', label: t('schedule.private') },
  ];

  return (
    <>
      <PageHeader
        title={t('schedule.title')}
        description={t('schedule.subtitle')}
        actions={
          <div className="flex items-center gap-1">
            <button
              type="button"
              className="cc-btn-secondary !min-h-0 !py-1.5"
              onClick={() => setWeekOffset((w) => w - 1)}
            >
              <span aria-hidden="true">‹</span> {t('schedule.previousWeek')}
            </button>
            <button
              type="button"
              className="cc-btn-secondary !min-h-0 !py-1.5"
              onClick={() => setWeekOffset(0)}
              disabled={weekOffset === 0}
            >
              {t('schedule.thisWeek')}
            </button>
            <button
              type="button"
              className="cc-btn-secondary !min-h-0 !py-1.5"
              onClick={() => setWeekOffset((w) => w + 1)}
            >
              {t('schedule.nextWeek')} <span aria-hidden="true">›</span>
            </button>
          </div>
        }
      />

      <ErrorAlert error={error} />

      {/* The four groupings. */}
      <div
        role="radiogroup"
        aria-label={t('schedule.title')}
        className="mb-4 flex flex-wrap gap-1 rounded-lg border border-ink-300 bg-white p-1"
      >
        {groupings.map((option) => {
          const active = grouping === option.value;
          return (
            <button
              key={option.value}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => {
                setGrouping(option.value);
                setOpenSlot(null);
              }}
              className={[
                'flex min-h-touch items-center gap-1.5 rounded-md px-3 text-sm transition-colors',
                active ? 'bg-brand-600 font-semibold text-white' : 'text-ink-600 hover:bg-ink-100',
              ].join(' ')}
            >
              <span aria-hidden="true">{active ? '●' : '○'}</span>
              {option.label}
            </button>
          );
        })}
      </div>

      {!week ? (
        <p className="text-ink-600">{t('common.loading')}</p>
      ) : (
        <>
          <div className="mb-3 flex flex-wrap items-center gap-3 text-sm text-ink-600">
            <span className="font-medium text-ink-900">
              {t('schedule.weekOf', {
                date: formatLocal(new Date(`${week.weekStartsOn}T00:00:00Z`), language, {
                  dateStyle: 'medium',
                }),
              })}
            </span>
            <span>{t('schedule.totalSessions', { count: week.totals.sessions })}</span>
            <span>{t('schedule.totalTeachers', { count: week.totals.teachers })}</span>
            {week.totals.live > 0 && (
              <span className="font-medium text-success-600">
                {t('live.liveNow', { count: week.totals.live })}
              </span>
            )}
          </div>

          {week.totals.sessions === 0 ? (
            <EmptyState title={t('schedule.emptyTitle')} body={t('schedule.emptyBody')} />
          ) : (
            /*
             * Seven columns on a desktop, stacking on narrower screens. The
             * admin surface is desktop-first (§2.3), but a timetable is the one
             * screen a founder is most likely to check from a phone.
             */
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-7">
              {week.days.map((day) => {
                const isToday = day.date === todayIso;
                return (
                  <div
                    key={day.weekday}
                    className={[
                      'rounded-lg border bg-white p-2',
                      isToday ? 'border-brand-600 ring-1 ring-brand-600' : 'border-ink-300',
                    ].join(' ')}
                  >
                    <h2 className="mb-2 flex items-baseline justify-between gap-2 px-1">
                      <span className="text-sm font-semibold text-ink-900">
                        {t(DAY_KEYS[day.weekday] ?? 'schedule.monday')}
                      </span>
                      <span className="text-xs tabular-nums text-ink-600">
                        {formatLocal(new Date(`${day.date}T00:00:00Z`), language, {
                          day: 'numeric',
                          month: 'short',
                        })}
                      </span>
                    </h2>

                    {isToday && (
                      <p className="mb-1.5 px-1 text-[0.6875rem] font-semibold uppercase tracking-wide text-brand-700">
                        {t('schedule.today')}
                      </p>
                    )}

                    {day.entries.length === 0 ? (
                      <p className="px-1 py-2 text-xs text-ink-600">{t('schedule.noLessons')}</p>
                    ) : (
                      <ul className="flex flex-col gap-1.5">
                        {day.entries.map((entry) => (
                          <li key={entry.sessionId}>
                            <button
                              type="button"
                              onClick={() => void openDetail(entry)}
                              aria-expanded={openSlot === entry.sessionId}
                              className={[
                                'w-full rounded-md border p-2 text-left transition-colors',
                                entry.cancelled
                                  ? 'border-ink-300 bg-ink-100 opacity-70'
                                  : entry.live
                                    ? 'border-success-600 bg-success-50'
                                    : entry.isPrivate
                                      ? 'border-brand-600 border-l-4 hover:bg-brand-50'
                                      : 'border-ink-300 hover:bg-ink-100',
                                openSlot === entry.sessionId ? 'ring-2 ring-brand-600' : '',
                              ].join(' ')}
                            >
                              {/* The time. */}
                              <span className="block text-xs font-semibold tabular-nums text-ink-900">
                                {entry.startTime}–{entry.endTime}
                              </span>
                              {/* The course. */}
                              <span className="mt-0.5 block text-sm text-ink-900">
                                {language === 'fr' ? entry.subject.nameFr : entry.subject.nameEn}
                              </span>
                              <span className="mt-0.5 block truncate text-xs text-ink-600">
                                {entry.teacher.fullName}
                              </span>

                              <span className="mt-1 flex flex-wrap gap-1">
                                {entry.live && (
                                  <span className="inline-flex items-center gap-1 text-[0.6875rem] font-semibold text-success-600">
                                    <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-success-600" />
                                    {t('schedule.liveNow')}
                                  </span>
                                )}
                                {entry.cancelled && (
                                  <span className="text-[0.6875rem] font-medium text-ink-600">
                                    {t('schedule.cancelled')}
                                  </span>
                                )}
                                {entry.isPrivate && !entry.live && (
                                  <span className="text-[0.6875rem] text-brand-700">
                                    {t('live.private')}
                                  </span>
                                )}
                              </span>
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}

      {/* The teacher behind the slot, and what they are teaching right now. */}
      {openSlot && (
        <section className="mt-6 rounded-lg border border-ink-300 bg-white p-4">
          <div className="mb-3 flex items-start justify-between gap-3">
            <h2 className="text-base font-semibold text-ink-900">{t('schedule.slotDetail')}</h2>
            <button
              type="button"
              className="cc-btn-secondary !min-h-0 !py-1"
              onClick={() => setOpenSlot(null)}
            >
              {t('common.close')}
            </button>
          </div>

          {!detail ? (
            <p className="text-sm text-ink-600">{t('common.loading')}</p>
          ) : (
            <div className="grid gap-6 lg:grid-cols-3">
              {/* Who they are. */}
              <div>
                <h3 className="mb-2 text-sm font-semibold text-ink-900">
                  {t('schedule.slotTeacher')}
                </h3>
                <p className="text-base font-medium text-ink-900">{detail.teacher.fullName}</p>
                <p className="text-xs text-ink-600">
                  {detail.teacher.highestQualification ?? t('common.notRecorded')}
                </p>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {detail.teacher.schoolType && (
                    <StateChip tone="neutral">
                      {t(schoolTypeLabelKey(detail.teacher.schoolType))}
                    </StateChip>
                  )}
                  <StateChip tone={detail.teacher.suspended ? 'frozen' : 'good'}>
                    {detail.teacher.suspended
                      ? t('payments.stateSuspended')
                      : detail.teacher.verificationStatus}
                  </StateChip>
                </div>
                <dl className="mt-3 grid grid-cols-3 gap-2 text-sm">
                  <div>
                    <dt className="text-xs text-ink-600">{t('teachers.hoursThisMonth')}</dt>
                    <dd className="font-semibold tabular-nums">{detail.teacher.hoursThisMonth}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-ink-600">{t('teachers.hoursAllTime')}</dt>
                    <dd className="font-semibold tabular-nums">{detail.teacher.hoursAllTime}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-ink-600">{t('teachers.sessionsDelivered')}</dt>
                    <dd className="font-semibold tabular-nums">
                      {detail.teacher.sessionsDelivered}
                    </dd>
                  </div>
                </dl>
              </div>

              {/* What they teach. */}
              <div>
                <h3 className="mb-2 text-sm font-semibold text-ink-900">
                  {t('teachers.subjectsTaught')}
                </h3>
                {detail.teacher.subjects.length === 0 ? (
                  <p className="text-sm text-ink-600">{t('teachers.noSubjects')}</p>
                ) : (
                  <ul className="flex flex-col gap-1 text-sm">
                    {detail.teacher.subjects.map((s, index) => (
                      <li key={index}>
                        {language === 'fr' ? s.nameFr : s.nameEn}
                        <span className="ml-1.5 text-xs text-ink-600">
                          {language === 'fr' ? s.level.nameFr : s.level.nameEn}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              {/* What they are teaching at this moment. */}
              <div>
                <h3 className="mb-2 text-sm font-semibold text-ink-900">
                  {t('schedule.nowTeaching')}
                </h3>
                {!detail.nowTeaching ? (
                  <p className="text-sm text-ink-600">{t('schedule.nowTeachingNone')}</p>
                ) : (
                  <div className="rounded-md border border-success-600 bg-success-50 p-3">
                    <p className="flex items-center gap-1.5 text-xs font-semibold text-success-600">
                      <span aria-hidden="true" className="h-2 w-2 rounded-full bg-success-600" />
                      {detail.nowTeaching.isPrivate ? t('live.private') : t('live.group')}
                    </p>
                    <p className="mt-1 text-sm font-medium text-ink-900">
                      {language === 'fr'
                        ? detail.nowTeaching.subject.nameFr
                        : detail.nowTeaching.subject.nameEn}
                    </p>
                    <p className="text-xs text-ink-600">
                      {t('schedule.runningFor', {
                        duration: duration(detail.nowTeaching.elapsedMinutes),
                      })}
                      {' · '}
                      {t('live.attendingCount', { count: detail.nowTeaching.presentCount })}
                    </p>
                    {detail.nowTeaching.learner && (
                      <p className="mt-1 text-xs text-ink-900">
                        {detail.nowTeaching.learner.fullName}
                      </p>
                    )}
                    {detail.nowTeaching.cohort && (
                      <p className="mt-1 text-xs text-ink-900">
                        {detail.nowTeaching.cohort.name} ({detail.nowTeaching.cohort.size})
                      </p>
                    )}
                    {detail.nowTeaching.isThisSlot && (
                      <p className="mt-1.5 text-xs font-medium text-success-600">
                        {t('schedule.nowTeachingThis')}
                      </p>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}
        </section>
      )}
    </>
  );
}
