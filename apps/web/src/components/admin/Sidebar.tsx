'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  formatBadge,
  sumChildBadges,
  type AdminNavItem,
  type BadgeKey,
} from '@classconnect/shared';
import { useI18n } from '@/lib/i18n';
import { useAdminShell } from '@/lib/admin-badges';
import { useAuth } from '@/lib/auth-context';
import { LanguageSwitcher } from '@/components/LanguageSwitcher';
import { SidebarSection } from '@/components/admin/SidebarSection';

/**
 * §3 — the admin sidebar.
 *
 * Persistent, collapsible to icon-only, with the active item clearly marked.
 * Items render only where the server said they may (the nav payload is built
 * from the signed-in user's permissions), and every endpoint behind them
 * re-checks the same permission — hiding a link is never the access control
 * (FR-RBA-002).
 */

const COLLAPSE_KEY = 'cc.admin.sidebarCollapsed';

type NavIconName = 'home' | 'people' | 'calendar' | 'video' | 'message' | 'shield' | 'money' | 'settings' | 'chart' | 'document';

/** Every navigation item resolves to one icon from the same 24px outline set. */
const NAV_ICONS: Record<string, NavIconName> = {
  overview: 'home', students: 'people', primaryStudents: 'people', teachers: 'people',
  teacherRoster: 'people', studentRoster: 'people', timetable: 'calendar',
  timetableOverview: 'calendar', schedule: 'calendar', live: 'video', recordings: 'video',
  support: 'message', messages: 'message', safeguarding: 'shield', payments: 'money',
  studentsFees: 'money', studentsPaid: 'money', studentsOwing: 'money', teachersPaid: 'money',
  teachersPending: 'money', hoursEarnings: 'money', reconciliation: 'money',
  accounts: 'settings', reports: 'chart', academicResults: 'chart', audit: 'document',
};

function NavIcon({ id }: { id: string }) {
  const icon = NAV_ICONS[id] ?? 'document';
  const common = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
  return <svg viewBox="0 0 24 24" className="h-[1.125rem] w-[1.125rem]" aria-hidden="true">
    {icon === 'home' && <path {...common} d="m3 10 9-7 9 7v10H3V10Zm6 10v-6h6v6" />}
    {icon === 'people' && <><circle {...common} cx="9" cy="7" r="4" /><path {...common} d="M2 21v-2a5 5 0 0 1 5-5h4a5 5 0 0 1 5 5v2M17 3a4 4 0 0 1 0 8M22 21v-2a5 5 0 0 0-3-4.6" /></>}
    {icon === 'calendar' && <><rect {...common} x="3" y="5" width="18" height="16" rx="2" /><path {...common} d="M8 3v4M16 3v4M3 10h18M8 14h.01M12 14h.01M16 14h.01M8 18h.01M12 18h.01" /></>}
    {icon === 'video' && <><rect {...common} x="3" y="6" width="14" height="12" rx="2" /><path {...common} d="m17 10 4-2v8l-4-2" /></>}
    {icon === 'message' && <path {...common} d="M21 11.5a8.5 8.5 0 0 1-9 8.5 9.5 9.5 0 0 1-4-.9L3 21l1.7-4a8.5 8.5 0 1 1 16.3-5.5Z" />}
    {icon === 'shield' && <path {...common} d="M12 22s8-3.7 8-10V5l-8-3-8 3v7c0 6.3 8 10 8 10ZM9 12l2 2 4-4" />}
    {icon === 'money' && <><rect {...common} x="3" y="5" width="18" height="14" rx="2" /><circle {...common} cx="12" cy="12" r="3" /><path {...common} d="M7 8h.01M17 16h.01" /></>}
    {icon === 'settings' && <><circle {...common} cx="12" cy="12" r="3" /><path {...common} d="M19 12a7 7 0 0 0-.1-1l2-1.5-2-3.5-2.3 1a7 7 0 0 0-1.7-1L14.5 3h-4L10 6a7 7 0 0 0-1.7 1L6 6 4 9.5 6 11a7 7 0 0 0 0 2l-2 1.5L6 18l2.3-1a7 7 0 0 0 1.7 1l.5 3h4l.5-3a7 7 0 0 0 1.7-1l2.3 1 2-3.5-2-1.5c.1-.3.1-.7.1-1Z" /></>}
    {icon === 'chart' && <><path {...common} d="M4 20V10M10 20V4M16 20v-7M22 20H2" /><path {...common} d="m4 8 5-4 5 5 6-6" /></>}
    {icon === 'document' && <><path {...common} d="M6 3h8l4 4v14H6a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Z" /><path {...common} d="M14 3v5h5M8 13h8M8 17h6" /></>}
  </svg>;
}

function Badge({
  badgeKey,
  count,
  danger,
  collapsed,
}: {
  badgeKey: BadgeKey;
  count: number;
  danger?: boolean;
  collapsed: boolean;
}) {
  const { t } = useI18n();
  if (count <= 0) return null;

  /**
   * §3 / UI-003: "Badges are announced to screen readers ... not conveyed by
   * colour alone." The visible pill is `aria-hidden` and the accessible name is
   * the full sentence — "Students awaiting approval: 12" — so the count is
   * never a bare number floating beside a link.
   */
  const label = t(`adminNav.badgeLabel.${badgeKey}`, { count });

  return (
    <>
      <span
        aria-hidden="true"
        className={[
          'ml-auto inline-flex min-w-[1.5rem] justify-center rounded-full px-1.5 py-0.5',
          'text-xs font-semibold tabular-nums',
          // §3 / §7: red is reserved for safeguarding and frozen accounts. If it
          // meant four things it would mean nothing.
          danger ? 'bg-danger-600 text-white' : 'bg-ink-100 text-ink-900',
          // NFR-LOC-002: French runs longer than English. The label wraps; the
          // count must not be what gives way.
          'shrink-0',
          collapsed ? 'absolute right-1 top-1 ml-0' : '',
        ].join(' ')}
      >
        {formatBadge(count)}
      </span>
      <span className="sr-only">{label}</span>
    </>
  );
}

function NavLink({
  item,
  basePath,
  collapsed,
  depth = 0,
}: {
  item: AdminNavItem;
  basePath: string;
  collapsed: boolean;
  depth?: number;
}) {
  const { t } = useI18n();
  const { counts } = useAdminShell();
  const pathname = usePathname() ?? '';

  const href = `${basePath}${item.href}`;
  // The overview lives at the bare admin path, so a prefix match would light it
  // up on every screen.
  const active = item.href === '' ? pathname === href : pathname.startsWith(href);
  const label = t(`adminNav.${item.id}`);
  const count = item.badge ? (counts[item.badge] ?? 0) : 0;
  const children = item.children ?? [];

  /**
   * §3: an item that owns children is a disclosure, not a destination.
   *
   * Driven off the nav data rather than off the item's id, so Approvals and
   * Operations become collapsible the day they are given children in
   * `ADMIN_NAV` — there is nothing here to remember to change.
   */
  if (children.length > 0) {
    const childActive = children.some((child) =>
      pathname.startsWith(`${basePath}${child.href}`),
    );
    return (
      <SidebarSection
        label={label}
        badgeCount={sumChildBadges(item, counts)}
        storageKey={`cc.admin.sidebar.${item.id}.open`}
        containsActiveRoute={childActive}
        icon={<NavIcon id={item.id} />}
        rail={collapsed}
      >
        {children.map((child) => (
          <NavLink
            key={child.id}
            item={child}
            basePath={basePath}
            // Inside the flyout the children get their full width and their
            // labels back — the rail only collapses the row it is standing in.
            collapsed={false}
            depth={depth + 1}
          />
        ))}
      </SidebarSection>
    );
  }

  return (
    <li>
      <Link
        href={href}
        aria-current={active ? 'page' : undefined}
        title={collapsed ? label : undefined}
        className={[
          'relative flex min-h-touch items-center gap-2.5 rounded-md px-2.5 py-2 text-sm',
          'transition-colors',
          // UI-003: the same AA focus ring the section toggle carries, so
          // tabbing through the rail never loses the caret.
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600',
          'focus-visible:ring-offset-1 focus-visible:ring-offset-white',
          collapsed ? 'justify-center' : '',
          depth > 0 && !collapsed ? 'pl-8 text-[0.8125rem]' : '',
          active
            ? 'bg-white font-semibold text-brand-700 shadow-sm ring-1 ring-brand-100'
            : 'text-ink-900 hover:bg-brand-50 hover:text-brand-700',
        ].join(' ')}
      >
        {/* Marks the active item by more than colour (UI-003). */}
        {active && (
          <span
            aria-hidden="true"
            className="absolute left-0 top-1.5 bottom-1.5 w-[3px] rounded-r bg-brand-600"
          />
        )}
        <span aria-hidden="true" className="w-[1.125rem] shrink-0 text-ink-600">
          <NavIcon id={item.id} />
        </span>
        {!collapsed && (
          /*
           * NFR-LOC-002: "Enseignants — en attente" is half again the width of
           * "Teachers — pending". A sub-item wraps onto a second line rather
           * than losing the half of the label that says which queue it is; the
           * top-level rows are short enough in both languages to truncate.
           */
          <span className={depth > 0 ? 'min-w-0 break-words leading-snug' : 'truncate'}>
            {label}
          </span>
        )}
        {item.badge && (
          <Badge
            badgeKey={item.badge}
            count={count}
            danger={item.danger}
            collapsed={collapsed}
          />
        )}
      </Link>
    </li>
  );
}

export function Sidebar({ language }: { language: string }) {
  const { t } = useI18n();
  const { nav, loading, connected, navError } = useAdminShell();
  const { user, signOut } = useAuth();
  const [collapsed, setCollapsed] = useState(false);

  // Read after mount rather than during render: the server has no localStorage,
  // and reading it in the initial render is a hydration mismatch.
  useEffect(() => {
    setCollapsed(window.localStorage.getItem(COLLAPSE_KEY) === 'true');
  }, []);

  const toggle = () => {
    setCollapsed((current) => {
      window.localStorage.setItem(COLLAPSE_KEY, String(!current));
      return !current;
    });
  };

  const basePath = `/${language}/admin`;

  return (
    <nav
      aria-label={t('adminNav.title')}
      className={[
        /*
         * A tinted rail rather than a white one.
         *
         * The admin surface is a console someone sits in all day, and a white
         * rail against a white workspace leaves the two indistinguishable — the
         * operator has to find the boundary every time they look up. A tint
         * separates the frame from the work without competing with it.
         *
         * A tint, not the brand colour: the active item needs somewhere to go,
         * and a saturated rail would leave it nothing to contrast against.
         */
        'flex shrink-0 flex-col border-b border-brand-100 bg-gradient-to-b from-brand-50 to-white lg:border-b-0 lg:border-r',
        // Desktop is the design target: the sidebar is its own scroll region so
        // a long queue never pushes the navigation off screen. On a tablet or
        // phone it stacks above the content and scrolls with the page instead
        // of trapping the operator in a 14rem-tall column.
        'lg:sticky lg:top-0 lg:h-screen lg:overflow-y-auto',
        collapsed ? 'w-full lg:w-14' : 'w-full lg:w-60',
      ].join(' ')}
    >
      <div className="flex items-center gap-2 border-b border-ink-300 px-2.5 py-3">
        {!collapsed && (
          <span className="truncate text-sm font-semibold text-ink-900">
            {t('adminNav.title')}
          </span>
        )}
        <button
          type="button"
          onClick={toggle}
          aria-expanded={!collapsed}
          aria-label={collapsed ? t('adminNav.expand') : t('adminNav.collapse')}
          className="ml-auto flex h-8 w-8 items-center justify-center rounded-md text-ink-600 hover:bg-ink-100"
        >
          <span aria-hidden="true">{collapsed ? '»' : '«'}</span>
        </button>
      </div>

      <div className="flex-1 px-2 py-3">
        {loading ? (
          <p className="px-2 text-sm text-ink-600">{t('common.loading')}</p>
        ) : navError ? (
          /*
           * NFR-USA-004: say what happened and what to do, never a blank rail.
           * An admin whose sidebar is empty cannot tell "I have no permissions"
           * from "the API is down" from "the database is behind on migrations",
           * and only the first of those is about them.
           */
          !collapsed && (
            <div
              role="alert"
              className="rounded-md border border-danger-600 bg-danger-50 p-2.5 text-xs text-danger-600"
            >
              <p className="font-semibold">{t('adminNav.unavailableTitle')}</p>
              <p className="mt-1">{t(navError.messageKey, navError.params)}</p>
              <p className="mt-1.5 text-ink-600">{t('adminNav.unavailableBody')}</p>
              {navError.correlationId && (
                <p className="mt-1 font-mono text-[0.625rem] text-ink-600">
                  {navError.correlationId}
                </p>
              )}
            </div>
          )
        ) : (
          nav.map((section) => (
            <div key={section.id ?? 'root'} className="mb-4">
              {section.id && !collapsed && (
                <h2 className="mb-1 px-2.5 text-[0.6875rem] font-semibold uppercase tracking-wider text-ink-600">
                  {t(`adminNav.group.${section.id}`)}
                </h2>
              )}
              {section.id && collapsed && (
                <div aria-hidden="true" className="mx-2 mb-2 border-t border-ink-300" />
              )}
              <ul className="flex flex-col gap-0.5">
                {section.items.map((item) => (
                  <NavLink
                    key={item.id}
                    item={item}
                    basePath={basePath}
                    collapsed={collapsed}
                  />
                ))}
              </ul>
            </div>
          ))
        )}
      </div>

      <div className="border-t border-ink-300 px-2.5 py-3">
        {!collapsed && (
          <>
            <LanguageSwitcher current={language as 'en' | 'fr'} />
            <p className="mt-3 truncate text-sm font-medium text-ink-900">
              {user?.fullName ?? '—'}
            </p>
            <p className="truncate text-xs text-ink-600">
              {(user?.roles ?? []).join(' · ')}
            </p>
          </>
        )}
        <button
          type="button"
          onClick={() => void signOut()}
          className={[
            'mt-2 flex min-h-touch w-full items-center rounded-md px-2 text-sm text-ink-600',
            'hover:bg-ink-100 hover:text-ink-900',
            collapsed ? 'justify-center' : '',
          ].join(' ')}
          title={collapsed ? t('common.signOut') : undefined}
        >
          <span aria-hidden="true">⏻</span>
          {!collapsed && <span className="ml-2">{t('common.signOut')}</span>}
        </button>

        {/*
         * COM-003: when the push channel is down the counts still reconcile on
         * the 60-second poll, so this is information rather than an error — a
         * quiet dot, not a banner over the operator's work.
         */}
        {!collapsed && !connected && (
          <p className="mt-2 flex items-center gap-1.5 text-[0.6875rem] text-ink-600">
            <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-warning-600" />
            {t('common.offline')}
          </p>
        )}
      </div>
    </nav>
  );
}
