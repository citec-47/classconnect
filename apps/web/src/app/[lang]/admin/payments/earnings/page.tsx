'use client';

import { useCallback, useEffect, useState } from 'react';
import { formatXaf } from '@classconnect/shared';
import { useI18n } from '@/lib/i18n';
import { useAutoRecover } from '@/lib/use-auto-recover';
import { api, type ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { ErrorAlert, EmptyState, SuccessAlert } from '@/components/Alert';
import {
  Banner,
  ConfirmDialog,
  ExportButton,
  Money,
  PageHeader,
  ReasonField,
  Table,
  Td,
  Th,
  Tr,
} from '@/components/admin/ui';
import { EarningsExplainer } from '@/components/admin/EarningsExplainer';

/**
 * §4.7.5 — hours taught and earnings.
 *
 * The screen carries its own caveat: OI-02 leaves the 60/40 split unresolved, so
 * the percentages, the basis and the session weights are configuration read at
 * calculation time and stamped onto every row. Saying that here is more honest
 * than presenting a settled-looking number.
 */

interface TeacherRow {
  earningId: string;
  teacherId: string;
  teacherName: string;
  sessionsDelivered: number;
  attendedMinutes: number;
  oneToOneMinutes: number;
  groupMinutes: number;
  grossXaf: string;
  deductionsXaf: string;
  netPayableXaf: string;
  effectiveHourlyXaf: number;
  configVersion: string;
  payout: { id: string; status: string } | null;
}

interface Breakdown {
  period: string;
  config: {
    teacherPoolPercent: number;
    basis: 'gross' | 'net_of_fees_and_tax';
    oneToOneFactor: number;
    groupFactor: number;
    minPresencePercent: number;
  };
  configVersion: string;
  poolXaf: string;
  teachers: TeacherRow[];
  unallocated: {
    amountXaf: string;
    decision: string;
    decidedBy: string | null;
    decidedAt: string | null;
    reason: string | null;
  } | null;
}

function currentPeriod(): string {
  return new Date().toISOString().slice(0, 7);
}

export default function HoursAndEarnings() {
  const { language, t } = useI18n();
  const { user } = useAuth();

  const [period, setPeriod] = useState(currentPeriod());
  const [data, setData] = useState<Breakdown | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [explaining, setExplaining] = useState<string | null>(null);
  const [decision, setDecision] = useState<
    'released_to_teachers' | 'retained_by_platform' | 'carried_forward' | null
  >(null);
  const [reason, setReason] = useState('');

  const canDecide =
    user?.roles.some((role) => ['admin_finance', 'super_admin'].includes(role)) ?? false;

  const load = useCallback(async () => {
    setError(null);
    try {
      setData(await api<Breakdown>(`/admin/earnings/periods/${period}`, { language }));
    } catch (caught) {
      setError(caught as ApiError);
      setData(null);
    }
  }, [language, period]);

  useEffect(() => {
    void load();
  }, [load]);

  /*
   * AS-08: a screen that failed while the API was restarting must not stay
   * failed once it answers again. Retries on reconnect, on refocus, and
   * slowly while the error stands.
   */
  useAutoRecover(load, error !== null);

  const recalculate = async () => {
    setBusy(true);
    setError(null);
    try {
      await api(`/admin/earnings/periods/${period}/calculate`, { method: 'POST', language });
      setDone(t('payments.recalculated'));
      await load();
    } catch (caught) {
      setError(caught as ApiError);
    } finally {
      setBusy(false);
    }
  };

  const decideUnallocated = async () => {
    if (!decision) return;
    setBusy(true);
    setError(null);
    try {
      await api(`/admin/earnings/periods/${period}/unallocated`, {
        method: 'POST',
        body: { decision, reason },
        language,
      });
      setDone(t('payments.unallocatedDecided'));
      setDecision(null);
      setReason('');
      await load();
    } catch (caught) {
      setError(caught as ApiError);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <PageHeader
        title={t('payments.earningsTitle')}
        actions={
          <>
            <label className="sr-only" htmlFor="period">
              {t('payments.period')}
            </label>
            <input
              id="period"
              type="month"
              className="cc-field !min-h-0 !w-auto !py-1.5 text-sm"
              value={period}
              onChange={(event) => setPeriod(event.target.value)}
            />
            {canDecide && (
              <button
                type="button"
                className="cc-btn-secondary !min-h-0 !py-1.5"
                disabled={busy}
                onClick={() => void recalculate()}
              >
                {t('payments.recalculate')}
              </button>
            )}
            <ExportButton dataset="earnings" query={{ period }} />
          </>
        }
      />

      {/* OI-02 stated on the screen, not buried in a comment. */}
      <Banner>{t('payments.poolUnresolved')}</Banner>

      {done && <SuccessAlert>{done}</SuccessAlert>}
      <ErrorAlert error={error} />

      {!data ? (
        <p className="text-ink-600">{t('common.loading')}</p>
      ) : (
        <>
          <div className="mb-4 rounded-lg border border-ink-300 bg-white p-3">
            <p className="text-xs text-ink-600">{t('payments.poolThisMonth')}</p>
            <p className="text-2xl font-semibold tabular-nums text-ink-900">
              <Money amount={data.poolXaf} />
            </p>
            <p className="mt-1 text-xs text-ink-600">
              {t('payments.poolBasis', {
                percent: data.config.teacherPoolPercent,
                basis:
                  data.config.basis === 'gross'
                    ? t('payments.poolBasisGross')
                    : t('payments.poolBasisNet'),
              })}
            </p>
          </div>

          {/* FR-ERN-004: never swept into platform revenue without a decision. */}
          {data.unallocated && (
            <div className="mb-4 rounded-lg border border-warning-600 bg-warning-50 p-3">
              <h2 className="text-sm font-semibold text-warning-600">
                {t('payments.unallocated')}
              </h2>
              <p className="mt-1 max-w-prose text-sm text-warning-600">
                {t('payments.unallocatedBody', {
                  amount: formatXaf(BigInt(data.unallocated.amountXaf), language),
                })}
              </p>
              {data.unallocated.decision === 'pending' ? (
                canDecide && (
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button
                      type="button"
                      className="cc-btn-secondary !min-h-0 !py-1.5"
                      onClick={() => {
                        setDecision('released_to_teachers');
                        setReason('');
                      }}
                    >
                      {t('payments.unallocatedRelease')}
                    </button>
                    <button
                      type="button"
                      className="cc-btn-secondary !min-h-0 !py-1.5"
                      onClick={() => {
                        setDecision('retained_by_platform');
                        setReason('');
                      }}
                    >
                      {t('payments.unallocatedRetain')}
                    </button>
                    <button
                      type="button"
                      className="cc-btn-secondary !min-h-0 !py-1.5"
                      onClick={() => {
                        setDecision('carried_forward');
                        setReason('');
                      }}
                    >
                      {t('payments.unallocatedCarry')}
                    </button>
                  </div>
                )
              ) : (
                <p className="mt-2 text-xs text-warning-600">
                  {data.unallocated.decision} — {data.unallocated.reason}
                </p>
              )}
            </div>
          )}

          {data.teachers.length === 0 ? (
            <EmptyState
              title={t('payments.emptyPendingTitle')}
              body={t('payments.emptyPendingBody')}
            />
          ) : (
            <div className="rounded-lg bg-white">
              <Table>
                <thead>
                  <tr>
                    <Th>{t('payments.teacher')}</Th>
                    <Th numeric>{t('payments.sessionsDelivered')}</Th>
                    <Th numeric>{t('payments.attendedMinutes')}</Th>
                    <Th numeric>{t('payments.oneToOne')}</Th>
                    <Th numeric>{t('payments.group')}</Th>
                    <Th numeric>{t('payments.effectiveHourly')}</Th>
                    <Th numeric>{t('payments.grossEarnings')}</Th>
                    <Th numeric>{t('payments.deductions')}</Th>
                    <Th numeric>{t('payments.netPayable')}</Th>
                    <Th>{t('payments.whyThisNumber')}</Th>
                  </tr>
                </thead>
                <tbody>
                  {data.teachers.map((row) => (
                    <Tr key={row.teacherId}>
                      <Td>{row.teacherName}</Td>
                      <Td numeric>{row.sessionsDelivered}</Td>
                      <Td numeric>{row.attendedMinutes}</Td>
                      <Td numeric>{row.oneToOneMinutes}</Td>
                      <Td numeric>{row.groupMinutes}</Td>
                      <Td numeric>
                        <Money amount={String(row.effectiveHourlyXaf)} />
                      </Td>
                      <Td numeric>
                        <Money amount={row.grossXaf} />
                      </Td>
                      <Td numeric>
                        <Money amount={row.deductionsXaf} />
                      </Td>
                      <Td numeric>
                        <Money amount={row.netPayableXaf} className="font-semibold" />
                      </Td>
                      <Td>
                        <button
                          type="button"
                          className="text-left text-xs text-brand-700 underline"
                          onClick={() => setExplaining(row.earningId)}
                        >
                          {t('payments.sessionsBehind')}
                        </button>
                      </Td>
                    </Tr>
                  ))}
                </tbody>
              </Table>
            </div>
          )}
        </>
      )}

      <ConfirmDialog
        open={decision !== null}
        title={t('payments.unallocatedDecide')}
        consequences={
          data?.unallocated
            ? [
                t('payments.unallocatedBody', {
                  amount: formatXaf(BigInt(data.unallocated.amountXaf), language),
                }),
              ]
            : []
        }
        confirmLabel={t('payments.unallocatedDecide')}
        busy={busy}
        confirmDisabled={!reason.trim()}
        onConfirm={() => void decideUnallocated()}
        onCancel={() => {
          setDecision(null);
          setReason('');
        }}
      >
        <ReasonField
          label={t('payments.heldDecisionReason')}
          value={reason}
          onChange={setReason}
        />
      </ConfirmDialog>

      {explaining && (
        <EarningsExplainer earningId={explaining} onClose={() => setExplaining(null)} />
      )}
    </>
  );
}
