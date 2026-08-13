'use client';

import { isTeacherApproved } from '@classconnect/shared';
import { useCachedApi } from './use-cached-api';

/** Only the part of the application the gate cares about. */
interface ApplicationStatus {
  status: 'draft' | 'submitted' | 'under_review' | 'approved' | 'rejected' | 'more_info_required';
}

export interface TeacherApproval {
  status: ApplicationStatus['status'] | null;
  /** True once an Admin has approved. Drives every lock on the teacher surface. */
  approved: boolean;
  /** True while the first answer is still outstanding. */
  loading: boolean;
}

/**
 * Whether this teacher's surface is open yet.
 *
 * FR-TVR-005: a teacher is put in front of children only after an Admin has
 * verified them, so the teaching screens stay shut until the application is
 * approved. The sidebar and the dashboard both ask, and `useCachedApi` keys its
 * cache on the path — so the two of them share one request rather than each
 * making their own on every navigation.
 *
 * Short-lived on purpose. The moment an Admin approves, the teacher is often
 * sitting on this very screen waiting for it, and a 30-second cache would leave
 * them looking at a locked dashboard that is no longer locked.
 *
 * FR-RBA-002: this decides what is *shown*. It is not the access control — the
 * endpoints behind these screens enforce their own permissions server-side.
 */
export function useTeacherApproval(language: string): TeacherApproval {
  const { data, loading } = useCachedApi<ApplicationStatus>('/teachers/me/application', {
    language,
    maxAgeMs: 5_000,
  });

  return {
    status: data?.status ?? null,
    approved: isTeacherApproved(data?.status),
    loading,
  };
}
