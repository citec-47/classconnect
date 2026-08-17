'use client';

import { useI18n } from '@/lib/i18n';
import { useAuth } from '@/lib/auth-context';
import { useStudent } from '@/lib/student-context';
import { PageTitle } from '@/components/student/ui';

/**
 * The learner's own account screen.
 *
 * ## Why this page existed only as a link
 *
 * The account menu offered Profile, and no page answered it — a 404 from a menu
 * the learner was invited to open. Two of its neighbours, Notifications and
 * Help, are still in the same state and are named at the bottom of this file so
 * the next person finds them without discovering them the way this one was.
 *
 * ## What it shows, and what it deliberately does not
 *
 * Everything here is already in `StudentProvider` — no request is made, because
 * the shell fetched it to render the surface at all and asking again would spend
 * a round trip on §6.2's network for facts already in memory.
 *
 * It shows the name the learner goes by and their class. It does not show their
 * full legal name: FR-SAF-007 keeps that to linked guardians, assigned teachers
 * and staff, and the server never sends it here — there is nothing to leak
 * because nothing was fetched.
 *
 * ## Signing out
 *
 * The reason this page matters more than its contents. A learner on a shared
 * phone — a parent's, an older sibling's, a friend's in a study group — had no
 * way to end their session, and a session that cannot be ended on a shared
 * device is a child's account left open to whoever holds the handset next.
 */
export default function StudentProfilePage() {
  const { t } = useI18n();
  const { config, learner } = useStudent();
  const { signOut } = useAuth();

  if (!config || !learner) return null;
  const large = config.typeScale === 'large';

  return (
    <>
      <PageTitle large={large}>{t('student.account.profile')}</PageTitle>

      <dl className="rounded-xl border border-ink-300 bg-white p-4">
        <div className="flex items-baseline justify-between gap-3 py-1">
          <dt className="text-sm text-ink-600">{t('student.profile.name')}</dt>
          <dd className="text-sm font-semibold text-ink-900">{learner.displayName}</dd>
        </div>
        <div className="flex items-baseline justify-between gap-3 border-t border-ink-200 py-1">
          <dt className="text-sm text-ink-600">{t('student.profile.className')}</dt>
          <dd className="text-sm font-semibold text-ink-900">{learner.levelLabel}</dd>
        </div>
        {/*
          * Only when there is one. An exam date on a Primary learner's profile
          * would be a blank row inviting the question of what should be in it.
          */}
        {learner.targetExamDate && (
          <div className="flex items-baseline justify-between gap-3 border-t border-ink-200 py-1">
            <dt className="text-sm text-ink-600">{t('student.profile.examDate')}</dt>
            <dd className="text-sm font-semibold tabular-nums text-ink-900">
              {learner.targetExamDate}
            </dd>
          </div>
        )}
      </dl>

      <p className="mt-2 text-xs text-ink-600">{t('student.profile.changeHint')}</p>

      {/*
        * Separated and in the danger tone, because it ends the session rather
        * than navigating anywhere — the same treatment the teacher's profile
        * gives it, for the same reason.
        */}
      <div className="mt-6 border-t border-ink-200 pt-4">
        <button
          type="button"
          onClick={() => void signOut()}
          className="min-h-touch w-full rounded-lg border border-danger-600 px-4 text-sm font-medium text-danger-600"
        >
          {t('nav.signOut')}
        </button>
      </div>
    </>
  );
}

/*
 * Still missing, and reachable from the same menu:
 *   /student/notifications  — the account menu links to it; no page exists.
 *   /student/help           — likewise.
 * Both 404 today.
 */
