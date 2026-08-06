'use client';

import Link from 'next/link';
import { useI18n } from '@/lib/i18n';
import { useAuth } from '@/lib/auth-context';
import { Landing } from '@/components/Landing';

/**
 * The landing surface.
 *
 * UI-005: primary navigation for learners exposes no more than five top-level
 * destinations, in plain language with an accompanying icon.
 */
export default function Home() {
  // The language is resolved once by the layout and shared through context.
  // Unwrapping the route params again in every client page would re-derive the
  // same value across the server/client boundary for no benefit.
  const { language, t } = useI18n();
  const { user, signOut } = useAuth();

  /**
   * The signed-out landing is the default, not a state reached after a loading
   * check. Two reasons, both from the SRS:
   *
   * NFR-PER-001 — this is a new visitor's first paint on a 3G connection.
   * Gating it behind "am I signed in?" replaced real content with a spinner
   * until the client hydrated and localStorage could be read, which spends the
   * FCP budget on nothing.
   *
   * NFR-BAN-006 — it also made the page fragile: anything that stopped
   * hydration left the spinner on screen permanently, with no error and no
   * retry. Rendering useful content first means a hydration failure degrades to
   * a working, if static, page.
   *
   * The signed-in dashboard swaps in once `user` resolves.
   */
  if (!user) {
    return <Landing language={language} />;
  }

  const destinations = destinationsFor(user.roles, language, t);

  return (
    <div>
      <h1 className="text-2xl font-semibold text-ink-900">
        {language === 'fr' ? `Bonjour, ${user.fullName}` : `Hello, ${user.fullName}`}
      </h1>

      <nav className="mt-6" aria-label={t('nav.home')}>
        <ul className="flex flex-col gap-3">
          {destinations.map((destination) => (
            <li key={destination.href}>
              <Link
                href={destination.href}
                className="cc-card flex min-h-touch items-center gap-3 hover:bg-ink-100"
              >
                {/* UI-005 / NFR-USA-005: an icon alongside the text label. */}
                <span aria-hidden="true" className="text-2xl">
                  {destination.icon}
                </span>
                <span className="font-medium text-ink-900">{destination.label}</span>
              </Link>
            </li>
          ))}
        </ul>
      </nav>

      <button type="button" onClick={() => void signOut()} className="cc-btn-secondary mt-8 w-full">
        {t('common.signOut')}
      </button>
    </div>
  );
}

function destinationsFor(
  roles: string[],
  language: string,
  t: (key: string) => string,
): { href: string; label: string; icon: string }[] {
  const items: { href: string; label: string; icon: string }[] = [];

  if (roles.includes('parent')) {
    items.push({ href: `/${language}/children`, label: t('family.myChildren'), icon: '👨‍👩‍👧' });
    items.push({ href: `/${language}/teachers`, label: t('catalogue.findTeacher'), icon: '🔎' });
  }
  if (roles.includes('teacher')) {
    items.push({ href: `/${language}/teach`, label: t('teacher.myAccount'), icon: '📋' });
  }
  if (roles.includes('admin_ops') || roles.includes('super_admin')) {
    // Account creation first: it is the Admin's primary job now that nobody
    // else can bring a Student or Teacher account into existence.
    items.push({ href: `/${language}/admin/students`, label: t('admin.students'), icon: '🎒' });
    items.push({ href: `/${language}/admin/teachers/new`, label: t('admin.newTeacher'), icon: '👩‍🏫' });
    items.push({
      href: `/${language}/admin/verification`,
      label: t('admin.verificationQueue'),
      icon: '✅',
    });
  }
  if (roles.includes('student') || roles.includes('adult_learner')) {
    items.push({ href: `/${language}/timetable`, label: t('nav.timetable'), icon: '📅' });
    items.push({ href: `/${language}/homework`, label: t('nav.homework'), icon: '📝' });
  }

  // UI-005: never more than five top-level destinations.
  return items.slice(0, 5);
}
