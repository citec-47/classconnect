/**
 * The ClassConnect mark.
 *
 * The idea is the platform's one sentence: a teacher and a learner, connected.
 * Two nodes sit on the terminals of an open "C" — the letter and the link are
 * the same shape. The larger filled node is the teacher, the outlined one the
 * learner; the gap in the C is deliberate, because the connection is the point.
 *
 * Drawn on a 32-unit grid with 2px strokes so it stays legible at 20px in a
 * phone header and at favicon size. Inline SVG rather than an image file: it is
 * about 600 bytes, needs no extra request, and inherits `currentColor` — which
 * matters for the §6.1 payload budget and for the high-contrast mode in
 * NFR-USA-005.
 */
export function LogoMark({ className = 'h-8 w-8' }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 32 32"
      className={className}
      fill="none"
      role="presentation"
      aria-hidden="true"
    >
      <rect width="32" height="32" rx="8" className="fill-brand-700" />
      {/* The open C. Terminals stop short so the nodes can sit on them. */}
      <path
        d="M22 10.5A7.5 7.5 0 1 0 22 21.5"
        stroke="white"
        strokeWidth="2.5"
        strokeLinecap="round"
      />
      {/* Teacher: filled. */}
      <circle cx="22" cy="10.5" r="3" fill="white" />
      {/* Learner: outlined, and slightly smaller. */}
      <circle cx="22" cy="21.5" r="2.5" stroke="white" strokeWidth="2" />
    </svg>
  );
}

/** Mark plus wordmark. `size` controls the whole lock-up. */
export function Logo({
  size = 'md',
  className = '',
}: {
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}) {
  const mark = size === 'lg' ? 'h-10 w-10' : size === 'sm' ? 'h-6 w-6' : 'h-8 w-8';
  const text = size === 'lg' ? 'text-2xl' : size === 'sm' ? 'text-base' : 'text-lg';

  return (
    <span className={`inline-flex items-center gap-2 ${className}`}>
      <LogoMark className={mark} />
      {/* "Class" in regular, "Connect" in semibold: the join is the brand. */}
      <span className={`${text} tracking-tight text-brand-900`}>
        <span className="font-normal">Class</span>
        <span className="font-semibold">Connect</span>
      </span>
    </span>
  );
}
