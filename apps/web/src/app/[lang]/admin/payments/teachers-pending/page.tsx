'use client';

import { useCallback, useEffect, useState } from 'react';
import { formatXaf } from '@classconnect/shared';
import { useI18n } from '@/lib/i18n';
import { useAutoRecover } from '@/lib/use-auto-recover';
import { api, type ApiError } from '@/lib/api';
import { useAdminShell } from '@/lib/admin-badges';
import { useAuth } from '@/lib/auth-context';
import { ErrorAlert, EmptyState, SuccessAlert } from '@/components/Alert';
import {
  ConfirmDialog,
  ExportButton,
  Money,
  PageHeader,
  ReasonField,
  StateChip,
  Table,
  Td,
  Th,
  Tr,
} from '@/components/admin/ui';
import { EarningsExplainer } from '@/components/admin/EarningsExplainer';

/**
 * §4.7.4 — teachers, pending salary.
 *
 * FR-ERN-010: a blocked payout shows its specific reason on the row. "Do not
 * just grey out the button" — an operator who cannot see why cannot fix it, and
 * the fix is usually a KYC field somebody has to chase.
 *
 * The API refuses a blocked payout regardless of what this screen renders; the
 * acceptance criteria require that refusal to be provable by test, and it is.
 */

interface PendingRow {
  earningId: string;
  teacherId: string;
  teacherName: string;
  period: string;
  attendedMinutes: number;
  grossXaf: string;
  deductionsXaf: string;
  netPayableXaf: string;
  kycComplete: boolean;
  walletVerified: boolean;
  walletMasked: string | null;
  suspended: boolean;
  daysPending: number;
  blockers: { reason: string; messageKey: string; params: Record<string, string> }[];
  payable: boolean;
  heldPendingReview: boolean;
  heldReason: string | null;
  configVersion: string;
}

export default function TeachersPending() {
  const { language, t } = useI18n();
  const { refresh } = useAdminShell();
  const { user } = useAuth();

  const [rows, setRows] = useState<PendingRow[] | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [explaining, setExplaining] = useState<string | null>(null);
  const [batchOpen, setBatchOpen] = useState(false);
  const [held, setHeld] = useState<{ row: PendingRow; decision: 'release' | 'withhold' } | null>(
    null,
  );
  const [reason, setReason] = useState('');

  const canApprove =
    user?.roles.some((role) => ['admin_finance', 'super_admin'].includes(role)) ?? false;

  const load = useCallback(async () => {
    setError(null);
    try {
      setRows(await api<PendingRow[]>('/admin/earnings/payouts/pending', { language }));
      setSelected(new Set());
    } catch (caught) {
      setError(caught as ApiError);
      setRows([]);
    }
  }, [language]);

  useEffect(() => {
    void load();
  }, [load]);

  /*
   * AS-08: a screen that failed while the API was restarting must not stay
   * failed once it answers again. Retries on reconnect, on refocus, and
   * slowly while the error stands.
   */
  useAutoRecover(load, error !== null);

  const approveOne = async (row: PendingRow) => {
    setBusy(true);
    setError(null);
    try {
      await api(`/admin/earnings/${row.earningId}/approve`, { method: 'POST', language });
      setDone(t('payments.payoutApproved'));
      await load();
      await refresh();
    } catch (caught) {
      setError(caught as ApiError);
    } finally {
      setBusy(false);
    }
  };

  const approveBatch = async () => {
    setBusy(true);
    setError(null);
    try {
      const result = await api<{ approved: unknown[]; refused: unknown[] }>(
        '/admin/earnings/payouts/approve-batch',
        { method: 'POST', body: { earningIds: [...selected] }, language },
      );
      setDone(t('payments.payoutApproved'));
      setBatchOpen(false);
      if (result.refused.length > 0) {
        // Partial success is normal here: a blocked teacher is refused
        // individually and the rest still go. Saying so beats a silent drop.
        setDone(
          `${t('payments.payoutApproved')} — ${result.approved.length}/${
            result.approved.length + result.refused.length
          }`,
        );
      }
      await load();
      await refresh();
    } catch (caught) {
      setError(caught as ApiError);
    } finally {
      setBusy(false);
    }
  };

  const decideHeld = async () => {
    if (!held) return;
    setBusy(true);
    setError(null);
    try {
      await api(`/admin/earnings/${held.row.earningId}/held-decision`, {
        method: 'POST',
        body: { decision: held.decision, reason },
        language,
      });
      setDone(t('payments.unallocatedDecided'));
      setHeld(null);
      setReason('');
      await load();
    } catch (caught) {
      setError(caught as ApiError);
    } finally {
      setBusy(false);
    }
  };

  const selectedRows = (rows ?? []).filter((row) => selected.has(row.earningId));
  const batchTotal = selectedRows.reduce((sum, row) => sum + BigInt(row.netPayableXaf), 0n);

  if (rows === null) {
    return (
      <>
        <PageHeader title={t('payments.teachersPendingTitle')} />
        <p className="text-ink-600">{t('common.loading')}</p>
      </>
    );
  }

  return (
    <>
      <PageHeader
        title={t('payments.teachersPendingTitle')}
        actions={
          <>
            {canApprove && selected.size > 0 && (
              <button
                type="button"
                className="cc-btn-primary !min-h-0 !py-1.5"
                onClick={() => setBatchOpen(true)}
              >
                {t('payments.approveBatch', { count: selected.size })}
              </button>
            )}
            <ExportButton dataset="teachers-pending" />
          </>
        }
      />

      {done && <SuccessAlert>{done}</SuccessAlert>}
      <ErrorAlert error={error} />

      {rows.length === 0 ? (
        <EmptyState
          title={t('payments.emptyPendingTitle')}
          body={t('payments.emptyPendingBody')}
        />
      ) : (
        <div className="rounded-lg bg-white">
          <Table>
            <thead>
              <tr>
                <Th>
                  <span className="sr-only">{t('payments.approvePayout')}</span>
                </Th>
                <Th>{t('payments.teacher')}</Th>
                <Th>{t('payments.period')}</Th>
                <Th numeric>{t('payments.attendedMinutes')}</Th>
                <Th numeric>{t('payments.netPayable')}</Th>
                <Th>{t('payments.kycComplete')}</Th>
                <Th>{t('payments.walletVerified')}</Th>
                <Th>{t('payments.accountState')}</Th>
                <Th numeric>{t('payments.daysPending')}</Th>
                <Th>{t('payments.blocked')}</Th>
                <Th>{t('common.filter')}</Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <Tr key={row.earningId}>
                  <Td>
                    <input
                      type="checkbox"
                      className="h-5 w-5"
                      // A blocked payout cannot be batched: the confirmation
                      // screen would promise money the API will refuse to send.
                      disabled={!row.payable || !canApprove}
                      checked={selected.has(row.earningId)}
                      onChange={() =>
                        setSelected((current) => {
                          const next = new Set(current);
                          if (next.has(row.earningId)) next.delete(row.earningId);
                          else next.add(row.earningId);
                          return next;
                        })
                      }
                      aria-label={row.teacherName}
                    />
                  </Td>
                  <Td>
                    {row.teacherName}
                    <span className="block font-mono text-xs text-ink-600">
                      {row.walletMasked ?? '—'}
                    </span>
                  </Td>
                  <Td className="tabular-nums">{row.period}</Td>
                  <Td numeric>{row.attendedMinutes}</Td>
                  <Td numeric>
                    <Money amount={row.netPayableXaf} className="font-semibold" />
                    <span className="block text-xs text-ink-600">
                      <Money amount={row.grossXaf} /> − <Money amount={row.deductionsXaf} />
                    </span>
                  </Td>
                  <Td>
                    <StateChip tone={row.kycComplete ? 'good' : 'frozen'}>
                      {row.kycComplete ? t('common.yes') : t('common.no')}
                    </StateChip>
                  </Td>
                  <Td>
                    <StateChip tone={row.walletVerified ? 'good' : 'frozen'}>
                      {row.walletVerified ? t('common.yes') : t('common.no')}
                    </StateChip>
                  </Td>
                  <Td>
                    <StateChip tone={row.suspended ? 'frozen' : 'good'}>
                      {row.suspended ? t('payments.stateSuspended') : t('payments.stateActive')}
                    </StateChip>
                  </Td>
                  <Td numeric>{row.daysPending}</Td>
                  <Td className="max-w-xs">
                    {/* FR-ERN-010 / §4.7.4: the specific reason, on the row. */}
                    {row.blockers.length === 0 ? (
                      <span className="text-ink-600">—</span>
                    ) : (
                      <ul className="flex flex-col gap-0.5 text-xs text-danger-600">
                        {row.blockers.map((blocker) => (
                          <li key={blocker.reason}>
                            {t(blocker.messageKey, {
                              ...blocker.params,
                              ...(blocker.params.minimum
                                ? {
                                    minimum: formatXaf(BigInt(blocker.params.minimum), language),
                                  }
                                : {}),
                            })}
                          </li>
                        ))}
                      </ul>
                    )}

                    {/* §4.7.4: held, not forfeited. */}
                    {row.heldPendingReview && (
                      <p className="mt-1 text-xs text-warning-600">
                        {t('payments.heldPendingReviewBody', {
                          amount: formatXaf(BigInt(row.netPayableXaf), language),
                        })}
                      </p>
                    )}
                  </Td>
                  <Td>
                    <div className="flex flex-col gap-1">
                      <button
                        type="button"
                        className="text-left text-xs text-brand-700 underline"
                        onClick={() => setExplaining(row.earningId)}
                      >
                        {t('payments.whyThisNumber')}
                      </button>
                      {canApprove && row.payable && (
                        <button
                          type="button"
                          className="text-left text-xs text-brand-700 underline"
                          disabled={busy}
                          onClick={() => void approveOne(row)}
                        >
                          {t('payments.approvePayout')}
                        </button>
                      )}
                      {/* FR-AI-005: a named human releases or withholds. */}
                      {canApprove && row.heldPendingReview && (
                        <>
                          <button
                            type="button"
                            className="text-left text-xs text-brand-700 underline"
                            onClick={() => {
                              setHeld({ row, decision: 'release' });
                              setReason('');
                            }}
                          >
                            {t('payments.release')}
                          </button>
                          <button
                            type="button"
                            className="text-left text-xs text-danger-600 underline"
                            onClick={() => {
                              setHeld({ row, decision: 'withhold' });
                              setReason('');
                            }}
                          >
                            {t('payments.withhold')}
                          </button>
                        </>
                      )}
                    </div>
                  </Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        </div>
      )}

      {/*
       * §4.7.4: "batch approval must still list each teacher and amount on the
       * confirmation screen before commit."
       */}
      <ConfirmDialog
        open={batchOpen}
        title={t('payments.batchConfirmTitle')}
        consequences={[
          ...selectedRows.map((row) => (
            <span key={row.earningId} className="flex justify-between gap-4">
              <span>
                {row.teacherName} · {row.period}
              </span>
              <Money amount={row.netPayableXaf} className="font-medium" />
            </span>
          )),
          <span key="total" className="mt-1 block border-t border-ink-300 pt-2 font-semibold">
            {t('payments.batchTotal', { amount: formatXaf(batchTotal, language) })}
          </span>,
        ]}
        confirmLabel={t('payments.approveBatch', { count: selected.size })}
        busy={busy}
        onConfirm={() => void approveBatch()}
        onCancel={() => setBatchOpen(false)}
      />

      <ConfirmDialog
        open={held !== null}
        title={held?.decision === 'release' ? t('payments.release') : t('payments.withhold')}
        consequences={
          held
            ? [
                t('payments.heldPendingReviewBody', {
                  amount: formatXaf(BigInt(held.row.netPayableXaf), language),
                }),
              ]
            : []
        }
        confirmLabel={held?.decision === 'release' ? t('payments.release') : t('payments.withhold')}
        destructive={held?.decision === 'withhold'}
        busy={busy}
        confirmDisabled={!reason.trim()}
        onConfirm={() => void decideHeld()}
        onCancel={() => {
          setHeld(null);
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
