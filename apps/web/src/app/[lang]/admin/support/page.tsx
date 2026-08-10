'use client';

import { useCallback, useEffect, useState } from 'react';
import { useI18n } from '@/lib/i18n';
import { useAutoRecover } from '@/lib/use-auto-recover';
import { api, type ApiError } from '@/lib/api';
import { useAdminShell } from '@/lib/admin-badges';
import { ErrorAlert, EmptyState, SuccessAlert } from '@/components/Alert';
import { PageHeader, StateChip, Table, Td, Th, Tr } from '@/components/admin/ui';
import {
  AGENT_PRESENCE_KEY,
  TICKET_CATEGORY_KEY,
  TICKET_CHANNEL_KEY,
} from '@/components/admin/labels';

/**
 * §4.5 — assign a customer service agent.
 *
 * FR-SUP-007 / FR-SAF-006: safeguarding tickets are absent from this screen
 * because the API never returns them here, not because the client filters them
 * out. A payment dispute is shown but marked as routed to the finance queue, so
 * an operator understands why it is not theirs rather than finding it missing.
 */

interface Ticket {
  id: string;
  channel: 'in_app' | 'whatsapp' | 'email';
  category: string;
  priority: string;
  status: string;
  subject: string;
  requester: { id: string; fullName: string; phone: string | null; roles: string[] };
  createdAt: string;
  ageMinutes: number;
  assigneeId: string | null;
  sla: { minutesRemaining: number | null; breached: boolean };
  routedTo: 'general' | 'finance';
  whatsapp: {
    windowEndsAt: string | null;
    open: boolean;
    windowHours: number;
    minutesRemaining: number;
  } | null;
}

interface Agent {
  id: string;
  fullName: string;
  roles: string[];
  openTickets: number;
  waitingOnUser: number;
  averageFirstResponseMinutes: number | null;
  presence: 'online' | 'away' | 'offline';
  maxOpenTickets: number;
}

/** Renders a duration in whole hours and minutes, in the viewer's language. */
function duration(minutes: number, t: (key: string, p?: Record<string, string | number>) => string) {
  const absolute = Math.abs(minutes);
  const hours = Math.floor(absolute / 60);
  const mins = absolute % 60;
  return hours > 0 ? `${hours}h ${mins}m` : `${mins}m`;
}

export default function SupportRouting() {
  const { language, t } = useI18n();
  const { refresh } = useAdminShell();

  const [scope, setScope] = useState<'unassigned' | 'mine'>('unassigned');
  const [tickets, setTickets] = useState<Ticket[] | null>(null);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [agentId, setAgentId] = useState('');
  const [error, setError] = useState<ApiError | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [queue, panel] = await Promise.all([
        api<Ticket[]>(`/admin/support/queue?scope=${scope}`, { language }),
        // An agent without `support:assign` sees their own queue but no routing
        // panel; the endpoint refuses and the panel simply stays empty.
        api<Agent[]>('/admin/support/agents', { language }).catch(() => [] as Agent[]),
      ]);
      setTickets(queue);
      setAgents(panel);
      setSelected(new Set());
    } catch (caught) {
      setError(caught as ApiError);
      setTickets([]);
    }
  }, [language, scope]);

  useEffect(() => {
    void load();
  }, [load]);

  /*
   * AS-08: a screen that failed while the API was restarting must not stay
   * failed once it answers again. Retries on reconnect, on refocus, and
   * slowly while the error stands.
   */
  useAutoRecover(load, error !== null);

  const assign = async () => {
    if (!agentId || selected.size === 0) return;
    setBusy(true);
    setError(null);
    try {
      const result = await api<{ assigned: number; agent: string }>('/admin/support/assign', {
        method: 'POST',
        body: { ticketIds: [...selected], agentId },
        language,
      });
      setDone(t('support.assigned', { name: result.agent }));
      await load();
      await refresh();
    } catch (caught) {
      setError(caught as ApiError);
    } finally {
      setBusy(false);
    }
  };

  const toggle = (id: string) => {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  if (tickets === null) {
    return (
      <>
        <PageHeader title={t('support.title')} />
        <p className="text-ink-600">{t('common.loading')}</p>
      </>
    );
  }

  return (
    <>
      <PageHeader
        title={t('support.title')}
        actions={
          <div className="flex gap-1 rounded-lg border border-ink-300 bg-white p-0.5">
            {(['unassigned', 'mine'] as const).map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => setScope(option)}
                aria-pressed={scope === option}
                className={[
                  'rounded px-3 py-1.5 text-sm',
                  scope === option
                    ? 'bg-brand-600 font-medium text-white'
                    : 'text-ink-600 hover:bg-ink-100',
                ].join(' ')}
              >
                {option === 'unassigned' ? t('support.unassigned') : t('support.myQueue')}
              </button>
            ))}
          </div>
        }
      />

      {done && <SuccessAlert>{done}</SuccessAlert>}
      <ErrorAlert error={error} />

      <div className="grid gap-4 xl:grid-cols-[1fr_22rem]">
        <div>
          {tickets.length === 0 ? (
            <EmptyState title={t('support.emptyTitle')} body={t('support.emptyBody')} />
          ) : (
            <div className="rounded-lg bg-white">
              <Table>
                <thead>
                  <tr>
                    <Th>
                      <span className="sr-only">{t('support.assign')}</span>
                    </Th>
                    <Th>{t('support.ticket')}</Th>
                    <Th>{t('support.channel')}</Th>
                    <Th>{t('support.category')}</Th>
                    <Th>{t('support.priority')}</Th>
                    <Th>{t('support.requester')}</Th>
                    <Th>{t('support.subject')}</Th>
                    <Th numeric>{t('support.age')}</Th>
                    <Th>{t('support.slaCountdown')}</Th>
                  </tr>
                </thead>
                <tbody>
                  {tickets.map((ticket) => (
                    <Tr key={ticket.id}>
                      <Td>
                        <input
                          type="checkbox"
                          className="h-5 w-5"
                          checked={selected.has(ticket.id)}
                          onChange={() => toggle(ticket.id)}
                          aria-label={ticket.subject}
                        />
                      </Td>
                      <Td className="font-mono text-xs">{ticket.id.slice(0, 8)}</Td>
                      <Td>{t(TICKET_CHANNEL_KEY[ticket.channel] ?? 'common.notRecorded')}</Td>
                      <Td>
                        {t(TICKET_CATEGORY_KEY[ticket.category] ?? 'common.notRecorded')}
                        {/* FR-SUP-007: say where it went, rather than hide it. */}
                        {ticket.routedTo === 'finance' && (
                          <span className="mt-0.5 block text-xs text-ink-600">
                            {t('support.routedFinance')}
                          </span>
                        )}
                      </Td>
                      <Td>
                        <StateChip
                          tone={
                            ticket.priority === 'urgent'
                              ? 'warn'
                              : ticket.priority === 'high'
                                ? 'warn'
                                : 'neutral'
                          }
                        >
                          {ticket.priority}
                        </StateChip>
                      </Td>
                      <Td>
                        {ticket.requester.fullName}
                        <span className="block text-xs text-ink-600">
                          {ticket.requester.roles.join(' · ')}
                        </span>
                      </Td>
                      <Td className="max-w-xs">
                        <span className="line-clamp-2">{ticket.subject}</span>
                        {/* FR-NOT-007 / R7: the composer's rules depend on this. */}
                        {ticket.whatsapp && (
                          <span className="mt-0.5 block text-xs text-ink-600">
                            {ticket.whatsapp.open
                              ? t('support.whatsappWindowOpen', {
                                  duration: duration(ticket.whatsapp.minutesRemaining, t),
                                })
                              : t('support.whatsappWindowClosed')}
                          </span>
                        )}
                      </Td>
                      <Td numeric>{duration(ticket.ageMinutes, t)}</Td>
                      <Td>
                        {/* FR-SUP-006: the countdown, and the breach. */}
                        {ticket.sla.minutesRemaining === null ? (
                          <span className="text-ink-600">—</span>
                        ) : ticket.sla.breached ? (
                          <StateChip tone="frozen">
                            {t('support.slaBreached', {
                              duration: duration(ticket.sla.minutesRemaining, t),
                            })}
                          </StateChip>
                        ) : (
                          <StateChip tone="neutral">
                            {t('support.slaDueIn', {
                              duration: duration(ticket.sla.minutesRemaining, t),
                            })}
                          </StateChip>
                        )}
                      </Td>
                    </Tr>
                  ))}
                </tbody>
              </Table>
            </div>
          )}
        </div>

        {/* §4.5: the agent panel. */}
        {agents.length > 0 && (
          <aside className="rounded-lg border border-ink-300 bg-white p-3">
            <h2 className="mb-2 text-sm font-semibold text-ink-900">{t('support.agents')}</h2>
            <ul className="flex flex-col gap-2">
              {agents.map((agent) => (
                <li key={agent.id} className="rounded-md border border-ink-300 p-2.5">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="text-sm font-medium text-ink-900">{agent.fullName}</p>
                      <p className="text-xs text-ink-600">
                        {t('support.openTickets')}: {agent.openTickets} ·{' '}
                        {t('support.waitingOnUser')}: {agent.waitingOnUser}
                      </p>
                      <p className="text-xs text-ink-600">
                        {t('support.avgFirstResponse')}:{' '}
                        {agent.averageFirstResponseMinutes === null
                          ? '—'
                          : duration(agent.averageFirstResponseMinutes, t)}
                      </p>
                    </div>
                    <StateChip
                      tone={
                        agent.presence === 'online'
                          ? 'good'
                          : agent.presence === 'away'
                            ? 'warn'
                            : 'neutral'
                      }
                    >
                      {t(AGENT_PRESENCE_KEY[agent.presence] ?? 'common.notRecorded')}
                    </StateChip>
                  </div>
                </li>
              ))}
            </ul>

            <div className="mt-4 border-t border-ink-300 pt-3">
              <label className="cc-label" htmlFor="assign-agent">
                {t('support.assignTo')}
              </label>
              <select
                id="assign-agent"
                className="cc-field"
                value={agentId}
                onChange={(event) => setAgentId(event.target.value)}
              >
                <option value="">{t('common.none')}</option>
                {agents.map((agent) => (
                  <option key={agent.id} value={agent.id}>
                    {agent.fullName} ({agent.openTickets}/{agent.maxOpenTickets})
                  </option>
                ))}
              </select>
              <button
                type="button"
                className="cc-btn-primary mt-2 w-full"
                disabled={busy || !agentId || selected.size === 0}
                onClick={() => void assign()}
              >
                {t('support.assignSelected', { count: selected.size })}
              </button>
            </div>
          </aside>
        )}
      </div>
    </>
  );
}
