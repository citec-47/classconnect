/**
 * The teacher sidebar, as data.
 *
 * The same arrangement `admin-nav.ts` uses, and for the same reason: holding
 * the destinations here rather than in the React tree means a screen cannot be
 * added to the router and forgotten in the navigation, and the permission that
 * decides whether an item renders is the one the endpoint behind it checks.
 *
 * FR-RBA-001/002: `permission` drives *presentation only*. Every route below
 * enforces the same permission server-side. Hiding an item is never the access
 * control — a teacher who types the URL of a screen they cannot use gets a 403
 * from the API, not a working page.
 *
 * `implemented: false` marks a destination the brief calls for that has no
 * screen yet. It is here rather than absent so the shape of the finished
 * surface is visible in one file, and so the sidebar can render those items
 * disabled instead of pretending the surface is smaller than it is. See
 * BUILD-PLAN.md for the order they land in.
 */

import type { Permission } from './roles';

export interface TeacherNavItem {
  /** Stable id, also the translation key suffix under `teacherNav.`. */
  id: string;
  /** Route relative to `/{lang}/teacher`. */
  href: string;
  /** Permission the signed-in teacher must hold for the item to be usable. */
  permission: Permission;
  /** False while the screen is still to be built. Rendered, but not linked. */
  implemented: boolean;
  /**
   * True for the handful of destinations an unapproved teacher may still use.
   *
   * FR-TVR-005 puts a verified teacher in front of children, so nothing that
   * touches a class, a learner or a payout opens before an Admin has approved
   * the application. Rather than tag the dozen items that are closed, this tags
   * the two that are not — a screen added later is closed by default, which is
   * the safe direction for a mistake to fall.
   */
  availableBeforeApproval?: boolean;
}

export interface TeacherNavSection {
  /** Null for the ungrouped first item. Otherwise a key under `teacherNav.group`. */
  id: string | null;
  items: TeacherNavItem[];
}

export const TEACHER_NAV: readonly TeacherNavSection[] = [
  {
    id: null,
    items: [
      {
        id: 'overview',
        href: '',
        permission: 'profile:read:own',
        implemented: true,
        // The dashboard itself stays reachable while unapproved — it is what
        // explains *why* everything else is closed and where to go next.
        availableBeforeApproval: true,
      },
      {
        id: 'verification',
        href: '/verification',
        permission: 'teacher:profile:write:own',
        implemented: true,
        // The one piece of work an unapproved teacher can actually do.
        availableBeforeApproval: true,
      },
    ],
  },
  {
    id: 'teaching',
    items: [
      {
        id: 'classes',
        href: '/classes',
        permission: 'teacher:classes:read:own',
        implemented: true,
      },
      {
        id: 'timetable',
        href: '/timetable',
        permission: 'teacher:classes:read:own',
        implemented: true,
      },
      {
        id: 'lessons',
        href: '/lessons',
        // Publishing writes to every learner in a level, so the nav entry is
        // gated on the permission that allows it rather than on reading classes.
        permission: 'lesson:publish:own',
        implemented: true,
      },
      {
        id: 'groups',
        href: '/groups',
        permission: 'group:manage:own',
        implemented: true,
      },
      {
        id: 'live',
        href: '/live',
        permission: 'live:host',
        implemented: true,
      },
      {
        id: 'recordings',
        href: '/recordings',
        permission: 'recording:read:own',
        implemented: true,
      },
    ],
  },
  {
    id: 'assessment',
    items: [
      {
        id: 'exams',
        href: '/exams',
        permission: 'exam:manage:own',
        implemented: true,
      },
      {
        id: 'reports',
        href: '/reports',
        permission: 'report:submit:own',
        implemented: true,
      },
    ],
  },
  {
    id: 'account',
    items: [
      {
        id: 'earnings',
        href: '/earnings',
        // The endpoint behind it checks the same permission (FR-RBA-002).
        permission: 'earnings:read:own',
        implemented: true,
      },
      {
        id: 'messages',
        href: '/messages',
        permission: 'profile:read:own',
        implemented: true,
      },
      {
        id: 'profile',
        href: '/profile',
        permission: 'teacher:profile:write:own',
        implemented: true,
      },
    ],
  },
];

/** Every item, flattened — for route guards and for tests that check coverage. */
export function teacherNavItems(): TeacherNavItem[] {
  return TEACHER_NAV.flatMap((section) => section.items);
}

/**
 * The verification states in which the teaching surface is open.
 *
 * Only `approved`. Named as a list rather than compared inline so that the
 * sidebar, the dashboard and any later route guard cannot each decide it
 * slightly differently.
 */
export const TEACHER_APPROVED_STATES: readonly string[] = ['approved'];

/** Whether an application in this state unlocks the teaching surface. */
export function isTeacherApproved(status: string | null | undefined): boolean {
  return status !== null && status !== undefined && TEACHER_APPROVED_STATES.includes(status);
}

/**
 * Whether a nav item is usable right now.
 *
 * One rule, one place: an item is usable if its screen exists, and either the
 * teacher is approved or the item is one of the few open beforehand.
 */
export function isTeacherNavItemUsable(
  item: TeacherNavItem,
  approved: boolean,
): boolean {
  if (!item.implemented) return false;
  return approved || item.availableBeforeApproval === true;
}
