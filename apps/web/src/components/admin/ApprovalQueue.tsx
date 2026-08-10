'use client';

import { Fragment, useCallback, useEffect, useState } from 'react';
import { useI18n } from '@/lib/i18n';
import { api, type ApiError } from '@/lib/api';
import { useAdminShell } from '@/lib/admin-badges';
import { ErrorAlert, EmptyState, SuccessAlert } from '@/components/Alert';
import {
  Banner,
  CheckMark,
  PageHeader,
  ReasonField,
  StateChip,
  Table,
  Td,
  Th,
  Tr,
  When,
} from './ui';

/**
 * §4.2 and §4.3 — the student and primary-student approval queues.
 *
 * One component, two screens, because §4.3 says "same queue mechanics" and the
 * differences are data: which learners the API returns, which checks it
 * attaches, and one standing banner.
 *
 * There is no bulk selection here and no "approve all". §4.2 is explicit, and
 * the API has no endpoint that would accept one anyway.
 */

interface ApprovalCheck {
  key: string;
  labelKey: string;
  passed: boolean;
  blocking: boolean;
  detail?: string;
}

export interface QueueEntry {
  learnerId: string;
  fullName: string;
  dob: string;
  ageYears: number;
  isMinor: boolean;
  level: { nameEn: string; nameFr: string; schoolType: string } | null;
  subjects: { nameEn: string; nameFr: string }[];
  guardian: {
    userId: string;
    fullName: string;
    phone: string | null;
    email: string | null;
    verified: boolean;
  } | null;
  plan: { code: string; nameEn: string; nameFr: string; priceXaf: string } | null;
  hasOwnSignIn: boolean;
  status: string;
  submittedAt: string;
  ageOfRequestDays: number;
  decisionReason: string | null;
  checks: ApprovalCheck[];
  approvable: boolean;
}

export function ApprovalQueue({ cohort }: { cohort: 'students' | 'primary' }) {
  const { language, t } = useI18n();
  const { refresh } = useAdminShell();

  const [queue, setQueue] = useState<QueueEntry[] | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<string | null>(null);

  const path = cohort === 'primary' ? '/admin/approvals/primary' : '/admin/approvals/students';

  const load = useCallback(async () => {
    setError(null);
    try {
      setQueue(await api<QueueEntry[]>(path, { language }));
    } catch (caught) {
      setError(caught as ApiError);
      setQueue([]);
    }
  }, [language, path]);

  useEffect(() => {
    void load();
  }, [load]);

  const decide = async (
    learnerId: string,
    decision: 'approved' | 'rejected' | 'more_info_required',
  ) => {
    setBusy(true);
    setError(null);
    try {
      await api(`/admin/approvals/learners/${learnerId}/decision`, {
        method: 'POST',
        body: { decision, ...(decision === 'approved' ? {} : { reason }) },
        language,
      });
      // §7: "Buttons keep their verb through the flow" — "Approve student"
      // produces "Student approved."
      setDone(
        decision === 'approved'
          ? t('approvals.approved')
          : decision === 'rejected'
            ? t('approvals.rejected')
            : t('approvals.requestedInfo'),
      );
      setOpenId(null);
      setReason('');
      await load();
      // §3: the badge falls now, because an item was actioned.
      await refresh();
    } catch (caught) {
      setError(caught as ApiError);
    } finally {
      setBusy(false);
    }
  };

  const title = cohort === 'primary' ? t('approvals.primaryTitle') : t('approvals.studentsTitle');

  if (queue === null) {
    return (
      <>
        <PageHeader title={title} />
        <p className="text-ink-600">{t('common.loading')}</p>
      </>
    );
  }

  return (
    <>
      <PageHeader title={title} description={t('approvals.noBulk')} />

      {/* §4.3: a persistent banner on the primary queue. */}
      {cohort === 'primary' && <Banner tone="danger">{t('approvals.primaryBanner')}</Banner>}

      {done && <SuccessAlert>{done}</SuccessAlert>}
      <ErrorAlert error={error} />

      {queue.length === 0 ? (
        <EmptyState
          title={t('approvals.emptyStudentsTitle')}
          body={
            cohort === 'primary'
              ? t('approvals.emptyPrimaryBody')
              : t('approvals.emptyStudentsBody')
          }
        />
      ) : (
        <div className="rounded-lg bg-white">
          <Table>
            <thead>
              <tr>
                <Th>{t('approvals.learner')}</Th>
                <Th>{t('approvals.guardian')}</Th>
                <Th>{t('approvals.level')}</Th>
                <Th>{t('approvals.dob')}</Th>
                <Th>{t('approvals.consentRecorded')}</Th>
                <Th>{t('approvals.plan')}</Th>
                <Th>{t('approvals.submittedAt')}</Th>
                <Th numeric>{t('approvals.ageOfRequest')}</Th>
                <Th>{t('common.filter')}</Th>
              </tr>
            </thead>
            <tbody>
              {queue.map((entry) => {
                const consent = entry.checks.find((c) => c.key === 'guardian_consent');
                const isOpen = openId === entry.learnerId;

                return (
                  // A queue row and its expanded detail are two <tr>s, so the
                  // key belongs on the fragment that holds them together.
                  <Fragment key={entry.learnerId}>
                    <Tr>
                      <Td>
                        <span className="font-medium">{entry.fullName}</span>
                        <span className="ml-2 text-xs text-ink-600">
                          {/* FR-FAM-006: derived from the date of birth, never typed. */}
                          {entry.isMinor ? t('approvals.isMinor') : t('approvals.isAdult')}
                        </span>
                      </Td>
                      <Td>
                        {entry.guardian ? (
                          <>
                            <span>{entry.guardian.fullName}</span>
                            <span className="block text-xs text-ink-600">
                              {entry.guardian.phone ?? entry.guardian.email}
                            </span>
                          </>
                        ) : (
                          <span className="text-ink-600">{t('common.notRecorded')}</span>
                        )}
                      </Td>
                      <Td>
                        {entry.level
                          ? language === 'fr'
                            ? entry.level.nameFr
                            : entry.level.nameEn
                          : t('common.notRecorded')}
                        <span className="block text-xs text-ink-600">
                          {entry.subjects
                            .map((s) => (language === 'fr' ? s.nameFr : s.nameEn))
                            .join(' · ')}
                        </span>
                      </Td>
                      <Td>
                        <When value={`${entry.dob}T00:00:00Z`} dateOnly />
                      </Td>
                      <Td>
                        {consent?.passed ? (
                          <StateChip tone="good">{t('common.yes')}</StateChip>
                        ) : (
                          <StateChip tone="frozen">{t('common.no')}</StateChip>
                        )}
                      </Td>
                      <Td>
                        {entry.plan
                          ? language === 'fr'
                            ? entry.plan.nameFr
                            : entry.plan.nameEn
                          : t('common.notRecorded')}
                      </Td>
                      <Td>
                        <When value={entry.submittedAt} />
                      </Td>
                      <Td numeric>{t('approvals.ageDays', { days: entry.ageOfRequestDays })}</Td>
                      <Td>
                        <button
                          type="button"
                          className="cc-btn-secondary !min-h-0 !py-1 !text-sm"
                          onClick={() => {
                            setOpenId(isOpen ? null : entry.learnerId);
                            setReason('');
                          }}
                          aria-expanded={isOpen}
                        >
                          {t('approvals.checks')}
                        </button>
                      </Td>
                    </Tr>

                    {isOpen && (
                      <tr>
                        <td colSpan={9} className="border-b border-ink-300 bg-ink-100/50 px-3 py-4">
                          <div className="grid gap-5 lg:grid-cols-[1fr_20rem]">
                            <div>
                              <h3 className="mb-2 text-sm font-semibold text-ink-900">
                                {t('approvals.checks')}
                              </h3>
                              <ul className="flex flex-col gap-1.5">
                                {entry.checks.map((check) => (
                                  <li
                                    key={check.key}
                                    className="flex items-start justify-between gap-3 text-sm"
                                  >
                                    <span className="text-ink-900">
                                      {t(check.labelKey)}
                                      {!check.blocking && (
                                        <span className="ml-1 text-ink-600">
                                          ({t('common.optional')})
                                        </span>
                                      )}
                                      {check.detail && (
                                        <span className="block text-xs text-ink-600">
                                          {check.detail}
                                        </span>
                                      )}
                                    </span>
                                    <CheckMark passed={check.passed} />
                                  </li>
                                ))}
                              </ul>

                              {!entry.approvable && (
                                <p className="cc-error mt-3" role="status">
                                  <span aria-hidden="true">⚠</span>
                                  <span>{t('approvals.approveBlocked')}</span>
                                </p>
                              )}
                            </div>

                            <div>
                              <ReasonField
                                label={t('approvals.reason')}
                                value={reason}
                                onChange={setReason}
                                hint={t('approvals.reasonRequired')}
                              />

                              <div className="mt-3 flex flex-col gap-2">
                                <button
                                  type="button"
                                  className="cc-btn-primary w-full"
                                  disabled={busy || !entry.approvable}
                                  onClick={() => void decide(entry.learnerId, 'approved')}
                                >
                                  {t('approvals.approve')}
                                </button>
                                <button
                                  type="button"
                                  className="cc-btn-secondary w-full"
                                  disabled={busy || !reason.trim()}
                                  onClick={() =>
                                    void decide(entry.learnerId, 'more_info_required')
                                  }
                                >
                                  {t('approvals.requestInfo')}
                                </button>
                                <button
                                  type="button"
                                  className="cc-btn-danger w-full"
                                  disabled={busy || !reason.trim()}
                                  onClick={() => void decide(entry.learnerId, 'rejected')}
                                >
                                  {t('approvals.reject')}
                                </button>
                              </div>
                            </div>
                          </div>
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
    </>
  );
}
