'use client';

import { useCallback, useEffect, useState } from 'react';
import { useI18n } from '@/lib/i18n';
import { api, type ApiError } from '@/lib/api';
import { ErrorAlert } from '@/components/Alert';

interface Person {
  id: string;
  fullName: string;
  roles: string[];
  invited: boolean;
}

/**
 * Inviting somebody into a call, by name.
 *
 * The brief's "he clicks Invite and types the name of the person he wants".
 * Students and teachers both, because a teacher may want a colleague.
 *
 * The list is empty until two characters are typed. That is not a nicety: an
 * empty query would return the platform's entire directory of children into a
 * dropdown, and the server refuses it for the same reason.
 *
 * Inviting is what actually admits somebody — the join token is checked against
 * this list — so the button says "invited" once it has happened rather than
 * leaving the teacher unsure whether the tap registered.
 */
export function InviteToCallDialog({
  sessionId,
  onClose,
}: {
  sessionId: string;
  onClose: () => void;
}) {
  const { t, language } = useI18n();

  const [query, setQuery] = useState('');
  const [people, setPeople] = useState<Person[]>([]);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const search = useCallback(
    async (term: string) => {
      if (term.trim().length < 2) {
        setPeople([]);
        return;
      }
      setSearching(true);
      try {
        const result = await api<{ people: Person[] }>(
          `/teacher/live/${sessionId}/invitees?q=${encodeURIComponent(term.trim())}`,
          { language },
        );
        setPeople(result.people);
      } catch (caught) {
        setError(caught as ApiError);
      } finally {
        setSearching(false);
      }
    },
    [sessionId, language],
  );

  /*
   * Debounced, because this fires on every keystroke over a mobile link.
   *
   * 300ms is long enough that typing a name is one request rather than eight,
   * and short enough that the list feels like it is keeping up.
   */
  useEffect(() => {
    const timer = setTimeout(() => void search(query), 300);
    return () => clearTimeout(timer);
  }, [query, search]);

  const toggle = async (person: Person) => {
    setBusyId(person.id);
    setError(null);
    try {
      await api(`/teacher/live/${sessionId}/invite-user/${person.id}`, {
        method: person.invited ? 'DELETE' : 'POST',
        language,
      });
      setPeople((current) =>
        current.map((row) =>
          row.id === person.id ? { ...row, invited: !row.invited } : row,
        ),
      );
    } catch (caught) {
      setError(caught as ApiError);
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={t('live.invite.title')}
      className="fixed inset-0 z-50 flex items-end justify-center bg-ink-900/40 sm:items-center sm:p-4"
    >
      <div className="flex max-h-[85vh] w-full max-w-md flex-col rounded-t-2xl bg-white sm:rounded-2xl">
        <div className="border-b border-ink-200 px-4 py-3">
          <h2 className="font-display text-lg font-semibold text-ink-900">
            {t('live.invite.title')}
          </h2>
          <p className="text-sm text-ink-600">{t('live.invite.hint')}</p>
        </div>

        <div className="px-4 py-3">
          <ErrorAlert error={error} />
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t('live.invite.searchPlaceholder')}
            aria-label={t('live.invite.searchPlaceholder')}
            className="cc-field w-full"
            autoFocus
          />
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-4">
          {query.trim().length < 2 ? (
            <p className="py-4 text-sm text-ink-600">{t('live.invite.typeMore')}</p>
          ) : searching && people.length === 0 ? (
            <div className="my-2 h-10 animate-pulse rounded-lg bg-ink-100" />
          ) : people.length === 0 ? (
            <p className="py-4 text-sm text-ink-600">{t('live.invite.noMatches')}</p>
          ) : (
            <ul className="flex flex-col gap-1 pb-2">
              {people.map((person) => (
                <li
                  key={person.id}
                  className="flex items-center justify-between gap-3 rounded-lg border border-ink-200 p-2"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-ink-900">
                      {person.fullName}
                    </p>
                    <p className="text-xs text-ink-600">
                      {person.roles.includes('teacher')
                        ? t('live.invite.roleTeacher')
                        : t('live.invite.roleStudent')}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => void toggle(person)}
                    disabled={busyId === person.id}
                    className={
                      person.invited
                        ? 'min-h-touch shrink-0 rounded-lg border border-ink-300 px-3 text-sm'
                        : 'min-h-touch shrink-0 rounded-lg bg-brand-600 px-3 text-sm font-medium text-white'
                    }
                  >
                    {person.invited ? t('live.invite.remove') : t('live.invite.add')}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="border-t border-ink-200 px-4 py-3 text-right">
          <button type="button" onClick={onClose} className="cc-btn-secondary">
            {t('common.close')}
          </button>
        </div>
      </div>
    </div>
  );
}
