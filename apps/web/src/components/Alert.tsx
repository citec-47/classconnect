'use client';

import { useT } from '@/lib/i18n';
import type { ApiError } from '@/lib/api';

/**
 * NFR-USA-004: errors state what went wrong, why, and what the user can do —
 * never a raw code alone. The correlation ID is shown quietly alongside, so a
 * user can quote it to support (NFR-MNT-005) without it dominating the message.
 */
export function ErrorAlert({
  error,
  handledFields = [],
}: {
  error: ApiError | null;
  /**
   * Paths this form already flags on the input itself.
   *
   * Anything listed here is left out of the summary below, because the field
   * shows its own message next to the box the user has to fix. Repeating it in
   * a banner a few centimetres away is noise, and it trains people to ignore
   * the banner — which matters, because the banner is the only thing that can
   * report a field with no input on the page at all.
   */
  handledFields?: readonly string[];
}) {
  const t = useT();
  if (!error) return null;

  const unlisted = error.fields.filter((field) => !handledFields.includes(field.path));

  /*
   * Every rejected field is already flagged where the user is looking. The
   * inline errors *are* the message; a summary would only repeat them.
   */
  if (error.fields.length > 0 && unlisted.length === 0) return null;

  return (
    <div className="mb-4 rounded-lg border border-danger-600 bg-danger-50 p-3" role="alert">
      <p className="flex items-start gap-2 text-sm font-medium text-danger-600">
        <span aria-hidden="true">⚠</span>
        {/*
         * Fall back rather than crash.
         *
         * Not every `ApiError` carries a message key — one built from a network
         * failure has none — and `t(undefined)` throws inside the lookup, taking
         * down the whole page. An error component that can crash the screen it
         * is reporting on is worse than useless: it hides the very failure it
         * exists to explain. This is the last line of defence for every caller.
         */}
        <span>{t(error.messageKey ?? 'errors.generic', error.params)}</span>
      </p>
      {/*
       * Name the fields, do not just refer to them.
       *
       * "Please check the highlighted fields" is a dead end whenever the
       * rejected field has no input on the page to highlight — the applicant
       * reads a message about highlighting, sees nothing highlighted, and has
       * no way to find out what is wrong. That is precisely how a required
       * `nationalId` with no form control blocked every teacher application.
       *
       * Listing them here means a mismatch between what the server requires and
       * what the form asks for reports itself, instead of stranding the user.
       * Fields that *do* have an input are still highlighted inline as well; a
       * short list repeated at the top is cheaper than a silent dead end.
       */}
      {unlisted.length > 0 && (
        <ul className="mt-2 list-disc space-y-0.5 pl-11 text-sm text-danger-600">
          {unlisted.map((field) => (
            <li key={field.path}>
              <span className="font-medium">
                {t(`errors.fieldName.${field.path}`) === `errors.fieldName.${field.path}`
                  ? field.path
                  : t(`errors.fieldName.${field.path}`)}
              </span>
              {' — '}
              {t(field.messageKey)}
            </li>
          ))}
        </ul>
      )}
      {error.correlationId && (
        <p className="mt-1 pl-6 text-xs text-ink-600">
          <span className="font-mono">{error.correlationId}</span>
        </p>
      )}
    </div>
  );
}

export function SuccessAlert({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="mb-4 rounded-lg border border-success-600 bg-success-50 p-3 text-sm font-medium text-success-600"
      role="status"
    >
      {children}
    </div>
  );
}

/**
 * UI-008: every screen that can be empty defines an empty state that tells the
 * user what to do next.
 */
export function EmptyState({
  title,
  body,
  action,
}: {
  title: string;
  body: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="cc-card text-center">
      <h2 className="text-base font-semibold text-ink-900">{title}</h2>
      <p className="mx-auto mt-1 max-w-sm text-sm text-ink-600">{body}</p>
      {action && <div className="mt-4 flex justify-center">{action}</div>}
    </div>
  );
}
