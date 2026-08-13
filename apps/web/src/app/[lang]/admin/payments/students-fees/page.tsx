'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { formatXaf } from '@classconnect/shared';
import { useI18n } from '@/lib/i18n';
import { api, type ApiError } from '@/lib/api';
import { useAutoRecover } from '@/lib/use-auto-recover';
import { ErrorAlert, EmptyState, SuccessAlert } from '@/components/Alert';
import { PageHeader, Table, Th, Td, StateChip, type StateTone } from '@/components/admin/ui';
import { RecordPaymentDialog } from '@/components/admin/RecordPaymentDialog';
import { SetFeeStageDialog } from '@/components/admin/SetFeeStageDialog';
import { RegisterLearnerDialog } from '@/components/admin/RegisterLearnerDialog';
import { EditPlanDialog } from '@/components/admin/EditPlanDialog';
import { LEVEL_ACCENT } from '@/lib/subject-accent';

/**
 * Students — fees.
 *
 * Roster-first, not payment-first. The previous screen listed payment rows, so a
 * learner nobody had ever paid for appeared nowhere — which is precisely the
 * learner an operator most needs to see. Every approved learner is here exactly
 * once, whatever has or has not been paid.
 *
 * ## Why the stage is not editable
 *
 * The obvious control would be a dropdown setting the stage to Registration,
 * First, Second or Completed. It is deliberately absent.
 *
 * A stage is a *reading* of the instalments, which are a reading of the
 * append-only ledger (FR-LDG-001). Setting it directly would make the schedule
 * and the ledger disagree, and that disagreement surfaces weeks later in
 * reconciliation with nobody able to reconstruct what happened or who did it.
 *
 * **Record payment** produces exactly those four stages, and keeps them true: it
 * writes balanced ledger entries, issues a numbered invoice, settles instalments
 * in sequence, and lifts an automatic freeze. The operator enters what was
 * received; the schedule decides what it settles.
 */

type Stage = 'not_registered' | 'registered' | 'first' | 'second' | 'completed';
type LevelGroup = 'all' | 'primary' | 'secondary' | 'lower' | 'upper';

interface FeeRow {
  learnerId: string;
  learner: string;
  levelCode: string | null;
  levelEn: string | null;
  levelFr: string | null;
  guardian: string | null;
  guardianPhone: string | null;
  subscriptionId: string | null;
  planType: string | null;
  stage: Stage;
  instalmentsPaid: number;
  instalmentsTotal: number;
  totalXaf: string;
  registrationFeeXaf: string;
  registrationPaid: boolean;
  outstandingXaf: string;
  nextDueOn: string | null;
  parts: { sequence: number; state: string; amountXaf: string; dueOn: string | null }[];
}

/** Collapses the catalogue's sixteen levels into the four an operator thinks in. */
function groupOf(code: string | null): Exclude<LevelGroup, 'all'> | null {
  if (!code) return null;
  if (code.startsWith('PRIMARY')) return 'primary';
  if (code.startsWith('FORM')) return 'secondary';
  if (code === 'LOWER_SIXTH') return 'lower';
  if (code === 'UPPER_SIXTH') return 'upper';
  return null;
}

/**
 * The four tones `StateChip` actually has, not a fifth set invented here.
 *
 * `frozen` is the only red on this surface by design (see `admin/ui.tsx`), and
 * it is spent on `not_registered` deliberately: a learner with no fee schedule at
 * all is the row an operator has to act on, and every other stage is a payment
 * in progress rather than a problem.
 */
const STAGE_TONE: Record<Stage, StateTone> = {
  completed: 'good',
  second: 'good',
  first: 'warn',
  registered: 'warn',
  not_registered: 'frozen',
};

export default function StudentsFees() {
  const { t, language } = useI18n();
  const [rows, setRows] = useState<FeeRow[] | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [group, setGroup] = useState<LevelGroup>('all');
  const [recording, setRecording] = useState<FeeRow | null>(null);
  const [staging, setStaging] = useState<FeeRow | null>(null);
  const [registering, setRegistering] = useState<FeeRow | null>(null);
  const [editingPlan, setEditingPlan] = useState<FeeRow | null>(null);

  const load = useCallback(async () => {
    try {
      setRows(await api<FeeRow[]>('/admin/payments/students/fees', { language }));
      setError(null);
    } catch (caught) {
      setError(caught as ApiError);
    }
  }, [language]);

  useEffect(() => {
    void load();
  }, [load]);

  useAutoRecover(load, error !== null);

  /*
   * Filtered in the browser. The roster is a few hundred rows at this scale, an
   * operator correcting a payment is typing a name already on screen, and a
   * round trip per keystroke would be slower and would lose their place.
   */
  const visible = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return (rows ?? []).filter((row) => {
      const matchesSearch =
        !needle ||
        row.learner.toLowerCase().includes(needle) ||
        (row.guardian?.toLowerCase().includes(needle) ?? false) ||
        (row.guardianPhone?.includes(needle) ?? false);
      const matchesGroup = group === 'all' || groupOf(row.levelCode) === group;
      return matchesSearch && matchesGroup;
    });
  }, [rows, search, group]);

  return (
    <>
      <PageHeader title={t('payments.feesTitle')} description={t('payments.feesSubtitle')} />

      {error && <ErrorAlert error={error} />}
      {done && <SuccessAlert>{done}</SuccessAlert>}

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <input
          type="search"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder={t('payments.searchStudent')}
          className="min-h-touch w-72 rounded-lg border border-ink-300 px-3 text-sm"
        />

        {(['all', 'primary', 'secondary', 'lower', 'upper'] as const).map((key) => (
          <button
            key={key}
            type="button"
            aria-pressed={group === key}
            onClick={() => setGroup(key)}
            className={[
              'min-h-touch rounded-full border px-3 text-sm',
              group !== key
                ? 'border-ink-300 text-ink-600'
                : key === 'all'
                  ? 'border-brand-600 bg-brand-50 text-brand-700'
                  : `border-transparent ${LEVEL_ACCENT[key].bg} ${LEVEL_ACCENT[key].text}`,
            ].join(' ')}
          >
            {t(`payments.levelGroup.${key}`)}
          </button>
        ))}

        <span className="text-xs text-ink-600">
          {t('payments.showingCount', { shown: visible.length, total: rows?.length ?? 0 })}
        </span>
      </div>

      {rows && visible.length === 0 ? (
        <EmptyState title={t('payments.noStudents')} body={t('payments.noStudentsBody')} />
      ) : (
        <div className="rounded-lg bg-white">
          <Table>
            <thead>
              <tr>
                <Th>{t('payments.student')}</Th>
                <Th>{t('payments.level')}</Th>
                <Th>{t('payments.feeStage')}</Th>
                <Th>{t('payments.progress')}</Th>
                <Th>{t('payments.outstanding')}</Th>
                <Th>{t('common.actions')}</Th>
              </tr>
            </thead>
            <tbody>
              {visible.map((row) => (
                <tr
                  key={row.learnerId}
                  /*
                   * Double-click opens the stage dialog, as asked. The explicit
                   * "Set status" link below stays: a double-click is invisible
                   * to anyone who does not already know it is there, and to a
                   * keyboard or screen-reader user it does not exist at all
                   * (UI-003).
                   */
                  /*
                   * Double-click does the thing the row is ready for: set the
                   * stage once registered, register it if not. Offering nothing
                   * to an unregistered learner is what left this screen inert.
                   */
                  onDoubleClick={() =>
                    row.subscriptionId ? setStaging(row) : setRegistering(row)
                  }
                  className="cursor-pointer" 
                >
                  <Td>
                    <span className="font-medium text-ink-900">{row.learner}</span>
                    {row.guardian && (
                      <span className="block text-xs text-ink-600">{row.guardian}</span>
                    )}
                  </Td>
                  <Td>{(language === 'fr' ? row.levelFr : row.levelEn) ?? '—'}</Td>
                  <Td>
                    <StateChip tone={STAGE_TONE[row.stage]}>
                      {t(`payments.stage.${row.stage}`)}
                    </StateChip>
                  </Td>
                  <Td>
                    {row.instalmentsTotal > 0
                      ? `${row.instalmentsPaid}/${row.instalmentsTotal}`
                      : '—'}
                  </Td>
                  <Td>
                    <span className="tabular-nums">
                      {row.outstandingXaf === '0'
                        ? '—'
                        : formatXaf(BigInt(row.outstandingXaf))}
                    </span>
                  </Td>
                  <Td>
                    {/*
                     * The only way to move a stage. It records what was
                     * received; the schedule decides which instalment that
                     * settles — see the file comment for why there is no
                     * direct stage control.
                     */}
                    {row.subscriptionId ? (
                      <span className="flex flex-col items-start gap-0.5">
                        {row.stage !== 'completed' && (
                          <button
                            type="button"
                            className="text-left text-xs text-brand-600 underline"
                            onClick={() => setRecording(row)}
                          >
                            {t('payments.recordPayment')}
                          </button>
                        )}
                        <button
                          type="button"
                          className="text-left text-xs text-ink-600 underline"
                          onClick={() => setStaging(row)}
                        >
                          {t('payments.setStage')}
                        </button>
                        <button
                          type="button"
                          className="text-left text-xs text-ink-600 underline"
                          onClick={() => setEditingPlan(row)}
                        >
                          {t('payments.editPlan')}
                        </button>
                      </span>
                    ) : (
                      <button
                        type="button"
                        className="text-left text-xs text-brand-600 underline"
                        onClick={() => setRegistering(row)}
                      >
                        {t('payments.register')}
                      </button>
                    )}
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </div>
      )}

      {editingPlan && editingPlan.subscriptionId && (
        <EditPlanDialog
          row={{
            subscriptionId: editingPlan.subscriptionId,
            learner: editingPlan.learner,
            totalXaf: editingPlan.totalXaf,
            registrationFeeXaf: editingPlan.registrationFeeXaf ?? '0',
            parts: editingPlan.parts ?? [],
          }}
          onClose={() => setEditingPlan(null)}
          onSaved={(message) => {
            setEditingPlan(null);
            setDone(message);
            void load();
          }}
        />
      )}

      {registering && (
        <RegisterLearnerDialog
          learnerId={registering.learnerId}
          learnerName={registering.learner}
          onClose={() => setRegistering(null)}
          onRegistered={(message) => {
            setRegistering(null);
            setDone(message);
            void load();
          }}
        />
      )}

      {staging && staging.subscriptionId && (
        <SetFeeStageDialog
          row={{
            subscriptionId: staging.subscriptionId,
            learner: staging.learner,
            stage: staging.stage,
            instalmentsPaid: staging.instalmentsPaid,
            instalmentsTotal: staging.instalmentsTotal,
          }}
          onClose={() => setStaging(null)}
          onSaved={(message) => {
            setStaging(null);
            setDone(message);
            void load();
          }}
        />
      )}

      {recording && recording.subscriptionId && (
        <RecordPaymentDialog
          row={{
            subscriptionId: recording.subscriptionId,
            learner: recording.learner,
            instalmentsDone: recording.instalmentsPaid,
            instalmentsTotal: recording.instalmentsTotal,
            outstandingXaf: recording.outstandingXaf,
          }}
          onClose={() => setRecording(null)}
          onRecorded={(message) => {
            setRecording(null);
            setDone(message);
            void load();
          }}
        />
      )}
    </>
  );
}
