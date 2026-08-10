'use client';

import { useEffect, useState } from 'react';
import { useI18n } from '@/lib/i18n';
import { api, type ApiError } from '@/lib/api';
import { ErrorAlert } from '@/components/Alert';
import { Money, Table, Td, Th, Tr, When } from './ui';

/**
 * §4.7.3 / FR-ERN-006 — "why this number?", answered.
 *
 * The second of the two clicks the brief allows support. Shows the pool the
 * figure came out of, each learner's contribution to it, and every session
 * behind those minutes with the attendance the media server recorded
 * (FR-LIV-014 — never the teacher's own account of it).
 */

interface Explanation {
  earningId: string;
  teacherName: string;
  period: string;
  configVersion: string;
  poolXaf: string | null;
  recognisedRevenueXaf: string | null;
  grossXaf: string;
  deductionsXaf: string;
  netPayableXaf: string;
  perLearner: {
    learnerId: string;
    learnerName: string | null;
    amountXaf: string;
    attendedMinutes: number;
  }[];
  sessions: {
    id: string;
    startsAtUtc: string;
    durationMin: number;
    type: 'one_to_one' | 'group';
    status: string;
    subject: { nameEn: string; nameFr: string };
    learner: { id: string; fullName: string } | null;
    teacherAttendedMinutes: number;
  }[];
}

export function EarningsExplainer({
  earningId,
  onClose,
}: {
  earningId: string;
  onClose: () => void;
}) {
  const { language, t } = useI18n();
  const [data, setData] = useState<Explanation | null>(null);
  const [error, setError] = useState<ApiError | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const result = await api<Explanation>(`/admin/earnings/${earningId}/explain`, {
          language,
        });
        if (!cancelled) setData(result);
      } catch (caught) {
        if (!cancelled) setError(caught as ApiError);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [earningId, language]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-ink-900/40 p-4"
      role="presentation"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="explain-title"
        className="my-8 w-full max-w-4xl rounded-xl border border-ink-300 bg-white p-5 shadow-lg"
      >
        <div className="mb-4 flex items-start justify-between gap-3">
          <h2 id="explain-title" className="text-base font-semibold text-ink-900">
            {t('payments.whyThisNumber')}
            {data && (
              <span className="ml-2 font-normal text-ink-600">
                {data.teacherName} · {data.period}
              </span>
            )}
          </h2>
          <button type="button" className="cc-btn-secondary !min-h-0 !py-1" onClick={onClose}>
            {t('common.close')}
          </button>
        </div>

        <ErrorAlert error={error} />

        {!data ? (
          <p className="text-ink-600">{t('common.loading')}</p>
        ) : (
          <>
            <dl className="mb-4 grid grid-cols-2 gap-3 text-sm md:grid-cols-4">
              <div>
                <dt className="text-xs text-ink-600">{t('payments.poolThisMonth')}</dt>
                <dd className="font-semibold">
                  <Money amount={data.poolXaf ?? '0'} />
                </dd>
              </div>
              <div>
                <dt className="text-xs text-ink-600">{t('payments.grossEarnings')}</dt>
                <dd className="font-semibold">
                  <Money amount={data.grossXaf} />
                </dd>
              </div>
              <div>
                <dt className="text-xs text-ink-600">{t('payments.deductions')}</dt>
                <dd className="font-semibold">
                  <Money amount={data.deductionsXaf} />
                </dd>
              </div>
              <div>
                <dt className="text-xs text-ink-600">{t('payments.netPayable')}</dt>
                <dd className="font-semibold">
                  <Money amount={data.netPayableXaf} />
                </dd>
              </div>
            </dl>

            {/*
             * OI-02: the split is not commercially settled, so the version the
             * calculation used is stamped on the record and shown here. Without
             * it, two months computed under different configuration would look
             * like an arithmetic error.
             */}
            <p className="mb-4 text-xs text-ink-600">
              {t('payments.configVersion', { version: data.configVersion })}
            </p>

            <h3 className="mb-2 text-sm font-semibold text-ink-900">
              {t('payments.learner')}
            </h3>
            <div className="mb-5">
              <Table>
                <thead>
                  <tr>
                    <Th>{t('payments.learner')}</Th>
                    <Th numeric>{t('payments.attendedMinutes')}</Th>
                    <Th numeric>{t('payments.grossEarnings')}</Th>
                  </tr>
                </thead>
                <tbody>
                  {data.perLearner.map((row) => (
                    <Tr key={row.learnerId}>
                      <Td>{row.learnerName ?? row.learnerId}</Td>
                      <Td numeric>{row.attendedMinutes}</Td>
                      <Td numeric>
                        <Money amount={row.amountXaf} />
                      </Td>
                    </Tr>
                  ))}
                </tbody>
              </Table>
            </div>

            <h3 className="mb-2 text-sm font-semibold text-ink-900">
              {t('payments.sessionsBehind')}
            </h3>
            <Table>
              <thead>
                <tr>
                  <Th>{t('overview.metric.sessionsDelivered')}</Th>
                  <Th>{t('approvals.subjects')}</Th>
                  <Th>{t('payments.learner')}</Th>
                  <Th>{t('payments.oneToOne')}</Th>
                  <Th numeric>{t('payments.attendedMinutes')}</Th>
                </tr>
              </thead>
              <tbody>
                {data.sessions.map((session) => (
                  <Tr key={session.id}>
                    <Td>
                      <When value={session.startsAtUtc} />
                      <span className="block text-xs text-ink-600">{session.status}</span>
                    </Td>
                    <Td>
                      {language === 'fr' ? session.subject.nameFr : session.subject.nameEn}
                    </Td>
                    <Td>{session.learner?.fullName ?? t('payments.group')}</Td>
                    <Td>
                      {session.type === 'one_to_one'
                        ? t('payments.oneToOne')
                        : t('payments.group')}
                    </Td>
                    <Td numeric>
                      {session.teacherAttendedMinutes}
                      <span className="ml-1 text-xs text-ink-600">/ {session.durationMin}</span>
                    </Td>
                  </Tr>
                ))}
              </tbody>
            </Table>
          </>
        )}
      </div>
    </div>
  );
}
