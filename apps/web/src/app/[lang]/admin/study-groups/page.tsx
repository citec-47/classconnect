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

interface Attachment {
  id: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  scanStatus: string;
  /** Present on a voice note; null on everything else. */
  durationSec: number | null;
}

interface GroupMessage {
  id: string;
  senderName: string;
  body: string;
  /** What was typed, where FR-SAF-002 redaction changed it. */
  original: string | null;
  /** Withheld from the group by a moderator, kept for the investigation. */
  withheld: boolean;
  sentAt: string;
  attachments: Attachment[];
}

interface Conversation {
  id: string;
  name: string;
  owner: string;
  deletedAt: string | null;
  members: { displayName: string; left: boolean }[];
  messages: GroupMessage[];
}

type Filter = 'deleted' | 'active' | 'all';

export default function AdminStudyGroups() {
  const { t, language } = useI18n();
  const [filter, setFilter] = useState<Filter>('deleted');
  const [groups, setGroups] = useState<GroupRow[] | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  /**
   * The group being read, if any.
   *
   * Opened in place rather than on its own route. This is a review action taken
   * while working down a list, and a page change would lose the filter and the
   * scroll position every time somebody checked one group.
   */
  const [openGroup, setOpenGroup] = useState<Conversation | null>(null);
  const [opening, setOpening] = useState<string | null>(null);

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

  /**
   * Opening a conversation.
   *
   * The read is audited on the server before anything comes back — a study
   * group is children talking to each other, and FR-RBA-004 requires every
   * staff access to a learner's personal data to be recorded.
   */
  const openConversation = async (id: string) => {
    if (opening) return;
    setOpening(id);
    setError(null);
    try {
      setOpenGroup(await api<Conversation>(`/admin/study-groups/${id}`, { language }));
    } catch (caught) {
      setError(caught as ApiError);
    } finally {
      setOpening(null);
    }
  };

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

      {/*
        * The conversation, in place above the list.
        *
        * Every message including ones a moderator withheld, and every file
        * described rather than linked — FR-FIL-003 signs a download per request
        * and re-checks the scan, so a permanent URL to a child's attachment is
        * exactly what must not exist on an admin screen.
        */}
      {openGroup && (
        <section className="mt-4 rounded-xl border border-brand-600 bg-white p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="font-semibold text-ink-900">{openGroup.name}</h2>
              <p className="text-sm text-ink-600">
                {t('studyGroupsAdmin.owner', { name: openGroup.owner })} ·{' '}
                {openGroup.members
                  .map((member) =>
                    member.left
                      ? t('studyGroupsAdmin.memberLeft', { name: member.displayName })
                      : member.displayName,
                  )
                  .join(', ')}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setOpenGroup(null)}
              className="min-h-touch rounded-lg border border-ink-300 px-3 text-sm"
            >
              {t('common.close')}
            </button>
          </div>

          {openGroup.messages.length === 0 ? (
            <p className="mt-3 text-sm text-ink-600">{t('studyGroupsAdmin.noMessages')}</p>
          ) : (
            <ul className="mt-3 max-h-[28rem] space-y-2 overflow-y-auto">
              {openGroup.messages.map((message) => (
                <li
                  key={message.id}
                  className={`rounded-lg p-3 ${
                    message.withheld ? 'bg-danger-50' : 'bg-ink-100'
                  }`}
                >
                  <p className="text-xs font-medium text-ink-900">
                    {message.senderName}
                    <span className="ml-2 font-normal text-ink-600">
                      {new Date(message.sentAt).toLocaleString(language)}
                    </span>
                    {message.withheld && (
                      <span className="ml-2 font-normal text-danger-600">
                        {t('studyGroupsAdmin.withheld')}
                      </span>
                    )}
                  </p>

                  <p className="mt-1 whitespace-pre-wrap text-sm text-ink-900">{message.body}</p>

                  {/*
                    * What was typed, where redaction changed it. A review that
                    * saw only the redacted version would be reading the
                    * platform's edit rather than what the child wrote.
                    */}
                  {message.original && (
                    <p className="mt-1 whitespace-pre-wrap rounded bg-warning-50 p-2 text-xs text-ink-900">
                      {t('studyGroupsAdmin.asTyped')}: {message.original}
                    </p>
                  )}

                  {message.attachments.length > 0 && (
                    <ul className="mt-2 space-y-1">
                      {message.attachments.map((file) => (
                        <li key={file.id} className="text-xs text-ink-600">
                          📎 {file.fileName} · {file.mimeType} ·{' '}
                          {Math.max(1, Math.round(file.sizeBytes / 1024))} KB
                          {file.durationSec !== null &&
                            ` · ${t('studyGroupsAdmin.seconds', { count: file.durationSec })}`}
                          {file.scanStatus !== 'clean' &&
                            ` · ${t('studyGroupsAdmin.fileChecking')}`}
                        </li>
                      ))}
                    </ul>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

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
                  {/*
                    * The name is the way in. A separate "Open" button beside a
                    * row whose obvious affordance is the row itself is one more
                    * thing to find, and this list is read by someone looking
                    * for a specific group.
                    */}
                  <button
                    type="button"
                    onClick={() => void openConversation(group.id)}
                    disabled={opening !== null}
                    className="text-left font-medium text-brand-700 underline disabled:opacity-60"
                  >
                    {opening === group.id ? t('common.loading') : group.name}
                  </button>
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
