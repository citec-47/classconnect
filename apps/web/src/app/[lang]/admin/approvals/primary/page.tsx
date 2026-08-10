'use client';

import { ApprovalQueue } from '@/components/admin/ApprovalQueue';

/**
 * §4.3 — the same queue mechanics, filtered to Primary (Classes 1–6).
 *
 * Separated because this cohort carries the heaviest safeguarding weight: it
 * adds four checks the general queue does not run, and it carries a standing
 * banner telling the operator what they are looking at.
 */
export default function PrimaryApprovals() {
  return <ApprovalQueue cohort="primary" />;
}
