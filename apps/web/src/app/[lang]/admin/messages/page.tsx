'use client';

import { useCallback, useEffect, useState } from 'react';
import { useI18n } from '@/lib/i18n';
import { useAutoRecover } from '@/lib/use-auto-recover';
import { api, type ApiError } from '@/lib/api';
import { ErrorAlert, EmptyState } from '@/components/Alert';
import { PageHeader, StateChip, When } from '@/components/admin/ui';
import { AttachmentPicker } from '@/components/student/AttachmentPicker';
import { AttachmentView } from '@/components/student/AttachmentView';
import type { MessageComposeLimitsDto, PendingAttachmentDto } from '@classconnect/shared';

/**
 * ClassConnect help — the staff end of it.
 *
 * Students could already write here; until now nobody could read it. This is
 * the inbox and the reply.
 *
 * Scoped to support threads only. A learner–teacher conversation is supervised
 * through the guardian (FR-SAF-003) and reachable by safeguarding staff through
 * the queue that records who read it and why. Putting every thread on a general
 * inbox would make that record meaningless, so it is not here.
 */

interface InboxRow {
  threadId: string;
  learnerId: string | null;
  learnerName: string | null;
  levelEn: string | null;
  levelFr: string | null;
  lastMessageAt: string;
  preview: string | null;
  awaitingStaff: boolean;
}

interface ThreadMessage {
  id: string;
  senderName: string;
  senderUserId: string;
  body: string;
  redacted: boolean;
  sentAt: string;
  attachments: {
    id: string;
    fileName: string;
    mimeType: string;
    sizeBytes: number;
    scanStatus: string;
    durationSec: number | null;
  }[];
}

export default function AdminMessages() {
  const { t, language } = useI18n();
  const [rows, setRows] = useState<InboxRow[] | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState<InboxRow | null>(null);
  const [thread, setThread] = useState<{ messages: ThreadMessage[] } | null>(null);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [attachments, setAttachments] = useState<PendingAttachmentDto[]>([]);

  /*
   * The same limits the learner side uses.
   *
   * Restating them here would let the two drift, and a staff reply refused for a
   * size the agent was never told about is the worst version of that.
   */
  const limits: MessageComposeLimitsDto | undefined = undefined;

  const load = useCallback(async () => {
    try {
      setRows(
        await api<InboxRow[]>(
          `/admin/messages${query.trim() ? `?q=${encodeURIComponent(query.trim())}` : ''}`,
          { language },
        ),
      );
      setError(null);
    } catch (caught) {
      setError(caught as ApiError);
    }
  }, [language, query]);

  useEffect(() => {
    void load();
  }, [load]);

  /*
   * AS-08: a screen that failed while the API was restarting must not stay
   * failed once it answers again. Retries on reconnect, on refocus, and
   * slowly while the error stands.
   */
  useAutoRecover(load, error !== null);

  const openThread = useCallback(
    async (row: InboxRow) => {
      setOpen(row);
      setThread(null);
      setDraft('');
      try {
        setThread(await api(`/admin/messages/${row.threadId}`, { language }));
      } catch (caught) {
        setError(caught as ApiError);
      }
    },
    [language],
  );

  async function send() {
    const ready = attachments.filter((a) => a.state === 'ready');
    const uploading = attachments.some(
      (a) => a.state === 'uploading' || a.state === 'scanning',
    );
    // A reply may be a file alone — a marked-up PDF often is. Nothing sends
    // while a file is still being checked (FR-FIL-001).
    if (!open || busy || uploading || (!draft.trim() && ready.length === 0)) return;

    setBusy(true);
    try {
      await api(`/admin/messages/${open.threadId}/reply`, {
        method: 'POST',
        body: { body: draft.trim(), attachmentIds: ready.map((a) => a.attachmentId) },
        language,
      });
      setDraft('');
      setAttachments([]);
      await openThread(open);
      await load();
    } catch (caught) {
      setError(caught as ApiError);
    } finally {
      setBusy(false);
    }
  }

  const waiting = rows?.filter((row) => row.awaitingStaff).length ?? 0;

  return (
    <>
      <PageHeader
        title={t('adminMessages.title')}
        subtitle={t('adminMessages.subtitle')}
      />

      {error && <ErrorAlert error={error} />}

      <div className="mb-3 flex flex-wrap items-center gap-3">
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={t('adminMessages.search')}
          className="min-h-touch w-72 rounded-lg border border-ink-300 px-3 text-sm"
        />
        {waiting > 0 && (
          <StateChip tone="warn">{t('adminMessages.awaiting', { count: waiting })}</StateChip>
        )}
      </div>

      <div className="grid gap-4 lg:grid-cols-[22rem_1fr]">
        <div className="space-y-2">
          {rows?.length === 0 && (
            <EmptyState
              title={t('adminMessages.none')}
              body={t('adminMessages.noneBody')}
            />
          )}
          {rows?.map((row) => (
            <button
              key={row.threadId}
              type="button"
              onClick={() => void openThread(row)}
              className={[
                'w-full rounded-xl border p-3 text-left',
                open?.threadId === row.threadId
                  ? 'border-brand-600 bg-brand-50'
                  : 'border-ink-300 bg-white',
              ].join(' ')}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="truncate text-sm font-semibold text-ink-900">
                  {row.learnerName ?? '—'}
                </span>
                {/* The only sort that matters to an agent. */}
                {row.awaitingStaff && <StateChip tone="warn">{t('adminMessages.new')}</StateChip>}
              </div>
              <p className="truncate text-xs text-ink-600">
                {(language === 'fr' ? row.levelFr : row.levelEn) ?? ''}
              </p>
              {row.preview && (
                <p className="mt-1 line-clamp-2 text-xs text-ink-600">{row.preview}</p>
              )}
              <p className="mt-1 text-xs text-ink-600">
                <When value={row.lastMessageAt} />
              </p>
            </button>
          ))}
        </div>

        <div className="rounded-xl border border-ink-300 bg-white p-4">
          {!open && <p className="text-sm text-ink-600">{t('adminMessages.selectThread')}</p>}

          {open && (
            <>
              <h2 className="font-display text-base font-semibold text-ink-900">
                {open.learnerName}
              </h2>

              <div className="my-3 max-h-[26rem] space-y-2 overflow-y-auto">
                {thread?.messages.map((message) => (
                  <div key={message.id} className="rounded-lg border border-ink-300 p-2.5">
                    <p className="text-xs font-medium text-ink-600">
                      {message.senderName} · <When value={message.sentAt} />
                    </p>
                    <p className="mt-1 whitespace-pre-wrap break-words text-sm text-ink-900">
                      {message.body}
                    </p>
                    {message.redacted && (
                      <p className="mt-1 text-xs text-warning-600">
                        {t('adminMessages.redacted')}
                      </p>
                    )}
                    {message.attachments.map((attachment) => (
                      <AttachmentView
                        key={attachment.id}
                        attachment={{
                          ...attachment,
                          scanStatus: attachment.scanStatus as
                            | 'pending'
                            | 'clean'
                            | 'quarantined',
                          url: null,
                        }}
                        mine={false}
                      />
                    ))}
                  </div>
                ))}
              </div>

              <AttachmentPicker
                threadId={open.threadId}
                limits={limits}
                attachments={attachments}
                onChange={setAttachments}
              />

              <label className="sr-only" htmlFor="admin-reply">
                {t('adminMessages.reply')}
              </label>
              <textarea
                id="admin-reply"
                rows={3}
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                placeholder={t('adminMessages.reply')}
                className="w-full rounded-lg border border-ink-300 p-2.5 text-sm"
              />
              {/* Redaction applies to staff too — see the service for why. */}
              <p className="mt-1 text-xs text-ink-600">{t('adminMessages.redactionNotice')}</p>

              <button
                type="button"
                disabled={
                  busy ||
                  attachments.some((a) => a.state === 'uploading' || a.state === 'scanning') ||
                  (!draft.trim() && attachments.filter((a) => a.state === 'ready').length === 0)
                }
                onClick={() => void send()}
                className="mt-2 min-h-touch rounded-lg bg-brand-600 px-4 text-sm font-medium text-white disabled:opacity-50"
              >
                {busy ? t('adminMessages.sending') : t('adminMessages.send')}
              </button>
            </>
          )}
        </div>
      </div>
    </>
  );
}
