/**
 * Platform configuration keys and their defaults.
 *
 * CON-07: the system is operated by a small team; anything the SRS describes as
 * "configurable" must be changeable without a deployment. Every default below
 * cites the requirement that fixes it.
 */

export const CONFIG_KEYS = {
  // --- FR-AUT-004: OTP issuance and verification ---
  OTP_TTL_SECONDS: 'auth.otp.ttl_seconds',
  OTP_MAX_ATTEMPTS: 'auth.otp.max_attempts',
  OTP_MAX_PER_WINDOW: 'auth.otp.max_per_window',
  OTP_WINDOW_MINUTES: 'auth.otp.window_minutes',
  OTP_MAX_PER_DAY: 'auth.otp.max_per_day',

  // --- FR-AUT-006/007: tokens and lockout ---
  ACCESS_TOKEN_TTL_SECONDS: 'auth.access_token.ttl_seconds',
  REFRESH_TOKEN_TTL_DAYS: 'auth.refresh_token.ttl_days',
  LOCKOUT_THRESHOLD: 'auth.lockout.threshold',
  LOCKOUT_MINUTES: 'auth.lockout.minutes',

  // --- FR-TVR-007: credential expiry ---
  DOCUMENT_REVERIFY_DAYS_BEFORE_EXPIRY: 'teacher.document.reverify_days_before_expiry',

  // --- FR-SCH-002/005/007/011/012: scheduling ---
  ASSIGNMENT_RESPONSE_WINDOW_HOURS: 'scheduling.assignment_response_window_hours',
  MIN_GAP_BETWEEN_SESSIONS_MINUTES: 'scheduling.min_gap_minutes',
  CANCELLATION_NOTICE_HOURS: 'scheduling.cancellation_notice_hours',
  NO_SHOW_TEACHER_MINUTES: 'scheduling.no_show_teacher_minutes',
  NO_SHOW_LEARNER_MINUTES: 'scheduling.no_show_learner_minutes',
  SESSION_JOIN_EARLY_MINUTES: 'scheduling.join_early_minutes',

  // --- FR-PAY-007/012/018: billing ---
  SUBSCRIPTION_GRACE_DAYS: 'billing.grace_days',
  PAYMENT_POLL_TIMEOUT_SECONDS: 'billing.payment_poll_timeout_seconds',
  PAYMENT_RECHECK_WINDOW_HOURS: 'billing.payment_recheck_window_hours',
  RENEWAL_RETRY_DAYS: 'billing.renewal_retry_days',

  // --- FR-ERN-002/003/005: revenue attribution (OI-02, unresolved) ---
  TEACHER_POOL_PERCENT: 'earnings.teacher_pool_percent',
  /** FR-ERN-002 requires the gross/net basis to be a single explicit, auditable value. */
  TEACHER_POOL_BASIS: 'earnings.teacher_pool_basis',
  SESSION_TYPE_FACTOR_ONE_TO_ONE: 'earnings.session_factor.one_to_one',
  SESSION_TYPE_FACTOR_GROUP: 'earnings.session_factor.group',
  EARNING_MIN_PRESENCE_PERCENT: 'earnings.min_presence_percent',
  PAYOUT_MINIMUM_XAF: 'earnings.payout_minimum_xaf',

  // --- FR-NOT-004/008: notifications ---
  QUIET_HOURS_START: 'notifications.quiet_hours_start',
  QUIET_HOURS_END: 'notifications.quiet_hours_end',
  MAX_NOTIFICATIONS_PER_DAY: 'notifications.max_per_day',

  // --- FR-RAT-002: ratings ---
  MIN_RATINGS_BEFORE_PUBLIC: 'ratings.min_before_public',

  // --- FR-HWK-008: grading SLA ---
  UNGRADED_ESCALATION_DAYS: 'coursework.ungraded_escalation_days',

  // --- FR-SAF-004/005: safeguarding ---
  MINOR_ONE_TO_ONE_RECORDING_DEFAULT: 'safeguarding.minor_one_to_one_recording_default',
  SAFEGUARDING_FIRST_RESPONSE_HOURS: 'safeguarding.first_response_hours',

  // --- §5.5: retention ---
  RECORDING_RETENTION_DAYS: 'retention.recording_days',
} as const;

export type ConfigKey = (typeof CONFIG_KEYS)[keyof typeof CONFIG_KEYS];

/**
 * Defaults as specified by the SRS. Where the SRS leaves a value open, the
 * open-issue reference is noted so it is never mistaken for a settled decision.
 */
export const CONFIG_DEFAULTS: Record<ConfigKey, unknown> = {
  [CONFIG_KEYS.OTP_TTL_SECONDS]: 300, // FR-AUT-004: 5 minutes
  [CONFIG_KEYS.OTP_MAX_ATTEMPTS]: 5, // FR-AUT-004
  [CONFIG_KEYS.OTP_MAX_PER_WINDOW]: 3, // FR-AUT-004: 3 codes per number
  [CONFIG_KEYS.OTP_WINDOW_MINUTES]: 15, // FR-AUT-004: per 15 minutes
  [CONFIG_KEYS.OTP_MAX_PER_DAY]: 10, // FR-AUT-004

  [CONFIG_KEYS.ACCESS_TOKEN_TTL_SECONDS]: 900, // FR-AUT-006: <= 15 minutes
  [CONFIG_KEYS.REFRESH_TOKEN_TTL_DAYS]: 30, // FR-AUT-006: <= 30 days
  [CONFIG_KEYS.LOCKOUT_THRESHOLD]: 10, // FR-AUT-007
  [CONFIG_KEYS.LOCKOUT_MINUTES]: 15, // FR-AUT-007

  [CONFIG_KEYS.DOCUMENT_REVERIFY_DAYS_BEFORE_EXPIRY]: 30, // FR-TVR-007

  [CONFIG_KEYS.ASSIGNMENT_RESPONSE_WINDOW_HOURS]: 24, // FR-SCH-002
  [CONFIG_KEYS.MIN_GAP_BETWEEN_SESSIONS_MINUTES]: 0, // FR-SCH-005
  [CONFIG_KEYS.CANCELLATION_NOTICE_HOURS]: 12, // FR-SCH-007
  [CONFIG_KEYS.NO_SHOW_TEACHER_MINUTES]: 10, // FR-SCH-011
  [CONFIG_KEYS.NO_SHOW_LEARNER_MINUTES]: 15, // FR-SCH-012
  [CONFIG_KEYS.SESSION_JOIN_EARLY_MINUTES]: 10, // FR-LIV-003

  [CONFIG_KEYS.SUBSCRIPTION_GRACE_DAYS]: 3, // FR-PAY-007
  [CONFIG_KEYS.PAYMENT_POLL_TIMEOUT_SECONDS]: 300, // FR-PAY-012: 5 minutes
  [CONFIG_KEYS.PAYMENT_RECHECK_WINDOW_HOURS]: 24, // FR-PAY-012
  [CONFIG_KEYS.RENEWAL_RETRY_DAYS]: [0, 1, 3], // FR-PAY-018

  [CONFIG_KEYS.TEACHER_POOL_PERCENT]: 60, // FR-ERN-002 — subject to OI-02
  [CONFIG_KEYS.TEACHER_POOL_BASIS]: 'net_of_fees_and_tax', // FR-ERN-002 — subject to OI-02
  [CONFIG_KEYS.SESSION_TYPE_FACTOR_ONE_TO_ONE]: 1.0, // FR-ERN-003
  [CONFIG_KEYS.SESSION_TYPE_FACTOR_GROUP]: 1.0, // FR-ERN-003
  [CONFIG_KEYS.EARNING_MIN_PRESENCE_PERCENT]: 80, // FR-ERN-005
  [CONFIG_KEYS.PAYOUT_MINIMUM_XAF]: 10000, // FR-ERN-007 — value not fixed by the SRS

  [CONFIG_KEYS.QUIET_HOURS_START]: '21:00', // FR-NOT-004
  [CONFIG_KEYS.QUIET_HOURS_END]: '06:00', // FR-NOT-004
  [CONFIG_KEYS.MAX_NOTIFICATIONS_PER_DAY]: 10, // FR-NOT-008

  [CONFIG_KEYS.MIN_RATINGS_BEFORE_PUBLIC]: 5, // FR-RAT-002

  [CONFIG_KEYS.UNGRADED_ESCALATION_DAYS]: 7, // FR-HWK-008

  [CONFIG_KEYS.MINOR_ONE_TO_ONE_RECORDING_DEFAULT]: true, // FR-SAF-004
  [CONFIG_KEYS.SAFEGUARDING_FIRST_RESPONSE_HOURS]: 4, // FR-SAF-005

  [CONFIG_KEYS.RECORDING_RETENTION_DAYS]: 90, // §5.5 — subject to OI-09
};
