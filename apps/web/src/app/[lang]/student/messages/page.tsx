'use client';

import { Suspense, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import type {
  MessageComposeLimitsDto,
  MessageThreadSummaryDto,
} from '@classconnect/shared';
import { useI18n } from '@/lib/i18n';
import { useStudent } from '@/lib/student-context';
import { useCachedApi } from '@/lib/use-cached-api';
import { api } from '@/lib/api';
import { whenLabel } from '@/lib/student-format';
import { MessageThreadView } from '@/components/student/MessageThreadView';
import { ContactPicker } from '@/components/student/ContactPicker';
import { PageTitle, ScreenState } from '@/components/student/ui';

interface ThreadsResponse {
  threads: MessageThreadSummaryDto[];
  limits: MessageComposeLimitsDto;
}

/**
 * Messages.
 *
 * A list, and a conversation opened in place rather than at its own route. On a
 * 360px phone the two are never side by side, and keeping them in one component
 * means the back gesture returns to the list without a navigation — which on a
 * connection that drops is the difference between going back and reloading.
 *
 * What is not here is as deliberate as what is. There is no "new message" to an
 * arbitrary person: a learner reaches the teachers they are assigned to and
 * support, and those threads are created by the assignment, not by a search
 * box. FR-SAF-008 holds because there is nothing to type a name into.
 */
export default function StudentMessages() {
  return (
    <Suspense fallback={null}>
      <StudentMessagesContent />
    </Suspense>
  );
}

function StudentMessagesContent() {
  const { t, language } = useI18n();
  const { config } = useStudent();
  const params = useSearchParams();
  const [openThreadId, setOpenThreadId] = useState<string | null>(() => params.get('thread'));
  const [picking, setPicking] = useState(false);
  const [supportError, setSupportError] = useState(false);
  const openedSupport = useRef(false);

  const { data, loading, error, refresh } = useCachedApi<ThreadsResponse>('/learner/messages', {
    language,
  });

  /* Help is a real support thread, not a dead menu item or a generic mail link. */
  useEffect(() => {
    if (params.get('support') !== '1' || openedSupport.current) return;
    openedSupport.current = true;
    void api<{ threadId: string }>('/learner/messages/start', {
      method: 'POST',
      body: { support: true },
      language,
    })
      .then((result) => {
        setOpenThreadId(result.threadId);
        void refresh();
      })
      .catch(() => setSupportError(true));
  }, [language, params, refresh]);

  if (!config) return null;
  const large = config.typeScale === 'large';
  const threads = data?.threads ?? [];

  if (picking) {
    return (
      <ContactPicker
        onCancel={() => setPicking(false)}
        onOpened={(threadId) => {
          setPicking(false);
          setOpenThreadId(threadId);
          void refresh();
        }}
      />
    );
  }

  if (openThreadId) {
    return (
      <MessageThreadView
        threadId={openThreadId}
        limits={data?.limits}
        onBack={() => {
          setOpenThreadId(null);
          void refresh();
        }}
      />
    );
  }

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <PageTitle large={large}>{t('student.messages.title')}</PageTitle>
        <button
          type="button"
          onClick={() => setPicking(true)}
          className="min-h-touch rounded-lg bg-brand-600 px-4 text-sm font-medium text-white"
        >
          {t('student.messages.newMessage')}
        </button>
      </div>
      <p className="text-sm text-ink-600">{t('student.messages.subtitle')}</p>

      {supportError && (
        <p className="rounded-lg bg-danger-50 px-3 py-2 text-sm text-danger-600" role="alert">
          {t('student.error.loadBody')}
        </p>
      )}

      {/*
       * The permanence rule, stated on the list rather than only in the
       * composer. A learner should meet it before they are mid-sentence and
       * committed — that is when it can still change what they write, which is
       * the whole safeguarding value of saying it.
       */}
      <p className="rounded-lg bg-ink-100 px-3 py-2 text-xs text-ink-600">
        {t('student.messages.permanentLong')}
      </p>

      <ScreenState
        loading={loading}
        error={error}
        isEmpty={Boolean(data && threads.length === 0)}
        emptyTitle={t('student.messages.none')}
        emptyBody={t('student.messages.noneBody')}
        emptyAction={
          <button
            type="button"
            onClick={() => setPicking(true)}
            className="min-h-touch rounded-lg bg-brand-600 px-4 text-sm font-medium text-white"
          >
            {t('student.messages.newMessage')}
          </button>
        }
        onRetry={() => void refresh()}
      >
        <ul className="space-y-2">
          {threads.map((thread) => (
            <li key={thread.threadId}>
              <button
                type="button"
                onClick={() => setOpenThreadId(thread.threadId)}
                aria-label={t('student.messages.openThread', { name: thread.counterpartName })}
                className="flex w-full min-h-touch items-center gap-3 rounded-xl border border-ink-300 bg-white p-3.5 text-left"
              >
                <div className="min-w-0 flex-1">
                  <p
                    className={[
                      'truncate text-sm text-ink-900',
                      thread.unreadCount > 0 ? 'font-bold' : 'font-semibold',
                    ].join(' ')}
                  >
                    {thread.counterpartRole === 'support'
                      ? t('student.messages.support')
                      : thread.counterpartName}
                  </p>
                  {thread.subject && (
                    <p className="truncate text-xs text-ink-600">{thread.subject.name}</p>
                  )}
                  {thread.lastMessagePreview && (
                    <p className="mt-0.5 truncate text-sm text-ink-600">
                      {thread.lastMessagePreview}
                    </p>
                  )}
                </div>
                <span className="flex shrink-0 flex-col items-end gap-1">
                  {thread.lastMessageAt && (
                    <span className="text-xs text-ink-600">
                      {whenLabel(new Date(thread.lastMessageAt), language, t)}
                    </span>
                  )}
                  {/*
                   * The count is announced, not just coloured (UI-003), and it
                   * clears when the thread is opened rather than when the list
                   * is merely looked at.
                   */}
                  {thread.unreadCount > 0 && (
                    <span
                      aria-label={t('student.messages.unreadCount', {
                        count: thread.unreadCount,
                      })}
                      className="inline-flex min-w-[1.25rem] items-center justify-center rounded-full bg-brand-600 px-1.5 py-0.5 text-xs font-semibold tabular-nums text-white"
                    >
                      {thread.unreadCount > 99 ? '99+' : thread.unreadCount}
                    </span>
                  )}
                </span>
              </button>
            </li>
          ))}
        </ul>
      </ScreenState>
    </>
  );
}
