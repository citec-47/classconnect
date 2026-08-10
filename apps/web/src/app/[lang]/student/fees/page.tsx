'use client';

import type { FeeStageDto, LearnerFeesDto } from '@classconnect/shared';
import { useI18n } from '@/lib/i18n';
import { useStudent } from '@/lib/student-context';
import { useCachedApi } from '@/lib/use-cached-api';
import { fullDate } from '@/lib/student-format';
import { PageTitle, ScreenState, SectionHeading } from '@/components/student/ui';

/**
 * Fees.
 *
 * Redesigned around the question the reader actually has, which is not "what is
 * my status" but **"how much is left, and when is it due?"**. So the headline is
 * the outstanding amount, the progress bar shows how far through the plan they
 * are, and each part carries its own figure and date.
 *
 * The previous version led with a stage name and no numbers at all. That was a
 * deliberate reading of FR-PAY-003 — a bill is the payer's business, and a child
 * should not be handed one they cannot act on. It stops making sense once
 * guardians sign in through the learner's account, because then the rule
 * guarantees the *payer* never sees what they owe.
 *
 * The copy still names whose responsibility the money is, so a child reading
 * their own screen is not left feeling it is theirs to solve.
 */
export default function StudentFees() {
  const { t, language } = useI18n();
  const { config } = useStudent();
  const { data, loading, error, refresh } = useCachedApi<LearnerFeesDto | null>('/learner/fees', {
    language,
  });

  if (!config) return null;
  const large = config.typeScale === 'large';

  const stages = data?.stages ?? [];
  const notices = data?.notices ?? [];
  const paid = data?.paidXaf ?? 0;
  const total = data?.totalXaf ?? 0;
  const outstanding = data?.outstandingXaf ?? 0;
  const percent = total > 0 ? Math.round((paid / total) * 100) : 0;

  return (
    <>
      <PageTitle large={large}>{t('student.fees.title')}</PageTitle>

      <ScreenState
        loading={loading}
        error={error}
        isEmpty={!data || stages.length === 0}
        emptyTitle={t('student.fees.none')}
        emptyBody={t('student.fees.noneBody')}
        onRetry={() => void refresh()}
      >
        {data && stages.length > 0 && (
          <>
            {/* The headline: what is left, not what stage this is. */}
            <section className="rounded-2xl border border-brand-100 bg-brand-50 p-4">
              <p className="text-sm text-brand-700">
                {outstanding > 0 ? t('student.fees.stillToPay') : t('student.fees.allPaid')}
              </p>
              <p className="mt-0.5 font-display text-3xl font-semibold tabular-nums text-brand-700">
                {formatXaf(outstanding)}
              </p>

              <div className="mt-3">
                <div
                  role="progressbar"
                  aria-valuenow={percent}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-label={t('student.fees.progressLabel')}
                  className="h-2 w-full overflow-hidden rounded-full bg-white"
                >
                  <div
                    className="h-full rounded-full bg-brand-600 transition-[width]"
                    style={{ width: `${percent}%` }}
                  />
                </div>
                {/* The bar is decorative; the sentence carries the same fact. */}
                <p className="mt-1.5 text-xs text-brand-700">
                  {t('student.fees.paidOfTotal', {
                    paid: formatXaf(paid),
                    total: formatXaf(total),
                  })}
                </p>
              </div>

              <p className="mt-3 text-sm text-ink-700">
                {data.payer === 'guardian'
                  ? t('student.fees.guardianHandles')
                  : data.planType === 'full'
                    ? t('student.fees.payInFull')
                    : t('student.fees.threeInstalments')}
              </p>
            </section>

            <section className="space-y-2">
              <SectionHeading count={stages.length}>
                {t('student.fees.thePlan')}
              </SectionHeading>
              <ol className="space-y-2">
                {stages.map((stage) => (
                  <StageRow key={stage.sequence} stage={stage} />
                ))}
              </ol>
            </section>

            {notices.length > 0 && (
              <section className="space-y-2">
                <SectionHeading>{t('student.fees.updates')}</SectionHeading>
                <ul className="space-y-2">
                  {notices.map((notice) => (
                    <li
                      key={notice.id}
                      className="rounded-xl border-l-4 border-ink-300 border-l-brand-600 bg-white p-3.5"
                    >
                      <p className="text-sm text-ink-900">
                        {t(`notifications.${notice.eventType}.body`, {
                          ...notice.params,
                          ...(notice.params.stage
                            ? { stage: t(`payments.stage.${String(notice.params.stage)}`) }
                            : {}),
                        })}
                      </p>
                      <p className="mt-1 text-xs text-ink-600">
                        {fullDate(new Date(notice.at), language)}
                      </p>
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </>
        )}
      </ScreenState>
    </>
  );
}

function StageRow({ stage }: { stage: FeeStageDto }) {
  const { t, language } = useI18n();

  const paid = stage.state === 'paid';
  const overdue = stage.state === 'overdue';
  const due = stage.state === 'due';

  return (
    <li
      className={[
        'flex items-center gap-3 rounded-xl border bg-white p-3.5',
        overdue ? 'border-danger-600' : due ? 'border-brand-600' : 'border-ink-300',
      ].join(' ')}
    >
      {/*
       * A tick when settled, the numeral otherwise. "Part 2 of 3" is the whole
       * mental model, and it survives being read by someone who cannot read the
       * rest of the card.
       */}
      <span
        aria-hidden="true"
        className={[
          'flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-semibold',
          paid ? 'bg-success-600 text-white' : due || overdue ? 'bg-brand-50 text-brand-700' : 'bg-ink-100 text-ink-600',
        ].join(' ')}
      >
        {paid ? '✓' : stage.sequence}
      </span>

      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-ink-900">
          {t('student.fees.stage', { number: stage.sequence })}
        </p>
        <p className="truncate text-xs text-ink-600">
          {stage.paidOn
            ? t('student.fees.paidOn', { date: fullDate(new Date(stage.paidOn), language) })
            : stage.dueOn
              ? t('student.fees.dueOn', { date: fullDate(new Date(stage.dueOn), language) })
              : ''}
        </p>
      </div>

      <div className="shrink-0 text-right">
        {stage.amountXaf !== undefined && (
          <p
            className={[
              'text-sm font-semibold tabular-nums',
              paid ? 'text-ink-600 line-through' : 'text-ink-900',
            ].join(' ')}
          >
            {formatXaf(stage.amountXaf)}
          </p>
        )}
        <p
          className={[
            'text-xs',
            paid ? 'text-success-600' : overdue ? 'text-danger-600' : 'text-ink-600',
          ].join(' ')}
        >
          {t(`student.fees.stage${capitalise(stage.state)}`)}
        </p>
      </div>
    </li>
  );
}

/** UI-009: whole XAF, thousands separated, `FCFA` suffix. Never a decimal. */
function formatXaf(amount: number): string {
  return `${amount.toLocaleString('fr-FR').replace(/\u202f|\u00a0/g, ' ')} FCFA`;
}

function capitalise(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}
