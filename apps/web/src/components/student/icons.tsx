/**
 * The five navigation icons (§4).
 *
 * Drawn to the same spec as `components/icons.tsx` — 24-unit grid, 1.75 stroke,
 * round caps and joins, no fills — and inline for the same reason: NFR-PER-001
 * gives the whole first load 200 KB of JavaScript, and an icon font would spend
 * a request and a render-blocking wait on five glyphs.
 *
 * UI-005 asks for an icon *and* a label on every destination, so all of these
 * are decorative: the accessible name always comes from the text beside them.
 */

type IconProps = { className?: string };

const base = (className = 'h-6 w-6') => ({
  viewBox: '0 0 24 24',
  className,
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.75,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  'aria-hidden': true,
});

/** Home. */
export function HomeIcon({ className }: IconProps) {
  return (
    <svg {...base(className)}>
      <path d="M4 10.5 12 4l8 6.5" />
      <path d="M6 9.5V20h12V9.5" />
      <path d="M10 20v-5h4v5" />
    </svg>
  );
}

/** Classes — a lesson on a screen. */
export function VideoIcon({ className }: IconProps) {
  return (
    <svg {...base(className)}>
      <rect x="3" y="5" width="12" height="14" rx="2" />
      <path d="m15 10 5-2.5v9L15 14" />
    </svg>
  );
}

/** Work — handwriting, because the dominant path is a photograph of it. */
export function PencilIcon({ className }: IconProps) {
  return (
    <svg {...base(className)}>
      <path d="M4 20h4L19.5 8.5a2.1 2.1 0 0 0-3-3L5 17v3Z" />
      <path d="m14.5 6.5 3 3" />
    </svg>
  );
}

/** Practice — a question paper. */
export function FileTextIcon({ className }: IconProps) {
  return (
    <svg {...base(className)}>
      <path d="M6 3h8l5 5v13H6a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Z" />
      <path d="M14 3v5h5" />
      <path d="M9 13h6" />
      <path d="M9 17h4" />
    </svg>
  );
}

/** Progress — going up, which is the whole point of the screen. */
export function ChartIcon({ className }: IconProps) {
  return (
    <svg {...base(className)}>
      <path d="M4 20h16" />
      <path d="M7 20v-5" />
      <path d="M12 20V9" />
      <path d="M17 20v-8" />
    </svg>
  );
}

/** The account menu trigger. */
export function AvatarIcon({ className }: IconProps) {
  return (
    <svg {...base(className)}>
      <circle cx="12" cy="9" r="3.5" />
      <path d="M5 20a7 7 0 0 1 14 0" />
    </svg>
  );
}

/** §6 — the frozen state. A pause, not a stop, and not a warning triangle. */
export function PauseCircleIcon({ className }: IconProps) {
  return (
    <svg {...base(className)}>
      <circle cx="12" cy="12" r="9" />
      <path d="M10 9v6" />
      <path d="M14 9v6" />
    </svg>
  );
}

/** Exams — a paper under a clock, because the clock is the thing that bites. */
export function ExamIcon({ className }: IconProps) {
  return (
    <svg {...base(className)}>
      <path d="M14 3H6a1 1 0 0 0-1 1v16a1 1 0 0 0 1 1h8" />
      <path d="M8 8h5M8 12h3" />
      <circle cx="17" cy="15" r="4.5" />
      <path d="M17 13v2.2l1.4 1" />
    </svg>
  );
}

/** Messages. */
export function MessageIcon({ className }: IconProps) {
  return (
    <svg {...base(className)}>
      <path d="M20 14.5a2 2 0 0 1-2 2H8l-4 3.5v-14a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2Z" />
      <path d="M8.5 8.5h7M8.5 12h4.5" />
    </svg>
  );
}

/** The bottom bar's overflow, where destinations past the fifth live. */
export function MoreIcon({ className }: IconProps) {
  return (
    <svg {...base(className)}>
      <circle cx="5" cy="12" r="1.4" />
      <circle cx="12" cy="12" r="1.4" />
      <circle cx="19" cy="12" r="1.4" />
    </svg>
  );
}

/** Subjects. A book, because a subject is the one thing a school still calls a book. */
export function BookIcon({ className }: IconProps) {
  return (
    <svg {...base(className)}>
      <path d="M4 4.5A1.5 1.5 0 015.5 3H18a1 1 0 011 1v14a1 1 0 01-1 1H5.5A1.5 1.5 0 004 20.5z" />
      <path d="M4 17.5A1.5 1.5 0 015.5 16H19" />
    </svg>
  );
}
