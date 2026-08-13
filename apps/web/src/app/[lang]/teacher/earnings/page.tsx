'use client';

import { useI18n } from '@/lib/i18n';
import { useCachedApi } from '@/lib/use-cached-api';
import { PageHeader } from '@/components/admin/ui';
import { EmptyState } from '@/components/Alert';
import { TeacherGate } from '@/components/teacher/TeacherGate';

interface EarningPeriod {
  id: string;
  period: string;
  attendedMinutes: number;
  oneToOneMinutes: number;
  groupMinutes: number;
  amountXaf: string;
  deductionsXaf: string;
  netPayableXaf: string;
  paidOut: boolean;
}

interface Earnings {
  periods: EarningPeriod[];
  totals: {
    grossXaf: string;
    deductionsXaf: string;
    netPayableXaf: string;
    awaitingPayoutXaf: string;
    attendedMinutes: number;
  };
  /**
   * The brief's daily, weekly and monthly figures.
   *
   * Deliberately a separate object from `totals`, and labelled *indicative* on
   * screen. `totals` comes from `Earning` rows, which are Finance's periodic
   * distribution of a revenue pool; this is teaching done since midnight, this
   * week and this month, valued at the admin's hourly rate. Merging the two into
   * one number would answer "when do I get paid" wrongly.
   */
  accrual: {
    hourlyRateXaf: number;
    minSessionMinutes: number;
    indicative: {
      today: { minutes: number; xaf: string };
      thisWeek: { minutes: number; xaf: string };
      thisMonth: { minutes: number; xaf: string };
    };
    qualifyingSessions: number;
    belowFloorSessions: number;
  };
}

/**
 * Amounts arrive as strings because they are BigInt on the wire.
 *
 * Formatted with grouping and no decimals: XAF has no minor unit, so a
 * "1 500,00" would be inventing centimes the currency does not have.
 */
function xaf(amount: string, language: string): string {
  const value = Number(amount);
  const formatted = Number.isSafeInteger(value)
    ? value.toLocaleString(language === 'fr' ? 'fr-CM' : 'en-CM')
    : amount;
  return `${formatted} XAF`;
}

/** Minutes read as hours once there are enough of them to bother. */
function hours(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  return `${Math.floor(minutes / 60)} h ${minutes % 60 ? `${minutes % 60} min` : ''}`.trim();
}

/**
 * FR-ERN-006: what this teacher has earned, and what is still to come.
 *
 * Read-only, and it says which figures are settled and which are not — a
 * teacher's actual question is "when do I get paid", and a single total that
 * silently mixes accrued and paid answers it wrongly.
 */
function TeacherEarningsPage() {
  const { t, language } = useI18n();
  const { data, loading } = useCachedApi<Earnings>('/teacher/earnings', { language });

  if (loading && !data) {
    return (
      <>
        <PageHeader
          title={t('teacherNav.earnings')}
          description={t('teacher.earnings.description')}
        />
        <div className="h-32 animate-pulse rounded-xl bg-ink-100" />
      </>
    );
  }

  const totals = data?.totals;
  const periods = data?.periods ?? [];

  return (
    <>
      <PageHeader
        title={t('teacherNav.earnings')}
        description={t('teacher.earnings.description')}
      />

      <div className="mb-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Tile label={t('teacher.earnings.net')} value={xaf(totals?.netPayableXaf ?? '0', language)} tone="success" />
        <Tile
          label={t('teacher.earnings.awaiting')}
          value={xaf(totals?.awaitingPayoutXaf ?? '0', language)}
          tone="warning"
        />
        <Tile label={t('teacher.earnings.gross')} value={xaf(totals?.grossXaf ?? '0', language)} tone="brand" />
        <Tile label={t('teacher.earnings.taught')} value={hours(totals?.attendedMinutes ?? 0)} tone="clay" />
      </div>

      {/*
       * The brief's daily, weekly and monthly figures.
       *
       * Its own section, under its own heading, because these are *not* the same
       * kind of number as the tiles above. Those are settled amounts from
       * Finance's period calculation; these are teaching done, valued at the
       * admin's hourly rate, before anyone has run a period. A teacher who
       * confuses the two expects money on a date it will not arrive.
       */}
      {data?.accrual && (
        <section className="mb-4 rounded-xl border border-ink-200 bg-white p-4">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="font-display text-base font-semibold text-ink-900">
              {t('teacher.earnings.accrualTitle')}
            </h2>
            <p className="text-xs text-ink-600">
              {t('teacher.earnings.rate', {
                rate: data.accrual.hourlyRateXaf.toLocaleString(
                  language === 'fr' ? 'fr-CM' : 'en-CM',
                ),
              })}
            </p>
          </div>
          <p className="mt-1 max-w-prose text-sm text-ink-600">
            {t('teacher.earnings.accrualHint', { minutes: data.accrual.minSessionMinutes })}
          </p>

          <div className="mt-3 grid gap-3 sm:grid-cols-3">
            {(['today', 'thisWeek', 'thisMonth'] as const).map((window) => (
              <div key={window} className="rounded-lg border border-ink-200 p-3">
                <p className="text-xs font-medium uppercase tracking-wide text-ink-500">
                  {t(`teacher.earnings.window.${window}`)}
                </p>
                <p className="mt-1 text-2xl font-semibold tabular-nums text-ink-900">
                  {xaf(data.accrual.indicative[window].xaf, language)}
                </p>
                <p className="text-xs text-ink-600">
                  {hours(data.accrual.indicative[window].minutes)}
                </p>
              </div>
            ))}
          </div>

          {/*
           * Why a figure is lower than expected, rather than leaving the teacher
           * to conclude the platform lost their hours.
           */}
          {data.accrual.belowFloorSessions > 0 && (
            <p className="mt-2 text-xs text-ink-600">
              {t('teacher.earnings.belowFloor', {
                count: data.accrual.belowFloorSessions,
                minutes: data.accrual.minSessionMinutes,
              })}
            </p>
          )}
        </section>
      )}

      {periods.length === 0 ? (
        <EmptyState
          title={t('teacher.earnings.emptyTitle')}
          body={t('teacher.earnings.emptyBody')}
        />
      ) : (
        /* Wide on a phone, so it scrolls inside its own container. */
        <div className="overflow-x-auto rounded-xl border border-ink-200 bg-white">
          <table className="w-full min-w-[40rem] text-sm">
            <thead className="border-b border-ink-200 text-left text-xs uppercase tracking-wide text-ink-500">
              <tr>
                <th className="px-3 py-2 font-medium">{t('teacher.earnings.period')}</th>
                <th className="px-3 py-2 font-medium">{t('teacher.earnings.taught')}</th>
                <th className="px-3 py-2 text-right font-medium">{t('teacher.earnings.gross')}</th>
                <th className="px-3 py-2 text-right font-medium">
                  {t('teacher.earnings.deductions')}
                </th>
                <th className="px-3 py-2 text-right font-medium">{t('teacher.earnings.net')}</th>
                <th className="px-3 py-2 font-medium">{t('teacher.earnings.state')}</th>
              </tr>
            </thead>
            <tbody>
              {periods.map((row) => (
                <tr key={row.id} className="border-b border-ink-100 last:border-0">
                  <td className="px-3 py-2 font-medium tabular-nums text-ink-900">{row.period}</td>
                  <td className="px-3 py-2 text-ink-600">{hours(row.attendedMinutes)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {xaf(row.amountXaf, language)}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums text-ink-600">
                    {xaf(row.deductionsXaf, language)}
                  </td>
                  <td className="px-3 py-2 text-right font-medium tabular-nums text-ink-900">
                    {xaf(row.netPayableXaf, language)}
                  </td>
                  <td className="px-3 py-2">
                    <span
                      className={`cc-badge ${
                        row.paidOut
                          ? 'bg-success-50 text-success-600'
                          : 'bg-warning-50 text-warning-600'
                      }`}
                    >
                      {t(row.paidOut ? 'teacher.earnings.paid' : 'teacher.earnings.pending')}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="mt-3 text-xs text-ink-600">{t('teacher.earnings.footnote')}</p>
    </>
  );
}

function Tile({
  label,
  value,
  tone = 'brand',
}: {
  label: string;
  value: string;
  tone?: 'brand' | 'clay' | 'success' | 'warning';
}) {
  return (
    <div className="cc-tile pl-5" data-tone={tone}>
      <p className="text-xs font-medium uppercase tracking-wide text-ink-500">{label}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums text-ink-900">{value}</p>
    </div>
  );
}

/**
 * Closed until an Admin approves the application (FR-TVR-005).
 *
 * The gate wraps the screen rather than living inside it, so the component above
 * never renders — and therefore never fires the API calls that would 403 — while
 * the teacher is unapproved. See `TeacherGate`.
 */
export default function Page() {
  return (
    <TeacherGate titleKey="teacherNav.earnings">
      <TeacherEarningsPage />
    </TeacherGate>
  );
}
