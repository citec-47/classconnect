'use client';

import { useT } from '@/lib/i18n';
import type { ApiError } from '@/lib/api';

/**
 * NFR-USA-004: errors state what went wrong, why, and what the user can do —
 * never a raw code alone. The correlation ID is shown quietly alongside, so a
 * user can quote it to support (NFR-MNT-005) without it dominating the message.
 */
export function ErrorAlert({ error }: { error: ApiError | null }) {
  const t = useT();
  if (!error) return null;

  return (
    <div className="mb-4 rounded-lg border border-danger-600 bg-danger-50 p-3" role="alert">
      <p className="flex items-start gap-2 text-sm font-medium text-danger-600">
        <span aria-hidden="true">⚠</span>
        <span>{t(error.messageKey, error.params)}</span>
      </p>
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
