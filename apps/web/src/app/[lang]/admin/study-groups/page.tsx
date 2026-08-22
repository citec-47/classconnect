'use client';

import { useCallback, useEffect, useState } from 'react';
import { useI18n } from '@/lib/i18n';
import { api, ApiError } from '@/lib/api';
import { ErrorAlert, EmptyState } from '@/components/Alert';

/**
 * Study groups, and the deleted ones in particular.
 *
 * A learner can delete a group they own. The rows survive — `deletedAt` is set
 * and the thread seats removed — so what actually happens is that a
 * conversation between children becomes invisible to everyone who was in it,
 * and to anyone who later needs to look. That default is right; closing a group
 * should not need permission. But it is exactly the event a safeguarding review
 * has to be able to find, which is what this screen is for.
 *
 * Deleted is the default filter, because the reason to open this page is almost
 * always something that disappeared.
 */
interface GroupRow {
  id: string;
  name: string;
  level: string;
  owner: { id: string; displayName: string };
  members: number;
  tasks: number;
  messages: number;
  locked: boolean;
  createdAt: string;
  deletedAt: string | null;
}

type Filter = 'deleted' | 'active' | 'all';

export default function AdminStudyGroups() {
  const { t, language } = useI18n();
  const [filter, setFilter] = useState<Filter>('deleted');
  const [groups, setGroups] = useState<GroupRow[] | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<ApiError | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      setGroups(await api<GroupRow[]>(`/admin/study-groups?filter=${filter}`, { language }));
    } catch (caught) {
      setError(caught as ApiError);
      setGroups([]);
    }
  }, [filter, language]);

  useEffect(() => {
    void load();
  }, [load]);

  const restore = async (id: string) => {
    if (busyId) return;
    setBusyId(id);
    setError(null);
    try {
      await api(`/admin/study-groups/${id}/restore`, { method: 'POST', language });
      await load();
    } catch (caught) {
      setError(caught as ApiError);
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold text-ink-900">{t('studyGroupsAdmin.title')}</h1>
        <p className="max-w-prose text-sm text-ink-600">{t('studyGroupsAdmin.intro')}</p>
      </div>

      <div className="flex flex-wrap gap-2">
        {(['deleted', 'active', 'all'] as const).map((key) => (
          <button
            key={key}
            type="button"
            onClick={() => setFilter(key)}
            aria-pressed={filter === key}
            className={`min-h-touch rounded-lg border px-3 text-sm ${
              filter === key
                ? 'border-brand-600 bg-brand-50 text-brand-700'
                : 'border-ink-300 text-ink-700'
            }`}
          >
            {t(`studyGroupsAdmin.filter.${key}`)}
          </button>
        ))}
      </div>

      <ErrorAlert error={error} />

      {groups?.length === 0 ? (
        <EmptyState title={t('studyGroupsAdmin.none')} body={t('studyGroupsAdmin.intro')} />
      ) : (
        <ul className="space-y-2">
          {(groups ?? []).map((group) => (
            <li
              key={group.id}
              className="rounded-xl border border-ink-300 bg-white p-4"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-medium text-ink-900">{group.name}</p>
                  <p className="text-sm text-ink-600">
                    {group.level} · {t('studyGroupsAdmin.owner', { name: group.owner.displayName })}
                  </p>
                  {/*
                    * How much would be lost, or was. A group with two messages
                    * and one with four hundred are not the same decision.
                    */}
                  <p className="mt-1 text-xs text-ink-600">
                    {t('studyGroupsAdmin.counts', {
                      members: group.members,
                      messages: group.messages,
                      tasks: group.tasks,
                    })}
                  </p>
                </div>

                {group.deletedAt ? (
                  <button
                    type="button"
                    onClick={() => void restore(group.id)}
                    disabled={busyId !== null}
                    className="cc-btn-primary shrink-0 disabled:opacity-60"
                  >
                    {busyId === group.id
                      ? t('common.saving')
                      : t('studyGroupsAdmin.restore')}
                  </button>
                ) : (
                  <span className="shrink-0 rounded-full bg-success-50 px-2 py-0.5 text-xs font-medium text-success-600">
                    {t('studyGroupsAdmin.live')}
                  </span>
                )}
              </div>

              {group.deletedAt && (
                <p className="mt-2 text-xs text-danger-600">
                  {t('studyGroupsAdmin.deletedOn', {
                    date: new Date(group.deletedAt).toLocaleDateString(language),
                  })}
                </p>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
