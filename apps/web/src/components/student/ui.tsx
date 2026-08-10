'use client';

import type { ReactNode } from 'react';
import { useI18n } from '@/lib/i18n';

/**
 * The three shapes every learner screen needs: a card, an empty state and a
 * failure.
 *
 * UI-008 asks for a *designed* empty state on every screen that can be empty,
 * and NFR-BAN-006 for a plain-language message and a retry on every failure.
 * Both are easy to promise and easy to forget on the fifth screen, so neither is
 * left to each page to remember.
 */

export function Card({
  title,
  action,
  children,
}: {
  title?: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="rounded-xl border border-ink-300 bg-white p-4">
      {(title || action) && (
        <div className="mb-3 flex items-start justify-between gap-3">
          {title && <h2 className="text-base font-semibold text-ink-900">{title}</h2>}
          {action}
        </div>
      )}
      {children}
    </section>
  );
}

/**
 * UI-008: an empty screen says what will appear here and what to do next.
 *
 * "No data" is not an empty state — a learner who has just been approved and has
 * no classes yet needs to know that someone else books them, not that a list is
 * of length zero.
 */
export function EmptyState({
  title,
  body,
  action,
}: {
  title: string;
  body: string;
  action?: ReactNode;
}) {
  return (
    <div className="rounded-xl border border-dashed border-ink-300 px-4 py-8 text-center">
      <p className="text-base font-semibold text-ink-900">{title}</p>
      <p className="mx-auto mt-1.5 max-w-prose text-sm text-ink-600">{body}</p>
      {action && <div className="mt-4 flex justify-center">{action}</div>}
    </div>
  );
}

/**
 * NFR-BAN-006 / NFR-USA-004: what went wrong, and a way on.
 *
 * Deliberately does not show a status code or a correlation id. This surface's
 * user may be six; the reference for that detail is the support ticket, not the
 * screen.
 */
export function ErrorState({ onRetry }: { onRetry?: () => void }) {
  const { t } = useI18n();

  return (
    <div role="alert" className="rounded-xl border border-danger-600 bg-danger-50 p-4">
      <p className="text-base font-semibold text-danger-600">{t('student.error.loadTitle')}</p>
      <p className="mt-1.5 text-sm text-ink-900">{t('student.error.loadBody')}</p>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className={[
            'mt-3 inline-flex min-h-touch items-center rounded-lg bg-brand-600 px-4',
            'text-sm font-semibold text-white hover:bg-brand-700',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600',
            'focus-visible:ring-offset-2 focus-visible:ring-offset-white',
          ].join(' ')}
        >
          {t('student.error.retry')}
        </button>
      )}
    </div>
  );
}

/**
 * FR-SAF-005: reachable from every session, message thread and teacher profile.
 *
 * Kept as its own component so "is it on this screen?" is answerable by grep
 * rather than by reading five page files.
 */
export function ReportConcern({ className = '' }: { className?: string }) {
  const { t } = useI18n();

  return (
    <a
      href="#report-a-concern"
      className={[
        'inline-flex min-h-touch items-center gap-2 rounded-lg px-3 text-sm font-medium',
        'text-ink-600 underline hover:text-ink-900',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600',
        'focus-visible:ring-offset-1 focus-visible:ring-offset-white',
        className,
      ].join(' ')}
    >
      {t('student.report.concern')}
    </a>
  );
}

/**
 * A small status word.
 *
 * UI-003: the tone is a colour *and* the word itself, so "Late" is legible to
 * someone who cannot distinguish the red from the grey.
 */
export function Pill({
  children,
  tone = 'neutral',
}: {
  children: ReactNode;
  tone?: 'neutral' | 'brand' | 'danger' | 'success';
}) {
  const tones = {
    neutral: 'bg-ink-100 text-ink-900',
    brand: 'bg-brand-50 text-brand-700',
    danger: 'bg-danger-50 text-danger-600',
    success: 'bg-success-50 text-success-600',
  } as const;

  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ${tones[tone]}`}
    >
      {children}
    </span>
  );
}

/**
 * A horizontal proportion.
 *
 * UI-003: never the bar alone — the figure is always beside it, because a bar is
 * unreadable to a screen reader and imprecise to everyone else.
 */
export function Meter({ label, percentage }: { label: string; percentage: number }) {
  const clamped = Math.max(0, Math.min(100, Math.round(percentage)));

  return (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-sm text-ink-900">{label}</span>
        <span className="text-sm font-semibold tabular-nums text-ink-900">{clamped}%</span>
      </div>
      <div
        role="meter"
        aria-valuenow={clamped}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={label}
        className="mt-1.5 h-2 overflow-hidden rounded-full bg-ink-100"
      >
        <div className="h-full rounded-full bg-brand-600" style={{ width: `${clamped}%` }} />
      </div>
    </div>
  );
}

/** A heading above a group of rows. */
export function SectionHeading({ children, count }: { children: ReactNode; count?: number }) {
  return (
    <h2 className="flex items-baseline gap-2 text-base font-semibold text-ink-900">
      {children}
      {count !== undefined && count > 0 && (
        <span className="text-sm font-normal tabular-nums text-ink-600">{count}</span>
      )}
    </h2>
  );
}

/**
 * The three states every data-backed screen has, in one place.
 *
 * UI-008 wants a designed empty state on every screen that can be empty, and
 * NFR-BAN-006 a plain message and a retry on every failure. Five screens each
 * remembering both is five chances to forget one.
 */
export function ScreenState({
  loading,
  error,
  isEmpty,
  emptyTitle,
  emptyBody,
  emptyAction,
  onRetry,
  children,
}: {
  loading: boolean;
  error: unknown;
  isEmpty: boolean;
  emptyTitle: string;
  emptyBody: string;
  emptyAction?: ReactNode;
  onRetry: () => void;
  children: ReactNode;
}) {
  if (loading) return <SkeletonList />;
  if (error) return <ErrorState onRetry={onRetry} />;
  if (isEmpty) return <EmptyState title={emptyTitle} body={emptyBody} action={emptyAction} />;
  return <>{children}</>;
}

/**
 * Placeholder rows at the shape of the real ones.
 *
 * A spinner on a 3G connection tells a learner nothing except that they are
 * waiting. Blocks the size of the content coming say what is on its way, and
 * stop the page jumping when it lands (NFR-PER-008).
 */
export function SkeletonList({ rows = 3 }: { rows?: number }) {
  return (
    <div aria-hidden="true" className="space-y-3">
      {Array.from({ length: rows }, (_, index) => (
        <div key={index} className="rounded-xl border border-ink-300 bg-white p-3.5">
          <div className="h-4 w-2/5 rounded bg-ink-100" />
          <div className="mt-2 h-3 w-1/4 rounded bg-ink-100" />
        </div>
      ))}
    </div>
  );
}

/** A page heading, sized by the level's type scale. */
export function PageTitle({ children, large }: { children: ReactNode; large: boolean }) {
  return (
    <h1
      className={[
        'font-display font-semibold text-ink-900',
        large ? 'text-2xl' : 'text-xl',
      ].join(' ')}
    >
      {children}
    </h1>
  );
}
