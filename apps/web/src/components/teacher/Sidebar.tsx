'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  TEACHER_NAV,
  hasPermission,
  isTeacherNavItemUsable,
  type Language,
} from '@classconnect/shared';
import { useI18n } from '@/lib/i18n';
import { useAuth } from '@/lib/auth-context';
import { useTeacherApproval } from '@/lib/use-teacher-approval';

/**
 * The teacher's persistent navigation.
 *
 * Built from `TEACHER_NAV` rather than from JSX, so the sidebar and the routes
 * cannot drift apart. Items the brief calls for but which have no screen yet
 * render greyed and unlinked instead of being omitted: a teacher who can see
 * that Lessons is coming is better informed than one who finds a surface that
 * silently lacks half of what they were told to expect, and it keeps the
 * finished shape visible while it is being built.
 *
 * FR-RBA-002: the permission check here hides controls. It is not the access
 * control — every endpoint behind these routes checks the same permission.
 */
export function TeacherSidebar({ language }: { language: Language }) {
  const { t } = useI18n();
  const { user } = useAuth();
  const pathname = usePathname();
  const { approved, loading } = useTeacherApproval(language);

  const roles = user?.roles ?? [];
  const base = `/${language}/teacher`;

  /*
   * Locked until we know otherwise.
   *
   * While the status is still in flight the honest answer is "not yet", not
   * "yes" — an optimistic open would flash every teaching link live for a
   * moment on each load, and an unapproved teacher would get one clickable
   * instant on a screen they cannot use.
   */
  const unlocked = approved && !loading;

  return (
    <nav
      aria-label={t('teacherNav.label')}
      className="shrink-0 border-b border-brand-100 bg-gradient-to-b from-brand-50/70 to-white lg:w-60 lg:border-b-0 lg:border-r"
    >
      <div className="px-4 py-4 lg:sticky lg:top-0">
        <p className="mb-4 text-xs font-bold uppercase tracking-widest text-brand-700">
          {t('teacherNav.label')}
        </p>

        {TEACHER_NAV.map((section) => {
          const visible = section.items.filter((item) => hasPermission(roles, item.permission));
          if (visible.length === 0) return null;

          return (
            <div key={section.id ?? 'root'} className="mb-4">
              {section.id && (
                <p className="mb-1 px-2 text-[11px] font-bold uppercase tracking-widest text-brand-600/70">
                  {t(`teacherNav.group.${section.id}`)}
                </p>
              )}

              <ul className="space-y-0.5">
                {visible.map((item) => {
                  const href = `${base}${item.href}`;
                  const active = item.href === '' ? pathname === base : pathname.startsWith(href);
                  const label = t(`teacherNav.${item.id}`);

                  if (!isTeacherNavItemUsable(item, unlocked)) {
                    /*
                     * Two reasons an item is not clickable, and they are not
                     * the same thing to the reader: "soon" is on us and needs
                     * no action, "locked" is waiting on their verification and
                     * tells them where to go. Labelling both the same way would
                     * make an unapproved teacher think the platform is simply
                     * unfinished.
                     */
                    const blockedByApproval = item.implemented;
                    return (
                      <li key={item.id}>
                        <span
                          aria-disabled="true"
                          title={t(
                            blockedByApproval ? 'teacherNav.lockedHint' : 'teacherNav.comingSoon',
                          )}
                          className="flex min-h-touch cursor-default items-center justify-between rounded-lg px-2 text-sm text-ink-400"
                        >
                          {label}
                          <span className="rounded bg-ink-100 px-1.5 py-0.5 text-[10px] font-medium text-ink-500">
                            {blockedByApproval ? t('teacherNav.locked') : t('teacherNav.soon')}
                          </span>
                        </span>
                      </li>
                    );
                  }

                  return (
                    <li key={item.id}>
                      <Link
                        href={href}
                        aria-current={active ? 'page' : undefined}
                        className={[
                          'flex min-h-touch items-center rounded-lg px-2 text-sm font-medium',
                          active
                            ? 'bg-brand-600 text-white shadow-sm'
                            : 'text-ink-900 hover:bg-brand-50 hover:text-brand-700',
                        ].join(' ')}
                      >
                        {label}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          );
        })}
      </div>
    </nav>
  );
}
