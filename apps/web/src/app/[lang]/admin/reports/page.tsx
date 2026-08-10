'use client';

import { useCallback, useEffect, useState } from 'react';
import { useI18n } from '@/lib/i18n';
import { useAutoRecover } from '@/lib/use-auto-recover';
import { api, type ApiError } from '@/lib/api';
import { ErrorAlert } from '@/components/Alert';
import { ExportButton, Money, PageHeader, Stat, Table, Td, Th, Tr } from '@/components/admin/ui';

/**
 * §6 — Reports.
 *
 * The FR-RPT-003/004 dashboards in full, filterable and exportable (FR-RPT-005).
 * FR-RPT-006 requires these to come from a read replica; the API note says where
 * that seam is, and until a replica is provisioned this reads the primary — a
 * deployment gap rather than a hidden one, which is why the note is on the page.
 */

interface Reports {
  operational: Record<string, number | null>;
  money: {
    grossRevenueXaf: string;
    refundsXaf: string;
    teacherPoolAccruedXaf: string;
    payoutsMadeXaf: string;
    payoutsPayableXaf: string;
    unreconciledValueXaf: string;
    revenueByPlan: { plan: string; amountXaf: string }[];
    paymentSuccessByMethod: {
      method: string;
      attempted: number;
      succeeded: number;
      ratePercent: number | null;
    }[];
  };
}

const DATASETS = [
  'students-paid',
  'students-owing',
  'teachers-paid',
  'teachers-pending',
  'earnings',
  'audit',
] as const;

export default function ReportsScreen() {
  const { language, t } = useI18n();

  const [data, setData] = useState<Reports | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [range, setRange] = useState({ from: '', to: '' });

  const load = useCallback(async () => {
    setError(null);
    try {
      setData(await api<Reports>('/admin/reports', { language }));
    } catch (caught) {
      setError(caught as ApiError);
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

  return (
    <>
      <PageHeader title={t('reports.title')} description={t('reports.readReplicaNote')} />
      <ErrorAlert error={error} />

      <div className="mb-4 flex flex-wrap items-end gap-3 rounded-lg border border-ink-300 bg-white p-3">
        <div>
          <label className="cc-label" htmlFor="report-from">
            {t('reports.from')}
          </label>
          <input
            id="report-from"
            type="date"
            className="cc-field !min-h-0 !w-auto !py-1.5 text-sm"
            value={range.from}
            onChange={(event) => setRange((r) => ({ ...r, from: event.target.value }))}
          />
        </div>
        <div>
          <label className="cc-label" htmlFor="report-to">
            {t('reports.to')}
          </label>
          <input
            id="report-to"
            type="date"
            className="cc-field !min-h-0 !w-auto !py-1.5 text-sm"
            value={range.to}
            onChange={(event) => setRange((r) => ({ ...r, to: event.target.value }))}
          />
        </div>
      </div>

      {!data ? (
        <p className="text-ink-600">{t('common.loading')}</p>
      ) : (
        <>
          <section className="mb-6">
            <h2 className="mb-2 text-sm font-semibold text-ink-900">{t('overview.operational')}</h2>
            <dl className="grid grid-cols-2 gap-2 md:grid-cols-3 xl:grid-cols-5">
              {Object.entries(data.operational).map(([key, value]) => (
                <Stat
                  key={key}
                  label={t(`overview.metric.${metricKey(key)}`)}
                  value={value ?? t('common.notRecorded')}
                />
              ))}
            </dl>
          </section>

          <section className="mb-6">
            <h2 className="mb-2 text-sm font-semibold text-ink-900">{t('overview.money')}</h2>
            <dl className="grid grid-cols-2 gap-2 md:grid-cols-3 xl:grid-cols-4">
              <Stat
                label={t('overview.metric.grossRevenue')}
                value={<Money amount={data.money.grossRevenueXaf} />}
              />
              <Stat
                label={t('overview.metric.refunds')}
                value={<Money amount={data.money.refundsXaf} />}
              />
              <Stat
                label={t('overview.metric.teacherPoolAccrued')}
                value={<Money amount={data.money.teacherPoolAccruedXaf} />}
              />
              <Stat
                label={t('overview.metric.payoutsMade')}
                value={<Money amount={data.money.payoutsMadeXaf} />}
              />
              <Stat
                label={t('overview.metric.payoutsPayable')}
                value={<Money amount={data.money.payoutsPayableXaf} />}
              />
              <Stat
                label={t('overview.metric.unreconciled')}
                value={<Money amount={data.money.unreconciledValueXaf} />}
              />
            </dl>
          </section>

          {/* FR-RPT-005: every table exportable. */}
          <section>
            <h2 className="mb-2 text-sm font-semibold text-ink-900">{t('reports.exportCsv')}</h2>
            <div className="rounded-lg bg-white">
              <Table>
                <thead>
                  <tr>
                    <Th>{t('audit.entity')}</Th>
                    <Th>{t('reports.exportCsv')}</Th>
                  </tr>
                </thead>
                <tbody>
                  {DATASETS.map((dataset) => (
                    <Tr key={dataset}>
                      <Td className="font-mono text-xs">{dataset}</Td>
                      <Td>
                        <ExportButton dataset={dataset} query={range} />
                      </Td>
                    </Tr>
                  ))}
                </tbody>
              </Table>
            </div>
          </section>
        </>
      )}
    </>
  );
}

/**
 * The API returns `sessionsScheduledToday`; the catalogue key is
 * `sessionsScheduled`, because the label already says "today". Mapping here
 * rather than renaming the field keeps the wire contract stable.
 */
function metricKey(key: string): string {
  return key
    .replace(/Today$/, '')
    .replace(/RatePercent$/, 'Rate')
    .replace(/PerWeek$/, '')
    .replace(/AttainmentPercent$/, '');
}
