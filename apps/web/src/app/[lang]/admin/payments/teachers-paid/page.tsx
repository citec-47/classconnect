'use client';

import { useCallback, useEffect, useState } from 'react';
import { useI18n } from '@/lib/i18n';
import { useAutoRecover } from '@/lib/use-auto-recover';
import { api, type ApiError } from '@/lib/api';
import { ErrorAlert, EmptyState } from '@/components/Alert';
import {
  ExportButton,
  Money,
  PageHeader,
  StateChip,
  Table,
  Td,
  Th,
  Tr,
  When,
} from '@/components/admin/ui';
import { PAYMENT_METHOD_KEY } from '@/components/admin/labels';
import { EarningsExplainer } from '@/components/admin/EarningsExplainer';

/**
 * §4.7.3 — teachers paid.
 *
 * "Every figure links through to the underlying sessions that produced it. A
 * teacher must be able to ask 'why this number?' and support must be able to
 * answer in two clicks." The net-paid cell is the first click; the explainer
 * panel is the second.
 */

interface PaidRow {
  id: string;
  teacherId: string;
  teacherName: string;
  period: string | null;
  attendedMinutes: number;
  grossXaf: string;
  providerFeeXaf: string;
  taxWithheldXaf: string;
  netPaidXaf: string;
  method: string;
  walletMasked: string | null;
  providerRef: string | null;
  approvedBy: string | null;
  approvedAt: string | null;
  paidAt: string | null;
  status: string;
  earningId: string | null;
  configVersion: string | null;
}

export default function TeachersPaid() {
  const { language, t } = useI18n();

  const [rows, setRows] = useState<PaidRow[] | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [explaining, setExplaining] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      setRows(await api<PaidRow[]>('/admin/earnings/payouts/paid', { language }));
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

  if (rows === null) {
    return (
      <>
        <PageHeader title={t('payments.teachersPaidTitle')} />
        <p className="text-ink-600">{t('common.loading')}</p>
      </>
    );
  }

  return (
    <>
      <PageHeader
        title={t('payments.teachersPaidTitle')}
        actions={<ExportButton dataset="teachers-paid" />}
      />
      <ErrorAlert error={error} />

      {rows.length === 0 ? (
        <EmptyState title={t('payments.emptyPaidTitle')} body={t('payments.emptyPaidBody')} />
      ) : (
        <div className="rounded-lg bg-white">
          <Table>
            <thead>
              <tr>
                <Th>{t('payments.teacher')}</Th>
                <Th>{t('payments.period')}</Th>
                <Th numeric>{t('payments.attendedMinutes')}</Th>
                <Th numeric>{t('payments.grossEarnings')}</Th>
                <Th numeric>{t('payments.providerFee')}</Th>
                <Th numeric>{t('payments.taxWithheld')}</Th>
                <Th numeric>{t('payments.netPaid')}</Th>
                <Th>{t('payments.payoutMethod')}</Th>
                <Th>{t('payments.providerRef')}</Th>
                <Th>{t('payments.approvedBy')}</Th>
                <Th>{t('payments.paidAt')}</Th>
                <Th>{t('payments.whyThisNumber')}</Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <Tr key={row.id}>
                  <Td>{row.teacherName}</Td>
                  <Td className="tabular-nums">{row.period ?? '—'}</Td>
                  <Td numeric>{row.attendedMinutes}</Td>
                  <Td numeric>
                    <Money amount={row.grossXaf} />
                  </Td>
                  <Td numeric>
                    <Money amount={row.providerFeeXaf} />
                  </Td>
                  <Td numeric>
                    <Money amount={row.taxWithheldXaf} />
                  </Td>
                  <Td numeric>
                    <Money amount={row.netPaidXaf} className="font-semibold" />
                  </Td>
                  <Td>
                    {t(PAYMENT_METHOD_KEY[row.method] ?? 'common.notRecorded')}
                    {/* NFR-SEC-003 / CON-03: last four only, never the wallet. */}
                    <span className="block font-mono text-xs text-ink-600">
                      {row.walletMasked ?? '—'}
                    </span>
                  </Td>
                  <Td className="font-mono text-xs">{row.providerRef ?? '—'}</Td>
                  <Td>{row.approvedBy ?? t('audit.system')}</Td>
                  <Td>
                    <When value={row.paidAt ?? row.approvedAt} />
                    <span className="mt-0.5 block">
                      <StateChip tone={row.status === 'paid' ? 'good' : 'warn'}>
                        {row.status}
                      </StateChip>
                    </span>
                  </Td>
                  <Td>
                    {row.earningId && (
                      <button
                        type="button"
                        className="text-left text-xs text-brand-700 underline"
                        onClick={() => setExplaining(row.earningId)}
                      >
                        {t('payments.sessionsBehind')}
                      </button>
                    )}
                  </Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        </div>
      )}

      {explaining && (
        <EarningsExplainer earningId={explaining} onClose={() => setExplaining(null)} />
      )}
    </>
  );
}
