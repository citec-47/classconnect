/**
 * Enum-to-message-key maps shared across the admin screens.
 *
 * NFR-LOC-002: an enum value from the API is never rendered raw — it is looked
 * up here and translated. Keeping the maps in one module means a new payment
 * method appears correctly on every screen at once rather than on whichever one
 * was edited most recently.
 *
 * These deliberately do not live in a `page.tsx`: a Next.js App Router page may
 * export only `default` and the framework's route config, so a shared constant
 * exported from one would fail the build.
 */

export const PAYMENT_METHOD_KEY: Record<string, string> = {
  mtn_momo: 'payments.methodMtnMomo',
  orange_money: 'payments.methodOrangeMoney',
  visa: 'payments.methodVisa',
  mastercard: 'payments.methodMastercard',
};

export const TICKET_CHANNEL_KEY: Record<string, string> = {
  in_app: 'support.channelInApp',
  whatsapp: 'support.channelWhatsapp',
  email: 'support.channelEmail',
};

export const TICKET_CATEGORY_KEY: Record<string, string> = {
  general: 'support.categoryGeneral',
  billing: 'support.categoryBilling',
  technical: 'support.categoryTechnical',
  safeguarding: 'support.categorySafeguarding',
  payment_dispute: 'support.categoryPaymentDispute',
};

export const AGENT_PRESENCE_KEY: Record<string, string> = {
  online: 'support.presenceOnline',
  away: 'support.presenceAway',
  offline: 'support.presenceOffline',
};

export const SAFEGUARDING_SOURCE_KEY: Record<string, string> = {
  session: 'safeguarding.sourceSession',
  message_thread: 'safeguarding.sourceMessageThread',
  teacher_profile: 'safeguarding.sourceTeacherProfile',
  redaction_flag: 'safeguarding.sourceRedactionFlag',
  other: 'safeguarding.sourceOther',
};

export const SAFEGUARDING_STATE_KEY: Record<string, string> = {
  open: 'safeguarding.stateOpen',
  in_review: 'safeguarding.stateInReview',
  actioned: 'safeguarding.stateActioned',
  closed: 'safeguarding.stateClosed',
};
