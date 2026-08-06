/**
 * GSM-7 encoding.
 *
 * SI-007: "Send transactional SMS to Cameroonian MSISDNs; receive delivery
 * receipts; support both English and French bodies within GSM-7 where possible."
 *
 * The "where possible" matters commercially. A message that fits GSM-7 carries
 * 160 characters per segment; one character outside the alphabet forces the
 * whole message to UCS-2, which drops the segment to 70 characters and can turn
 * a one-segment message into three. Every extra segment is billed.
 *
 * Our French copy is the usual culprit: it is typeset with ’ « » … and
 * superscript ordinals, none of which are in GSM-7, while the accented letters
 * that actually carry meaning (é, à, ç, è, ù) all are. So the fix is not to
 * strip accents — that would mangle the French — but to replace the typography.
 */

/** The GSM 03.38 basic character set. */
const GSM7_BASIC = new Set(
  (
    '@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !"#¤%&\'()*+,-./0123456789:;<=>?' +
    '¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà'
  ).split(''),
);

/**
 * Characters that need an escape byte. They still fit GSM-7 but cost two
 * septets each, so they count double towards the segment length.
 */
const GSM7_EXTENDED = new Set(['\f', '^', '{', '}', '\\', '[', '~', ']', '|', '€']);

/**
 * Replacements that keep a message on GSM-7.
 *
 * Two groups, and the distinction matters:
 *
 * 1. Typography. A curly apostrophe, a guillemet or an ellipsis is a
 *    presentation choice; replacing it costs the reader nothing.
 *
 * 2. Accented letters GSM 03.38 simply does not contain. This is the
 *    surprising part: the alphabet carries e-grave, e-acute, u-grave, i-grave,
 *    o-grave, a-grave, a-umlaut, o-umlaut, n-tilde and u-umlaut, but NOT the
 *    circumflex or dieresis forms, and not lowercase c-cedilla, only uppercase.
 *
 *    So "pret", "aout" and "francais" each force the whole message to UCS-2,
 *    cutting a segment from 160 characters to 70. Dropping a circumflex or a
 *    cedilla in a text message is the conventional compromise and is what a
 *    reader expects; paying triple to keep them is not. The accents GSM-7 does
 *    have are left alone, so "verifie a Buea" keeps its acute accents.
 */
const TRANSLITERATIONS: ReadonlyArray<readonly [RegExp, string]> = [
  // --- Typography ----------------------------------------------------------
  [/[‘’‛]/g, "'"],   // curly and reversed apostrophes
  [/[“”„]/g, '"'],   // curly double quotes
  [/[«»]/g, '"'],          // French guillemets
  [/…/g, '...'],                // ellipsis
  [/[–—]/g, '-'],          // en and em dashes
  [/[   ]/g, ' '],   // non-breaking and thin spaces
  [/•/g, '*'],                  // bullet
  [/[′″]/g, "'"],         // primes
  [/ᵉ/g, 'e'],                  // superscript e, as in 1re / 2e
  [/ʳ/g, 'r'],                  // superscript r
  [/œ/g, 'oe'],
  [/Œ/g, 'OE'],

  // --- Letters absent from GSM 03.38 ---------------------------------------
  [/[âãáā]/g, 'a'],           // a-circumflex, tilde, acute
  [/[êëē]/g, 'e'],                  // e-circumflex, dieresis
  [/[îïíī]/g, 'i'],           // i-circumflex, dieresis, acute
  [/[ôõóō]/g, 'o'],           // o-circumflex, tilde, acute
  [/[ûúū]/g, 'u'],                  // u-circumflex, acute
  [/[ýÿ]/g, 'y'],
  [/ç/g, 'c'],                                 // GSM-7 has uppercase cedilla only
  [/[ÂÃÁÀ]/g, 'A'],
  [/[ÈÊË]/g, 'E'],                  // uppercase E-acute stays
  [/[ÎÏÌÍ]/g, 'I'],
  [/[ÔÕÓÒ]/g, 'O'],           // O-umlaut stays
  [/[ÛÚÙ]/g, 'U'],                  // U-umlaut stays
];

/**
 * Replaces typography that GSM-7 cannot represent, leaving meaning intact.
 * Applied before encoding so a French message stays on the cheap alphabet.
 */
export function toGsm7Friendly(text: string): string {
  let out = text;
  for (const [pattern, replacement] of TRANSLITERATIONS) {
    out = out.replace(pattern, replacement);
  }
  return out;
}

export function isGsm7(text: string): boolean {
  for (const char of text) {
    if (!GSM7_BASIC.has(char) && !GSM7_EXTENDED.has(char)) return false;
  }
  return true;
}

export interface SmsEncoding {
  /** The body as it should be sent. */
  body: string;
  encoding: 'GSM-7' | 'UCS-2';
  /** Billable segments. */
  segments: number;
  /** True when transliteration moved the message onto the cheaper alphabet. */
  transliterated: boolean;
}

/**
 * Chooses the encoding for a message, transliterating first where that keeps it
 * on GSM-7.
 *
 * Segment sizes come from GSM 03.38: 160 septets alone, 153 when concatenated
 * (7 are spent on the multipart header); 70 UCS-2 characters alone, 67 when
 * concatenated.
 */
export function encodeSms(text: string): SmsEncoding {
  if (isGsm7(text)) {
    return { body: text, encoding: 'GSM-7', segments: gsm7Segments(text), transliterated: false };
  }

  const friendly = toGsm7Friendly(text);
  if (isGsm7(friendly)) {
    return {
      body: friendly,
      encoding: 'GSM-7',
      segments: gsm7Segments(friendly),
      transliterated: friendly !== text,
    };
  }

  // Genuinely needs UCS-2. Send the original: if we are paying for the wide
  // alphabet anyway, the reader may as well have the proper typography.
  const units = [...text].reduce((n, c) => n + (c.codePointAt(0)! > 0xffff ? 2 : 1), 0);
  return {
    body: text,
    encoding: 'UCS-2',
    segments: units <= 70 ? 1 : Math.ceil(units / 67),
    transliterated: false,
  };
}

/** Septet count, where an extended character costs two. */
function gsm7Septets(text: string): number {
  let septets = 0;
  for (const char of text) septets += GSM7_EXTENDED.has(char) ? 2 : 1;
  return septets;
}

function gsm7Segments(text: string): number {
  const septets = gsm7Septets(text);
  if (septets === 0) return 0;
  return septets <= 160 ? 1 : Math.ceil(septets / 153);
}
