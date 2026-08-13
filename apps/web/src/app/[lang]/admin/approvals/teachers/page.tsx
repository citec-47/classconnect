'use client';

import { useCallback, useEffect, useState } from 'react';
import { useI18n } from '@/lib/i18n';
import { useAutoRecover } from '@/lib/use-auto-recover';
import { api, ApiError } from '@/lib/api';
import { ErrorAlert, EmptyState } from '@/components/Alert';
import { TeacherDocuments } from '@/components/admin/TeacherDocuments';
import type { Language } from '@classconnect/shared';

interface ChecklistItem {
  key: string;
  labelKey: string;
  mandatory: boolean;
  verified: boolean;
  findings: string | null;
}

interface QueueEntry {
  teacherId: string;
  applicant: { fullName: string; phone: string | null; email: string | null };
  status: string;
  submittedAt: string | null;
  waitingDays: number;
  qualification: {
    highest: string | null;
    institution: string | null;
    year: number | null;
    yearsExperience: number;
  };
  nationalIdPreview: string | null;
  payoutWalletPreview: string | null;
  documents: { id: string; type: string; fileName: string; scanStatus: string }[];
  subjects: { subject: { nameEn: string; nameFr: string }; level: { nameEn: string; nameFr: string } }[];
  checklist: ChecklistItem[];
}

/**
 * FR-TVR-004: the verification queue — each application, its documents, a
 * checklist of verification steps, and required free-text findings.
 * FR-TVR-005: approval requires each item to be affirmatively recorded, and
 *             there is no bulk action anywhere on this screen.
 */
export default function VerificationQueue() {
  const { language, t } = useI18n();

  const [queue, setQueue] = useState<QueueEntry[] | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [checks, setChecks] = useState<Record<string, { verified: boolean; findings: string }>>({});
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      setQueue(await api<QueueEntry[]>('/admin/verification/queue', { language }));
    } catch (caught) {
      setError(caught as ApiError);
      setQueue([]);
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

  const open = (entry: QueueEntry) => {
    setOpenId(entry.teacherId);
    setReason('');
    setChecks(
      Object.fromEntries(
        entry.checklist.map((item) => [
          item.key,
          { verified: item.verified, findings: item.findings ?? '' },
        ]),
      ),
    );
  };

  const decide = async (
    teacherId: string,
    decision: 'approved' | 'rejected' | 'more_info_required',
  ) => {
    setBusy(true);
    setError(null);
    try {
      await api(`/admin/verification/${teacherId}/decision`, {
        method: 'POST',
        body: {
          decision,
          checklist: Object.entries(checks).map(([itemKey, value]) => ({
            itemKey,
            verified: value.verified,
            findings: value.findings || undefined,
          })),
          ...(decision === 'approved' ? {} : { reason }),
        },
        language,
      });
      setOpenId(null);
      await load();
    } catch (caught) {
      setError(caught as ApiError);
    } finally {
      setBusy(false);
    }
  };

  if (queue === null) return <p className="text-ink-600">{t('common.loading')}</p>;

  return (
    <div>
      <h1 className="text-2xl font-semibold text-ink-900">{t('admin.verificationQueue')}</h1>
      <ErrorAlert error={error} />

      {queue.length === 0 ? (
        <div className="mt-6">
          <EmptyState title={t('admin.verificationQueue')} body={t('admin.queueEmpty')} />
        </div>
      ) : (
        <ul className="mt-6 flex flex-col gap-3">
          {queue.map((entry) => {
            const isOpen = openId === entry.teacherId;
            // FR-TVR-005: the approve button stays disabled until every
            // mandatory item is affirmatively recorded.
            const mandatoryDone = entry.checklist
              .filter((item) => item.mandatory)
              .every((item) => checks[item.key]?.verified);

            return (
              <li key={entry.teacherId} className="cc-card">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-medium text-ink-900">{entry.applicant.fullName}</p>
                    <p className="text-sm text-ink-600">
                      {entry.qualification.highest} · {entry.qualification.institution}{' '}
                      {entry.qualification.year}
                    </p>
                    <p className="mt-1 text-sm text-ink-600">
                      {t('admin.waiting', { days: entry.waitingDays })}
                    </p>
                  </div>
                  <span className="cc-badge bg-brand-50 text-brand-700">{entry.status}</span>
                </div>

                <ul className="mt-3 flex flex-wrap gap-1.5">
                  {entry.subjects.map((pair, index) => (
                    <li key={index} className="cc-badge bg-ink-100 text-ink-600">
                      {language === 'fr' ? pair.subject.nameFr : pair.subject.nameEn} ·{' '}
                      {language === 'fr' ? pair.level.nameFr : pair.level.nameEn}
                    </li>
                  ))}
                </ul>

                {!isOpen ? (
                  <div className="mt-4 flex flex-col gap-2 sm:flex-row">
                    <button
                      type="button"
                      className="cc-btn-secondary w-full"
                      onClick={() => open(entry)}
                    >
                      {t('admin.checklist')}
                    </button>
                    {/*
                     * Clearing an application out of the queue without opening
                     * it — the abandoned registrations and test rows that would
                     * otherwise be worked through one checklist at a time.
                     */}
                    <RemoveFromQueue
                      entry={entry}
                      onRemoved={() =>
                        setQueue((current) =>
                          current
                            ? current.filter((row) => row.teacherId !== entry.teacherId)
                            : current,
                        )
                      }
                    />
                  </div>
                ) : (
                  <div className="mt-4 border-t border-ink-300 pt-4">
                    {/* NFR-SEC-003: identifiers are shown masked. */}
                    <dl className="mb-4 grid grid-cols-2 gap-2 text-sm">
                      <dt className="text-ink-600">{t('teacher.identityDocument')}</dt>
                      <dd className="font-mono">{entry.nationalIdPreview}</dd>
                      <dt className="text-ink-600">{t('teacher.payoutDetails')}</dt>
                      <dd className="font-mono">{entry.payoutWalletPreview}</dd>
                    </dl>

                    {/*
                     * The files, before the boxes that attest to them.
                     *
                     * FR-TVR-005 wants each item recorded affirmatively. Placing
                     * the evidence above the checklist means the reviewer reads
                     * it and then ticks, rather than ticking and then wondering.
                     */}
                    <TeacherDocuments
                      documents={entry.documents}
                      // Drop it from the list in place. Re-fetching the whole
                      // queue would collapse the open panel the reviewer is
                      // working in and lose the checklist they have ticked.
                      onRemoved={(documentId) =>
                        setQueue((current) =>
                          current
                            ? current.map((row) =>
                                row.teacherId === entry.teacherId
                                  ? {
                                      ...row,
                                      documents: row.documents.filter((d) => d.id !== documentId),
                                    }
                                  : row,
                              )
                            : current,
                        )
                      }
                    />

                    <p className="mb-3 text-sm text-ink-600">{t('admin.checklistHint')}</p>

                    <ul className="flex flex-col gap-3">
                      {entry.checklist.map((item) => (
                        <li key={item.key}>
                          <label className="flex items-start gap-3">
                            <input
                              type="checkbox"
                              className="mt-1 h-6 w-6"
                              checked={checks[item.key]?.verified ?? false}
                              onChange={(event) =>
                                setChecks((current) => ({
                                  ...current,
                                  [item.key]: {
                                    verified: event.target.checked,
                                    findings: current[item.key]?.findings ?? '',
                                  },
                                }))
                              }
                            />
                            <span className="text-sm text-ink-900">
                              {t(item.labelKey)}
                              {!item.mandatory && (
                                <span className="ml-1 text-ink-600">({t('common.optional')})</span>
                              )}
                            </span>
                          </label>
                          <input
                            type="text"
                            className="cc-field mt-1.5 text-sm"
                            placeholder={t('admin.findings')}
                            value={checks[item.key]?.findings ?? ''}
                            onChange={(event) =>
                              setChecks((current) => ({
                                ...current,
                                [item.key]: {
                                  verified: current[item.key]?.verified ?? false,
                                  findings: event.target.value,
                                },
                              }))
                            }
                          />
                        </li>
                      ))}
                    </ul>

                    <label className="cc-label mt-4">{t('admin.decisionReason')}</label>
                    <textarea
                      className="cc-field"
                      rows={2}
                      value={reason}
                      onChange={(event) => setReason(event.target.value)}
                    />

                    {!mandatoryDone && (
                      <p className="cc-error" role="status">
                        <span aria-hidden="true">⚠</span>
                        <span>{t('admin.approveBlocked')}</span>
                      </p>
                    )}

                    <div className="mt-4 flex flex-col gap-2">
                      <button
                        type="button"
                        className="cc-btn-primary w-full"
                        disabled={busy || !mandatoryDone}
                        onClick={() => void decide(entry.teacherId, 'approved')}
                      >
                        {t('admin.approve')}
                      </button>
                      <button
                        type="button"
                        className="cc-btn-secondary w-full"
                        disabled={busy || !reason.trim()}
                        onClick={() => void decide(entry.teacherId, 'more_info_required')}
                      >
                        {t('admin.requestMoreInfo')}
                      </button>
                      <button
                        type="button"
                        className="cc-btn-danger w-full"
                        disabled={busy || !reason.trim()}
                        onClick={() => void decide(entry.teacherId, 'rejected')}
                      >
                        {t('admin.reject')}
                      </button>
                    </div>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

/**
 * Clearing an application out of the review queue.
 *
 * ## Why this is not a delete
 *
 * The record cannot be destroyed, and that is enforced by the database rather
 * than by preference. `teachers` is referenced by `redaction_flags` and
 * `verification_checklist_items`, both of which carry `DO INSTEAD NOTHING`
 * rules on DELETE (FR-SAF-006, FR-TVR-010 / §4.4). A cascade into either is
 * swallowed by the rule and PostgreSQL refuses the parent delete outright:
 *
 *   referential integrity query on "teachers" ... gave unexpected result
 *   Hint: This is most likely due to a rule having rewritten the query.
 *
 * Removing the row would mean dropping those controls for every table they
 * protect, which is a decision about safeguarding evidence and not about
 * tidying a queue.
 *
 * So this does the thing the reviewer actually wants — the application leaves
 * the queue for good — by recording the decision that says so. The queue reads
 * `submitted` and `under_review`, so a rejected application is gone from it,
 * while who decided, when, and why survives.
 *
 * The reason is required because the applicant is told it.
 */
function RemoveFromQueue({
  entry,
  onRemoved,
}: {
  entry: QueueEntry;
  onRemoved: () => void;
}) {
  const { t, language } = useI18n();
  const [asking, setAsking] = useState(false);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  const remove = async () => {
    setBusy(true);
    setFailed(false);
    try {
      await api(`/admin/verification/${entry.teacherId}/decision`, {
        method: 'POST',
        body: { decision: 'rejected', reason: reason.trim(), checklist: [] },
        language,
        // The same heavier ceiling the rest of this surface needs: the decision
        // writes, notifies and re-reads across a database in another region.
        timeoutMs: 120_000,
      });
      onRemoved();
    } catch {
      setFailed(true);
      setBusy(false);
    }
  };

  if (!asking) {
    return (
      <button
        type="button"
        className="w-full rounded-lg border border-danger-600 px-3 py-2 text-sm font-medium text-danger-600"
        onClick={() => setAsking(true)}
      >
        {t('admin.review.removeFromQueue')}
      </button>
    );
  }

  return (
    <div className="w-full rounded-lg border border-danger-600 bg-danger-50 p-3">
      <p className="text-sm font-medium text-danger-600">
        {t('admin.review.removeFromQueueConfirm', { name: entry.applicant.fullName })}
      </p>
      <p className="mt-1 text-xs text-ink-600">{t('admin.review.removeFromQueueHint')}</p>
      <input
        type="text"
        value={reason}
        onChange={(event) => setReason(event.target.value)}
        placeholder={t('admin.review.removeFromQueueReason')}
        className="cc-field mt-2 w-full"
        aria-label={t('admin.review.removeFromQueueReason')}
      />
      {failed && <p className="mt-1 text-xs text-danger-600">{t('errors.generic')}</p>}
      <div className="mt-2 flex gap-2">
        <button
          type="button"
          className="min-h-touch rounded-lg bg-danger-600 px-3 text-sm font-medium text-white disabled:opacity-50"
          disabled={busy || !reason.trim()}
          onClick={() => void remove()}
        >
          {busy ? t('common.saving') : t('admin.review.removeFromQueueAction')}
        </button>
        <button
          type="button"
          className="min-h-touch rounded-lg border border-ink-300 px-3 text-sm"
          onClick={() => {
            setAsking(false);
            setReason('');
          }}
        >
          {t('common.cancel')}
        </button>
      </div>
    </div>
  );
}
