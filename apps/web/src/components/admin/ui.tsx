'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { formatXaf, formatLocal } from '@classconnect/shared';
import { useI18n } from '@/lib/i18n';
import { apiBase, tokenStore } from '@/lib/api';

/**
 * §7 — the admin interface direction, as components.
 *
 *   "Density over decoration."      — tight rows, real data in every cell.
 *   "One accent colour."            — brand for the primary action only.
 *   "State is a first-class visual."— labelled chips that do not rely on colour.
 *   "Numbers are typeset properly." — tabular figures, right-aligned money.
 *   "Every destructive dialog names the consequence."
 *
 * Keeping these here rather than repeating Tailwind strings on ten screens is
 * what makes those rules hold across the surface instead of on the screen that
 * was written most recently.
 */

// ---------------------------------------------------------------------------
// Page furniture
// ---------------------------------------------------------------------------

export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
      <div>
        <h1 className="text-xl font-semibold text-ink-900">{title}</h1>
        {description && <p className="mt-1 max-w-prose text-sm text-ink-600">{description}</p>}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  );
}

/**
 * A standing note that is part of the screen rather than a transient alert —
 * §4.3's "These are children under 12" banner, §4.6's restriction notice.
 */
export function Banner({
  tone = 'info',
  children,
}: {
  tone?: 'info' | 'danger';
  children: ReactNode;
}) {
  return (
    <div
      role="note"
      className={[
        'mb-4 flex items-start gap-2 rounded-lg border p-3 text-sm',
        tone === 'danger'
          ? 'border-danger-600 bg-danger-50 text-danger-600'
          : 'border-brand-600 bg-brand-50 text-brand-700',
      ].join(' ')}
    >
      <span aria-hidden="true">{tone === 'danger' ? '⬦' : 'ℹ'}</span>
      <span className="font-medium">{children}</span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tables — §7 "Operators scan queues all day."
// ---------------------------------------------------------------------------

export function Table({ children }: { children: ReactNode }) {
  return (
    // The wrapper scrolls, not the page: a wide money table must never give the
    // whole shell a horizontal scrollbar.
    <div className="overflow-x-auto rounded-lg border border-ink-300">
      <table className="w-full min-w-full border-collapse text-sm">{children}</table>
    </div>
  );
}

export function Th({
  children,
  numeric,
}: {
  children: ReactNode;
  numeric?: boolean;
}) {
  return (
    <th
      scope="col"
      className={[
        'whitespace-nowrap border-b border-ink-300 bg-ink-100 px-3 py-2',
        'text-xs font-semibold uppercase tracking-wide text-ink-600',
        numeric ? 'text-right' : 'text-left',
      ].join(' ')}
    >
      {children}
    </th>
  );
}

export function Td({
  children,
  numeric,
  className = '',
}: {
  children: ReactNode;
  numeric?: boolean;
  className?: string;
}) {
  return (
    <td
      className={[
        'border-b border-ink-300 px-3 py-2 align-top text-ink-900',
        numeric ? 'text-right tabular-nums' : '',
        className,
      ].join(' ')}
    >
      {children}
    </td>
  );
}

export function Tr({ children }: { children: ReactNode }) {
  return <tr className="hover:bg-ink-100/60">{children}</tr>;
}

// ---------------------------------------------------------------------------
// Money — UI-009
// ---------------------------------------------------------------------------

/**
 * UI-009: "15 000 FCFA — whole number, thousands separator, FCFA suffix."
 *
 * Takes the amount as a string because it crosses the wire as one: a bigint
 * franc total larger than 2^53 would lose precision as a JSON number, and
 * CON-02 forbids exactly that class of error.
 */
export function Money({ amount, className = '' }: { amount: string | bigint; className?: string }) {
  const { language } = useI18n();
  const value = typeof amount === 'bigint' ? amount : BigInt(amount || '0');
  return (
    <span className={`whitespace-nowrap tabular-nums ${className}`}>
      {formatXaf(value, language)}
    </span>
  );
}

/** §2.4: stored UTC, rendered Africa/Douala. */
export function When({
  value,
  dateOnly,
}: {
  value: string | Date | null | undefined;
  dateOnly?: boolean;
}) {
  const { language, t } = useI18n();
  if (!value) return <span className="text-ink-600">{t('common.notRecorded')}</span>;

  const instant = value instanceof Date ? value : new Date(value);
  return (
    <time dateTime={instant.toISOString()} className="whitespace-nowrap tabular-nums">
      {formatLocal(
        instant,
        language,
        dateOnly ? { dateStyle: 'medium' } : { dateStyle: 'medium', timeStyle: 'short' },
      )}
    </time>
  );
}

// ---------------------------------------------------------------------------
// State — §7 "State is a first-class visual ... does not rely on colour alone."
// ---------------------------------------------------------------------------

export type StateTone = 'neutral' | 'good' | 'warn' | 'frozen';

/**
 * Every chip carries a text label and a shape marker. Red is used only for
 * `frozen`, which together with the safeguarding badge is its entire budget on
 * this surface.
 */
export function StateChip({ tone, children }: { tone: StateTone; children: ReactNode }) {
  const styles: Record<StateTone, string> = {
    neutral: 'bg-ink-100 text-ink-900 border-ink-300',
    good: 'bg-success-50 text-success-600 border-success-600',
    warn: 'bg-warning-50 text-warning-600 border-warning-600',
    frozen: 'bg-danger-50 text-danger-600 border-danger-600',
  };
  const marks: Record<StateTone, string> = {
    neutral: '○',
    good: '●',
    warn: '◐',
    frozen: '✕',
  };

  return (
    <span
      className={`inline-flex items-center gap-1 whitespace-nowrap rounded border px-1.5 py-0.5 text-xs font-medium ${styles[tone]}`}
    >
      <span aria-hidden="true">{marks[tone]}</span>
      {children}
    </span>
  );
}

/** A pass/fail marker for a checklist row, legible without colour. */
export function CheckMark({ passed }: { passed: boolean }) {
  const { t } = useI18n();
  return (
    <span
      className={`inline-flex items-center gap-1 text-xs font-medium ${
        passed ? 'text-success-600' : 'text-danger-600'
      }`}
    >
      <span aria-hidden="true">{passed ? '✓' : '✕'}</span>
      {passed ? t('approvals.checkPassed') : t('approvals.checkFailed')}
    </span>
  );
}

// ---------------------------------------------------------------------------
// UI-007 — "Every destructive dialog names the consequence."
// ---------------------------------------------------------------------------

/**
 * A confirmation that states, in plain language, what will happen.
 *
 * `consequences` is a list of sentences, not an "Are you sure?". The caller
 * builds them from figures the API returned, so the dialog and the action
 * cannot disagree about how many sessions are about to be cancelled.
 */
export function ConfirmDialog({
  open,
  title,
  consequences,
  confirmLabel,
  destructive,
  busy,
  confirmDisabled,
  onConfirm,
  onCancel,
  children,
}: {
  open: boolean;
  title: string;
  consequences: ReactNode[];
  confirmLabel: string;
  destructive?: boolean;
  busy?: boolean;
  /**
   * Held down while a mandatory reason is empty. The API refuses a reasonless
   * discretionary action regardless (FR-AI-005); this only saves the operator a
   * round trip to be told so.
   */
  confirmDisabled?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  children?: ReactNode;
}) {
  const { t } = useI18n();
  const panelRef = useRef<HTMLDivElement>(null);

  // WCAG 2.4.3 / UI-003: focus moves into the dialog when it opens, and Escape
  // closes it. Without this a keyboard user is stranded behind the overlay.
  useEffect(() => {
    if (!open) return;
    panelRef.current?.focus();

    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onCancel();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onCancel]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink-900/40 p-4"
      role="presentation"
      onClick={(event) => {
        if (event.target === event.currentTarget) onCancel();
      }}
    >
      <div
        ref={panelRef}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-title"
        tabIndex={-1}
        className="w-full max-w-lg rounded-xl border border-ink-300 bg-white p-5 shadow-lg"
      >
        <h2 id="confirm-title" className="text-base font-semibold text-ink-900">
          {title}
        </h2>

        <ul className="mt-3 flex flex-col gap-1.5 text-sm text-ink-900">
          {consequences.map((line, index) => (
            <li key={index} className="flex items-start gap-2">
              <span aria-hidden="true" className="text-ink-600">
                •
              </span>
              <span>{line}</span>
            </li>
          ))}
        </ul>

        {children && <div className="mt-4">{children}</div>}

        <div className="mt-5 flex justify-end gap-2">
          <button type="button" className="cc-btn-secondary" onClick={onCancel} disabled={busy}>
            {t('common.cancel')}
          </button>
          <button
            type="button"
            className={destructive ? 'cc-btn-danger' : 'cc-btn-primary'}
            onClick={onConfirm}
            disabled={busy || confirmDisabled}
          >
            {busy ? t('common.saving') : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * A reason field.
 *
 * Every discretionary action on this surface needs one (FR-AI-005), so it is a
 * component rather than a pattern people remember to repeat. The submit button
 * stays disabled until it has content, which is the client half of a rule the
 * API enforces regardless.
 */
export function ReasonField({
  label,
  value,
  onChange,
  hint,
  rows = 3,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  hint?: string;
  rows?: number;
}) {
  return (
    <div>
      <label className="cc-label" htmlFor="reason-field">
        {label}
      </label>
      <textarea
        id="reason-field"
        className="cc-field"
        rows={rows}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        required
        aria-required="true"
      />
      {hint && <p className="cc-hint">{hint}</p>}
    </div>
  );
}

/**
 * FR-RPT-005 — "every table exportable to CSV".
 *
 * A plain `<a href>` cannot do this: the export endpoint is authorised like
 * every other (FR-RBA-002) and a browser navigation carries no Authorization
 * header, so the link would download the sign-in redirect instead of the data.
 * The file is fetched with the session's token and handed to the browser as a
 * blob.
 */
export function ExportButton({
  dataset,
  query = {},
}: {
  dataset: string;
  query?: Record<string, string | undefined>;
}) {
  const { language, t } = useI18n();
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  const download = async () => {
    setBusy(true);
    setFailed(false);
    try {
      const search = new URLSearchParams(
        Object.entries(query).filter((entry): entry is [string, string] => Boolean(entry[1])),
      ).toString();

      const response = await fetch(
        `${apiBase()}/admin/reports/export/${dataset}${search ? `?${search}` : ''}`,
        {
          headers: {
            'accept-language': language,
            ...(tokenStore.access ? { authorization: `Bearer ${tokenStore.access}` } : {}),
          },
        },
      );
      if (!response.ok) throw new Error(String(response.status));

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `classconnect-${dataset}-${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      // Revoking immediately can cancel the download in some browsers; a tick is
      // enough for the navigation to have taken the reference.
      setTimeout(() => URL.revokeObjectURL(url), 1_000);
    } catch {
      // NFR-BAN-006: a failed export says so rather than doing nothing visible.
      setFailed(true);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col items-end">
      <button
        type="button"
        className="cc-btn-secondary !min-h-0 !py-1.5"
        onClick={() => void download()}
        disabled={busy}
      >
        {busy ? t('common.saving') : t('reports.exportCsv')}
      </button>
      {failed && (
        <p className="mt-1 text-xs text-danger-600" role="alert">
          {t('errors.generic')}
        </p>
      )}
    </div>
  );
}

/** A compact metric, for the overview's operational and money rows. */
export function Stat({
  label,
  value,
  suffix,
  href,
}: {
  label: string;
  value: ReactNode;
  suffix?: string;
  href?: string;
}) {
  const body = (
    <>
      <dt className="text-xs text-ink-600">{label}</dt>
      <dd className="mt-0.5 text-lg font-semibold tabular-nums text-ink-900">
        {value}
        {suffix && <span className="ml-0.5 text-sm font-normal text-ink-600">{suffix}</span>}
      </dd>
    </>
  );

  return href ? (
    <a
      href={href}
      className="block rounded-lg border border-ink-300 px-3 py-2 transition-colors hover:border-brand-600 hover:bg-brand-50"
    >
      {body}
    </a>
  ) : (
    <div className="rounded-lg border border-ink-300 px-3 py-2">{body}</div>
  );
}
