'use client';

import { Fragment, useCallback, useEffect, useState } from 'react';
import {
  SCHOOL_TYPES,
  schoolTypeLabelKey,
  type SchoolType,
} from '@classconnect/shared';
import { useI18n } from '@/lib/i18n';
import { api, type ApiError } from '@/lib/api';
import { useCachedApi } from '@/lib/use-cached-api';
import { useAdminShell } from '@/lib/admin-badges';
import { useAuth } from '@/lib/auth-context';
import { ErrorAlert, EmptyState, SuccessAlert } from '@/components/Alert';
import { BandFilter, type BandFilterValue } from '@/components/admin/BandFilter';
import { AssignSubjectsDialog } from '@/components/admin/AssignSubjectsDialog';
import { BulkDeleteBar } from '@/components/admin/BulkDeleteBar';
import {
  Banner,
  ConfirmDialog,
  PageHeader,
  StateChip,
  Table,
  Td,
  Th,
  Tr,
} from '@/components/admin/ui';

/**
 * The teacher roster.
 *
 * Three bands — primary, secondary, Lower & Upper Sixth — and an Admin can move
 * a teacher between them. FR-SCH-002 hangs assignment off that band, so this is
 * the screen that decides who ends up in front of whom.
 *
 * Opening a row shows what the teacher actually teaches: every subject, and the
 * hours behind each, taken from the media server's attendance rather than from
 * anyone's own account of it (FR-LIV-014).
 */

interface TeacherRow {
  teacherId: string;
  fullName: string;
  phone: string | null;
  email: string | null;
  schoolType: SchoolType | null;
  verificationStatus: string;
  suspended: boolean;
  yearsExperience: number;
  highestQualification: string | null;
  subjects: {
    subjectId: string;
    nameEn: string;
    nameFr: string;
    level: { nameEn: string; nameFr: string; schoolType: SchoolType };
  }[];
  subjectCount: number;
  outOfBandSubjects: number;
  hoursAllTime: number;
  hoursThisMonth: number;
  sessionsAllTime: number;
}

interface TeacherDetail extends TeacherRow {
  institution: string | null;
  ratingAvg: number | null;
  ratingCount: number;
  hours: {
    allTime: number;
    thisMonth: number;
    oneToOne: number;
    group: number;
    minutesAllTime: number;
  };
  sessionsDelivered: number;
  learnersTaught: number;
  perSubject: { id: string; nameEn: string; nameFr: string; hours: number; sessions: number }[];
}

export default function TeacherRoster() {
  const { language, t } = useI18n();
  const { refresh } = useAdminShell();
  const { user } = useAuth();

  const [band, setBand] = useState<BandFilterValue>('all');
  /**
   * Stale-while-revalidate: coming back to this screen paints the last roster
   * immediately and refreshes behind it, rather than showing a blank page for
   * the couple of seconds the query legitimately takes.
   */
  const bandQuery = band === 'all' ? '' : `?band=${band}`;
  const teachersQuery = useCachedApi<TeacherRow[]>(`/admin/people/teachers${bandQuery}`, {
    language,
  });
  const countsQuery = useCachedApi<{ teachers: Record<string, number> }>('/admin/people/counts', {
    language,
    maxAgeMs: 60_000,
  });

  const rows = teachersQuery.data;
  const counts = countsQuery.data
    ? {
        ...countsQuery.data.teachers,
        all: Object.values(countsQuery.data.teachers).reduce((a, b) => a + b, 0),
      }
    : {};
  const [error, setError] = useState<ApiError | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [openId, setOpenId] = useState<string | null>(null);
  const [detail, setDetail] = useState<TeacherDetail | null>(null);
  const [classifying, setClassifying] = useState<{ row: TeacherRow; to: SchoolType } | null>(null);

  const canClassify =
    user?.roles.some((r) => ['admin_ops', 'super_admin'].includes(r)) ?? false;

  /*
   * `user:delete` is the admin's alone, so customer service sees no Select
   * control at all rather than one that fails on submit. The API refuses it
   * either way — this only keeps the screen honest about what is on offer.
   */
  const canDelete = canClassify;

  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [assigning, setAssigning] = useState<TeacherRow | null>(null);

  // Called after a classification, which changes both the roster and the counts.
  const load = useCallback(async () => {
    await Promise.all([teachersQuery.refresh(), countsQuery.refresh()]);
  }, [teachersQuery, countsQuery]);

  const open = async (row: TeacherRow) => {
    if (openId === row.teacherId) {
      setOpenId(null);
      return;
    }
    setOpenId(row.teacherId);
    setDetail(null);
    try {
      setDetail(
        await api<TeacherDetail>(`/admin/people/teachers/${row.teacherId}`, { language }),
      );
    } catch (caught) {
      setError(caught as ApiError);
    }
  };

  const classify = async () => {
    if (!classifying) return;
    setBusy(true);
    setError(null);
    try {
      await api(`/admin/people/teachers/${classifying.row.teacherId}/classification`, {
        method: 'POST',
        body: { schoolType: classifying.to },
        language,
      });
      setDone(t('teachers.classified'));
      setClassifying(null);
      await load();
      await refresh();
      if (openId === classifying.row.teacherId) setOpenId(null);
    } catch (caught) {
      setError(caught as ApiError);
    } finally {
      setBusy(false);
    }
  };

  const bandLabel = (value: SchoolType | null) =>
    value ? t(schoolTypeLabelKey(value)) : t('schoolType.unclassified');

  const unclassified = (rows ?? []).filter((r) => !r.schoolType).length;

  // Only when there is genuinely nothing to show. A background refresh keeps the
  // previous roster on screen rather than blanking it.
  if (rows === null) {
    return (
      <>
        <PageHeader title={t('teachers.title')} />
        <p className="text-ink-600">{t('common.loading')}</p>
      </>
    );
  }

  return (
    <>
      <PageHeader title={t('teachers.title')} description={t('teachers.hoursExplain')} />

      {done && <SuccessAlert>{done}</SuccessAlert>}
      <ErrorAlert error={error ?? teachersQuery.error} />

      {/* FR-SCH-002: a teacher with no band cannot be given a learner. */}
      {unclassified > 0 && band !== 'unclassified' && (
        <Banner>{t('teachers.unclassifiedBanner', { count: unclassified })}</Banner>
      )}

      <BandFilter value={band} onChange={setBand} counts={counts} />

      {/*
       * Selection is off until asked for.
       *
       * A checkbox on every row of a screen people mostly read invites the one
       * mis-click this list cannot afford, so the column appears only after
       * Select — the same shape the brief describes.
       */}
      {canDelete && (
        <div className="mb-2 flex justify-end">
          <button
            type="button"
            onClick={() => {
              setSelecting((on) => !on);
              setSelected(new Set());
            }}
            className="cc-btn-secondary"
          >
            {selecting ? t('bulk.done') : t('bulk.select')}
          </button>
        </div>
      )}

      {selecting && (
        <BulkDeleteBar
          selected={[...selected]}
          onClear={() => setSelected(new Set())}
          onDeleted={(count) => {
            setDone(t('bulk.deleted', { count }));
            setSelecting(false);
            void load();
          }}
        />
      )}

      {rows.length === 0 ? (
        <EmptyState title={t('teachers.emptyTitle')} body={t('teachers.emptyBody')} />
      ) : (
        <div className="rounded-lg bg-white">
          <Table>
            <thead>
              <tr>
                {selecting && <Th>{t('bulk.select')}</Th>}
                <Th>{t('approvals.applicant')}</Th>
                <Th>{t('teachers.band')}</Th>
                <Th>{t('teachers.subjectsTaught')}</Th>
                <Th numeric>{t('teachers.hoursThisMonth')}</Th>
                <Th numeric>{t('teachers.hoursAllTime')}</Th>
                <Th numeric>{t('teachers.sessionsDelivered')}</Th>
                <Th>{t('teachers.verification')}</Th>
                <Th>{t('common.filter')}</Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const isOpen = openId === row.teacherId;
                return (
                  <Fragment key={row.teacherId}>
                    <Tr>
                      {selecting && (
                        <Td>
                          <input
                            type="checkbox"
                            className="h-4 w-4"
                            aria-label={row.fullName}
                            checked={selected.has(row.teacherId)}
                            onChange={() =>
                              setSelected((current) => {
                                const next = new Set(current);
                                if (next.has(row.teacherId)) next.delete(row.teacherId);
                                else next.add(row.teacherId);
                                return next;
                              })
                            }
                          />
                        </Td>
                      )}
                      <Td>
                        <span className="font-medium">{row.fullName}</span>
                        <span className="block text-xs text-ink-600">
                          {row.highestQualification ?? t('common.notRecorded')}
                        </span>
                        {/*
                         * The assignment lives on the row, not behind the
                         * expander: it is what decides whether this teacher can
                         * timetable anything at all, and a teacher with no
                         * subjects is the case an admin is looking for.
                         */}
                        {canClassify && (
                          <button
                            type="button"
                            onClick={() => setAssigning(row)}
                            className="mt-1 block text-xs font-medium text-brand-700 underline"
                          >
                            {t('assign.open')}
                          </button>
                        )}
                      </Td>
                      <Td>
                        {row.schoolType ? (
                          <StateChip tone="neutral">{bandLabel(row.schoolType)}</StateChip>
                        ) : (
                          // Not decoration: this teacher cannot be assigned anyone.
                          <StateChip tone="warn">{t('schoolType.unclassified')}</StateChip>
                        )}
                        {row.outOfBandSubjects > 0 && (
                          <span className="mt-0.5 block text-xs text-warning-600">
                            {t('teachers.classifyMismatch', { count: row.outOfBandSubjects })}
                          </span>
                        )}
                      </Td>
                      <Td className="max-w-xs">
                        {row.subjectCount === 0 ? (
                          <span className="text-ink-600">{t('teachers.noSubjects')}</span>
                        ) : (
                          <span className="line-clamp-2 text-xs">
                            {row.subjects
                              .map(
                                (s) =>
                                  `${language === 'fr' ? s.nameFr : s.nameEn} · ${
                                    language === 'fr' ? s.level.nameFr : s.level.nameEn
                                  }`,
                              )
                              .join(' | ')}
                          </span>
                        )}
                      </Td>
                      <Td numeric>{row.hoursThisMonth}</Td>
                      <Td numeric>{row.hoursAllTime}</Td>
                      <Td numeric>{row.sessionsAllTime}</Td>
                      <Td>
                        <StateChip
                          tone={
                            row.suspended
                              ? 'frozen'
                              : row.verificationStatus === 'approved'
                                ? 'good'
                                : 'warn'
                          }
                        >
                          {row.suspended ? t('payments.stateSuspended') : row.verificationStatus}
                        </StateChip>
                      </Td>
                      <Td>
                        <button
                          type="button"
                          className="text-left text-xs text-brand-700 underline"
                          aria-expanded={isOpen}
                          onClick={() => void open(row)}
                        >
                          {t('teachers.viewDetail')}
                        </button>
                      </Td>
                    </Tr>

                    {isOpen && (
                      <tr>
                        <td colSpan={selecting ? 9 : 8} className="border-b border-ink-300 bg-ink-100/50 px-3 py-4">
                          {!detail ? (
                            <p className="text-sm text-ink-600">{t('common.loading')}</p>
                          ) : (
                            <div className="grid gap-6 lg:grid-cols-[1fr_1fr_16rem]">
                              {/* What they are contracted to teach. */}
                              <div>
                                <h3 className="mb-2 text-sm font-semibold text-ink-900">
                                  {t('teachers.subjectsTaught')}
                                </h3>
                                {detail.subjects.length === 0 ? (
                                  <p className="text-sm text-ink-600">{t('teachers.noSubjects')}</p>
                                ) : (
                                  <ul className="flex flex-col gap-1 text-sm">
                                    {detail.subjects.map((s, index) => (
                                      <li key={index} className="flex items-center gap-2">
                                        <span>
                                          {language === 'fr' ? s.nameFr : s.nameEn}
                                        </span>
                                        <span className="text-xs text-ink-600">
                                          {language === 'fr' ? s.level.nameFr : s.level.nameEn}
                                        </span>
                                        {!('inBand' in s && s.inBand) && (
                                          <StateChip tone="warn">
                                            {t(schoolTypeLabelKey(s.level.schoolType))}
                                          </StateChip>
                                        )}
                                      </li>
                                    ))}
                                  </ul>
                                )}
                              </div>

                              {/* What they have actually taught. */}
                              <div>
                                <h3 className="mb-2 text-sm font-semibold text-ink-900">
                                  {t('teachers.hoursTaught')}
                                </h3>
                                <dl className="mb-3 grid grid-cols-2 gap-2 text-sm">
                                  <div>
                                    <dt className="text-xs text-ink-600">
                                      {t('teachers.hoursThisMonth')}
                                    </dt>
                                    <dd className="text-lg font-semibold tabular-nums">
                                      {detail.hours.thisMonth}
                                    </dd>
                                  </div>
                                  <div>
                                    <dt className="text-xs text-ink-600">
                                      {t('teachers.hoursAllTime')}
                                    </dt>
                                    <dd className="text-lg font-semibold tabular-nums">
                                      {detail.hours.allTime}
                                    </dd>
                                  </div>
                                  <div>
                                    <dt className="text-xs text-ink-600">
                                      {t('payments.oneToOne')}
                                    </dt>
                                    <dd className="tabular-nums">{detail.hours.oneToOne}</dd>
                                  </div>
                                  <div>
                                    <dt className="text-xs text-ink-600">{t('payments.group')}</dt>
                                    <dd className="tabular-nums">{detail.hours.group}</dd>
                                  </div>
                                  <div>
                                    <dt className="text-xs text-ink-600">
                                      {t('teachers.sessionsDelivered')}
                                    </dt>
                                    <dd className="tabular-nums">{detail.sessionsDelivered}</dd>
                                  </div>
                                  <div>
                                    <dt className="text-xs text-ink-600">
                                      {t('teachers.learnersTaught')}
                                    </dt>
                                    <dd className="tabular-nums">{detail.learnersTaught}</dd>
                                  </div>
                                </dl>

                                {detail.perSubject.length > 0 && (
                                  <>
                                    <h4 className="mb-1 text-xs font-semibold uppercase tracking-wide text-ink-600">
                                      {t('teachers.perSubject')}
                                    </h4>
                                    <ul className="flex flex-col gap-0.5 text-sm">
                                      {detail.perSubject.map((s) => (
                                        <li key={s.id} className="flex justify-between gap-3">
                                          <span>{language === 'fr' ? s.nameFr : s.nameEn}</span>
                                          <span className="tabular-nums text-ink-600">
                                            {s.hours}h · {s.sessions}
                                          </span>
                                        </li>
                                      ))}
                                    </ul>
                                  </>
                                )}
                                {detail.perSubject.length === 0 && (
                                  <p className="text-sm text-ink-600">{t('teachers.noHours')}</p>
                                )}
                              </div>

                              {/* Move them to another band. */}
                              {canClassify && (
                                <div>
                                  <h3 className="mb-2 text-sm font-semibold text-ink-900">
                                    {t('teachers.classify')}
                                  </h3>
                                  <div className="flex flex-col gap-2">
                                    {SCHOOL_TYPES.map((option) => (
                                      <button
                                        key={option}
                                        type="button"
                                        className={
                                          option === row.schoolType
                                            ? 'cc-btn-primary w-full !min-h-0 !py-2'
                                            : 'cc-btn-secondary w-full !min-h-0 !py-2'
                                        }
                                        disabled={option === row.schoolType}
                                        onClick={() => setClassifying({ row, to: option })}
                                      >
                                        {t(schoolTypeLabelKey(option))}
                                      </button>
                                    ))}
                                  </div>
                                </div>
                              )}
                            </div>
                          )}
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </Table>
        </div>
      )}

      {/* UI-007: says what the change actually decides, before it is made. */}
      <ConfirmDialog
        open={classifying !== null}
        title={
          classifying
            ? t('teachers.classifyTitle', { name: classifying.row.fullName })
            : ''
        }
        consequences={
          classifying
            ? [
                t('teachers.classifyBody', { name: classifying.row.fullName }),
                ...(classifying.row.subjects.filter(
                  (s) => s.level.schoolType !== classifying.to,
                ).length > 0
                  ? [
                      t('teachers.classifyMismatch', {
                        count: classifying.row.subjects.filter(
                          (s) => s.level.schoolType !== classifying.to,
                        ).length,
                      }),
                    ]
                  : []),
              ]
            : []
        }
        confirmLabel={classifying ? t(schoolTypeLabelKey(classifying.to)) : ''}
        busy={busy}
        onConfirm={() => void classify()}
        onCancel={() => setClassifying(null)}
      />

      {assigning && (
        <AssignSubjectsDialog
          mode="teacher"
          subjectId={assigning.teacherId}
          onClose={() => setAssigning(null)}
          onSaved={() => {
            setDone(t('teachers.classified'));
            void load();
          }}
        />
      )}
    </>
  );
}
