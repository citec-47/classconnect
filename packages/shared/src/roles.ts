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
  /**
   * The teacher's own teaching load: their cohorts, their private assignments
   * and the headcount on each. Scoped `:own` because a teacher may read the
   * roster of a class they teach and no other.
   */
  'teacher:classes:read:own',
  /**
   * Publishing a lesson to a class (BUILD-PLAN Phase 2).
   *
   * Its own permission rather than part of `teacher:classes:read:own`, because
   * this one *writes* to every learner in a level. The service checks the
   * teacher was verified for that subject and level as well (FR-TVR-005) — the
   * permission answers "may a teacher publish at all", the query answers "to
   * this class".
   */
  'lesson:publish:own',
  /**
   * Groups and the exercises set in them (BUILD-PLAN Phase 3).
   *
   * Creating a `Cohort`, setting an exercise with a locking deadline, and
   * awarding the group its mark. All three are the same authority over the same
   * group, so they are one permission rather than three.
   */
  'group:manage:own',
  /**
   * Setting and marking exams (BUILD-PLAN Phase 4).
   *
   * Distinct from `group:manage:own` because it reaches a whole level rather than
   * a group the teacher assembled, and because releasing a mark is the act a
   * learner's report card is built from.
   */
  'exam:manage:own',
  /**
   * Submitting a subject's termly mark and coefficient (BUILD-PLAN Phase 6).
   *
   * A teacher submits marks for their own subject; nobody computes a report card
   * with this. That is `report:generate`, which is staff's, because the average
   * and the class position depend on every teacher having finished.
   */
  'report:submit:own',
  /** Generating the class's report cards once every subject is in. Staff. */
  'report:generate',
  /**
   * Hosting a live lesson.
   *
   * Held by teachers and by admins — the brief gives both the ability to go live.
   * `live:watch` is the different, more intrusive thing: seeing into somebody
   * else's room.
   */
  'live:host',
  /** A teacher watching back their own recorded lessons. */
  'recording:read:own',
  /**
   * Deleting a recording.
   *
   * "Only the admin can delete it", and deliberately not granted to the teacher
   * who taught the lesson: a recording of a class containing children is
   * safeguarding evidence, and the person most motivated to remove it is exactly
   * who must not be able to.
   */
  'recording:delete',

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

  /**
   * Placing a learner in a class and setting the subjects they offer.
   *
   * Separate from `learner:approve`, which decides whether an account may exist
   * at all. This decides which timetable, lessons and exams reach a child who
   * already has one — a routine registry task the front desk does, not a
   * judgement about admitting them.
   *
   * Held by customer service as well as Ops, because a learner waiting on a
   * single team to be given a class cannot see a single lesson meanwhile.
   */
  'learner:class:assign',

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
  /** FR-ERN-006: a teacher's read of their own accrued earnings. Never another's. */
  'earnings:read:own',
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
    'teacher:classes:read:own',
    /*
     * Publishing lessons to the classes they teach (BUILD-PLAN Phase 2).
     *
     * Granted to `teacher` and to nobody else — not even an admin. An admin can
     * remove a lesson through the file endpoints and can see every one of them,
     * but a lesson arrives in a child's library under a teacher's name, and
     * staff publishing one would make that attribution a guess.
     */
    'lesson:publish:own',
    // The teaching surface proper: groups, exams, termly marks, going live, and
    // watching back their own lessons. Every one is scoped to what they teach,
    // and each endpoint re-derives that from the database rather than the request.
    'group:manage:own',
    'exam:manage:own',
    'report:submit:own',
    'live:host',
    'recording:read:own',
    /*
     * FR-ERN-006: a teacher reads their own accrued earnings.
     *
     * Read, and only their own. Approving a payout stays `payout:approve`,
     * which Finance holds and a teacher never does — seeing what you have
     * earned and authorising its payment are different acts, and the whole
     * point of separating them is that the same person does not do both.
     */
    'earnings:read:own',
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
    /*
     * Customer service reviews teacher applications alongside Ops.
     *
     * A deliberate widening: verification decides whether a stranger is put in
     * front of children, so it was Ops-only. It is shared because an applicant
     * waiting on a single team waits days, and the control that matters is not
     * *who* clicks approve — it is FR-TVR-005, which still requires every
     * checklist item to be recorded affirmatively, one applicant at a time,
     * with findings, and no bulk action anywhere on the screen. Every decision
     * is attributed and audited (FR-TVR-010).
     */
    'teacher:verification:read',
    'teacher:verification:decide',
    // Placing a learner in a class is front-desk registry work, and a learner
    // without one sees no timetable, no lessons and no exams until it is done.
    'learner:class:assign',
    // Customer service generates report cards and unlocks a group exercise a
    // teacher is unavailable to reopen. Neither writes a mark.
    'report:generate',
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
    'learner:class:assign',
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
    // The brief's admin live session, the one-click report card generation, and
    // the deletion of a recording — which is Ops's alone, never the teacher's.
    'live:host',
    'report:generate',
    'recording:delete',
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
