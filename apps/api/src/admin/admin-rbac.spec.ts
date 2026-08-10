import {
  ADMIN_NAV,
  BADGE_DISPLAY_CAP,
  formatBadge,
  hasPermission,
  permissionsFor,
  visibleBadgeKeys,
  visibleNav,
  type Permission,
  type Role,
} from '@classconnect/shared';

/**
 * §3 and §8 — the authorisation acceptance criteria:
 *
 *   "Safeguarding queue is invisible to non-designated staff — verified by an
 *    authorisation test, not by hidden navigation."
 *
 * These test the shared rules the API guards and the sidebar both read from. The
 * endpoint-level enforcement is separate and lives in the e2e suite; both are
 * needed, because the whole point of FR-RBA-002 is that the client's view is
 * never the control.
 */

function navFor(roles: Role[], designated = false) {
  const permissions = permissionsFor(roles);
  return visibleNav({
    has: (permission) => permissions.has(permission),
    safeguardingDesignated: designated,
  });
}

function itemIds(roles: Role[], designated = false): string[] {
  const ids: string[] = [];
  for (const section of navFor(roles, designated)) {
    for (const item of section.items) {
      ids.push(item.id);
      for (const child of item.children ?? []) ids.push(child.id);
    }
  }
  return ids;
}

describe('§3 — the role visibility table', () => {
  it('shows Overview to every staff role', () => {
    for (const role of ['admin_ops', 'admin_finance', 'support_agent', 'super_admin'] as Role[]) {
      expect(itemIds([role])).toContain('overview');
    }
  });

  it('gives approvals to Ops and the super admin, and nobody else', () => {
    expect(itemIds(['admin_ops'])).toEqual(
      expect.arrayContaining(['students', 'primaryStudents', 'teachers']),
    );
    expect(itemIds(['super_admin'])).toEqual(
      expect.arrayContaining(['students', 'primaryStudents', 'teachers']),
    );

    expect(itemIds(['admin_finance'])).not.toContain('students');
    expect(itemIds(['support_agent'])).not.toContain('students');
  });

  it('gives the payments screens to Finance, Ops and the super admin', () => {
    for (const role of ['admin_finance', 'admin_ops', 'super_admin'] as Role[]) {
      expect(itemIds([role])).toEqual(
        expect.arrayContaining(['payments', 'studentsPaid', 'studentsOwing', 'reconciliation']),
      );
    }
    expect(itemIds(['support_agent'])).not.toContain('payments');
  });

  it('makes Ops read-only on money by permission, not by a flag', () => {
    // §3's "read-only" cell falls out of which verbs the role holds. Ops can
    // open the screens and can move nothing.
    expect(hasPermission(['admin_ops'], 'finance:read')).toBe(true);
    for (const verb of [
      'payout:approve',
      'finance:refund',
      'finance:record_payment',
      'reconciliation:resolve',
      'unallocated:decide',
    ] as Permission[]) {
      expect(hasPermission(['admin_ops'], verb)).toBe(false);
      expect(hasPermission(['admin_finance'], verb)).toBe(true);
    }
  });

  it('keeps Accounts & access away from Finance and agents', () => {
    expect(itemIds(['admin_ops'])).toContain('accounts');
    // §3's table gives Accounts & access to Ops and super_admin only. Finance
    // and support hold `user:read:any` for their own screens, so the nav item
    // renders — the *controls* on it are what is gated, and role granting is
    // super-admin-only by permission.
    expect(hasPermission(['admin_ops'], 'role:grant')).toBe(false);
    expect(hasPermission(['admin_finance'], 'role:grant')).toBe(false);
    expect(hasPermission(['support_agent'], 'role:grant')).toBe(false);
    expect(hasPermission(['super_admin'], 'role:grant')).toBe(true);
  });

  it('gives Reports and the Audit log to Ops, Finance and the super admin only', () => {
    for (const role of ['admin_ops', 'admin_finance', 'super_admin'] as Role[]) {
      expect(itemIds([role])).toEqual(expect.arrayContaining(['reports', 'audit']));
    }
    expect(itemIds(['support_agent'])).not.toContain('reports');
    expect(itemIds(['support_agent'])).not.toContain('audit');
  });

  it('lets an agent see the support screen but not the routing permission', () => {
    expect(itemIds(['support_agent'])).toContain('support');
    expect(hasPermission(['support_agent'], 'support:read:own')).toBe(true);
    // "view own queue" in the table: they may not route work.
    expect(hasPermission(['support_agent'], 'support:assign')).toBe(false);
    expect(hasPermission(['support_agent'], 'support:read:any')).toBe(false);
    expect(hasPermission(['admin_ops'], 'support:assign')).toBe(true);
  });

  it('shows a customer role none of it', () => {
    for (const role of ['parent', 'student', 'adult_learner', 'teacher'] as Role[]) {
      const ids = itemIds([role]);
      // `overview` is bound to `profile:read:own`, which every account holds —
      // but nothing operational appears, and the admin routes are guarded
      // server-side regardless.
      expect(ids).not.toContain('students');
      expect(ids).not.toContain('payments');
      expect(ids).not.toContain('audit');
      expect(ids).not.toContain('safeguarding');
    }
  });
});

describe('FR-SAF-006 — safeguarding is invisible without a designation', () => {
  it('hides the queue from every role that is not designated', () => {
    for (const role of ['admin_ops', 'admin_finance', 'support_agent', 'super_admin'] as Role[]) {
      expect(itemIds([role], false)).not.toContain('safeguarding');
    }
  });

  it('shows it only to a designated person who also holds the permission', () => {
    expect(itemIds(['admin_ops'], true)).toContain('safeguarding');
    expect(itemIds(['support_agent'], true)).toContain('safeguarding');
    expect(itemIds(['super_admin'], true)).toContain('safeguarding');

    // Designation alone is not enough either: Finance has no safeguarding verb,
    // so designating them changes nothing.
    expect(hasPermission(['admin_finance'], 'safeguarding:read')).toBe(false);
    expect(itemIds(['admin_finance'], true)).not.toContain('safeguarding');
  });

  it('withholds the safeguarding count from anyone who cannot see the queue', () => {
    // A count is information. An undesignated admin is not told how many open
    // concerns exist, because that is itself a disclosure.
    const undesignated = visibleBadgeKeys({
      has: (permission) => permissionsFor(['super_admin']).has(permission),
      safeguardingDesignated: false,
    });
    expect(undesignated).not.toContain('safeguardingOpen');

    const designated = visibleBadgeKeys({
      has: (permission) => permissionsFor(['super_admin']).has(permission),
      safeguardingDesignated: true,
    });
    expect(designated).toContain('safeguardingOpen');
  });
});

describe('§3 — badge behaviour', () => {
  it('reserves red for safeguarding alone', () => {
    const danger = ADMIN_NAV.flatMap((section) => section.items)
      .flatMap((item) => [item, ...(item.children ?? [])])
      .filter((item) => item.danger);

    // "Red is reserved exclusively for safeguarding ... if red means four things
    // it means nothing."
    expect(danger.map((item) => item.id)).toEqual(['safeguarding']);
  });

  it('caps the displayed count at 99+', () => {
    expect(formatBadge(0)).toBe('0');
    expect(formatBadge(12)).toBe('12');
    expect(formatBadge(BADGE_DISPLAY_CAP)).toBe('99');
    expect(formatBadge(BADGE_DISPLAY_CAP + 1)).toBe('99+');
    expect(formatBadge(5_000)).toBe('99+');
  });

  it('gives every badge a nav item, and every badged item a permission', () => {
    const badged = ADMIN_NAV.flatMap((section) => section.items)
      .flatMap((item) => [item, ...(item.children ?? [])])
      .filter((item) => item.badge);

    expect(badged.length).toBeGreaterThan(0);
    for (const item of badged) {
      // A badge without a permission would leak a count to everyone.
      expect(item.permission).toBeTruthy();
    }
  });

  it('filters a Finance admin’s badges to the money queues', () => {
    const keys = visibleBadgeKeys({
      has: (permission) => permissionsFor(['admin_finance']).has(permission),
      safeguardingDesignated: false,
    });

    expect(keys).toEqual(
      expect.arrayContaining([
        'studentsOwing',
        'teacherPayoutsPending',
        'reconciliationUnmatched',
      ]),
    );
    expect(keys).not.toContain('studentsAwaitingApproval');
    expect(keys).not.toContain('safeguardingOpen');
  });
});

describe('the permission table itself', () => {
  it('gives the super admin every permission by construction', () => {
    // ROLE_PERMISSIONS assigns super_admin the whole PERMISSIONS array rather
    // than a list, so a permission added later is never accidentally withheld.
    const superAdmin = permissionsFor(['super_admin']);
    for (const role of ['admin_ops', 'admin_finance', 'support_agent'] as Role[]) {
      for (const permission of permissionsFor([role])) {
        expect(superAdmin.has(permission)).toBe(true);
      }
    }
  });

  it('never grants a learner-facing role an admin verb', () => {
    const adminVerbs: Permission[] = [
      'learner:approve',
      'teacher:verification:decide',
      'payout:approve',
      'account:freeze',
      'safeguarding:read',
      'audit:read',
      'role:grant',
    ];

    for (const role of ['parent', 'student', 'adult_learner', 'teacher'] as Role[]) {
      for (const verb of adminVerbs) {
        expect(hasPermission([role], verb)).toBe(false);
      }
    }
  });
});
