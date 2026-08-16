/**
 * The admin sidebar, as data.
 *
 * §3 of the admin brief fixes the items, their grouping, which roles see which,
 * and which carry a badge. Holding that here rather than in the React tree means
 * the API computes badge counts from the same list the sidebar renders, so a new
 * queue cannot appear in one and be forgotten in the other.
 *
 * FR-RBA-001/002: `permission` below drives *presentation only*. Every endpoint
 * behind these routes enforces the same permission server-side. Hiding an item
 * is never the access control.
 */

import type { Permission } from './roles';

/**
 * §3: "A badge shows the count of items awaiting an admin action, not unread
 * items." Each key is a queue the API counts; the count decrements only when an
 * item is actioned, never by opening the screen.
 */
export const BADGE_KEYS = [
  'studentsAwaitingApproval',
  'primaryAwaitingApproval',
  'teachersAwaitingVerification',
  'unassignedTickets',
  'safeguardingOpen',
  'studentsOwing',
  'teacherPayoutsPending',
  'reconciliationUnmatched',
  /**
   * Lessons in progress right now.
   *
   * The one badge that is not a queue of work. It does not count things
   * awaiting an action, and it falls on its own when a lesson ends rather than
   * because anyone actioned it — so it is a live gauge, deliberately admitted as
   * an exception to the §3 rule because "is anything happening right now" is a
   * question the safeguarding duty makes worth answering at a glance.
   */
  'liveClasses',
  /** Teachers with no band, who therefore cannot be assigned a learner. */
  'teachersUnclassified',
] as const;

export type BadgeKey = (typeof BADGE_KEYS)[number];

export type BadgeCounts = Record<BadgeKey, number>;

/** §3: "Cap the display at 99+." */
export const BADGE_DISPLAY_CAP = 99;

export function formatBadge(count: number): string {
  return count > BADGE_DISPLAY_CAP ? `${BADGE_DISPLAY_CAP}+` : String(count);
}

export interface AdminNavItem {
  /** Stable id, also the translation key suffix under `adminNav.`. */
  id: string;
  /** Route relative to `/{lang}/admin`. */
  href: string;
  /** Permission the signed-in user must hold for the item to render. */
  permission: Permission;
  /** The queue whose count this item badges, if any. */
  badge?: BadgeKey;
  /**
   * §3 / §7: "Red is reserved exclusively for safeguarding and for
   * frozen-account state." Exactly one nav item may set this.
   */
  danger?: boolean;
  /**
   * FR-SAF-006: the item is additionally gated on the per-person safeguarding
   * designation, not merely on the role's permissions.
   */
  requiresSafeguardingDesignation?: boolean;
  children?: AdminNavItem[];
}

export interface AdminNavSection {
  /** Null for the ungrouped first item. Otherwise a key under `adminNav.group`. */
  id: string | null;
  items: AdminNavItem[];
}

export const ADMIN_NAV: readonly AdminNavSection[] = [
  {
    id: null,
    items: [{ id: 'overview', href: '', permission: 'profile:read:own' }],
  },
  {
    id: 'approvals',
    items: [
      {
        id: 'students',
        href: '/approvals/students',
        permission: 'learner:approve',
        badge: 'studentsAwaitingApproval',
      },
      {
        id: 'primaryStudents',
        href: '/approvals/primary',
        permission: 'learner:approve',
        badge: 'primaryAwaitingApproval',
      },
      {
        id: 'timetable',
        href: '/timetable',
        permission: 'teacher:verification:decide',
      },
      {
        id: 'teachers',
        href: '/approvals/teachers',
        permission: 'teacher:verification:read',
        badge: 'teachersAwaitingVerification',
      },
    ],
  },
  {
    id: 'people',
    items: [
      {
        // The roster, not the queue: everyone already approved, grouped by the
        // band they teach or learn in.
        id: 'teacherRoster',
        href: '/people/teachers',
        permission: 'teacher:browse',
        badge: 'teachersUnclassified',
      },
      {
        id: 'studentRoster',
        href: '/people/students',
        permission: 'user:read:any',
      },
    ],
  },
  {
    id: 'operations',
    items: [
      {
        /*
         * Every class's week, in one screen.
         *
         * Under Operations rather than Approvals: the queue above is work
         * waiting to be done, and this is the state of the whole school —
         * which is what somebody opens when asked "who teaches Form 2 on
         * Thursday", not a decision they are being asked to make.
         */
        id: 'timetableOverview',
        href: '/timetables',
        permission: 'teacher:verification:read',
      },
      {
        // The week ahead, by band or by private lesson.
        id: 'schedule',
        href: '/schedule',
        permission: 'user:read:any',
      },
      {
        // Every lesson in progress, who is teaching it and who is in it.
        id: 'live',
        href: '/live',
        permission: 'live:watch',
        badge: 'liveClasses',
      },
      {
        /*
         * Every recording on the platform, in one place.
         *
         * Gated on `recording:delete` rather than `live:watch`, which customer
         * service also holds. The brief puts deletion in the admin's hands alone,
         * and the whole archive is a stronger read than the lessons happening
         * right now: it is every room full of children the platform has kept.
         */
        id: 'recordings',
        href: '/recordings',
        permission: 'recording:delete',
      },
      {
        /*
         * Marks by category, class and subject, and the button that compiles
         * them into ranked sheets.
         *
         * `reports:read` rather than `recording:delete`: this is the same
         * academic record the reports dashboard already shows, read through a
         * different arrangement, and gating it harder than the dashboard it
         * draws from would be a lock on a door standing open beside it.
         */
        id: 'academicResults',
        href: '/academic-results',
        permission: 'reports:read',
      },
      {
        id: 'support',
        href: '/support',
        // An agent holds `support:read:own` and sees the screen filtered to their
        // own queue; routing controls need `support:assign` and are checked again
        // at the endpoint.
        permission: 'support:read:own',
        badge: 'unassignedTickets',
      },
      {
        /*
         * ClassConnect help — the staff end of the learner's support thread.
         * Support threads only; a learner–teacher conversation is reached
         * through the safeguarding queue, which records who read it and why.
         */
        id: 'messages',
        href: '/messages',
        permission: 'support:read:any',
      },
      {
        id: 'safeguarding',
        href: '/safeguarding',
        permission: 'safeguarding:read',
        badge: 'safeguardingOpen',
        danger: true,
        requiresSafeguardingDesignation: true,
      },
    ],
  },
  {
    id: 'money',
    items: [
      {
        id: 'payments',
        href: '/payments',
        permission: 'finance:read',
        children: [
          /*
           * Roster-first, and first in the group.
           *
           * Paid and owing both list *movements*, so a learner nobody has paid
           * for appears on neither. An operator asking "what has this student
           * paid?" starts from the student, so this is the landing screen.
           */
          { id: 'studentsFees', href: '/payments/students-fees', permission: 'finance:read' },
          { id: 'studentsPaid', href: '/payments/students-paid', permission: 'finance:read' },
          {
            id: 'studentsOwing',
            href: '/payments/students-owing',
            permission: 'finance:read',
            badge: 'studentsOwing',
          },
          { id: 'teachersPaid', href: '/payments/teachers-paid', permission: 'finance:read' },
          {
            id: 'teachersPending',
            href: '/payments/teachers-pending',
            permission: 'finance:read',
            badge: 'teacherPayoutsPending',
          },
          { id: 'hoursEarnings', href: '/payments/earnings', permission: 'finance:read' },
          {
            id: 'reconciliation',
            href: '/payments/reconciliation',
            permission: 'finance:read',
            badge: 'reconciliationUnmatched',
          },
        ],
      },
      { id: 'accounts', href: '/accounts', permission: 'user:read:any' },
      { id: 'reports', href: '/reports', permission: 'reports:read' },
      { id: 'audit', href: '/audit', permission: 'audit:read' },
    ],
  },
];

export interface NavVisibilityContext {
  has: (permission: Permission) => boolean;
  safeguardingDesignated: boolean;
}

function itemVisible(item: AdminNavItem, ctx: NavVisibilityContext): boolean {
  if (!ctx.has(item.permission)) return false;
  // FR-SAF-006: designation overrides role level in both directions — a
  // super_admin who has not been designated does not see this queue either.
  if (item.requiresSafeguardingDesignation && !ctx.safeguardingDesignated) return false;
  return true;
}

/** Filters the sidebar to what this signed-in user may see. */
export function visibleNav(ctx: NavVisibilityContext): AdminNavSection[] {
  return ADMIN_NAV.map((section) => ({
    id: section.id,
    items: section.items
      .filter((item) => itemVisible(item, ctx))
      .map((item) => ({
        ...item,
        children: item.children?.filter((child) => itemVisible(child, ctx)),
      })),
  })).filter((section) => section.items.length > 0);
}

/**
 * §3: the total a collapsed section carries on behalf of its children.
 *
 * Summed raw. `formatBadge` applies the 99+ cap at the point of display, so two
 * queues of 60 read as "99+" and never as "60" — the cap is a rendering limit,
 * never an arithmetic one, and collapsing a section must not lose work.
 */
export function sumChildBadges(
  item: AdminNavItem,
  counts: Partial<BadgeCounts>,
): number {
  return (item.children ?? []).reduce(
    (total, child) => total + (child.badge ? (counts[child.badge] ?? 0) : 0),
    0,
  );
}

/** Which badges this user is allowed to be told the count of. */
export function visibleBadgeKeys(ctx: NavVisibilityContext): BadgeKey[] {
  const keys: BadgeKey[] = [];
  for (const section of visibleNav(ctx)) {
    for (const item of section.items) {
      if (item.badge) keys.push(item.badge);
      for (const child of item.children ?? []) {
        if (child.badge) keys.push(child.badge);
      }
    }
  }
  return keys;
}
