'use client';

import { useEffect, useState } from 'react';
import { schoolTypeLabelKey, type SchoolType } from '@classconnect/shared';
import { useI18n } from '@/lib/i18n';
import { useCachedApi } from '@/lib/use-cached-api';
import { ErrorAlert, EmptyState } from '@/components/Alert';
import { BandFilter, type BandFilterValue } from '@/components/admin/BandFilter';
import { PageHeader, StateChip, Table, Td, Th, Tr, When } from '@/components/admin/ui';
import { AssignSubjectsDialog } from '@/components/admin/AssignSubjectsDialog';
import { BulkDeleteBar } from '@/components/admin/BulkDeleteBar';
import { useAuth } from '@/lib/auth-context';
import { SuccessAlert } from '@/components/Alert';

/**
 * The student roster, grouped by teaching band.
 *
 * A learner's band is derived from their level rather than stored, so a learner
 * moved from Form 5 to Lower Sixth changes band by changing class and there is
 * no second field to forget. `unclassified` therefore means "no level recorded",
 * which is a data gap worth finding rather than a category anyone belongs to.
 */

interface StudentRow {
  learnerId: string;
  /** Null for a Parent-managed minor with no sign-in of their own. */
  userId: string | null;
  fullName: string;
  schoolType: SchoolType | null;
  level: { nameEn: string; nameFr: string } | null;
  subjects: { nameEn: string; nameFr: string }[];
  dob: string;
  ageYears: number;
  isMinor: boolean;
  approvalState: string;
  status: string;
  hasOwnSignIn: boolean;
  guardian: { fullName: string; phone: string | null } | null;
  plan: string | null;
  frozen: boolean;
  freezeKind: 'manual' | 'automatic' | null;
}

export default function StudentRoster() {
  const { language, t } = useI18n();

  const [band, setBand] = useState<BandFilterValue>('all');
  const [query, setQuery] = useState('');

  /**
   * Debounced separately from the fetch.
   *
   * Each read writes an audit entry (FR-RBA-004), so a search should record one
   * look rather than one per keystroke — and the cached hook keys off the path,
   * so debouncing the path is what stops a query per character.
   */
  const [debouncedQuery, setDebouncedQuery] = useState('');
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(query.trim()), 350);
    return () => clearTimeout(timer);
  }, [query]);

  const params = new URLSearchParams();
  if (band !== 'all') params.set('band', band);
  if (debouncedQuery) params.set('q', debouncedQuery);
  const search = params.toString();

  // Stale-while-revalidate: returning to this screen paints the previous roster
  // at once instead of blanking for the couple of seconds the query takes.
  const studentsQuery = useCachedApi<StudentRow[]>(
    `/admin/people/students${search ? `?${search}` : ''}`,
    { language },
  );
  const countsQuery = useCachedApi<{ learners: Record<string, number> }>(
    '/admin/people/counts',
    { language, maxAgeMs: 60_000 },
  );

  const rows = studentsQuery.data;

  const { user } = useAuth();
  /*
   * Assigning a class is customer service's job too; deleting an account is the
   * admin's alone. Two different checks, because they are two different powers.
   */
  const canAssign =
    user?.roles.some((r) => ['admin_ops', 'super_admin', 'support_agent'].includes(r)) ?? false;
  const canDelete = user?.roles.some((r) => ['admin_ops', 'super_admin'].includes(r)) ?? false;

  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [assigning, setAssigning] = useState<StudentRow | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const counts = countsQuery.data
    ? {
        ...countsQuery.data.learners,
        all: Object.values(countsQuery.data.learners).reduce((a, b) => a + b, 0),
      }
    : {};
  const error = studentsQuery.error;

  return (
    <>
      <PageHeader
        title={t('adminNav.studentRoster')}
        actions={
          <>
            <label className="sr-only" htmlFor="student-search">
              {t('common.search')}
            </label>
            <input
              id="student-search"
              type="search"
              className="cc-field !min-h-0 !w-auto !py-1.5 text-sm"
              placeholder={t('common.search')}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </>
        }
      />

      <ErrorAlert error={error} />

      <BandFilter value={band} onChange={setBand} counts={counts} />

      {done && <SuccessAlert>{done}</SuccessAlert>}

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
            void studentsQuery.refresh();
          }}
        />
      )}

      {rows === null ? (
        <p className="text-ink-600">{t('common.loading')}</p>
      ) : rows.length === 0 ? (
        <EmptyState
          title={t('approvals.emptyStudentsTitle')}
          body={t('approvals.emptyStudentsBody')}
        />
      ) : (
        <div className="rounded-lg bg-white">
          <Table>
            <thead>
              <tr>
                {selecting && <Th>{t('bulk.select')}</Th>}
                <Th>{t('approvals.learner')}</Th>
                <Th>{t('teachers.band')}</Th>
                <Th>{t('approvals.level')}</Th>
                <Th>{t('approvals.subjects')}</Th>
                <Th>{t('approvals.guardian')}</Th>
                <Th>{t('approvals.dob')}</Th>
                <Th>{t('payments.plan')}</Th>
                <Th>{t('payments.accountState')}</Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <Tr key={row.learnerId}>
                  {selecting && (
                    <Td>
                      {/*
                       * A learner with no sign-in of their own has no account to
                       * delete — the checkbox is absent rather than disabled,
                       * because there is nothing here to act on at all.
                       */}
                      {row.userId ? (
                        <input
                          type="checkbox"
                          className="h-4 w-4"
                          aria-label={row.fullName}
                          checked={selected.has(row.userId)}
                          onChange={() =>
                            setSelected((current) => {
                              const next = new Set(current);
                              if (next.has(row.userId!)) next.delete(row.userId!);
                              else next.add(row.userId!);
                              return next;
                            })
                          }
                        />
                      ) : (
                        <span className="text-xs text-ink-500">—</span>
                      )}
                    </Td>
                  )}
                  <Td>
                    <span className="font-medium">{row.fullName}</span>
                    <span className="ml-2 text-xs text-ink-600">
                      {/* FR-FAM-006: derived from the date of birth. */}
                      {row.isMinor ? t('approvals.isMinor') : t('approvals.isAdult')}
                    </span>
                    {/*
                     * On the row rather than behind an expander: a learner with
                     * no class sees no timetable, no lessons and no exams, and
                     * that is the row an admin is scanning this list for.
                     */}
                    {canAssign && (
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
                      <StateChip tone="neutral">{t(schoolTypeLabelKey(row.schoolType))}</StateChip>
                    ) : (
                      <StateChip tone="warn">{t('schoolType.unclassified')}</StateChip>
                    )}
                  </Td>
                  <Td>
                    {row.level
                      ? language === 'fr'
                        ? row.level.nameFr
                        : row.level.nameEn
                      : t('common.notRecorded')}
                  </Td>
                  <Td className="max-w-xs">
                    <span className="line-clamp-2 text-xs">
                      {row.subjects
                        .map((s) => (language === 'fr' ? s.nameFr : s.nameEn))
                        .join(' · ') || t('common.none')}
                    </span>
                  </Td>
                  <Td>
                    {row.guardian ? (
                      <>
                        {row.guardian.fullName}
                        <span className="block text-xs text-ink-600">{row.guardian.phone}</span>
                      </>
                    ) : (
                      <span className="text-ink-600">{t('admin.noGuardian')}</span>
                    )}
                  </Td>
                  <Td>
                    <When value={`${row.dob}T00:00:00Z`} dateOnly />
                  </Td>
                  <Td>{row.plan ?? t('common.notRecorded')}</Td>
                  <Td>
                    {row.frozen ? (
                      <StateChip tone="frozen">
                        {row.freezeKind === 'manual'
                          ? t('freeze.frozenManual', { reason: '' })
                          : t('freeze.frozenAutomatic')}
                      </StateChip>
                    ) : row.approvalState === 'approved' ? (
                      <StateChip tone="good">{t('payments.stateActive')}</StateChip>
                    ) : (
                      <StateChip tone="warn">{row.approvalState}</StateChip>
                    )}
                  </Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        </div>
      )}

      {assigning && (
        <AssignSubjectsDialog
          mode="learner"
          subjectId={assigning.learnerId}
          onClose={() => setAssigning(null)}
          onSaved={() => {
            setDone(t('assign.learnerTitle'));
            void studentsQuery.refresh();
          }}
        />
      )}
    </>
  );
}
