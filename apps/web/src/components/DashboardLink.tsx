'use client';

import Link from 'next/link';
import { useI18n } from '@/lib/i18n';
import { useAuth } from '@/lib/auth-context';
import { homeFor } from '@/lib/home-for';

/**
 * A way back to your own dashboard from any public page.
 *
 * The public header carried a logo and a language switcher and nothing else, so a
 * signed-in teacher who followed a link to the pricing page, or opened the site
 * from a bookmark, had no route to their own surface and no sign they were signed
 * in at all. The redirects on `/sign-in` and `/register` cover the two doors
 * people arrive through; this covers everywhere else.
 *
 * Renders nothing at all when signed out, and nothing while the session is still
 * being established — a button that appears and then vanishes is worse than one
 * that arrives a moment late.
 */
export function DashboardLink() {
  const { t, language } = useI18n();
  const { user, loading } = useAuth();

  if (loading || !user) return null;

  return (
    <Link
      href={homeFor(user.roles, language)}
      className="min-h-touch inline-flex items-center rounded-lg bg-brand-600 px-3 text-sm font-medium text-white"
    >
      {t('common.myDashboard')}
    </Link>
  );
}
