'use client';

import { useCallback, useEffect, useState } from 'react';
import { useI18n } from '@/lib/i18n';
import { useAutoRecover } from '@/lib/use-auto-recover';
import { api, type ApiError } from '@/lib/api';
import { ErrorAlert, EmptyState } from '@/components/Alert';
import {
  Banner,
  ExportButton,
  PageHeader,
  Table,
  Td,
  Th,
  Tr,
  When,
} from '@/components/admin/ui';

/**
 * §6 — the audit log.
 *
 * "Read-only in the UI — there is no delete control, because there is no
 * delete." There is also no edit control and no bulk action: this screen is a
 * search over an append-only table, and the database refuses UPDATE and DELETE
 * on it to the application role (DAT-005).
 */

interface Entry {
  id: string;
  occurredAt: string;
  actor: { id: string; fullName: string } | null;
  action: string;
  entity: string;
  entityId: string | null;
  before: unknown;
  after: unknown;
  ip: string | null;
  correlationId: string | null;
  reason: string | null;
}

export default function AuditLog() {
  const { language, t } = useI18n();

  const [entries, setEntries] = useState<Entry[] | null>(null);
  const [actions, setActions] = useState<string[]>([]);
  const [error, setError] = useState<ApiError | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);

  const [filters, setFilters] = useState({ action: '', entity: '', from: '', to: '' });

  const load = useCallback(async () => {
    setError(null);
    try {
      const query = new URLSearchParams(
        Object.entries(filters).filter((entry): entry is [string, string] => Boolean(entry[1])),
      ).toString();
      const [result, actionList] = await Promise.all([
        api<{ entries: Entry[]; nextCursor: string | null }>(
          `/admin/audit${query ? `?${query}` : ''}`,
          { language },
        ),
        api<string[]>('/admin/audit/actions', { language }).catch(() => [] as string[]),
      ]);
      setEntries(result.entries);
      setActions(actionList);
    } catch (caught) {
      setError(caught as ApiError);
      setEntries([]);
    }
  }, [language, filters]);

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
      <PageHeader
        title={t('audit.title')}
        actions={<ExportButton dataset="audit" query={filters} />}
      />

      <Banner>{t('audit.readOnly')}</Banner>
      <ErrorAlert error={error} />

      <div className="mb-4 flex flex-wrap gap-3 rounded-lg border border-ink-300 bg-white p-3">
        <div>
          <label className="cc-label" htmlFor="filter-action">
            {t('audit.filterAction')}
          </label>
          <select
            id="filter-action"
            className="cc-field !min-h-0 !w-auto !py-1.5 text-sm"
            value={filters.action}
            onChange={(event) => setFilters((f) => ({ ...f, action: event.target.value }))}
          >
            <option value="">{t('reports.all')}</option>
            {actions.map((action) => (
              <option key={action} value={action}>
                {action}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="cc-label" htmlFor="filter-entity">
            {t('audit.filterEntity')}
          </label>
          <input
            id="filter-entity"
            className="cc-field !min-h-0 !w-auto !py-1.5 text-sm"
            value={filters.entity}
            onChange={(event) => setFilters((f) => ({ ...f, entity: event.target.value }))}
          />
        </div>
        <div>
          <label className="cc-label" htmlFor="filter-from">
            {t('reports.from')}
          </label>
          <input
            id="filter-from"
            type="date"
            className="cc-field !min-h-0 !w-auto !py-1.5 text-sm"
            value={filters.from}
            onChange={(event) => setFilters((f) => ({ ...f, from: event.target.value }))}
          />
        </div>
        <div>
          <label className="cc-label" htmlFor="filter-to">
            {t('reports.to')}
          </label>
          <input
            id="filter-to"
            type="date"
            className="cc-field !min-h-0 !w-auto !py-1.5 text-sm"
            value={filters.to}
            onChange={(event) => setFilters((f) => ({ ...f, to: event.target.value }))}
          />
        </div>
      </div>

      {entries === null ? (
        <p className="text-ink-600">{t('common.loading')}</p>
      ) : entries.length === 0 ? (
        <EmptyState title={t('audit.emptyTitle')} body={t('audit.emptyBody')} />
      ) : (
        <div className="rounded-lg bg-white">
          <Table>
            <thead>
              <tr>
                <Th>{t('audit.when')}</Th>
                <Th>{t('audit.actor')}</Th>
                <Th>{t('audit.action')}</Th>
                <Th>{t('audit.entity')}</Th>
                <Th>{t('audit.ip')}</Th>
                <Th>{t('audit.reason')}</Th>
                <Th>{t('audit.viewDetail')}</Th>
              </tr>
            </thead>
            <tbody>
              {entries.map((entry) => (
                <Tr key={entry.id}>
                  <Td>
                    <When value={entry.occurredAt} />
                  </Td>
                  {/* A rule that fired has no actor; "System" beats a blank. */}
                  <Td>{entry.actor?.fullName ?? t('audit.system')}</Td>
                  <Td className="font-mono text-xs">{entry.action}</Td>
                  <Td className="font-mono text-xs">
                    {entry.entity}
                    {entry.entityId && (
                      <span className="block text-ink-600">{entry.entityId.slice(0, 8)}</span>
                    )}
                  </Td>
                  <Td className="font-mono text-xs">{entry.ip ?? '—'}</Td>
                  <Td className="max-w-xs text-xs">{entry.reason ?? '—'}</Td>
                  <Td>
                    <button
                      type="button"
                      className="text-left text-xs text-brand-700 underline"
                      aria-expanded={expanded === entry.id}
                      onClick={() => setExpanded(expanded === entry.id ? null : entry.id)}
                    >
                      {t('audit.viewDetail')}
                    </button>
                    {expanded === entry.id && (
                      <div className="mt-2 grid gap-2 md:grid-cols-2">
                        <div>
                          <p className="text-xs font-semibold text-ink-600">{t('audit.before')}</p>
                          <pre className="max-w-xs overflow-x-auto rounded bg-ink-100 p-2 text-[0.6875rem]">
                            {JSON.stringify(entry.before, null, 2)}
                          </pre>
                        </div>
                        <div>
                          <p className="text-xs font-semibold text-ink-600">{t('audit.after')}</p>
                          <pre className="max-w-xs overflow-x-auto rounded bg-ink-100 p-2 text-[0.6875rem]">
                            {JSON.stringify(entry.after, null, 2)}
                          </pre>
                        </div>
                      </div>
                    )}
                  </Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        </div>
      )}
    </>
  );
}
