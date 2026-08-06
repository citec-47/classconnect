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

  // Teacher's own profile. There is no `teacher:apply`: the self-service
  // application is gone, so a teacher account exists only because an Admin
  // created it (see `teacher:create`).
  'teacher:profile:write:own',
  'teacher:document:upload:own',

  // Account creation — admin only.
  'teacher:create',
  'student:create',

  // Teacher verification (FR-TVR-004..010) — admin side
  'teacher:verification:read',
  'teacher:verification:decide',
  'teacher:suspend',

  // Directory
  'teacher:browse',

  // Assignment and scheduling
  'assignment:create',
  'assignment:respond:own',

  // Staff
  'audit:read',
  'user:read:any',
  'user:suspend',
  'impersonation:start',
  'config:write',

  // Finance
  'finance:read',
  'payout:approve',
] as const;

export type Permission = (typeof PERMISSIONS)[number];

const LEARNER_BASE: Permission[] = [
  'catalogue:read',
  'profile:read:own',
  'profile:write:own',
  'teacher:browse',
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
    'learner:read:own',
    'learner:write:own',
    'learner:archive:own',
    'learner:credentials:manage',
    'guardian:invite',
  ],

  student: [...LEARNER_BASE],

  adult_learner: [...LEARNER_BASE, 'learner:read:own', 'learner:write:own'],

  teacher: [
    'catalogue:read',
    'profile:read:own',
    'profile:write:own',
    'teacher:profile:write:own',
    // FR-TVR-007: a teacher still supplies documents for re-verification when
    // a credential is due to expire, even though they did not create the account.
    'teacher:document:upload:own',
    'assignment:respond:own',
  ],

  support_agent: [
    'catalogue:read',
    'profile:read:own',
    'profile:write:own',
    'user:read:any',
    'teacher:browse',
    'impersonation:start',
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
    'assignment:create',
    'learner:create',
    'learner:read:own',
    'learner:write:own',
    'user:read:any',
    'user:suspend',
    'audit:read',
    'impersonation:start',
  ],

  admin_finance: [
    'catalogue:read',
    'profile:read:own',
    'profile:write:own',
    'user:read:any',
    'finance:read',
    'payout:approve',
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
