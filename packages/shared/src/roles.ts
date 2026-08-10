/**
 * Roles and permissions.
 *
 * FR-RBA-001: role-based access control with eight roles.
 * FR-RBA-002: every endpoint enforces authorisation server-side. Client-side
 *             hiding of controls is never the sole access control — so this
 *             module is consumed by the API guards, and only incidentally by
 *             the web app for presentation.
 */

export const ROLES = [
  'parent',
  'student',
  'adult_learner',
  'teacher',
  'support_agent',
  'admin_ops',
  'admin_finance',
  'super_admin',
] as const;

export type Role = (typeof ROLES)[number];

/** Roles that are platform staff rather than customers. */
export const STAFF_ROLES: readonly Role[] = [
  'support_agent',
  'admin_ops',
  'admin_finance',
  'super_admin',
];

/** FR-AUT-009: MFA is mandatory for these roles. */
export const MFA_REQUIRED_ROLES: readonly Role[] = STAFF_ROLES;

/** Roles that consume instruction. */
export const LEARNER_ROLES: readonly Role[] = ['student', 'adult_learner'];

/**
 * Permissions are verbs on resources. Guards check permissions, not roles, so
 * that a role's reach can change without touching every endpoint.
 */
export const PERMISSIONS = [
  // Catalogue
  'catalogue:read',
  'catalogue:write',

  // Own account
  'profile:read:own',
  'profile:write:own',

  // Family (FR-FAM-001..006)
  //
  // `learner:create` is deliberately NOT held by parents. Student and Teacher
  // accounts are created by an Admin only; a parent manages the children
  // already linked to them, and sees them through the same child selector.
  'learner:create',
  'learner:read:own',
  'learner:write:own',
  'learner:archive:own',
  'learner:credentials:manage',
  'guardian:invite',

  // Teacher's own application and profile. A teacher may state their
  // credentials and supply documents; only an Admin may accept them
  // (FR-TVR-005), so applying and being approved stay separate permissions.
  'teacher:apply',
  'teacher:profile:write:own',
  'teacher:document:upload:own',

  // Account creation — admin only.
  'teacher:create',
  'student:create',

  // Teacher verification (FR-TVR-004..010) — admin side
  'teacher:verification:read',
  'teacher:verification:decide',
  'teacher:suspend',
  /**
   * Classifying a teacher into a teaching band.
   *
   * Separate from verification: deciding that someone is who they say they are
   * and is qualified is a different judgement from deciding which learners they
   * should be put in front of, and FR-SCH-002 hangs assignment off the second.
   */
  'teacher:classify',

  /**
   * Watching lessons in progress — who is teaching, who is attending, and what.
   *
   * Its own permission because it is the most intrusive read on the platform: a
   * one-to-one lesson between a teacher and a child. FR-SAF-004 already records
   * those and tells everyone so; this is the live equivalent, and every use of
   * it is written to the audit log (FR-RBA-004).
   */
  'live:watch',

  // Directory
  'teacher:browse',

  // Assignment and scheduling
  'assignment:create',
  'assignment:respond:own',

  // Learner approval (§4.2/§4.3) — an account is queued until an Admin decides.
  'learner:approve',

  // Support routing (§4.5, FR-SUP-001..007). `support:read:own` is the agent's
  // own queue; `support:assign` is the routing screen itself.
  'support:read:any',
  'support:read:own',
  'support:assign',

  /**
   * Safeguarding (§4.6, FR-SAF-005/006).
   *
   * Holding this permission is necessary but never sufficient: FR-SAF-006
   * restricts the queue to *designated staff regardless of role level*, so the
   * API checks the per-person designation as well. The permission answers "may
   * this role ever be designated"; the designation answers "is this person".
   */
  'safeguarding:read',
  'safeguarding:act',

  // Staff
  'audit:read',
  'user:read:any',
  'user:suspend',
  'impersonation:start',
  'config:write',
  'reports:read',
  /** §6: granting and revoking roles is the super admin's alone. */
  'role:grant',

  // Finance
  'finance:read',
  'payout:approve',
  /** §4.7.1/§4.7.2: discretionary money movements, Finance Admin only. */
  'finance:refund',
  'finance:record_payment',
  'reconciliation:resolve',
  /** FR-ERN-004: deciding what becomes of an unallocated pool balance. */
  'unallocated:decide',

  /** §5.5: manual freeze and unfreeze of a student or teacher account. */
  'account:freeze',
] as const;

export type Permission = (typeof PERMISSIONS)[number];

/**
 * What everyone who consumes instruction may do.
 *
 * `teacher:browse` is deliberately *not* here. FR-SCH-002 and §7 of the student
 * brief forbid a minor browsing or booking teachers — assignment is an
 * administrative action — and the brief is explicit that the prohibitions are
 * enforced server-side rather than by hiding controls. A `student` holding the
 * permission and being shown no button is exactly the arrangement it rules out.
 * Parents and Adult Learners are granted it individually below.
 */
const LEARNER_BASE: Permission[] = [
  'catalogue:read',
  'profile:read:own',
  'profile:write:own',
];

/**
 * FR-RBA-003 is enforced separately, at record level. This table only answers
 * "may this role attempt this verb at all"; ownership is checked per record.
 */
export const ROLE_PERMISSIONS: Record<Role, readonly Permission[]> = {
  // A parent manages the children an Admin has linked to them, and pays. They
  // cannot create a Student account: `learner:create` is absent by design.
  parent: [
    ...LEARNER_BASE,
    'teacher:browse',
    'learner:read:own',
    'learner:write:own',
    'learner:archive:own',
    'learner:credentials:manage',
    'guardian:invite',
  ],

  /** FR-SCH-002: no teacher browsing, no self-serve booking. Minors are assigned. */
  student: [...LEARNER_BASE],

  // FR-SCH-004: an Adult Learner is their own payer and books their own slots,
  // so they get the browse permission a minor must not have.
  adult_learner: [
    ...LEARNER_BASE,
    'teacher:browse',
    'learner:read:own',
    'learner:write:own',
  ],

  teacher: [
    'catalogue:read',
    'profile:read:own',
    'profile:write:own',
    'teacher:apply',
    'teacher:profile:write:own',
    // FR-TVR-007: a teacher still supplies documents for re-verification when
    // a credential is due to expire, even though they did not create the account.
    'teacher:document:upload:own',
    'assignment:respond:own',
  ],

  // §3: an agent works their own queue. They cannot route work, cannot approve
  // anyone, and cannot see money.
  support_agent: [
    'catalogue:read',
    'profile:read:own',
    'profile:write:own',
    'user:read:any',
    'teacher:browse',
    'impersonation:start',
    'support:read:own',
    'live:watch',
    // Eligible for safeguarding designation; still gated on being designated.
    'safeguarding:read',
    'safeguarding:act',
  ],

  // The only role that can bring a Student or Teacher account into existence.
  admin_ops: [
    'catalogue:read',
    'catalogue:write',
    'profile:read:own',
    'profile:write:own',
    'teacher:browse',
    'teacher:create',
    'student:create',
    'teacher:verification:read',
    'teacher:verification:decide',
    'teacher:suspend',
    'teacher:classify',
    'live:watch',
    'assignment:create',
    'learner:create',
    'learner:read:own',
    'learner:write:own',
    'user:read:any',
    'user:suspend',
    'audit:read',
    'impersonation:start',
    'learner:approve',
    'support:read:any',
    'support:read:own',
    'support:assign',
    'safeguarding:read',
    'safeguarding:act',
    'reports:read',
    // §3: Ops sees the money screens but does not move money. `finance:read`
    // without `payout:approve`, `finance:refund` or `finance:record_payment` is
    // exactly the "read-only" cell in the role-visibility table.
    'finance:read',
    'account:freeze',
  ],

  admin_finance: [
    'catalogue:read',
    'profile:read:own',
    'profile:write:own',
    'user:read:any',
    'finance:read',
    'payout:approve',
    'finance:refund',
    'finance:record_payment',
    'reconciliation:resolve',
    'unallocated:decide',
    'account:freeze',
    'reports:read',
    'audit:read',
  ],

  // Break-glass. Holds every permission by construction rather than by list,
  // so a new permission is never accidentally withheld from the super admin.
  super_admin: PERMISSIONS,
};

export function permissionsFor(roles: readonly Role[]): Set<Permission> {
  const out = new Set<Permission>();
  for (const role of roles) {
    for (const permission of ROLE_PERMISSIONS[role] ?? []) out.add(permission);
  }
  return out;
}

export function hasPermission(roles: readonly Role[], permission: Permission): boolean {
  return permissionsFor(roles).has(permission);
}

export function isStaff(roles: readonly Role[]): boolean {
  return roles.some((r) => STAFF_ROLES.includes(r));
}

export function requiresMfa(roles: readonly Role[]): boolean {
  return roles.some((r) => MFA_REQUIRED_ROLES.includes(r));
}
