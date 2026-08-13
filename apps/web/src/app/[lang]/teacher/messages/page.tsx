'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { TeacherThreadSummaryDto } from '@classconnect/shared';
import { useI18n } from '@/lib/i18n';
import { api, ApiError } from '@/lib/api';
import { PageHeader } from '@/components/admin/ui';
import { ErrorAlert } from '@/components/Alert';
import { TeacherGate } from '@/components/teacher/TeacherGate';

interface ThreadMessage {
  id: string;
  mine: boolean;
  senderName: string;
  body: string;
  redacted: boolean;
  sentAt: string;
}

interface ThreadDetail {
  threadId: string;
  counterpartName: string;
  counterpartRole: string;
  mayPost: boolean;
  cannotPostReasonKey: string | null;
  messages: ThreadMessage[];
}

/**
 * The teacher's messages, with ClassConnect as the default conversation.
 *
 * Two panes on a laptop, one at a time on a phone — the list until a thread is
 * opened, then the thread. A side-by-side layout at the 360px reference width
 * would give each pane 180px, which is not a conversation.
 *
 * The redaction notice is shown on every message it fired on, not once at the top:
 * FR-SAF-002 strips phone numbers and handles from a channel that includes
 * children, and a teacher who does not know *which* message was altered will
 * reasonably assume none was.
 */
function TeacherMessagesPage() {
  const { t, language } = useI18n();

  const [threads, setThreads] = useState<TeacherThreadSummaryDto[] | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [thread, setThread] = useState<ThreadDetail | null>(null);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  const endRef = useRef<HTMLDivElement>(null);

  const loadThreads = useCallback(async () => {
    try {
      const result = await api<{ threads: TeacherThreadSummaryDto[] }>('/teacher/messages', {
        language,
      });
      setThreads(result.threads);
    } catch (caught) {
      setError(caught as ApiError);
      setThreads([]);
    }
  }, [language]);

  useEffect(() => {
    void loadThreads();
  }, [loadThreads]);

  const openThread = useCallback(
    async (threadId: string) => {
      setOpenId(threadId);
      setThread(null);
      try {
        const result = await api<ThreadDetail>(`/teacher/messages/${threadId}`, { language });
        setThread(result);
        // Opening is what marks it read server-side, so the list is refreshed to
        // clear the badge rather than clearing it optimistically here.
        void loadThreads();
      } catch (caught) {
        setError(caught as ApiError);
      }
    },
    [language, loadThreads],
  );

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end' });
  }, [thread?.messages.length]);

  /** The brief's "with the admin as default". Idempotent server-side. */
  const messageClassConnect = async () => {
    setBusy(true);
    setError(null);
    try {
      const result = await api<{ threadId: string }>('/teacher/messages/support', {
        method: 'POST',
        language,
      });
      await loadThreads();
      await openThread(result.threadId);
    } catch (caught) {
      setError(caught as ApiError);
    } finally {
      setBusy(false);
    }
  };

  const send = async () => {
    const body = draft.trim();
    if (!body || !openId) return;
    setBusy(true);
    setError(null);
    try {
      await api(`/teacher/messages/${openId}`, {
        method: 'POST',
        body: { body, attachmentIds: [] },
        language,
        timeoutMs: 120_000,
      });
      setDraft('');
      await openThread(openId);
    } catch (caught) {
      setError(caught as ApiError);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <PageHeader
        title={t('teacherNav.messages')}
        description={t('teacherMessages.description')}
      />

      <ErrorAlert error={error} />

      <div className="grid gap-4 lg:grid-cols-[20rem_1fr]">
        {/* The list. Hidden on a phone once a thread is open. */}
        <section className={openId ? 'hidden lg:block' : 'block'}>
          <button
            type="button"
            className="cc-btn-primary mb-3 w-full"
            disabled={busy}
            onClick={() => void messageClassConnect()}
          >
            {t('teacherMessages.contactAdmin')}
          </button>

          {threads === null ? (
            <p className="text-sm text-ink-600">{t('common.loading')}</p>
          ) : threads.length === 0 ? (
            <p className="rounded-xl border border-ink-200 bg-white p-4 text-sm text-ink-600">
              {t('teacherMessages.none')}
            </p>
          ) : (
            <ul className="flex flex-col gap-2">
              {threads.map((item) => (
                <li key={item.threadId}>
                  <button
                    type="button"
                    onClick={() => void openThread(item.threadId)}
                    aria-current={openId === item.threadId}
                    className={[
                      'w-full rounded-xl border p-3 text-left',
                      openId === item.threadId
                        ? 'border-brand-600 bg-brand-50'
                        : 'border-ink-200 bg-white',
                    ].join(' ')}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate text-sm font-semibold text-ink-900">
                        {item.counterpartName}
                      </span>
                      {item.unreadCount > 0 && (
                        <span className="shrink-0 rounded-full bg-brand-600 px-2 text-xs font-medium text-white">
                          {item.unreadCount}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-ink-500">
                      {t(`teacherMessages.role.${item.counterpartRole}`)}
                      {item.subject ? ` · ${item.subject.name}` : ''}
                    </p>
                    {item.lastMessagePreview && (
                      <p className="mt-1 truncate text-xs text-ink-600">
                        {item.lastMessagePreview}
                      </p>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* The conversation. */}
        <section className={openId ? 'block' : 'hidden lg:block'}>
          {!openId ? (
            <p className="rounded-xl border border-ink-200 bg-white p-4 text-sm text-ink-600">
              {t('teacherMessages.pickOne')}
            </p>
          ) : thread === null ? (
            <p className="text-sm text-ink-600">{t('common.loading')}</p>
          ) : (
            <div className="flex h-[32rem] flex-col rounded-xl border border-ink-200 bg-white">
              <header className="flex items-center gap-2 border-b border-ink-200 p-3">
                <button
                  type="button"
                  onClick={() => {
                    setOpenId(null);
                    setThread(null);
                  }}
                  className="min-h-touch text-sm font-medium text-brand-700 lg:hidden"
                >
                  {t('common.back')}
                </button>
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-ink-900">
                    {thread.counterpartName}
                  </p>
                  <p className="text-xs text-ink-500">
                    {t(`teacherMessages.role.${thread.counterpartRole}`)}
                  </p>
                </div>
              </header>

              <div className="flex-1 space-y-2 overflow-y-auto p-3">
                {thread.messages.length === 0 && (
                  <p className="text-sm text-ink-600">{t('teacherMessages.empty')}</p>
                )}
                {thread.messages.map((message) => (
                  <div
                    key={message.id}
                    className={`flex ${message.mine ? 'justify-end' : 'justify-start'}`}
                  >
                    <div
                      className={[
                        'max-w-[85%] rounded-2xl px-3 py-2 text-sm',
                        message.mine
                          ? 'bg-brand-600 text-white'
                          : 'bg-ink-100 text-ink-900',
                      ].join(' ')}
                    >
                      {!message.mine && (
                        <p className="text-xs font-medium text-ink-600">{message.senderName}</p>
                      )}
                      <p className="whitespace-pre-wrap">{message.body}</p>
                      {/*
                       * FR-SAF-002, said on the message it happened to. A notice at
                       * the top of the thread would leave the teacher guessing which
                       * of their messages was altered — and therefore assuming none
                       * was.
                       */}
                      {message.redacted && (
                        <p
                          className={`mt-1 text-xs ${message.mine ? 'text-white/80' : 'text-ink-600'}`}
                        >
                          {t('teacherMessages.redacted')}
                        </p>
                      )}
                    </div>
                  </div>
                ))}
                <div ref={endRef} />
              </div>

              <footer className="border-t border-ink-200 p-3">
                {thread.mayPost ? (
                  <div className="flex gap-2">
                    <textarea
                      className="cc-field min-h-touch flex-1 resize-none"
                      rows={2}
                      maxLength={5000}
                      value={draft}
                      placeholder={t('teacherMessages.placeholder')}
                      onChange={(event) => setDraft(event.target.value)}
                    />
                    <button
                      type="button"
                      className="cc-btn-primary shrink-0"
                      disabled={busy || draft.trim().length === 0}
                      onClick={() => void send()}
                    >
                      {busy ? t('common.sending') : t('teacherMessages.send')}
                    </button>
                  </div>
                ) : (
                  <p className="text-sm text-ink-600">
                    {t(thread.cannotPostReasonKey ?? 'teacherMessages.closed')}
                  </p>
                )}
              </footer>
            </div>
          )}
        </section>
      </div>
    </>
  );
}

/**
 * Closed until an Admin approves the application (FR-TVR-005).
 *
 * The gate wraps the screen rather than living inside it, so the component above
 * never renders — and therefore never fires the API calls that would 403 — while
 * the teacher is unapproved. See `TeacherGate`.
 */
export default function Page() {
  return (
    <TeacherGate titleKey="teacherNav.messages">
      <TeacherMessagesPage />
    </TeacherGate>
  );
}
