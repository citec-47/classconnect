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

  // --- §5 of the admin brief: instalment billing and automatic freezing ---
  /** §5.1: how many parts a "pay in instalments" schedule has. */
  INSTALMENT_COUNT: 'billing.instalment.count',
  /** Q2: days between instalment due dates. */
  INSTALMENT_INTERVAL_DAYS: 'billing.instalment.interval_days',
  /** Q2: relative weights of the parts. Equal thirds unless commercially changed. */
  INSTALMENT_WEIGHTS: 'billing.instalment.weights',
  /** Q4: grace after each instalment due date before the account freezes. */
  INSTALMENT_GRACE_DAYS: 'billing.instalment.grace_days',
  /** FR-PAY-019 / §5.3: notice days before the due date. Due day and freeze day
   *  are implied and always sent — a freeze is never the first the payer hears. */
  INSTALMENT_NOTICE_DAYS_BEFORE: 'billing.instalment.notice_days_before',
  /** Q3: discount for settling the whole period up front. */
  PAY_IN_FULL_DISCOUNT_PERCENT: 'billing.pay_in_full_discount_percent',

  // --- §4.7.3 / OI-07: deductions on teacher earnings ---
  TAX_WITHHOLDING_PERCENT: 'earnings.tax_withholding_percent',

  // --- §4.7.6 / FR-LDG-004: reconciliation ---
  RECONCILIATION_ALERT_ITEM_COUNT: 'reconciliation.alert_item_count',
  RECONCILIATION_ALERT_VALUE_XAF: 'reconciliation.alert_value_xaf',
  RECONCILIATION_ESCALATION_HOURS: 'reconciliation.escalation_hours',

  // --- §4.5 / FR-SUP-006 / OI-08: support SLA ---
  SUPPORT_FIRST_RESPONSE_HOURS: 'support.first_response_hours',
  SUPPORT_RESOLUTION_HOURS: 'support.resolution_hours',
  /** FR-NOT-007 / R7: the WhatsApp customer-service window. */
  WHATSAPP_SERVICE_WINDOW_HOURS: 'support.whatsapp_service_window_hours',

  // --- §4.1: alert thresholds on the overview ---
  TEACHER_RATING_ALERT_BELOW: 'alerts.teacher_rating_below',
  TEACHER_RELIABILITY_ALERT_BELOW: 'alerts.teacher_reliability_below',

  // --- §3 / COM-003: badge reconciliation poll when the socket has dropped ---
  BADGE_POLL_SECONDS: 'admin.badge_poll_seconds',

  // --- §2: live participation ---
  /**
   * FR-LIV-005/008: how many learners may publish alongside the teacher.
   *
   * A group class of 25 all publishing would collapse the NFR-BAN-001 budget
   * long before it collapsed the media server, so the cap is a product rule,
   * not a performance tuning knob.
   */
  MAX_ACTIVE_PUBLISHERS: 'live.max_active_publishers',
  /** Requests per learner per session, so a raised hand cannot become spam. */
  PUBLISH_REQUESTS_PER_SESSION: 'live.publish_requests_per_session',

  // --- §4.3: exam proctoring ---
  /**
   * Q1 — PROVISIONAL. Both of these must be calibrated against real recordings
   * from target households before proctoring is enabled for anyone.
   *
   * The environment is the reason. A microphone in Douala hears siblings,
   * generators, traffic, rain on a metal roof and calls to prayer. A detector
   * tuned to "any single noise" fires on every honest learner in the country,
   * and with termination now wired to the third flag, a bad threshold does not
   * merely annoy a learner — it ends their exam.
   */
  EXAM_NOISE_THRESHOLD_DB: 'exam.noise.threshold_db',
  EXAM_NOISE_SUSTAINED_MS: 'exam.noise.sustained_ms',
  /** Flags before the system stops the exam. Three, per the product owner. */
  EXAM_NOISE_FLAG_LIMIT: 'exam.noise.flag_limit',
  /**
   * How long a required stream may be off before the attempt is stopped.
   *
   * Not zero. A camera that drops for two seconds on a 3G handover has not been
   * covered up, and ending an exam over it would be indistinguishable, to the
   * learner, from the platform breaking.
   */
  EXAM_STREAM_GRACE_SECONDS: 'exam.stream_off_grace_seconds',
  /** FR-ASM-006: the autosave floor. */
  EXAM_AUTOSAVE_SECONDS: 'exam.autosave_seconds',
  /** Q4: proctoring is off for primary learners on the recommendation in §7. */
  EXAM_PROCTOR_PRIMARY: 'exam.proctor_primary',
  /** Q3 — PROVISIONAL, pending the same decision as OI-09. */
  PROCTOR_EVIDENCE_RETENTION_DAYS: 'exam.proctor_evidence_retention_days',

  // --- §5.3: message attachments ---
  VOICE_NOTE_MAX_SECONDS: 'messaging.voice_note_max_seconds',
  MESSAGE_ATTACHMENT_MAX_BYTES: 'messaging.attachment_max_bytes',

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

  // §5.1 / Q2: three equal parts a month apart. The weights are relative, so
  // changing them to e.g. [2, 1, 1] front-loads the schedule without any code
  // change; the remainder always lands on the first instalment.
  [CONFIG_KEYS.INSTALMENT_COUNT]: 3,
  [CONFIG_KEYS.INSTALMENT_INTERVAL_DAYS]: 30,
  [CONFIG_KEYS.INSTALMENT_WEIGHTS]: [1, 1, 1],
  // Q4: FR-PAY-007's 3 days, applied independently at each instalment.
  [CONFIG_KEYS.INSTALMENT_GRACE_DAYS]: 3,
  [CONFIG_KEYS.INSTALMENT_NOTICE_DAYS_BEFORE]: [7, 3, 1], // FR-PAY-019
  [CONFIG_KEYS.PAY_IN_FULL_DISCOUNT_PERCENT]: 0, // Q3 — no discount until decided

  [CONFIG_KEYS.TAX_WITHHOLDING_PERCENT]: 0, // OI-07 — unresolved, so zero until it is

  [CONFIG_KEYS.RECONCILIATION_ALERT_ITEM_COUNT]: 5, // FR-LDG-004
  [CONFIG_KEYS.RECONCILIATION_ALERT_VALUE_XAF]: 50_000, // FR-LDG-004
  [CONFIG_KEYS.RECONCILIATION_ESCALATION_HOURS]: 24, // FR-PAY-012

  [CONFIG_KEYS.SUPPORT_FIRST_RESPONSE_HOURS]: 24, // OI-08 — placeholder target
  [CONFIG_KEYS.SUPPORT_RESOLUTION_HOURS]: 72, // OI-08 — placeholder target
  [CONFIG_KEYS.WHATSAPP_SERVICE_WINDOW_HOURS]: 24, // R7 / SI-008 — set by Meta

  [CONFIG_KEYS.TEACHER_RATING_ALERT_BELOW]: 3.0, // FR-RAT-006
  [CONFIG_KEYS.TEACHER_RELIABILITY_ALERT_BELOW]: 80, // FR-RAT-006

  [CONFIG_KEYS.BADGE_POLL_SECONDS]: 60, // §3 / COM-003

  [CONFIG_KEYS.MAX_ACTIVE_PUBLISHERS]: 4, // §2 — plus the teacher
  [CONFIG_KEYS.PUBLISH_REQUESTS_PER_SESSION]: 5, // §2 — anti-spam

  // Q1 — provisional, uncalibrated. See the note on the keys above.
  [CONFIG_KEYS.EXAM_NOISE_THRESHOLD_DB]: 65,
  [CONFIG_KEYS.EXAM_NOISE_SUSTAINED_MS]: 4000,
  [CONFIG_KEYS.EXAM_NOISE_FLAG_LIMIT]: 3,
  [CONFIG_KEYS.EXAM_STREAM_GRACE_SECONDS]: 30,
  [CONFIG_KEYS.EXAM_AUTOSAVE_SECONDS]: 15, // FR-ASM-006 — a floor, not a target
  [CONFIG_KEYS.EXAM_PROCTOR_PRIMARY]: false, // Q4
  [CONFIG_KEYS.PROCTOR_EVIDENCE_RETENTION_DAYS]: 90, // Q3 — provisional

  [CONFIG_KEYS.VOICE_NOTE_MAX_SECONDS]: 180, // §5.3
  [CONFIG_KEYS.MESSAGE_ATTACHMENT_MAX_BYTES]: 10 * 1024 * 1024, // FR-FIL-004

  [CONFIG_KEYS.RECORDING_RETENTION_DAYS]: 90, // §5.5 — subject to OI-09
};
