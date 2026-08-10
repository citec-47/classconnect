'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { formatXaf } from '@classconnect/shared';
import { useI18n } from '@/lib/i18n';
import { useAutoRecover } from '@/lib/use-auto-recover';
import { api, type ApiError } from '@/lib/api';
import { ErrorAlert } from '@/components/Alert';
import { Money, PageHeader, Stat } from '@/components/admin/ui';

/**
 * §4.1 — the overview.
 *
 * "Answers 'what needs me right now?' in one screen. No vanity metrics above
 * the fold." The action strip is first and every tile links into its queue; the
 * operational and money rows sit below it; alerts are last because they are
 * exceptions rather than the daily work.
 */

interface Overview {
  actionStrip: Record<string, number | null>;
  operational: {
    activeLearners: number;
    activeTeachers: number;
    sessionsScheduledToday: number;
    sessionsDeliveredToday: number;
    sessionsCancelledToday: number;
    teacherNoShowRatePercent: number;
    learnerNoShowRatePercent: number;
    verificationThroughputPerWeek: number;
    supportSlaAttainmentPercent: number | null;
  };
  money: {
    period: string;
    grossRevenueXaf: string;
    refundsXaf: string;
    revenueByPlan: { plan: string; amountXaf: string }[];
    paymentSuccessByMethod: {
      method: string;
      attempted: number;
      succeeded: number;
      ratePercent: number | null;
    }[];
    teacherPoolAccruedXaf: string;
    payoutsMadeXaf: string;
    payoutsPayableXaf: string;
    unreconciledCount: number;
    unreconciledValueXaf: string;
    churnRatePercent: number | null;
  };
  alerts: {
    key: string;
    severity: 'warning' | 'danger';
    messageKey: string;
    params: Record<string, string | number>;
    href?: string;
  }[];
}

/**
 * UI-009: an alert that quotes a sum quotes it as "15 000 FCFA", like every
 * other figure on the surface. The API sends raw whole francs as a string
 * (CON-02 — a franc total must not travel as a JSON number), so the formatting
 * happens here, where the viewer's language is known.
 */
function formatMoneyParams(
  params: Record<string, string | number>,
  language: 'en' | 'fr',
): Record<string, string | number> {
  const MONETARY = new Set(['value', 'amount', 'minimum']);
  return Object.fromEntries(
    Object.entries(params).map(([key, value]) =>
      MONETARY.has(key) && /^\d+$/.test(String(value))
        ? [key, formatXaf(BigInt(String(value)), language)]
        : [key, value],
    ),
  );
}

/** §4.1: each tile is a link into its queue with its live count. */
const TILES: { key: string; href: string; danger?: boolean }[] = [
  { key: 'teachersAwaitingVerification', href: '/approvals/teachers' },
  { key: 'studentsAwaitingApproval', href: '/approvals/students' },
  { key: 'unassignedTickets', href: '/support' },
  { key: 'safeguardingOpen', href: '/safeguarding', danger: true },
  { key: 'paymentsPendingReconciliation', href: '/payments/reconciliation' },
  { key: 'autoFrozen24h', href: '/payments/students-owing?state=frozen' },
];

export default function AdminOverview() {
  const { language, t } = useI18n();
  const params = useParams<{ lang: string }>();
  const base = `/${params.lang}/admin`;

  const [data, setData] = useState<Overview | null>(null);
  const [error, setError] = useState<ApiError | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      setData(await api<Overview>('/admin/dashboard/overview', { language }));
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

  if (!data) {
    return (
      <>
        <PageHeader title={t('overview.title')} />
        <ErrorAlert error={error} />
        {!error && <p className="text-ink-600">{t('common.loading')}</p>}
      </>
    );
  }

  const { actionStrip, operational, money, alerts } = data;

  return (
    <>
      <PageHeader title={t('overview.title')} />
      <ErrorAlert error={error} />

      {/* Action strip — what needs a person today. */}
      <section aria-labelledby="needs-you" className="mb-6">
        <h2 id="needs-you" className="mb-2 text-sm font-semibold text-ink-900">
          {t('overview.needsYouNow')}
        </h2>
        <div className="grid grid-cols-2 gap-2 md:grid-cols-3 xl:grid-cols-6">
          {TILES.map((tile) => {
            const count = actionStrip[tile.key];
            // A queue this admin cannot see returns null rather than 0, so the
            // tile is absent rather than misreporting an empty queue.
            if (count === null || count === undefined) return null;

            return (
              <a
                key={tile.key}
                href={`${base}${tile.href}`}
                className={[
                  'rounded-lg border bg-white px-3 py-2.5 transition-colors',
                  tile.danger && count > 0
                    ? 'border-danger-600 hover:bg-danger-50'
                    : 'border-ink-300 hover:border-brand-600 hover:bg-brand-50',
                ].join(' ')}
              >
                <span
                  className={[
                    'block text-2xl font-semibold tabular-nums',
                    tile.danger && count > 0 ? 'text-danger-600' : 'text-ink-900',
                  ].join(' ')}
                >
                  {count}
                </span>
                <span className="mt-0.5 block text-xs leading-snug text-ink-600">
                  {t(`overview.tile.${tile.key}`)}
                </span>
              </a>
            );
          })}
        </div>
      </section>

      {/* FR-RPT-003 */}
      <section aria-labelledby="operational" className="mb-6">
        <h2 id="operational" className="mb-2 text-sm font-semibold text-ink-900">
          {t('overview.operational')}
        </h2>
        <dl className="grid grid-cols-2 gap-2 bg-white md:grid-cols-3 xl:grid-cols-5">
          <Stat label={t('overview.metric.activeLearners')} value={operational.activeLearners} />
          <Stat label={t('overview.metric.activeTeachers')} value={operational.activeTeachers} />
          <Stat
            label={t('overview.metric.sessionsScheduled')}
            value={operational.sessionsScheduledToday}
          />
          <Stat
            label={t('overview.metric.sessionsDelivered')}
            value={operational.sessionsDeliveredToday}
          />
          <Stat
            label={t('overview.metric.sessionsCancelled')}
            value={operational.sessionsCancelledToday}
          />
          <Stat
            label={t('overview.metric.teacherNoShowRate')}
            value={operational.teacherNoShowRatePercent}
            suffix="%"
          />
          <Stat
            label={t('overview.metric.learnerNoShowRate')}
            value={operational.learnerNoShowRatePercent}
            suffix="%"
          />
          <Stat
            label={t('overview.metric.verificationThroughput')}
            value={operational.verificationThroughputPerWeek}
          />
          <Stat
            label={t('overview.metric.supportSla')}
            value={operational.supportSlaAttainmentPercent ?? t('common.notRecorded')}
            suffix={operational.supportSlaAttainmentPercent === null ? undefined : '%'}
          />
        </dl>
      </section>

      {/* FR-RPT-004 */}
      <section aria-labelledby="money" className="mb-6">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <h2 id="money" className="text-sm font-semibold text-ink-900">
            {t('overview.money')}
          </h2>

          {/*
           * A direct way into the fee roster.
           *
           * The tiles above are queue counts — work waiting to be done — and the
           * fee roster is not a queue; it is the register an operator opens to
           * answer "what has this student paid?". It does not belong among
           * counts, but it should not be three clicks into a collapsed menu
           * either, because it is the most-opened screen in Money.
           */}
          <a
            href={`${base}/payments/students-fees`}
            className="inline-flex min-h-touch items-center gap-2 rounded-lg bg-brand-600 px-3 text-sm font-medium text-white transition-colors hover:bg-brand-700"
          >
            {t('adminNav.studentsFees')}
            <span aria-hidden="true">→</span>
          </a>
        </div>
        <dl className="grid grid-cols-2 gap-2 bg-white md:grid-cols-3 xl:grid-cols-4">
          <Stat
            label={t('overview.metric.grossRevenue')}
            value={<Money amount={money.grossRevenueXaf} />}
          />
          <Stat label={t('overview.metric.refunds')} value={<Money amount={money.refundsXaf} />} />
          <Stat
            label={t('overview.metric.teacherPoolAccrued')}
            value={<Money amount={money.teacherPoolAccruedXaf} />}
          />
          <Stat
            label={t('overview.metric.payoutsMade')}
            value={<Money amount={money.payoutsMadeXaf} />}
          />
          <Stat
            label={t('overview.metric.payoutsPayable')}
            value={<Money amount={money.payoutsPayableXaf} />}
            href={`${base}/payments/teachers-pending`}
          />
          <Stat
            label={t('overview.metric.unreconciled')}
            value={money.unreconciledCount}
            href={`${base}/payments/reconciliation`}
          />
          <Stat
            label={t('overview.metric.churn')}
            value={money.churnRatePercent ?? t('common.notRecorded')}
            suffix={money.churnRatePercent === null ? undefined : '%'}
          />
        </dl>

        <div className="mt-3 grid gap-3 md:grid-cols-2">
          <div className="rounded-lg border border-ink-300 bg-white p-3">
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-600">
              {t('overview.revenueByPlan')}
            </h3>
            {money.revenueByPlan.length === 0 ? (
              <p className="text-sm text-ink-600">{t('common.none')}</p>
            ) : (
              <ul className="flex flex-col gap-1 text-sm">
                {money.revenueByPlan.map((row) => (
                  <li key={row.plan} className="flex justify-between gap-3">
                    <span className="text-ink-600">{row.plan}</span>
                    <Money amount={row.amountXaf} className="font-medium" />
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="rounded-lg border border-ink-300 bg-white p-3">
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-600">
              {t('overview.revenueByMethod')}
            </h3>
            {money.paymentSuccessByMethod.length === 0 ? (
              <p className="text-sm text-ink-600">{t('common.none')}</p>
            ) : (
              <ul className="flex flex-col gap-1 text-sm">
                {money.paymentSuccessByMethod.map((row) => (
                  <li key={row.method} className="flex justify-between gap-3">
                    <span className="text-ink-600">
                      {t(
                        `payments.method${row.method
                          .split('_')
                          .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
                          .join('')}`,
                      )}
                    </span>
                    <span className="tabular-nums">
                      {row.ratePercent === null ? '—' : `${row.ratePercent}%`}
                      <span className="ml-1 text-ink-600">
                        ({row.succeeded}/{row.attempted})
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </section>

      {/* §4.1 alerts panel */}
      <section aria-labelledby="alerts">
        <h2 id="alerts" className="mb-2 text-sm font-semibold text-ink-900">
          {t('overview.alerts')}
        </h2>
        {alerts.length === 0 ? (
          // UI-008: an empty state that says what would appear here.
          <div className="rounded-lg border border-ink-300 bg-white p-4">
            <p className="text-sm font-medium text-ink-900">{t('overview.noAlertsTitle')}</p>
            <p className="mt-0.5 text-sm text-ink-600">{t('overview.noAlertsBody')}</p>
          </div>
        ) : (
          <ul className="flex flex-col gap-2">
            {alerts.map((alert) => (
              <li key={alert.key}>
                <a
                  href={alert.href ? `${base}${alert.href}` : undefined}
                  className={[
                    'flex items-start gap-2 rounded-lg border bg-white p-3 text-sm',
                    alert.href ? 'hover:bg-ink-100/60' : '',
                    alert.severity === 'danger'
                      ? 'border-danger-600 text-danger-600'
                      : 'border-warning-600 text-warning-600',
                  ].join(' ')}
                >
                  <span aria-hidden="true">⚠</span>
                  <span className="font-medium">
                    {t(alert.messageKey, formatMoneyParams(alert.params, language))}
                  </span>
                </a>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
