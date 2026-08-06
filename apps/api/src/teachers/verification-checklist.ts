/**
 * FR-TVR-004/005: the verification checklist.
 *
 * Approval requires an Admin to affirmatively record that *each* item was
 * verified. The list lives here as data so the queue UI, the decision endpoint
 * and the seeded configuration cannot drift apart.
 *
 * Bulk approval shall not be possible (FR-TVR-005): the decision endpoint
 * accepts a checklist for one applicant and refuses approval unless every item
 * below is present and true.
 */
export interface ChecklistItem {
  key: string;
  /** Message key resolved against the EN/FR catalogues (NFR-LOC-002). */
  labelKey: string;
  /** A false value here means the item may be recorded as not-applicable. */
  mandatory: boolean;
}

export const VERIFICATION_CHECKLIST: readonly ChecklistItem[] = [
  { key: 'identity', labelKey: 'admin.checkIdentity', mandatory: true },
  { key: 'qualification', labelKey: 'admin.checkQualification', mandatory: true },
  { key: 'institution', labelKey: 'admin.checkInstitution', mandatory: true },
  { key: 'subjects', labelKey: 'admin.checkSubjects', mandatory: true },
  // Not every subject or level requires a separate teaching authorisation, so
  // this one may be recorded as considered-and-not-applicable.
  { key: 'authorisation', labelKey: 'admin.checkAuthorisation', mandatory: false },
  { key: 'payout_name_match', labelKey: 'admin.checkPayout', mandatory: true },
];

export const MANDATORY_CHECKLIST_KEYS: readonly string[] = VERIFICATION_CHECKLIST.filter(
  (item) => item.mandatory,
).map((item) => item.key);
