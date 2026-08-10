/**
 * A stable colour per subject.
 *
 * Chemistry is the same colour on the Subjects tab, in the timetable, on a
 * lesson card and in the attendance breakdown — which is what makes colour
 * useful rather than pretty. A learner with nine subjects finds one by colour
 * faster than by reading nine names.
 *
 * Derived from the subject id rather than assigned, so a new subject gets a
 * colour without anyone maintaining a table, and the same subject keeps its
 * colour across devices and sessions.
 *
 * ## Why colour is never the only signal
 *
 * UI-003. Every place these are used also carries the subject's name, so a
 * learner who cannot distinguish the hues loses nothing — the colour is a
 * shortcut for people who can use it, not a channel anything depends on.
 *
 * The class strings are written out in full rather than composed, because
 * Tailwind scans source text for class names: a template-built class would be
 * absent from the stylesheet and silently render unstyled.
 */

export interface SubjectAccent {
  /** Tinted background, for a chip or a card edge. */
  bg: string;
  /** Text on that background. Every pairing clears 4.5:1. */
  text: string;
  /** A solid left border, for list rows. */
  border: string;
}

const ACCENTS: readonly SubjectAccent[] = [
  { bg: 'bg-accent-teal50', text: 'text-accent-teal700', border: 'border-l-accent-teal700' },
  { bg: 'bg-accent-plum50', text: 'text-accent-plum700', border: 'border-l-accent-plum700' },
  { bg: 'bg-accent-amber50', text: 'text-accent-amber700', border: 'border-l-accent-amber700' },
  { bg: 'bg-accent-indigo50', text: 'text-accent-indigo700', border: 'border-l-accent-indigo700' },
  { bg: 'bg-accent-moss50', text: 'text-accent-moss700', border: 'border-l-accent-moss700' },
  { bg: 'bg-accent-rose50', text: 'text-accent-rose700', border: 'border-l-accent-rose700' },
];

/**
 * A small, stable hash.
 *
 * Not for security — only to spread ids evenly across six buckets, and to give
 * the same id the same bucket every time. `id.length % 6` would put every uuid
 * in the same place, which is the bug this exists to avoid.
 */
function bucket(id: string): number {
  let hash = 0;
  for (let index = 0; index < id.length; index += 1) {
    hash = (hash * 31 + id.charCodeAt(index)) | 0;
  }
  return Math.abs(hash) % ACCENTS.length;
}

export function subjectAccent(subjectId: string): SubjectAccent {
  return ACCENTS[bucket(subjectId)]!;
}

/**
 * The four education levels an operator thinks in.
 *
 * Fixed rather than hashed: these are a known, ordered set, and an admin
 * scanning a payments table benefits from Primary always being the same colour.
 */
export const LEVEL_ACCENT: Record<'primary' | 'secondary' | 'lower' | 'upper', SubjectAccent> = {
  primary: ACCENTS[4]!,
  secondary: ACCENTS[0]!,
  lower: ACCENTS[3]!,
  upper: ACCENTS[1]!,
};
