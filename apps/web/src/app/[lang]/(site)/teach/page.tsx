'use client';

import { TeacherApplication } from '@/components/teach/TeacherApplication';

/**
 * The public application URL.
 *
 * The form itself moved to `components/teach/TeacherApplication` when the
 * teacher dashboard gained a Verification screen, because both show it. This
 * route stays because the address is already in circulation — in the invitation
 * an Admin sends a new teacher, and in the browser history of every applicant
 * part-way through. A redirect would work for a signed-in teacher and strand
 * everyone else at a sign-in page they did not ask for, so it renders the form
 * rather than forwarding.
 */
export default function Teach() {
  return <TeacherApplication />;
}
