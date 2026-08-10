'use client';

import { Fragment, useCallback, useEffect, useState } from 'react';
import { formatXaf } from '@classconnect/shared';
import { useI18n } from '@/lib/i18n';
import { useAutoRecover } from '@/lib/use-auto-recover';
import { api, type ApiError } from '@/lib/api';
import { useAdminShell } from '@/lib/admin-badges';
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

/**
 * §4.7.2 — the collections screen.
 *
 * Sorted by days overdue descending by default, because that is the order a
 * collections operator works in. The account-state column distinguishes the two
 * kinds of freeze (§5.5), since paying clears one and not the other and the
 * operator needs to know which conversation they are having.
 */

interface Instalment {
  id: string;
  sequence: number;
  amountXaf: string;
  dueOn: string;
  freezesOn: string;
  state: 'scheduled' | 'due' | 'overdue' | 'paid' | 'cancelled';
  paidAt: string | null;
}

interface OwingRow {
  scheduleId: string;
  subscriptionId: string;
  learnerId: string;
  learner: string;
  level: { nameEn: string; nameFr: string } | null;
  guardian: string;
  guardianPhone: string | null;
  plan: string;
  totalXaf: string;
  paidToDateXaf: string;
  outstandingXaf: string;
  daysOverdue: number;
  accountState: 'active' | 'grace' | 'frozen';
  freezeKind: 'manual' | 'automatic' | null;
  freezeReason: string | null;
  liftableByPayment: boolean;
  instalments: Instalment[];
  lastAttempt: { at: string; status: string; failureReason: string | null } | null;
  lastReminderAt: string | null;
}

const INSTALMENT_STATE: Record<Instalment['state'], { key: string; tone: 'neutral' | 'good' | 'warn' | 'frozen' }> = {
  scheduled: { key: 'payments.instalmentScheduled', tone: 'neutral' },
  due: { key: 'payments.instalmentDue', tone: 'warn' },
  overdue: { key: 'payments.instalmentOverdue', tone: 'frozen' },
  paid: { key: 'payments.instalmentPaid', tone: 'good' },
  cancelled: { key: 'payments.instalmentCancelled', tone: 'neutral' },
};

export default function StudentsOwing() {
  const { language, t } = useI18n();
  const { refresh } = useAdminShell();
  const { user } = useAuth();

  const [rows, setRows] = useState<OwingRow[] | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const [stateFilter, setStateFilter] = useState('');
  const [channel, setChannel] = useState<'sms' | 'whatsapp' | 'email' | 'in_app'>('sms');

  const [freezeDialog, setFreezeDialog] = useState<{
    row: OwingRow;
    action: 'freeze' | 'unfreeze';
    preview?: { sessions: number; teachers: number; guardians: number; inLiveSession: boolean };
  } | null>(null);
  const [reason, setReason] = useState('');
  const [category, setCategory] = useState('non_payment');

  const canFreeze =
    user?.roles.some((role) =>
      ['admin_ops', 'admin_finance', 'super_admin'].includes(role),
    ) ?? false;

  const load = useCallback(async () => {
    setError(null);
    try {
      const query = stateFilter ? `?state=${stateFilter}` : '';
      setRows(await api<OwingRow[]>(`/admin/payments/students/owing${query}`, { language }));
    } catch (caught) {
      setError(caught as ApiError);
      setRows([]);
    }
  }, [language, stateFilter]);

  useEffect(() => {
    void load();
  }, [load]);

  /*
   * AS-08: a screen that failed while the API was restarting must not stay
   * failed once it answers again. Retries on reconnect, on refocus, and
   * slowly while the error stands.
   */
  useAutoRecover(load, error !== null);

  const remind = async (row: OwingRow) => {
    setBusy(true);
    try {
      await api(`/admin/payments/schedules/${row.scheduleId}/remind`, {
        method: 'POST',
        body: { channel },
        language,
      });
      setDone(t('payments.reminderSent'));
      await load();
    } catch (caught) {
      setError(caught as ApiError);
    } finally {
      setBusy(false);
    }
  };

  // UI-007: the figures in the dialog come from the API, so what the operator
  // is told will happen is what the freeze will actually do.
  const openFreeze = async (row: OwingRow, action: 'freeze' | 'unfreeze') => {
    setReason('');
    setCategory('non_payment');
    if (action === 'unfreeze') {
      setFreezeDialog({ row, action });
      return;
    }
    try {
      const preview = await api<{
        sessions: number;
        teachers: number;
        guardians: number;
        inLiveSession: boolean;
      }>(`/admin/payments/freeze/preview/learner/${row.learnerId}`, { language });
      setFreezeDialog({ row, action, preview });
    } catch {
      setFreezeDialog({ row, action });
    }
  };

  const applyFreeze = async () => {
    if (!freezeDialog) return;
    setBusy(true);
    setError(null);
    try {
      await api(
        freezeDialog.action === 'freeze' ? '/admin/payments/freeze' : '/admin/payments/unfreeze',
        {
          method: 'POST',
          body: {
            scope: 'learner',
            subjectId: freezeDialog.row.learnerId,
            reason,
            ...(freezeDialog.action === 'freeze' ? { category } : {}),
          },
          language,
        },
      );
      setDone(freezeDialog.action === 'freeze' ? t('freeze.frozen') : t('freeze.unfrozen'));
      setFreezeDialog(null);
      setReason('');
      await load();
      await refresh();
    } catch (caught) {
      setError(caught as ApiError);
    } finally {
      setBusy(false);
    }
  };

  if (rows === null) {
    return (
      <>
        <PageHeader title={t('payments.studentsOwingTitle')} />
        <p className="text-ink-600">{t('common.loading')}</p>
      </>
    );
  }

  return (
    <>
      <PageHeader
        title={t('payments.studentsOwingTitle')}
        actions={
          <>
            <label className="sr-only" htmlFor="state-filter">
              {t('payments.accountState')}
            </label>
            <select
              id="state-filter"
              className="cc-field !min-h-0 !w-auto !py-1.5 text-sm"
              value={stateFilter}
              onChange={(event) => setStateFilter(event.target.value)}
            >
              <option value="">{t('reports.all')}</option>
              <option value="active">{t('payments.stateActive')}</option>
              <option value="grace">{t('payments.stateGrace')}</option>
              <option value="frozen">{t('payments.stateFrozen')}</option>
            </select>
            <ExportButton dataset="students-owing" />
          </>
        }
      />

      {done && <SuccessAlert>{done}</SuccessAlert>}
      <ErrorAlert error={error} />

      {rows.length === 0 ? (
        <EmptyState title={t('payments.emptyOwingTitle')} body={t('payments.emptyOwingBody')} />
      ) : (
        <div className="rounded-lg bg-white">
          <Table>
            <thead>
              <tr>
                <Th>{t('payments.learner')}</Th>
                <Th>{t('approvals.guardian')}</Th>
                <Th>{t('payments.plan')}</Th>
                <Th numeric>{t('payments.totalFee')}</Th>
                <Th numeric>{t('payments.paidToDate')}</Th>
                <Th numeric>{t('payments.outstanding')}</Th>
                <Th numeric>{t('payments.daysOverdue')}</Th>
                <Th>{t('payments.accountState')}</Th>
                <Th>{t('payments.lastAttempt')}</Th>
                <Th>{t('payments.lastReminder')}</Th>
                <Th>{t('common.filter')}</Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const isOpen = openId === row.scheduleId;
                return (
                  <Fragment key={row.scheduleId}>
                    <Tr>
                      <Td>
                        <span className="font-medium">{row.learner}</span>
                        {row.level && (
                          <span className="block text-xs text-ink-600">
                            {language === 'fr' ? row.level.nameFr : row.level.nameEn}
                          </span>
                        )}
                      </Td>
                      <Td>
                        {row.guardian}
                        <span className="block text-xs text-ink-600">{row.guardianPhone}</span>
                      </Td>
                      <Td>{row.plan}</Td>
                      <Td numeric>
                        <Money amount={row.totalXaf} />
                      </Td>
                      <Td numeric>
                        <Money amount={row.paidToDateXaf} />
                      </Td>
                      <Td numeric>
                        <Money amount={row.outstandingXaf} className="font-semibold" />
                      </Td>
                      <Td numeric>{row.daysOverdue}</Td>
                      <Td>
                        {/* §5.5: the two freezes read differently because the
                            remedy differs. Paying clears one and not the other. */}
                        {row.accountState === 'frozen' ? (
                          <StateChip tone="frozen">
                            {row.freezeKind === 'manual'
                              ? t('freeze.frozenManual', { reason: row.freezeReason ?? '' })
                              : t('freeze.frozenAutomatic')}
                          </StateChip>
                        ) : row.accountState === 'grace' ? (
                          <StateChip tone="warn">{t('payments.stateGrace')}</StateChip>
                        ) : (
                          <StateChip tone="good">{t('payments.stateActive')}</StateChip>
                        )}
                      </Td>
                      <Td>
                        {row.lastAttempt ? (
                          <>
                            <When value={row.lastAttempt.at} />
                            {row.lastAttempt.failureReason && (
                              <span className="block text-xs text-danger-600">
                                {t('payments.lastAttemptFailed', {
                                  reason: row.lastAttempt.failureReason,
                                })}
                              </span>
                            )}
                          </>
                        ) : (
                          <span className="text-ink-600">{t('common.notRecorded')}</span>
                        )}
                      </Td>
                      <Td>
                        {row.lastReminderAt ? (
                          <When value={row.lastReminderAt} />
                        ) : (
                          <span className="text-ink-600">{t('payments.neverReminded')}</span>
                        )}
                      </Td>
                      <Td>
                        <button
                          type="button"
                          className="text-left text-xs text-brand-700 underline"
                          aria-expanded={isOpen}
                          onClick={() => setOpenId(isOpen ? null : row.scheduleId)}
                        >
                          {t('payments.instalmentSchedule')}
                        </button>
                      </Td>
                    </Tr>

                    {isOpen && (
                      <tr>
                        <td colSpan={11} className="border-b border-ink-300 bg-ink-100/50 px-3 py-4">
                          <div className="grid gap-5 lg:grid-cols-[1fr_18rem]">
                            <div>
                              <h3 className="mb-2 text-sm font-semibold text-ink-900">
                                {t('payments.instalmentSchedule')}
                              </h3>
                              <ul className="flex flex-col gap-1.5">
                                {row.instalments.map((instalment) => (
                                  <li
                                    key={instalment.id}
                                    className="flex flex-wrap items-center gap-3 text-sm"
                                  >
                                    <span className="w-28 font-medium">
                                      {t('payments.instalmentNumber', {
                                        number: instalment.sequence,
                                      })}
                                    </span>
                                    <Money amount={instalment.amountXaf} className="w-28" />
                                    <span className="text-ink-600">
                                      {t('payments.dueOn', { date: instalment.dueOn })}
                                    </span>
                                    <StateChip tone={INSTALMENT_STATE[instalment.state].tone}>
                                      {t(INSTALMENT_STATE[instalment.state].key)}
                                    </StateChip>
                                    {/* §5.3: the freeze date is visible before
                                        it arrives, not only after. */}
                                    {(instalment.state === 'due' ||
                                      instalment.state === 'overdue') && (
                                      <span className="text-xs text-ink-600">
                                        {t('freeze.noticeFreeze')}: {instalment.freezesOn}
                                      </span>
                                    )}
                                  </li>
                                ))}
                              </ul>

                              {row.accountState === 'frozen' && (
                                <p className="mt-3 text-sm text-ink-600">
                                  {row.liftableByPayment
                                    ? t('freeze.payToUnfreeze')
                                    : t('freeze.manualOutranks')}
                                </p>
                              )}
                            </div>

                            <div className="flex flex-col gap-2">
                              <label className="cc-label" htmlFor={`channel-${row.scheduleId}`}>
                                {t('payments.reminderChannel')}
                              </label>
                              <select
                                id={`channel-${row.scheduleId}`}
                                className="cc-field"
                                value={channel}
                                onChange={(event) =>
                                  setChannel(event.target.value as typeof channel)
                                }
                              >
                                <option value="sms">SMS</option>
                                <option value="whatsapp">WhatsApp</option>
                                <option value="email">Email</option>
                                <option value="in_app">{t('support.channelInApp')}</option>
                              </select>
                              <button
                                type="button"
                                className="cc-btn-primary w-full"
                                disabled={busy}
                                onClick={() => void remind(row)}
                              >
                                {t('payments.sendReminder')}
                              </button>

                              {canFreeze &&
                                (row.accountState === 'frozen' ? (
                                  <button
                                    type="button"
                                    className="cc-btn-secondary w-full"
                                    onClick={() => void openFreeze(row, 'unfreeze')}
                                  >
                                    {t('freeze.unfreeze')}
                                  </button>
                                ) : (
                                  <button
                                    type="button"
                                    className="cc-btn-danger w-full"
                                    onClick={() => void openFreeze(row, 'freeze')}
                                  >
                                    {t('freeze.freeze')}
                                  </button>
                                ))}
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </Table>
        </div>
      )}

      {/*
       * UI-007: "Not 'Are you sure?' but 'Freezing this account cancels 3
       * upcoming sessions and notifies the guardian and 2 teachers.'"
       */}
      <ConfirmDialog
        open={freezeDialog !== null}
        title={
          freezeDialog?.action === 'freeze'
            ? t('freeze.confirmLearnerTitle')
            : t('freeze.unfreeze')
        }
        consequences={
          freezeDialog
            ? freezeDialog.action === 'freeze'
              ? [
                  t('freeze.confirmLearnerBody', {
                    name: freezeDialog.row.learner,
                    sessions: freezeDialog.preview?.sessions ?? 0,
                    teachers: freezeDialog.preview?.teachers ?? 0,
                  }),
                  ...(freezeDialog.preview?.inLiveSession
                    ? // §5.4: never freeze mid-session. Said before, not after.
                      [t('freeze.deferredMidSession')]
                    : []),
                  t('freeze.manualOutranks'),
                ]
              : [
                  t('freeze.confirmUnfreezeBody', { name: freezeDialog.row.learner }),
                ]
            : []
        }
        confirmLabel={
          freezeDialog?.action === 'freeze' ? t('freeze.freeze') : t('freeze.unfreeze')
        }
        destructive={freezeDialog?.action === 'freeze'}
        busy={busy}
        confirmDisabled={!reason.trim()}
        onConfirm={() => void applyFreeze()}
        onCancel={() => {
          setFreezeDialog(null);
          setReason('');
        }}
      >
        {freezeDialog?.action === 'freeze' && (
          <div className="mb-3">
            <label className="cc-label" htmlFor="freeze-category">
              {t('freeze.category')}
            </label>
            <select
              id="freeze-category"
              className="cc-field"
              value={category}
              onChange={(event) => setCategory(event.target.value)}
            >
              <option value="non_payment">{t('freeze.categoryNonPayment')}</option>
              <option value="safeguarding">{t('freeze.categorySafeguarding')}</option>
              <option value="abuse">{t('freeze.categoryAbuse')}</option>
              <option value="dispute">{t('freeze.categoryDispute')}</option>
              <option value="other">{t('freeze.categoryOther')}</option>
            </select>
          </div>
        )}
        <ReasonField
          label={t('freeze.reason')}
          value={reason}
          onChange={setReason}
          hint={t('freeze.reasonRequired')}
        />
      </ConfirmDialog>
    </>
  );
}
