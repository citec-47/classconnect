'use client';

import { useCallback, useEffect, useState } from 'react';
import { useI18n } from '@/lib/i18n';
import { useAutoRecover } from '@/lib/use-auto-recover';
import { api, ApiError } from '@/lib/api';
import { useAdminShell } from '@/lib/admin-badges';
import { ErrorAlert, EmptyState, SuccessAlert } from '@/components/Alert';
import {
  Banner,
  ConfirmDialog,
  PageHeader,
  ReasonField,
  StateChip,
  When,
} from '@/components/admin/ui';
import {
  SAFEGUARDING_SOURCE_KEY,
  SAFEGUARDING_STATE_KEY,
} from '@/components/admin/labels';

/**
 * §4.6 — the safeguarding queue.
 *
 * FR-SAF-006: restricted to designated staff. The sidebar link is absent for
 * anyone else, but that is presentation — the API refuses this data outright,
 * so reaching the URL directly produces the refusal below rather than the queue.
 *
 * FR-SAF-005: a 4-hour first-response target, counted down per report.
 */

interface Report {
  id: string;
  source: string;
  reporter: string | null;
  subjectTeacher: { id: string; fullName: string } | null;
  subjectLearner: { id: string; fullName: string | null } | null;
  relatedSessionId: string | null;
  ticket: { id: string; subject: string; channel: string } | null;
  summary: string;
  evidence: unknown;
  state: 'open' | 'in_review' | 'actioned' | 'closed';
  createdAt: string;
  ageMinutes: number;
  firstResponseDueAt: string;
  firstResponseAt: string | null;
  slaMinutesRemaining: number | null;
  slaBreached: boolean;
  actionTaken: string | null;
  closedAt: string | null;
}

interface QueueResponse {
  targetHours: number;
  reports: Report[];
}

interface RedactionFlag {
  teacherId: string;
  teacherName: string | null;
  attempts: number;
  lastAt: string | null;
}

export default function SafeguardingQueue() {
  const { language, t } = useI18n();
  const { refresh } = useAdminShell();

  const [data, setData] = useState<QueueResponse | null>(null);
  const [flags, setFlags] = useState<RedactionFlag[]>([]);
  const [error, setError] = useState<ApiError | null>(null);
  const [forbidden, setForbidden] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [dialog, setDialog] = useState<{ kind: 'suspend' | 'close'; report: Report } | null>(null);
  const [reason, setReason] = useState('');

  const load = useCallback(async () => {
    setError(null);
    try {
      const [queue, redactions] = await Promise.all([
        api<QueueResponse>('/admin/safeguarding', { language }),
        api<RedactionFlag[]>('/admin/safeguarding/redaction-flags', { language }).catch(
          () => [] as RedactionFlag[],
        ),
      ]);
      setData(queue);
      setFlags(redactions);
    } catch (caught) {
      const apiError = caught as ApiError;
      // FR-SAF-006: not designated. Say so plainly and say what to do about it,
      // rather than showing an empty queue that implies nothing is happening.
      if (apiError.status === 403) setForbidden(true);
      else setError(apiError);
      setData({ targetHours: 4, reports: [] });
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

  const act = async () => {
    if (!dialog) return;
    setBusy(true);
    setError(null);
    try {
      if (dialog.kind === 'suspend') {
        await api(`/admin/safeguarding/${dialog.report.id}/suspend-teacher`, {
          method: 'POST',
          body: { reason },
          language,
        });
        setDone(t('safeguarding.responded'));
      } else {
        await api(`/admin/safeguarding/${dialog.report.id}/close`, {
          method: 'POST',
          body: { actionTaken: reason },
          language,
        });
        setDone(t('safeguarding.closed'));
      }
      setDialog(null);
      setReason('');
      await load();
      await refresh();
    } catch (caught) {
      setError(caught as ApiError);
    } finally {
      setBusy(false);
    }
  };

  const respond = async (report: Report) => {
    setBusy(true);
    try {
      await api(`/admin/safeguarding/${report.id}/first-response`, {
        method: 'POST',
        body: { note: t('safeguarding.respond') },
        language,
      });
      setDone(t('safeguarding.responded'));
      await load();
      await refresh();
    } catch (caught) {
      setError(caught as ApiError);
    } finally {
      setBusy(false);
    }
  };

  if (forbidden) {
    return (
      <>
        <PageHeader title={t('safeguarding.title')} />
        <EmptyState
          title={t('safeguarding.notDesignatedTitle')}
          body={t('safeguarding.notDesignatedBody')}
        />
      </>
    );
  }

  if (!data) {
    return (
      <>
        <PageHeader title={t('safeguarding.title')} />
        <p className="text-ink-600">{t('common.loading')}</p>
      </>
    );
  }

  return (
    <>
      <PageHeader
        title={t('safeguarding.title')}
        description={t('safeguarding.firstResponseTarget', { hours: data.targetHours })}
      />

      <Banner tone="danger">{t('safeguarding.restricted')}</Banner>

      {done && <SuccessAlert>{done}</SuccessAlert>}
      <ErrorAlert error={error} />

      {data.reports.length === 0 ? (
        <EmptyState title={t('safeguarding.emptyTitle')} body={t('safeguarding.emptyBody')} />
      ) : (
        <ul className="flex flex-col gap-3">
          {data.reports.map((report) => (
            <li
              key={report.id}
              className={[
                'rounded-lg border bg-white p-4',
                report.slaBreached ? 'border-danger-600' : 'border-ink-300',
              ].join(' ')}
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <StateChip tone={report.state === 'closed' ? 'neutral' : 'frozen'}>
                      {t(SAFEGUARDING_STATE_KEY[report.state] ?? 'safeguarding.stateOpen')}
                    </StateChip>
                    <span className="text-xs text-ink-600">
                      {t('safeguarding.source')}:{' '}
                      {t(SAFEGUARDING_SOURCE_KEY[report.source] ?? 'safeguarding.sourceOther')}
                    </span>
                    {report.subjectTeacher && (
                      <span className="text-xs text-ink-600">
                        {t('safeguarding.subjectOfReport')}: {report.subjectTeacher.fullName}
                      </span>
                    )}
                  </div>

                  <p className="mt-2 max-w-prose text-sm text-ink-900">{report.summary}</p>

                  <p className="mt-2 text-xs text-ink-600">
                    {t('safeguarding.reporter')}: {report.reporter ?? t('audit.system')} ·{' '}
                    <When value={report.createdAt} />
                  </p>
                </div>

                <div className="text-right">
                  {/* FR-SAF-005: the countdown, and the breach, stated plainly. */}
                  <p className="text-xs text-ink-600">{t('safeguarding.firstResponseDue')}</p>
                  {report.firstResponseAt ? (
                    <StateChip tone="good">
                      <When value={report.firstResponseAt} />
                    </StateChip>
                  ) : report.slaBreached ? (
                    <StateChip tone="frozen">
                      {t('support.slaBreached', {
                        duration: `${Math.abs(report.slaMinutesRemaining ?? 0)}m`,
                      })}
                    </StateChip>
                  ) : (
                    <StateChip tone="warn">
                      {t('support.slaDueIn', {
                        duration: `${report.slaMinutesRemaining ?? 0}m`,
                      })}
                    </StateChip>
                  )}
                </div>
              </div>

              {report.actionTaken && (
                <p className="mt-3 rounded-md bg-ink-100 p-2 text-sm text-ink-900">
                  <span className="font-medium">{t('safeguarding.actionTaken')}: </span>
                  {report.actionTaken}
                </p>
              )}

              {report.state !== 'closed' && (
                <div className="mt-3 flex flex-wrap gap-2">
                  {!report.firstResponseAt && (
                    <button
                      type="button"
                      className="cc-btn-secondary !min-h-0 !py-1.5"
                      disabled={busy}
                      onClick={() => void respond(report)}
                    >
                      {t('safeguarding.respond')}
                    </button>
                  )}
                  {report.subjectTeacher && (
                    <button
                      type="button"
                      className="cc-btn-danger !min-h-0 !py-1.5"
                      onClick={() => {
                        setDialog({ kind: 'suspend', report });
                        setReason('');
                      }}
                    >
                      {t('safeguarding.suspendTeacherNow')}
                    </button>
                  )}
                  <button
                    type="button"
                    className="cc-btn-secondary !min-h-0 !py-1.5"
                    onClick={() => {
                      setDialog({ kind: 'close', report });
                      setReason('');
                    }}
                  >
                    {t('safeguarding.close')}
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      {/* FR-SAF-002 */}
      {flags.length > 0 && (
        <section className="mt-6">
          <h2 className="mb-2 text-sm font-semibold text-ink-900">
            {t('safeguarding.redactionFlags')}
          </h2>
          <ul className="flex flex-col gap-2">
            {flags.map((flag) => (
              <li
                key={flag.teacherId}
                className="rounded-lg border border-warning-600 bg-warning-50 p-3 text-sm text-warning-600"
              >
                {t('safeguarding.redactionFlagsBody', {
                  name: flag.teacherName ?? flag.teacherId,
                  count: flag.attempts,
                })}
              </li>
            ))}
          </ul>
        </section>
      )}

      <p className="mt-6 text-xs text-ink-600">{t('safeguarding.neverDeleted')}</p>

      {/* UI-007: the dialog names the consequences before anything happens. */}
      <ConfirmDialog
        open={dialog !== null}
        title={
          dialog?.kind === 'suspend'
            ? t('approvals.suspendConsequences', {
                name: dialog.report.subjectTeacher?.fullName ?? '',
              })
            : t('safeguarding.close')
        }
        consequences={
          dialog?.kind === 'suspend'
            ? [
                t('approvals.suspendConsequence1', { count: '' }),
                t('approvals.suspendConsequence2'),
                t('approvals.suspendConsequence3'),
                t('approvals.suspendConsequence4'),
              ]
            : [t('safeguarding.neverDeleted')]
        }
        confirmLabel={
          dialog?.kind === 'suspend'
            ? t('safeguarding.suspendTeacherNow')
            : t('safeguarding.close')
        }
        destructive={dialog?.kind === 'suspend'}
        busy={busy}
        confirmDisabled={!reason.trim()}
        onConfirm={() => void act()}
        onCancel={() => {
          setDialog(null);
          setReason('');
        }}
      >
        <ReasonField
          label={
            dialog?.kind === 'suspend' ? t('freeze.reason') : t('safeguarding.actionTaken')
          }
          value={reason}
          onChange={setReason}
          hint={t('freeze.reasonRequired')}
        />
      </ConfirmDialog>
    </>
  );
}
