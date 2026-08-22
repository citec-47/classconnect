'use client';

import { useCallback, useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { useI18n } from '@/lib/i18n';

/**
 * "Somebody has asked you to join a group."
 *
 * Sits on the Work page rather than in a tab of its own. An invitation is
 * something to answer once and then never think about again — a destination for
 * it would be a place a learner visits to find nothing, which is how a
 * navigation entry earns being ignored. The panel renders nothing at all when
 * there is nothing pending, so it costs no space on the common day.
 *
 * ## Why who asked is on the card
 *
 * Being invited by a teacher is a different proposition from being invited by a
 * classmate, and a learner may reasonably answer them differently. The server
 * says which; this only has to show it.
 */
interface Invitation {
  id: string;
  group: { id: string; name: string };
  inviter: { displayName: string; kind: 'teacher' | 'learner' };
  createdAt: string;
}

export function GroupInvitations({ onJoined }: { onJoined?: () => void }) {
  const { t, language } = useI18n();
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  const load = useCallback(async () => {
    try {
      setInvitations(await api<Invitation[]>('/learner/practice/invitations', { language }));
    } catch {
      /*
       * Silent. This is a secondary panel on somebody else's screen: a learner
       * who came to look at their homework should not be shown an error about a
       * list of invitations they may not even have.
       */
    }
  }, [language]);

  useEffect(() => {
    void load();
  }, [load]);

  const respond = async (id: string, accept: boolean) => {
    if (busyId) return;
    setBusyId(id);
    setFailed(false);
    try {
      await api(`/learner/practice/invitations/${id}/respond`, {
        method: 'POST',
        body: { accept },
        language,
      });
      /*
       * Removed locally rather than refetched. The answer is final either way,
       * and a list that reloads under somebody's finger is how the second
       * invitation gets answered by accident.
       */
      setInvitations((current) => current.filter((invitation) => invitation.id !== id));
      if (accept) await onJoined?.();
    } catch {
      setFailed(true);
    } finally {
      setBusyId(null);
    }
  };

  if (invitations.length === 0) return null;

  return (
    <section className="mb-3 rounded-xl border border-brand-600 bg-brand-50 p-3">
      <h2 className="text-sm font-semibold text-ink-900">
        {t('student.invitations.title', { count: invitations.length })}
      </h2>

      <ul className="mt-2 space-y-2">
        {invitations.map((invitation) => (
          <li key={invitation.id} className="rounded-lg bg-white p-3">
            <p className="text-sm font-medium text-ink-900">{invitation.group.name}</p>
            <p className="mt-0.5 text-xs text-ink-600">
              {t(
                invitation.inviter.kind === 'teacher'
                  ? 'student.invitations.fromTeacher'
                  : 'student.invitations.fromClassmate',
                { name: invitation.inviter.displayName },
              )}
            </p>

            <div className="mt-2 flex gap-2">
              <button
                type="button"
                disabled={busyId !== null}
                onClick={() => void respond(invitation.id, true)}
                className="min-h-touch flex-1 rounded-lg bg-brand-700 px-3 text-sm font-semibold text-white disabled:opacity-60"
              >
                {t('student.invitations.accept')}
              </button>
              <button
                type="button"
                disabled={busyId !== null}
                onClick={() => void respond(invitation.id, false)}
                className="min-h-touch flex-1 rounded-lg border border-ink-300 px-3 text-sm font-medium disabled:opacity-60"
              >
                {t('student.invitations.decline')}
              </button>
            </div>
          </li>
        ))}
      </ul>

      {failed && (
        <p className="mt-2 text-xs text-danger-600" role="alert">
          {t('student.invitations.failed')}
        </p>
      )}
    </section>
  );
}
