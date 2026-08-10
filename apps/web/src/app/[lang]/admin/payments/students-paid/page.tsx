'use client';

import { useCallback, useEffect, useState } from 'react';
import { formatXaf } from '@classconnect/shared';
import { useI18n } from '@/lib/i18n';
import { useAutoRecover } from '@/lib/use-auto-recover';
import { api, type ApiError } from '@/lib/api';
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
  When,
} from '@/components/admin/ui';
import { PAYMENT_METHOD_KEY } from '@/components/admin/labels';
import { RecordPaymentDialog } from '@/components/admin/RecordPaymentDialog';
import { LEVEL_ACCENT } from '@/lib/subject-accent';

/** §4.7.1 — students, paid. */

interface PaidRow {
  id: string;
  learner: string | null;
  payer: string | null;
  payerPhone: string | null;
  planNameEn: string | null;
  planNameFr: string | null;
  level: { nameEn: string; nameFr: string } | null;
  periodStart: string | null;
  periodEnd: string | null;
  method: string;
  amountXaf: string;
  settledAt: string | null;
  providerRef: string | null;
  invoiceId: string | null;
  invoiceNumber: string | null;
  planType: 'full' | 'three_instalments';
  instalmentsDone: number;
  instalmentsTotal: number;
  recordedOffline: boolean;
  refundedXaf: string;
  subscriptionId: string | null;
}

export default function StudentsPaid() {
  const { language, t } = useI18n();
  const { user } = useAuth();

  const [rows, setRows] = useState<PaidRow[] | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [refunding, setRefunding] = useState<PaidRow | null>(null);
  const [recording, setRecording] = useState<PaidRow | null>(null);
  const [search, setSearch] = useState('');
  const [levelGroup, setLevelGroup] = useState<'all' | 'primary' | 'secondary' | 'lower' | 'upper'>(
    'all',
  );
  const [reason, setReason] = useState('');

  // §3: Ops sees these screens read-only. The button is hidden here and the
  // endpoint refuses regardless — the permission, not the button, is the control.
  /** Collapses the catalogue's sixteen levels into the four an operator thinks in. */
  const groupOf = (nameEn: string | null): 'primary' | 'secondary' | 'lower' | 'upper' | null => {
    const name = (nameEn ?? '').toLowerCase();
    if (name.startsWith('class')) return 'primary';
    if (name.startsWith('form')) return 'secondary';
    if (name.includes('lower')) return 'lower';
    if (name.includes('upper')) return 'upper';
    return null;
  };

  const canRefund =
    user?.roles.includes('admin_finance') || user?.roles.includes('super_admin');

  const load = useCallback(async () => {
    setError(null);
    try {
      setRows(await api<PaidRow[]>('/admin/payments/students/paid', { language }));
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

  const resend = async (row: PaidRow) => {
    setBusy(true);
    try {
      await api(`/admin/payments/${row.id}/receipt`, { method: 'POST', language });
      setDone(t('payments.receiptResent'));
    } catch (caught) {
      setError(caught as ApiError);
    } finally {
      setBusy(false);
    }
  };

  const refund = async () => {
    if (!refunding) return;
    setBusy(true);
    setError(null);
    try {
      await api(`/admin/payments/${refunding.id}/refund`, {
        method: 'POST',
        body: { reason },
        language,
      });
      setDone(t('payments.refunded'));
      setRefunding(null);
      setReason('');
      await load();
    } catch (caught) {
      setError(caught as ApiError);
    } finally {
      setBusy(false);
    }
  };

  if (rows === null) {
    return (
      <>
        <PageHeader title={t('payments.studentsPaidTitle')} />
        <p className="text-ink-600">{t('common.loading')}</p>
      </>
    );
  }

  const needle = search.trim().toLowerCase();
  const visible = (rows ?? []).filter((row) => {
    const matchesSearch =
      !needle ||
      (row.learner?.toLowerCase().includes(needle) ?? false) ||
      (row.payer?.toLowerCase().includes(needle) ?? false) ||
      (row.payerPhone?.includes(needle) ?? false) ||
      (row.invoiceNumber?.toLowerCase().includes(needle) ?? false);

    const matchesGroup =
      levelGroup === 'all' || groupOf(row.level?.nameEn ?? null) === levelGroup;

    return matchesSearch && matchesGroup;
  });

  return (
    <>
      <PageHeader
        title={t('payments.studentsPaidTitle')}
        actions={<ExportButton dataset="students-paid" />}
      />

      {done && <SuccessAlert>{done}</SuccessAlert>}
      <ErrorAlert error={error} />

      {/*
       * Search and level grouping.
       *
       * Filtered client-side rather than round-tripping: the paid list is a
       * page of rows already in hand, and an admin correcting a payment is
       * typing a name they can see. A server round trip per keystroke would be
       * slower and would lose the row they were looking at.
       *
       * The level groups collapse the sixteen catalogue rows into the four an
       * operator actually thinks in — Primary, Secondary, Lower Sixth, Upper
       * Sixth — because "Class 4" and "Class 5" are the same question here.
       */}
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <input
          type="search"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder={t('payments.searchStudent')}
          className="min-h-touch w-72 rounded-lg border border-ink-300 px-3 text-sm"
        />
        {(['all', 'primary', 'secondary', 'lower', 'upper'] as const).map((group) => (
          <button
            key={group}
            type="button"
            aria-pressed={levelGroup === group}
            onClick={() => setLevelGroup(group)}
            /*
             * Each level keeps one colour across the payments screens, so an
             * operator filtering to Upper Sixth recognises the state without
             * re-reading the label. Unselected chips stay neutral; the colour
             * marks the choice rather than decorating the row.
             */
            className={[
              'min-h-touch rounded-full border px-3 text-sm',
              levelGroup !== group
                ? 'border-ink-300 text-ink-600'
                : group === 'all'
                  ? 'border-brand-600 bg-brand-50 text-brand-700'
                  : `border-transparent ${LEVEL_ACCENT[group].bg} ${LEVEL_ACCENT[group].text}`,
            ].join(' ')}
          >
            {t(`payments.levelGroup.${group}`)}
          </button>
        ))}
        <span className="text-xs text-ink-600">
          {t('payments.showingCount', { shown: visible.length, total: rows.length })}
        </span>
      </div>

      {visible.length === 0 ? (
        <EmptyState title={t('payments.emptyPaidTitle')} body={t('payments.emptyPaidBody')} />
      ) : (
        <div className="rounded-lg bg-white">
          <Table>
            <thead>
              <tr>
                <Th>{t('payments.learner')}</Th>
                <Th>{t('payments.payer')}</Th>
                <Th>{t('payments.plan')}</Th>
                <Th>{t('payments.billingPeriod')}</Th>
                <Th>{t('payments.method')}</Th>
                <Th numeric>{t('payments.amountPaid')}</Th>
                <Th>{t('payments.paymentDate')}</Th>
                <Th>{t('payments.providerRef')}</Th>
                <Th>{t('payments.invoiceNumber')}</Th>
                <Th>{t('payments.planTypeFull')}</Th>
                <Th>{t('common.filter')}</Th>
              </tr>
            </thead>
            <tbody>
              {visible.map((row) => (
                <Tr key={row.id}>
                  <Td>{row.learner ?? t('common.notRecorded')}</Td>
                  <Td>
                    {row.payer ?? t('common.notRecorded')}
                    <span className="block text-xs text-ink-600">{row.payerPhone}</span>
                  </Td>
                  <Td>
                    {(language === 'fr' ? row.planNameFr : row.planNameEn) ??
                      t('common.notRecorded')}
                    {row.level && (
                      <span className="block text-xs text-ink-600">
                        {language === 'fr' ? row.level.nameFr : row.level.nameEn}
                      </span>
                    )}
                  </Td>
                  <Td>
                    <When value={row.periodStart} dateOnly /> —{' '}
                    <When value={row.periodEnd} dateOnly />
                  </Td>
                  <Td>{t(PAYMENT_METHOD_KEY[row.method] ?? 'common.notRecorded')}</Td>
                  <Td numeric>
                    <Money amount={row.amountXaf} className="font-medium" />
                    {row.refundedXaf !== '0' && (
                      <span className="block text-xs text-danger-600">
                        −<Money amount={row.refundedXaf} />
                      </span>
                    )}
                  </Td>
                  <Td>
                    <When value={row.settledAt} />
                    {row.recordedOffline && (
                      <span className="mt-0.5 block">
                        <StateChip tone="warn">{t('payments.recordOfflinePayment')}</StateChip>
                      </span>
                    )}
                  </Td>
                  {/* CON-03: a provider reference only. No PAN, ever. */}
                  <Td className="font-mono text-xs">{row.providerRef ?? '—'}</Td>
                  <Td className="font-mono text-xs">{row.invoiceNumber ?? '—'}</Td>
                  <Td>
                    {row.planType === 'full'
                      ? t('payments.planTypeFull')
                      : t('payments.instalmentsDone', {
                          done: row.instalmentsDone,
                          total: row.instalmentsTotal,
                        })}
                  </Td>
                  <Td>
                    <div className="flex flex-col gap-1">
                      <button
                        type="button"
                        className="text-left text-xs text-brand-700 underline"
                        disabled={busy}
                        onClick={() => void resend(row)}
                      >
                        {t('payments.resendReceipt')}
                      </button>
                      {/*
                       * Recording a payment is Finance's, like the refund beside
                       * it: both move money and both write to the ledger. Ops
                       * sees these screens read-only (§3).
                       */}
                      {canRefund && row.subscriptionId && row.instalmentsDone < row.instalmentsTotal && (
                        <button
                          type="button"
                          className="text-left text-xs text-brand-600 underline"
                          onClick={() => setRecording(row)}
                        >
                          {t('payments.recordPayment')}
                        </button>
                      )}
                      {canRefund && row.refundedXaf === '0' && (
                        <button
                          type="button"
                          className="text-left text-xs text-danger-600 underline"
                          onClick={() => {
                            setRefunding(row);
                            setReason('');
                          }}
                        >
                          {t('payments.refund')}
                        </button>
                      )}
                    </div>
                  </Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        </div>
      )}

      {recording && (
        <RecordPaymentDialog
          row={recording}
          onClose={() => setRecording(null)}
          onRecorded={(message) => {
            setRecording(null);
            setDone(message);
            void load();
          }}
        />
      )}

      {/* UI-007 / FR-PAY-017: the consequence, in plain language, before commit. */}
      <ConfirmDialog
        open={refunding !== null}
        title={t('payments.refund')}
        consequences={
          refunding
            ? [
                // UI-009: the dialog quotes the sum the way every other figure
                // on this surface is written — "15 000 FCFA", not "15000".
                t('payments.refundConfirm', {
                  amount: formatXaf(BigInt(refunding.amountXaf), language),
                  payer: refunding.payer ?? '',
                }),
              ]
            : []
        }
        confirmLabel={t('payments.refund')}
        destructive
        busy={busy}
        confirmDisabled={!reason.trim()}
        onConfirm={() => void refund()}
        onCancel={() => {
          setRefunding(null);
          setReason('');
        }}
      >
        <ReasonField
          label={t('payments.refundReason')}
          value={reason}
          onChange={setReason}
          hint={t('payments.financeOnly')}
        />
      </ConfirmDialog>
    </>
  );
}
