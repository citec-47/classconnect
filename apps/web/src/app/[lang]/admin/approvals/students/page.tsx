'use client';

import { ApprovalQueue } from '@/components/admin/ApprovalQueue';

/** §4.2 — student accounts awaiting approval before they become active. */
export default function StudentApprovals() {
  return <ApprovalQueue cohort="students" />;
}
