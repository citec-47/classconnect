import type { Language, Role } from '@classconnect/shared';

/**
 * Where a signed-in person belongs.
 *
 * ## Why this is one function in one file
 *
 * It used to live inside the sign-in page, and the register page — the other
 * screen that signs somebody in — pushed a hard-coded `/${language}` instead. So
 * a teacher who *registered* was authenticated and then dropped on a public page
 * headed "Create a parent account", with nothing on screen acknowledging they had
 * an account, let alone a dashboard. Signing in worked and registering appeared
 * not to, for the same reason, six months apart.
 *
 * Two callers with the same question must not each answer it. Everything that
 * establishes a session routes through here.
 *
 * ## Ordered by specificity
 *
 * A super admin who is also a parent wants the admin dashboard, because that is
 * the account they signed in to use.
 */
export function homeFor(roles: readonly Role[], language: Language): string {
  const has = (role: Role) => roles.includes(role);

  if (has('super_admin') || has('admin_ops') || has('admin_finance') || has('support_agent')) {
    return `/${language}/admin`;
  }

  /*
   * A teacher lands on their dashboard, approved or not.
   *
   * Not on the application form, even for a brand-new applicant. The dashboard
   * shows the whole surface with everything but Verification locked, which states
   * the position exactly — what they have, what is coming, and the one thing to do
   * about it. The form on its own makes the platform look like a single form and
   * tells an applicant nothing about what they are applying to.
   */
  if (has('teacher')) return `/${language}/teacher`;

  if (has('parent')) return `/${language}/children`;

  // §4: a learner's home is their dashboard, for the same reason.
  if (has('student') || has('adult_learner')) return `/${language}/student`;

  return `/${language}`;
}
