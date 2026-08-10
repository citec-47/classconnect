'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type {
  MessageComposeLimitsDto,
  MessageDto,
  MessageThreadDto,
  PendingAttachmentDto,
} from '@classconnect/shared';
import { useI18n } from '@/lib/i18n';
import { api } from '@/lib/api';
import { useCachedApi } from '@/lib/use-cached-api';
import { fullDate, timeOfDay } from '@/lib/student-format';
import { ReportConcern } from './ui';
import { AttachmentPicker } from './AttachmentPicker';
import { AttachmentView } from './AttachmentView';

/**
 * One conversation, as a chat rather than a form.
 *
 * The previous version was a list with a textarea under it. Everything here is
 * the difference between that and something that behaves like a messenger:
 *
 *  - one composer row — attach, input, send — instead of stacked controls
 *  - Enter sends, Shift+Enter makes a newline
 *  - the input grows with the text and stops at a few lines
 *  - new messages arrive on their own while the thread is open
 *  - date separators, so a bare "9:14" means something
 *  - consecutive messages from one person group under a single name
 *  - the view sticks to the bottom unless the reader has scrolled up
 *
 * ## The absence that has not changed
 *
 * Still no delete, no edit, no unsend, and no long-press menu that might imply
 * one. A thread between an adult and a child is safeguarding evidence, and
 * evidence a participant can destroy is not evidence.
 */

/** How often an open thread checks for new messages. */
const POLL_MS = 10_000;

export function MessageThreadView({
  threadId,
  limits,
  onBack,
}: {
  threadId: string;
  limits?: MessageComposeLimitsDto;
  onBack: () => void;
}) {
  const { t, language } = useI18n();
  const { data, loading, error, refresh } = useCachedApi<MessageThreadDto>(
    `/learner/messages/${threadId}`,
    { language, maxAgeMs: 5_000 },
  );

  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [pending, setPending] = useState<MessageDto[]>([]);
  const [attachments, setAttachments] = useState<PendingAttachmentDto[]>([]);
  const [showPicker, setShowPicker] = useState(false);

  const scrollRef = useRef<HTMLDivElement>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  /** False once the reader scrolls up, so a new message does not yank them back. */
  const stickToBottom = useRef(true);

  /*
   * New messages arrive on their own.
   *
   * Polling rather than a socket. The API does carry a WebSocket for admin
   * badges, but a learner on an intermittent 3G connection reconnects
   * constantly, and a poll degrades to "slightly late" where a dropped socket
   * degrades to "silently dead". It pauses while the tab is hidden, because
   * polling a backgrounded tab spends a learner's data for nothing.
   */
  useEffect(() => {
    const tick = () => {
      if (document.visibilityState === 'visible') void refresh();
    };
    const timer = setInterval(tick, POLL_MS);
    document.addEventListener('visibilitychange', tick);
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', tick);
    };
  }, [refresh]);

  const messages = dedupe([...(data?.messages ?? []), ...pending]);

  useEffect(() => {
    if (stickToBottom.current) endRef.current?.scrollIntoView({ block: 'end' });
  }, [messages.length]);

  const onScroll = useCallback(() => {
    const element = scrollRef.current;
    if (!element) return;
    stickToBottom.current =
      element.scrollHeight - element.scrollTop - element.clientHeight < 80;
  }, []);

  const readyAttachments = attachments.filter((a) => a.state === 'ready');
  const uploading = attachments.some((a) => a.state === 'uploading' || a.state === 'scanning');
  const canSend = (draft.trim().length > 0 || readyAttachments.length > 0) && !uploading;

  async function send() {
    if (!canSend || sending) return;
    const body = draft.trim();

    setSending(true);
    setSendError(null);
    try {
      const sent = await api<MessageDto>(`/learner/messages/${threadId}`, {
        method: 'POST',
        body: { body, attachmentIds: readyAttachments.map((a) => a.attachmentId) },
        language,
      });
      setDraft('');
      setAttachments([]);
      setShowPicker(false);
      stickToBottom.current = true;
      setPending((prior) => [...prior, sent]);
      void refresh();
      if (textareaRef.current) {
        textareaRef.current.style.height = 'auto';
        textareaRef.current.focus();
      }
    } catch {
      setSendError(t('common.retry'));
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="flex h-[calc(100vh-9rem)] flex-col md:h-[calc(100vh-7rem)]">
      <div className="flex items-center gap-2 border-b border-ink-300 pb-2">
        <button
          type="button"
          onClick={onBack}
          aria-label={t('common.back')}
          className="min-h-touch min-w-touch rounded-lg text-xl text-ink-700"
        >
          ‹
        </button>
        <span
          aria-hidden="true"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-50 text-sm font-semibold text-brand-700"
        >
          {(data?.counterpartName ?? '?').slice(0, 1).toUpperCase()}
        </span>
        <div className="min-w-0">
          <p className="truncate font-display text-base font-semibold text-ink-900">
            {data?.counterpartRole === 'support'
              ? t('student.messages.support')
              : (data?.counterpartName ?? '')}
          </p>
          {data?.subject && <p className="truncate text-xs text-ink-600">{data.subject.name}</p>}
        </div>
      </div>

      <div ref={scrollRef} onScroll={onScroll} className="flex-1 overflow-y-auto py-3">
        {loading && messages.length === 0 && (
          <p className="text-center text-sm text-ink-600">{t('common.loading')}</p>
        )}
        {error && messages.length === 0 && (
          <button
            type="button"
            onClick={() => void refresh()}
            className="mx-auto block min-h-touch text-sm text-brand-600 underline"
          >
            {t('common.retry')}
          </button>
        )}
        {!loading && !error && messages.length === 0 && (
          <p className="px-6 pt-8 text-center text-sm text-ink-600">
            {t('student.messages.noneBody')}
          </p>
        )}

        {messages.map((message, index) => {
          const previous = messages[index - 1];
          const newDay =
            !previous || !isSameDay(new Date(previous.sentAt), new Date(message.sentAt));
          // Grouped when the same person spoke last, on the same day — removes
          // the repeated name that makes a plain list read like a log file.
          const grouped =
            !newDay &&
            previous?.mine === message.mine &&
            previous?.senderName === message.senderName;

          return (
            <div key={message.id}>
              {newDay && (
                <p className="my-3 text-center">
                  <span className="rounded-full bg-ink-100 px-3 py-1 text-xs text-ink-600">
                    {dayLabel(new Date(message.sentAt), language, t)}
                  </span>
                </p>
              )}
              <Bubble message={message} grouped={grouped} />
            </div>
          );
        })}
        <div ref={endRef} />
      </div>

      {data && !data.mayPost && data.cannotPostReasonKey && (
        <p className="rounded-lg bg-warning-50 px-3 py-2 text-sm text-warning-600">
          {t(data.cannotPostReasonKey)}
        </p>
      )}

      {data?.mayPost && (
        <div className="border-t border-ink-300 pt-2">
          {showPicker && (
            <div className="pb-2">
              <AttachmentPicker
                threadId={threadId}
                limits={limits}
                attachments={attachments}
                onChange={setAttachments}
              />
            </div>
          )}

          {sendError && <p className="pb-1 text-sm text-danger-600">{sendError}</p>}

          <div className="flex items-end gap-2">
            <button
              type="button"
              onClick={() => setShowPicker((open) => !open)}
              aria-expanded={showPicker}
              aria-label={t('student.messages.attach')}
              className="flex min-h-touch min-w-touch shrink-0 items-center justify-center rounded-full border border-ink-300 text-xl text-ink-700"
            >
              {showPicker ? '×' : '+'}
            </button>

            <label className="sr-only" htmlFor="message-body">
              {t('student.messages.compose')}
            </label>
            <textarea
              id="message-body"
              ref={textareaRef}
              value={draft}
              rows={1}
              placeholder={t('student.messages.placeholder')}
              onChange={(event) => {
                setDraft(event.target.value);
                // Grows with the text, capped so the conversation stays visible.
                const element = event.target;
                element.style.height = 'auto';
                element.style.height = `${Math.min(element.scrollHeight, 120)}px`;
              }}
              onKeyDown={(event) => {
                /*
                 * Enter sends, Shift+Enter is a newline — the convention every
                 * messenger uses on a keyboard. The send button stays because on
                 * a touch keyboard Enter is a newline and there is nothing else
                 * to press.
                 */
                if (event.key === 'Enter' && !event.shiftKey) {
                  event.preventDefault();
                  void send();
                }
              }}
              className="max-h-[7.5rem] min-h-touch flex-1 resize-none rounded-2xl border border-ink-300 px-3 py-2.5 text-sm"
            />

            <button
              type="button"
              onClick={() => void send()}
              disabled={!canSend || sending}
              aria-label={t('student.messages.send')}
              className="flex min-h-touch min-w-touch shrink-0 items-center justify-center rounded-full bg-brand-600 text-white disabled:opacity-40"
            >
              <SendIcon />
            </button>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
            {/* The rule, before the send, not after the regret. */}
            <p className="text-xs text-ink-600">{t('student.messages.permanent')}</p>
            <ReportConcern />
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * The optimistic copy and the server's copy are the same message.
 *
 * `send` appends locally so the bubble appears at once on a slow connection,
 * then refreshes; both carry the same id.
 */
function dedupe(messages: MessageDto[]): MessageDto[] {
  const seen = new Set<string>();
  return messages.filter((message) => {
    if (seen.has(message.id)) return false;
    seen.add(message.id);
    return true;
  });
}

function isSameDay(a: Date, b: Date): boolean {
  return a.toDateString() === b.toDateString();
}

function dayLabel(value: Date, language: string, t: (key: string) => string): string {
  const today = new Date();
  const yesterday = new Date(today.getTime() - 86_400_000);
  if (isSameDay(value, today)) return t('student.messages.today');
  if (isSameDay(value, yesterday)) return t('student.messages.yesterday');
  return fullDate(value, language as 'en' | 'fr');
}

function Bubble({ message, grouped }: { message: MessageDto; grouped: boolean }) {
  const { t, language } = useI18n();

  return (
    <div className={message.mine ? 'flex justify-end' : 'flex justify-start'}>
      <div
        className={[
          'max-w-[85%] px-3 py-2',
          // The corner facing the previous bubble is squared off, so a run of
          // messages reads as one turn rather than several separate ones.
          message.mine
            ? `bg-brand-600 text-white rounded-2xl ${grouped ? 'rounded-tr-md' : 'rounded-br-md'}`
            : `border border-ink-300 bg-white text-ink-900 rounded-2xl ${grouped ? 'rounded-tl-md' : 'rounded-bl-md'}`,
          grouped ? 'mt-0.5' : 'mt-2',
        ].join(' ')}
      >
        {!message.mine && !grouped && (
          <p className="text-xs font-medium text-ink-600">{message.senderName}</p>
        )}

        {message.body && (
          <p className="whitespace-pre-wrap break-words text-sm">{message.body}</p>
        )}

        {message.redacted && (
          <p
            className={['mt-1 text-xs', message.mine ? 'text-white/80' : 'text-ink-600'].join(' ')}
          >
            {t('student.messages.redactedNotice')}
          </p>
        )}

        {message.attachments.map((attachment) => (
          <AttachmentView key={attachment.id} attachment={attachment} mine={message.mine} />
        ))}

        <p
          className={[
            'mt-0.5 text-right text-[0.6875rem] tabular-nums',
            message.mine ? 'text-white/70' : 'text-ink-600',
          ].join(' ')}
        >
          {timeOfDay(new Date(message.sentAt), language)}
        </p>
      </div>
    </div>
  );
}

function SendIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      className="h-5 w-5"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M4 12 20 4l-8 16-2-6z" />
    </svg>
  );
}
