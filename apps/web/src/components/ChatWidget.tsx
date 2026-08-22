'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '@/lib/api';
import { useI18n } from '@/lib/i18n';

/**
 * The floating live-chat widget, for visitors with no account.
 *
 * ## The token is the whole of the isolation
 *
 * Opening the chat mints a session server-side and returns a secret. That secret
 * is the only handle this browser has, it goes in `x-chat-token`, and the API
 * resolves it to exactly one conversation. There is no session id in any request
 * this widget makes — which is why ten people chatting at once cannot see each
 * other: not because a check passes, but because none of them can name anyone
 * else's session.
 *
 * Kept in `localStorage` so the conversation survives a reload, which on a
 * shared handset over patchy data is the common case rather than the edge one.
 *
 * ## Polling, not a socket
 *
 * Chosen deliberately. The browser reaches the API through the frontend's
 * same-origin `/api/v1` bridge, and a WebSocket upgrade never reaches a Next API
 * route — a socket here would fail on every attempt. The same reasoning already
 * governs learner messaging, where a poll degrades to "slightly late" and a
 * dropped socket degrades to "silently dead".
 *
 * Polling stops when the widget is closed and when the tab is hidden, so a
 * visitor who wandered off is not spending their data on an idle conversation.
 */
interface ChatMessage {
  id: string;
  sender: 'visitor' | 'staff';
  body: string;
  file: { name: string | null; scanStatus: string | null } | null;
  createdAt: string;
}

const TOKEN_KEY = 'cc.chatToken';
const POLL_MS = 4_000;

export function ChatWidget() {
  const { t, language } = useI18n();
  const [open, setOpen] = useState(false);
  const [token, setToken] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState('');
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const [closed, setClosed] = useState(false);
  /** Replies that arrived while the window was shut, for the button's badge. */
  const [unseen, setUnseen] = useState(0);
  const seenCount = useRef(0);
  const endRef = useRef<HTMLDivElement>(null);

  /*
   * `localStorage` can throw outright — a private window, or a browser set to
   * block site data — so every access is guarded. A visitor whose browser
   * refuses storage still gets a working chat; it just does not survive a
   * reload, which is a smaller loss than the widget crashing the page.
   */
  useEffect(() => {
    try {
      setToken(window.localStorage.getItem(TOKEN_KEY));
    } catch {
      setToken(null);
    }
  }, []);

  const refresh = useCallback(
    async (current: string) => {
      try {
        const reply = await api<{ status: string; messages: ChatMessage[] }>(
          '/chat/messages',
          { language, headers: { 'x-chat-token': current } },
        );
        setMessages(reply.messages);
        setClosed(reply.status === 'closed');
        setFailed(false);
      } catch {
        /*
         * Quiet on a failed poll. The conversation on screen stays, and the next
         * poll four seconds later usually succeeds — a banner on a dropped
         * request would flicker constantly on the connections this is for.
         */
      }
    },
    [language],
  );

  /** Poll only while the window is open and the tab is in front. */
  useEffect(() => {
    if (!token || !open) return;
    void refresh(token);
    const tick = () => {
      if (document.visibilityState === 'visible') void refresh(token);
    };
    const timer = setInterval(tick, POLL_MS);
    document.addEventListener('visibilitychange', tick);
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', tick);
    };
  }, [token, open, refresh]);

  /*
   * The badge counts staff replies this visitor has not had on screen.
   *
   * Tracked against what was shown while open rather than against a server
   * field, because "unread" for the widget means "arrived while you were not
   * looking", and the server cannot know whether the window is up.
   */
  useEffect(() => {
    if (open) {
      seenCount.current = messages.length;
      setUnseen(0);
    } else {
      setUnseen(Math.max(0, messages.length - seenCount.current));
    }
  }, [messages, open]);

  const start = async () => {
    setBusy(true);
    setFailed(false);
    try {
      const created = await api<{ visitorToken: string }>('/chat/session', {
        method: 'POST',
        body: { ...(name.trim() ? { visitorName: name.trim() } : {}) },
        language,
      });
      try {
        window.localStorage.setItem(TOKEN_KEY, created.visitorToken);
      } catch {
        // Works for this visit; will not survive a reload. Better than nothing.
      }
      setToken(created.visitorToken);
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  };

  const send = async () => {
    const text = draft.trim();
    if (!text || !token || busy) return;
    setBusy(true);
    setFailed(false);
    try {
      await api('/chat/messages', {
        method: 'POST',
        body: { body: text },
        language,
        headers: { 'x-chat-token': token },
      });
      setDraft('');
      await refresh(token);
      endRef.current?.scrollIntoView({ behavior: 'smooth' });
    } catch {
      // Kept in the box on failure. Clearing it would lose what they wrote.
      setFailed(true);
    } finally {
      setBusy(false);
    }
  };

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={t('chat.open')}
        className="fixed bottom-4 right-4 z-40 flex min-h-touch items-center gap-2 rounded-full bg-brand-700 px-4 py-3 text-sm font-semibold text-white shadow-lg"
      >
        {t('chat.open')}
        {unseen > 0 && (
          <span className="rounded-full bg-danger-600 px-2 py-0.5 text-xs">{unseen}</span>
        )}
      </button>
    );
  }

  return (
    <section
      aria-label={t('chat.title')}
      className="fixed bottom-4 right-4 z-40 flex h-[28rem] w-[min(22rem,calc(100vw-2rem))] flex-col overflow-hidden rounded-xl border border-ink-300 bg-white shadow-xl"
    >
      <header className="flex items-center justify-between bg-brand-700 px-3 py-2 text-white">
        <span className="text-sm font-semibold">{t('chat.title')}</span>
        <button type="button" onClick={() => setOpen(false)} aria-label={t('chat.minimise')}>
          ✕
        </button>
      </header>

      {!token ? (
        /* Name asked for, never required — a form before "is anyone there"
           mostly means nobody asks. */
        <div className="flex flex-1 flex-col justify-center gap-2 p-4">
          <p className="text-sm text-ink-600">{t('chat.intro')}</p>
          <input
            className="cc-field w-full"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t('chat.namePlaceholder')}
            aria-label={t('chat.namePlaceholder')}
          />
          <button
            type="button"
            onClick={() => void start()}
            disabled={busy}
            className="min-h-touch rounded-lg bg-brand-700 px-4 text-sm font-semibold text-white disabled:opacity-60"
          >
            {busy ? t('common.saving') : t('chat.start')}
          </button>
          {failed && <p className="text-xs text-danger-600">{t('chat.failed')}</p>}
        </div>
      ) : (
        <>
          <div className="flex-1 space-y-2 overflow-y-auto p-3">
            {messages.length === 0 && (
              <p className="text-center text-xs text-ink-600">{t('chat.emptyBody')}</p>
            )}
            {messages.map((message) => (
              <div
                key={message.id}
                className={`max-w-[85%] rounded-lg px-3 py-2 text-sm ${
                  message.sender === 'visitor'
                    ? 'ml-auto bg-brand-700 text-white'
                    : 'bg-ink-100 text-ink-900'
                }`}
              >
                <p className="whitespace-pre-wrap">{message.body}</p>
                {message.file && (
                  <p className="mt-1 text-xs opacity-80">
                    {message.file.name}
                    {message.file.scanStatus !== 'clean' && ` — ${t('chat.fileChecking')}`}
                  </p>
                )}
              </div>
            ))}
            <div ref={endRef} />
          </div>

          {closed ? (
            /* Read-only rather than gone: the history stays, so nobody has to
               re-explain the whole thing to start again. */
            <p className="border-t border-ink-200 p-3 text-center text-xs text-ink-600">
              {t('chat.closedBody')}
            </p>
          ) : (
            <div className="flex items-end gap-2 border-t border-ink-200 p-2">
              <textarea
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  // Enter sends, Shift+Enter is a new line — the convention
                  // every chat this visitor already uses follows.
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    void send();
                  }
                }}
                rows={2}
                maxLength={4000}
                placeholder={t('chat.placeholder')}
                aria-label={t('chat.placeholder')}
                className="min-h-touch flex-1 resize-none rounded-lg border border-ink-300 p-2 text-sm"
              />
              <button
                type="button"
                onClick={() => void send()}
                disabled={busy || !draft.trim()}
                className="min-h-touch rounded-lg bg-brand-700 px-3 text-sm font-semibold text-white disabled:opacity-60"
              >
                {t('chat.send')}
              </button>
            </div>
          )}
          {failed && (
            <p className="px-3 pb-2 text-xs text-danger-600" role="alert">
              {t('chat.failed')}
            </p>
          )}
        </>
      )}
    </section>
  );
}
