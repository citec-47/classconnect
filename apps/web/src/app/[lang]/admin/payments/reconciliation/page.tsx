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
  Banner,
  ConfirmDialog,
  Money,
  PageHeader,
  ReasonField,
  StateChip,
  Table,
  Td,
  Th,
  Tr,
  When,
} from '@/components/admin/ui';

/**
 * §4.7.6 — reconciliation.
 *
 * CON-04 is why this screen exists: mobile-money callbacks are unreliable, are
 * treated as advisory, and the platform polls as well. What the two disagree
 * about lands here for a person, rather than being settled by whichever signal
 * arrived last.
 */

interface Item {
  id: string;
  provider: string;
  providerRef: string;
  amountXaf: string;
  occurredAt: string;
  statementDate: string;
  state: 'unmatched' | 'matched' | 'written_off' | 'escalated';
  note: string | null;
  ageHours: number;
  escalationDue: boolean;
  payment: {
    id: string;
    status: string;
    amountXaf: string;
    learner: string | null;
    payer: string | null;
  } | null;
}

interface Summary {
  unmatchedCount: number;
  unmatchedValueXaf: string;
  thresholdCount: number;
  thresholdValueXaf: string;
  breached: boolean;
}

const STATE_KEY: Record<Item['state'], { key: string; tone: 'neutral' | 'good' | 'warn' | 'frozen' }> = {
  unmatched: { key: 'payments.unmatched', tone: 'warn' },
  matched: { key: 'payments.matched', tone: 'good' },
  written_off: { key: 'payments.writtenOff', tone: 'neutral' },
  escalated: { key: 'payments.escalated', tone: 'frozen' },
};

/** Appendix B — the payment state machine, shown plainly as §4.7.6 asks. */
const STATE_MACHINE = [
  'payments.stateInitiated',
  'payments.statePending',
  'payments.stateSucceeded',
  'payments.stateFailed',
  'payments.statePendingReconciliation',
];

export default function Reconciliation() {
  const { language, t } = useI18n();
  const { refresh } = useAdminShell();
  const { user } = useAuth();

  const [items, setItems] = useState<Item[] | null>(null);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [writeOff, setWriteOff] = useState<Item | null>(null);
  const [note, setNote] = useState('');

  const canResolve =
    user?.roles.some((role) => ['admin_finance', 'super_admin'].includes(role)) ?? false;

  const load = useCallback(async () => {
    setError(null);
    try {
      const [list, totals] = await Promise.all([
        api<Item[]>('/admin/payments/reconciliation', { language }),
        api<Summary>('/admin/payments/reconciliation/summary', { language }),
      ]);
      setItems(list);
      setSummary(totals);
    } catch (caught) {
      setError(caught as ApiError);
      setItems([]);
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

  const resolve = async (item: Item, action: 'match' | 'escalate') => {
    setBusy(true);
    setError(null);
    try {
      await api(`/admin/payments/reconciliation/${item.id}/${action}`, {
        method: 'POST',
        body:
          action === 'match'
            ? { paymentId: item.payment?.id }
            : { note: item.note ?? 'Escalated from the reconciliation queue.' },
        language,
      });
      setDone(action === 'match' ? t('payments.matchedOk') : t('payments.escalated'));
      await load();
      await refresh();
    } catch (caught) {
      setError(caught as ApiError);
    } finally {
      setBusy(false);
    }
  };

  const confirmWriteOff = async () => {
    if (!writeOff) return;
    setBusy(true);
    setError(null);
    try {
      await api(`/admin/payments/reconciliation/${writeOff.id}/write-off`, {
        method: 'POST',
        body: { note },
        language,
      });
      setDone(t('payments.writtenOffOk'));
      setWriteOff(null);
      setNote('');
      await load();
      await refresh();
    } catch (caught) {
      setError(caught as ApiError);
    } finally {
      setBusy(false);
    }
  };

  if (items === null) {
    return (
      <>
        <PageHeader title={t('payments.reconciliationTitle')} />
        <p className="text-ink-600">{t('common.loading')}</p>
      </>
    );
  }

  return (
    <>
      <PageHeader title={t('payments.reconciliationTitle')} />

      {/* FR-LDG-004: the threshold alert, stated as a number rather than a hue. */}
      {summary?.breached && (
        <Banner tone="danger">
          {t('payments.thresholdAlert', {
            count: summary.thresholdCount,
            value: formatXaf(BigInt(summary.thresholdValueXaf), language),
          })}
        </Banner>
      )}

      {done && <SuccessAlert>{done}</SuccessAlert>}
      <ErrorAlert error={error} />

      {/* §4.7.6: "Show the payment state machine plainly." */}
      <div className="mb-4 flex flex-wrap items-center gap-2 rounded-lg border border-ink-300 bg-white p-3">
        <span className="text-xs font-semibold uppercase tracking-wide text-ink-600">
          {t('payments.stateMachine')}
        </span>
        {STATE_MACHINE.map((key, index) => (
          <span key={key} className="flex items-center gap-2 text-sm text-ink-900">
            {index > 0 && (
              <span aria-hidden="true" className="text-ink-600">
                →
              </span>
            )}
            {t(key)}
          </span>
        ))}
      </div>

      {items.length === 0 ? (
        <EmptyState
          title={t('payments.emptyReconciliationTitle')}
          body={t('payments.emptyReconciliationBody')}
        />
      ) : (
        <div className="rounded-lg bg-white">
          <Table>
            <thead>
              <tr>
                <Th>{t('payments.provider')}</Th>
                <Th>{t('payments.providerRef')}</Th>
                <Th numeric>{t('payments.amountPaid')}</Th>
                <Th>{t('payments.paymentDate')}</Th>
                <Th>{t('payments.statementDate')}</Th>
                <Th>{t('payments.learner')}</Th>
                <Th>{t('freeze.reason')}</Th>
                <Th>{t('safeguarding.state')}</Th>
                <Th>{t('common.filter')}</Th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <Tr key={item.id}>
                  <Td>{item.provider}</Td>
                  <Td className="font-mono text-xs">{item.providerRef}</Td>
                  <Td numeric>
                    <Money amount={item.amountXaf} />
                  </Td>
                  <Td>
                    <When value={item.occurredAt} />
                  </Td>
                  <Td className="tabular-nums">{item.statementDate}</Td>
                  <Td>{item.payment?.learner ?? item.payment?.payer ?? '—'}</Td>
                  <Td className="max-w-xs text-xs text-ink-600">{item.note}</Td>
                  <Td>
                    <StateChip tone={STATE_KEY[item.state].tone}>
                      {t(STATE_KEY[item.state].key)}
                    </StateChip>
                    {/* FR-PAY-012 / NFR-DEP-003: escalation after the window. */}
                    {item.escalationDue && (
                      <span className="mt-0.5 block text-xs text-danger-600">
                        {t('payments.recheckHourly', { hours: item.ageHours })}
                      </span>
                    )}
                  </Td>
                  <Td>
                    {canResolve && item.state === 'unmatched' && (
                      <div className="flex flex-col gap-1">
                        {item.payment && (
                          <button
                            type="button"
                            className="text-left text-xs text-brand-700 underline"
                            disabled={busy}
                            onClick={() => void resolve(item, 'match')}
                          >
                            {t('payments.matchTo')}
                          </button>
                        )}
                        <button
                          type="button"
                          className="text-left text-xs text-brand-700 underline"
                          disabled={busy}
                          onClick={() => void resolve(item, 'escalate')}
                        >
                          {t('payments.escalate')}
                        </button>
                        <button
                          type="button"
                          className="text-left text-xs text-danger-600 underline"
                          onClick={() => {
                            setWriteOff(item);
                            setNote('');
                          }}
                        >
                          {t('payments.writeOff')}
                        </button>
                      </div>
                    )}
                  </Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        </div>
      )}

      {/* FR-AI-005: a write-off is discretionary, so it names a person and a reason. */}
      <ConfirmDialog
        open={writeOff !== null}
        title={t('payments.writeOff')}
        consequences={
          writeOff
            ? [
                t('payments.refundConfirm', {
                  amount: formatXaf(BigInt(writeOff.amountXaf), language),
                  payer: writeOff.payment?.payer ?? writeOff.providerRef,
                }),
              ]
            : []
        }
        confirmLabel={t('payments.writeOff')}
        destructive
        busy={busy}
        confirmDisabled={!note.trim()}
        onConfirm={() => void confirmWriteOff()}
        onCancel={() => {
          setWriteOff(null);
          setNote('');
        }}
      >
        <ReasonField label={t('payments.writeOffReason')} value={note} onChange={setNote} />
      </ConfirmDialog>
    </>
  );
}
