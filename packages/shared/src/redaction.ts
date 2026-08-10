/**
 * FR-SAF-002 — contact-detail redaction in messages.
 *
 * All contact between a teacher and a learner stays inside the platform
 * (FR-SAF-001). This is what enforces it on the one surface where a human can
 * type freely: a message. Apparent phone numbers, email addresses and messaging
 * handles are removed *before delivery*, and repeated attempts are flagged for
 * admin review.
 *
 * ## Two things this is not
 *
 * It is not spam filtering, so it errs toward redacting. A false positive costs
 * a teacher one retyped message; a false negative moves a child's conversation
 * with an adult off-platform, where nothing is logged, nothing is reviewable and
 * no safeguarding control reaches.
 *
 * It is not a substitute for the audit trail. The original text is retained as
 * evidence — the point is that the *recipient* never sees it, not that it is
 * destroyed.
 */

export type RedactionKind = 'phone' | 'email' | 'handle';

export interface Redaction {
  kind: RedactionKind;
  /** What was matched, kept for the safeguarding record, never for delivery. */
  excerpt: string;
}

export interface RedactionResult {
  /** Safe to deliver. */
  text: string;
  redactions: Redaction[];
}

export const REDACTION_PLACEHOLDER = {
  phone: '[number removed]',
  email: '[email removed]',
  handle: '[contact removed]',
} as const;

/**
 * Cameroonian mobile numbers, written the way people actually write them.
 *
 * `+237 6XX XXX XXX`, `6XX-XXX-XXX`, `6 77 12 34 56`, and the same digits run
 * together. Separators are optional and mixed, so the pattern allows any run of
 * spaces, dots or dashes between groups rather than a fixed format.
 *
 * The first digit is not glued to the second, because people write "6 77 12 34
 * 56" as readily as "677123456" and a pattern that demanded two adjacent digits
 * missed the spaced form entirely.
 *
 * Anchoring on a leading 2 or 6 and requiring eight more digits is what keeps
 * this off ordinary text: prices, years, question numbers and dates are either
 * too short or start with the wrong digit, so "15 000 FCFA" in a message about
 * fees survives. Redacting that would make the feature useless to the people it
 * is meant to protect.
 */
const PHONE = /(?:\+?237[\s.\-]*)?[26](?:[\s.\-]*\d){7,11}/g;

/**
 * Digits spelled out, which is the obvious way around a digit matcher.
 *
 * Deliberately requires a run of six or more, so "call me at three" survives and
 * "six seven seven one two three" does not.
 */
const SPELLED_DIGITS =
  /\b(?:(?:zero|one|two|three|four|five|six|seven|eight|nine|oh|zéro|un|deux|trois|quatre|cinq|six|sept|huit|neuf)[\s,.-]*){6,}/gi;

/**
 * Addresses, including the evasions people reach for first.
 *
 * `@` is the easy half. The rest — "(at)", "[at]", " at ", and the same three
 * for the dot — is what someone writes the second time, after the first message
 * came back redacted. Handling them is the difference between a control and a
 * speed bump.
 */
const EMAIL =
  /[A-Za-z0-9._%+-]+\s*(?:@|\(at\)|\[at\]|\s+at\s+)\s*[A-Za-z0-9.-]+\s*(?:\.|\(dot\)|\[dot\]|\s+dot\s+)\s*[A-Za-z]{2,}/gi;

/**
 * Messaging handles, by platform name rather than by shape.
 *
 * "@name" alone is not enough to go on — it is also how people address each
 * other — so a handle counts when it arrives with the name of somewhere to
 * reach it. The named platforms are the ones actually used in Cameroon.
 */
const HANDLE =
  /\b(?:whatsapp|whats\s?app|telegram|signal|snapchat|snap|instagram|insta|facebook|messenger|tiktok|imo|viber|skype|discord)\b[\s:@]*[A-Za-z0-9._+-]{0,40}/gi;

/**
 * Redacts a message for delivery.
 *
 * Order matters. Emails are matched before phones, because an address can
 * contain a digit run that the phone pattern would otherwise eat first, leaving
 * a mangled fragment that no longer looks like an address to a reviewer.
 */
export function redactContactDetails(input: string): RedactionResult {
  const redactions: Redaction[] = [];

  const apply = (text: string, pattern: RegExp, kind: RedactionKind): string =>
    text.replace(pattern, (match) => {
      const trimmed = match.trim();
      if (!trimmed) return match;
      redactions.push({ kind, excerpt: trimmed });
      return REDACTION_PLACEHOLDER[kind];
    });

  let text = input;
  text = apply(text, EMAIL, 'email');
  text = apply(text, HANDLE, 'handle');
  text = apply(text, PHONE, 'phone');
  text = apply(text, SPELLED_DIGITS, 'phone');

  return { text, redactions };
}

/** Whether delivery would change the text at all. */
export function needsRedaction(input: string): boolean {
  return redactContactDetails(input).redactions.length > 0;
}

/**
 * Whether a pattern of attempts warrants admin review.
 *
 * FR-SAF-002 asks for repeated attempts to be flagged, not every one. A teacher
 * who pastes a school switchboard number once has made a mistake; a teacher who
 * keeps trying to move a child onto WhatsApp is doing something else, and the
 * difference is visible only over time.
 */
export const REPEATED_ATTEMPT_THRESHOLD = 3;

export function warrantsReview(priorAttempts: number): boolean {
  return priorAttempts + 1 >= REPEATED_ATTEMPT_THRESHOLD;
}
