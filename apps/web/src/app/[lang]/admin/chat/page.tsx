'use client';

import { useCallback, useEffect, useState } from 'react';
import { api, type ApiError } from '@/lib/api';
import { useI18n } from '@/lib/i18n';

/**
 * The live-chat desk: every visitor conversation, and one open at a time.
 *
 * ## Why the reply cannot go to the wrong person
 *
 * The reply is posted to `/admin/chat/sessions/:id/messages`, where `:id` is the
 * session the desk has open. There is no shared "current conversation" on the
 * server — each request names its own session — so two agents working different
 * chats side by side cannot cross, and neither can one agent switching quickly
 * between them.
 *
 * ## Polling, and why the two lists poll differently
 *
 * The queue refreshes every eight seconds; an open conversation every four. The
 * queue is a glance and can be slightly stale; a conversation somebody is
 * actively typing into cannot. Both stop while the tab is hidden.
 *
 * A socket would be better and is not available: the browser reaches the API
 * through the same-origin `/api/v1` bridge, which cannot carry a WebSocket
 * upgrade. Nothing here would change if that were fixed — the poll would simply
 * become the fallback.
 */
interface SessionRow {
  id: string;
  visitorName: string | null;
  visitorEmail: string | null;
  status: 'waiting' | 'active' | 'closed';
  assignee: { id: string; displayName: string } | null;
  lastMessageAt: string | null;
  preview: string | null;
  unread: number;
  createdAt: string;
}

interface ChatMessage {
  id: string;
  sender: 'visitor' | 'staff';
  body: string;
  file: { name: string | null; scanStatus: string | null } | null;
  createdAt: string;
}

interface Conversation {
  id: string;
  visitorName: string | null;
  visitorEmail: string | null;
  status: 'waiting' | 'active' | 'closed';
  messages: ChatMessage[];
}

type Filter = 'open' | 'waiting' | 'active' | 'closed';

const QUEUE_POLL_MS = 8_000;
const THREAD_POLL_MS = 4_000;

export default function AdminChat() {
  const { t, language } = useI18n();
  const [filter, setFilter] = useState<Filter>('open');
  const [sessions, setSessions] = useState<SessionRow[] | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [thread, setThread] = useState<Conversation | null>(null);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);

  const loadQueue = useCallback(async () => {
    try {
      setSessions(await api<SessionRow[]>(`/admin/chat/sessions?filter=${filter}`, { language }));
    } catch (caught) {
      setError(caught as ApiError);
    }
  }, [filter, language]);

  const loadThread = useCallback(
    async (id: string) => {
      try {
        setThread(await api<Conversation>(`/admin/chat/sessions/${id}`, { language }));
      } catch (caught) {
        setError(caught as ApiError);
      }
    },
    [language],
  );

  useEffect(() => {
    void loadQueue();
    const tick = () => {
      if (document.visibilityState === 'visible') void loadQueue();
    };
    const timer = setInterval(tick, QUEUE_POLL_MS);
    document.addEventListener('visibilitychange', tick);
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', tick);
    };
  }, [loadQueue]);

  useEffect(() => {
    if (!openId) return;
    void loadThread(openId);
    const tick = () => {
      if (document.visibilityState === 'visible') void loadThread(openId);
    };
    const timer = setInterval(tick, THREAD_POLL_MS);
    document.addEventListener('visibilitychange', tick);
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', tick);
    };
  }, [openId, loadThread]);

  const reply = async () => {
    const text = draft.trim();
    if (!text || !openId || busy) return;
    setBusy(true);
    setError(null);
    try {
      await api(`/admin/chat/sessions/${openId}/messages`, {
        method: 'POST',
        body: { body: text },
        language,
      });
      setDraft('');
      await Promise.all([loadThread(openId), loadQueue()]);
    } catch (caught) {
      // The draft stays in the box. Losing what somebody typed to report a
      // failed send is two problems instead of one.
      setError(caught as ApiError);
    } finally {
      setBusy(false);
    }
  };

  const close = async () => {
    if (!openId || busy) return;
    setBusy(true);
    try {
      await api(`/admin/chat/sessions/${openId}/close`, { method: 'POST', language });
      await Promise.all([loadThread(openId), loadQueue()]);
    } catch (caught) {
      setError(caught as ApiError);
    } finally {
      setBusy(false);
    }
  };

  const waiting = (sessions ?? []).filter((s) => s.status === 'waiting').length;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold text-ink-900">{t('adminChat.title')}</h1>
        <p className="text-sm text-ink-600">
          {t('adminChat.waitingCount', { count: waiting })}
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        {(['open', 'waiting', 'active', 'closed'] as const).map((key) => (
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
            {t(`adminChat.filter.${key}`)}
          </button>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-[20rem_1fr]">
        {/* The queue */}
        <ul className="space-y-2">
          {sessions?.length === 0 && (
            <li className="rounded-lg border border-ink-200 p-4 text-sm text-ink-600">
              {t('adminChat.emptyQueue')}
            </li>
          )}
          {(sessions ?? []).map((session) => (
            <li key={session.id}>
              <button
                type="button"
                onClick={() => setOpenId(session.id)}
                aria-pressed={openId === session.id}
                className={`w-full rounded-lg border p-3 text-left ${
                  openId === session.id ? 'border-brand-600 bg-brand-50' : 'border-ink-300'
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate text-sm font-medium text-ink-900">
                    {/* A visitor who gave no name is still a person waiting, so
                        they get a stable label rather than a blank row. */}
                    {session.visitorName || t('adminChat.guest')}
                  </span>
                  {session.unread > 0 && (
                    <span className="shrink-0 rounded-full bg-danger-600 px-2 py-0.5 text-xs font-semibold text-white">
                      {session.unread}
                    </span>
                  )}
                </div>
                {session.preview && (
                  <p className="mt-0.5 truncate text-xs text-ink-600">{session.preview}</p>
                )}
                <p className="mt-1 text-[11px] uppercase tracking-wide text-ink-600">
                  {t(`adminChat.status.${session.status}`)}
                  {session.assignee ? ` · ${session.assignee.displayName}` : ''}
                </p>
              </button>
            </li>
          ))}
        </ul>

        {/* The conversation */}
        <div className="rounded-xl border border-ink-300 bg-white">
          {!thread ? (
            <p className="p-6 text-sm text-ink-600">{t('adminChat.selectOne')}</p>
          ) : (
            <div className="flex h-[32rem] flex-col">
              <header className="flex items-center justify-between border-b border-ink-200 px-4 py-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-ink-900">
                    {thread.visitorName || t('adminChat.guest')}
                  </p>
                  {thread.visitorEmail && (
                    <p className="truncate text-xs text-ink-600">{thread.visitorEmail}</p>
                  )}
                </div>
                {thread.status !== 'closed' && (
                  <button
                    type="button"
                    onClick={() => void close()}
                    disabled={busy}
                    className="min-h-touch rounded-lg border border-ink-300 px-3 text-sm disabled:opacity-60"
                  >
                    {t('adminChat.close')}
                  </button>
                )}
              </header>

              <div className="flex-1 space-y-2 overflow-y-auto p-4">
                {thread.messages.map((message) => (
                  <div
                    key={message.id}
                    className={`max-w-[75%] rounded-lg px-3 py-2 text-sm ${
                      message.sender === 'staff'
                        ? 'ml-auto bg-brand-700 text-white'
                        : 'bg-ink-100 text-ink-900'
                    }`}
                  >
                    <p className="whitespace-pre-wrap">{message.body}</p>
                    {message.file && (
                      <p className="mt-1 text-xs opacity-80">
                        {message.file.name}
                        {message.file.scanStatus !== 'clean' &&
                          ` — ${t('adminChat.fileChecking')}`}
                      </p>
                    )}
                  </div>
                ))}
              </div>

              {thread.status === 'closed' ? (
                <p className="border-t border-ink-200 p-4 text-center text-xs text-ink-600">
                  {t('adminChat.closedBody')}
                </p>
              ) : (
                <div className="flex items-end gap-2 border-t border-ink-200 p-3">
                  <textarea
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        void reply();
                      }
                    }}
                    rows={2}
                    maxLength={4000}
                    placeholder={t('adminChat.placeholder')}
                    aria-label={t('adminChat.placeholder')}
                    className="min-h-touch flex-1 resize-none rounded-lg border border-ink-300 p-2 text-sm"
                  />
                  <button
                    type="button"
                    onClick={() => void reply()}
                    disabled={busy || !draft.trim()}
                    className="min-h-touch rounded-lg bg-brand-700 px-4 text-sm font-semibold text-white disabled:opacity-60"
                  >
                    {t('adminChat.send')}
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {error && (
        <p className="text-sm text-danger-600" role="alert">
          {t(error.messageKey)}
        </p>
      )}
    </div>
  );
}
