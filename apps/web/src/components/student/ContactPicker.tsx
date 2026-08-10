'use client';

import { useState } from 'react';
import type { MessageContactDto } from '@classconnect/shared';
import { useI18n } from '@/lib/i18n';
import { api } from '@/lib/api';
import { useCachedApi } from '@/lib/use-cached-api';
import { EmptyState, SkeletonList } from './ui';
import { subjectAccent } from '@/lib/subject-accent';

/**
 * Choosing who to write to.
 *
 * The list is the learner's own assigned teachers plus ClassConnect help, and
 * the search box filters *that* — it does not query the platform. Other
 * learners are absent by design: FR-SAF-008 removes learner-to-learner
 * messaging from v1.0, and FR-SAF-007 keeps a minor's name off any surface
 * another user can see. A search returning children's names to another child
 * would breach both in a single control.
 *
 * The line under the box says so plainly rather than leaving a learner to
 * wonder why their friend never appears. An unexplained absence invites people
 * to look for a way round it.
 */
export function ContactPicker({
  onOpened,
  onCancel,
}: {
  onOpened: (threadId: string) => void;
  onCancel: () => void;
}) {
  const { t, language } = useI18n();
  const [query, setQuery] = useState('');
  const [busy, setBusy] = useState<string | null>(null);

  const { data, loading, error, refresh } = useCachedApi<MessageContactDto[]>(
    '/learner/messages/contacts',
    { language },
  );

  const needle = query.trim().toLowerCase();
  const contacts = (data ?? []).filter(
    (contact) =>
      !needle ||
      contact.displayName.toLowerCase().includes(needle) ||
      (contact.subject?.name.toLowerCase().includes(needle) ?? false),
  );

  async function open(contact: MessageContactDto) {
    // An existing thread is reused rather than replaced: a split history is a
    // safeguarding record with a hole in it.
    if (contact.threadId) {
      onOpened(contact.threadId);
      return;
    }

    setBusy(contact.id);
    try {
      const result = await api<{ threadId: string }>('/learner/messages/start', {
        method: 'POST',
        body:
          contact.kind === 'support'
            ? { support: true }
            : { teacherUserId: contact.id, subjectId: contact.subject?.id },
        language,
      });
      onOpened(result.threadId);
    } catch {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h2 className="font-display text-base font-semibold text-ink-900">
          {t('student.messages.chooseContact')}
        </h2>
        <button
          type="button"
          onClick={onCancel}
          className="min-h-touch text-sm text-brand-600 underline"
        >
          {t('common.cancel')}
        </button>
      </div>

      <label className="sr-only" htmlFor="contact-search">
        {t('student.messages.searchContacts')}
      </label>
      <input
        id="contact-search"
        type="search"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder={t('student.messages.searchContacts')}
        className="min-h-touch w-full rounded-lg border border-ink-300 px-3 text-sm"
      />

      {/* Said up front, not discovered by failing to find someone. */}
      <p className="text-xs text-ink-600">{t('student.messages.onlyYourTeachers')}</p>

      {loading && <SkeletonList rows={3} />}
      {error && !data && (
        <button
          type="button"
          onClick={() => void refresh()}
          className="min-h-touch text-sm text-brand-600 underline"
        >
          {t('common.retry')}
        </button>
      )}

      {data && contacts.length === 0 && (
        <EmptyState
          title={t('student.messages.searchNoResults')}
          body={t('student.messages.searchNoResultsBody')}
        />
      )}

      <ul className="space-y-2">
        {contacts.map((contact) => (
          <li key={`${contact.kind}:${contact.id}:${contact.subject?.id ?? ''}`}>
            <button
              type="button"
              disabled={busy === contact.id}
              onClick={() => void open(contact)}
              aria-label={t('student.messages.startWith', { name: contact.displayName })}
              className="flex min-h-touch w-full items-center gap-3 rounded-xl border border-ink-300 bg-white p-3.5 text-left disabled:opacity-50"
            >
              <span
                aria-hidden="true"
                className={[
                  'flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-semibold',
                  contact.subject
                    ? `${subjectAccent(contact.subject.id).bg} ${subjectAccent(contact.subject.id).text}`
                    : 'bg-brand-50 text-brand-700',
                ].join(' ')}
              >
                {contact.displayName.slice(0, 1).toUpperCase()}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold text-ink-900">
                  {contact.displayName}
                </span>
                {contact.subject && (
                  <span className="block truncate text-xs text-ink-600">
                    {contact.subject.name}
                  </span>
                )}
              </span>
              {contact.threadId && (
                <span className="shrink-0 text-xs text-ink-600">
                  {t('student.messages.openExisting')}
                </span>
              )}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
