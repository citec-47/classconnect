/**
 * A small set of line icons, drawn to one spec: 24-unit grid, 1.75 stroke,
 * round caps and joins, no fills.
 *
 * Hand-drawn as inline SVG rather than pulled from an icon library — the whole
 * set is under 2 KB and needs no extra request, which the §6.1 payload budget
 * cares about far more than the convenience does.
 *
 * All are decorative: every one is paired with a text label, so they carry
 * aria-hidden and add nothing for a screen reader to announce (UI-003).
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

/** Credential checked by a person. */
export function ShieldCheck({ className }: IconProps) {
  return (
    <svg {...base(className)}>
      <path d="M12 3 5 6v5.5c0 4.2 2.9 8.1 7 9.5 4.1-1.4 7-5.3 7-9.5V6l-7-3Z" />
      <path d="m9 12 2 2 4-4" />
    </svg>
  );
}

/** A live lesson. */
export function LiveClass({ className }: IconProps) {
  return (
    <svg {...base(className)}>
      <rect x="3" y="5" width="12" height="14" rx="2" />
      <path d="m15 10 5-2.5v9L15 14" />
    </svg>
  );
}

/** Weak signal: three bars, the tallest one faded. */
export function LowBandwidth({ className }: IconProps) {
  return (
    <svg {...base(className)}>
      <path d="M4 20v-4" />
      <path d="M10 20V11" />
      <path d="M16 20v-6" opacity="0.35" />
      <path d="M22 20V5" opacity="0.35" />
    </svg>
  );
}

/** Mobile money. */
export function Wallet({ className }: IconProps) {
  return (
    <svg {...base(className)}>
      <rect x="3" y="6" width="18" height="13" rx="2" />
      <path d="M3 10h18" />
      <circle cx="17" cy="14.5" r="1.25" />
    </svg>
  );
}

/** Subjects and levels. */
export function BookStack({ className }: IconProps) {
  return (
    <svg {...base(className)}>
      <path d="M4 5.5A1.5 1.5 0 0 1 5.5 4H12v13H5.5A1.5 1.5 0 0 0 4 18.5v-13Z" />
      <path d="M20 5.5A1.5 1.5 0 0 0 18.5 4H12v13h6.5a1.5 1.5 0 0 1 1.5 1.5v-13Z" />
      <path d="M12 17v3" />
    </svg>
  );
}

/** A parent watching over a child's progress. */
export function ParentView({ className }: IconProps) {
  return (
    <svg {...base(className)}>
      <circle cx="9" cy="8" r="3.25" />
      <path d="M3.5 20a5.5 5.5 0 0 1 11 0" />
      <path d="M16 11.5a2.25 2.25 0 1 0 0-4.5" />
      <path d="M17 20a4.6 4.6 0 0 0-1.6-3.5" />
    </svg>
  );
}

/** Marked homework coming back. */
export function MarkedWork({ className }: IconProps) {
  return (
    <svg {...base(className)}>
      <path d="M6 3h8l5 5v13H6a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Z" />
      <path d="M14 3v5h5" />
      <path d="m9 14 2 2 4-4" />
    </svg>
  );
}

/** Two languages. */
export function Bilingual({ className }: IconProps) {
  return (
    <svg {...base(className)}>
      <circle cx="12" cy="12" r="9" />
      <path d="M3 12h18" />
      <path d="M12 3a14 14 0 0 1 0 18 14 14 0 0 1 0-18Z" />
    </svg>
  );
}

/** Small chevron for links. */
export function ArrowRight({ className = 'h-4 w-4' }: IconProps) {
  return (
    <svg {...base(className)}>
      <path d="M5 12h13" />
      <path d="m12.5 6 6 6-6 6" />
    </svg>
  );
}
