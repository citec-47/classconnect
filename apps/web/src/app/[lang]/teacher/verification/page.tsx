'use client';

import { TeacherApplication } from '@/components/teach/TeacherApplication';

/**
 * FR-TVR-001..003: the teacher's own verification screen.
 *
 * The one destination on the teacher surface an unapproved applicant can use,
 * and the only work there is for them to do — so it is reached the same way as
 * everything else, from the sidebar and from the dashboard, rather than living
 * off on a public URL the signed-in teacher would have to be told about.
 */
export default function TeacherVerificationPage() {
  return <TeacherApplication />;
}
