'use client';

import { useState } from 'react';
import { useI18n } from '@/lib/i18n';
import { api, type ApiError } from '@/lib/api';
import { ErrorAlert } from '@/components/Alert';

/**
 * Select rows, then delete them together.
 *
 * Sits above a roster and does nothing until something is ticked, so the screen
 * is unchanged for the ordinary case of reading the list.
 *
 * ## What "delete" means here, said on screen
 *
 * DAT-006 makes deletion soft, and the database enforces it — a `users` row
 * cannot be removed while the audit trail references it. So the confirmation
 * says what actually happens: signed out, gone from every roster, unable to
 * sign in, with the audit record intact. Promising erasure and delivering a
 * status change would be the kind of lie an admin only discovers under audit.
 *
 * ## Why a reason is required
 *
 * One entry per account is written, and "deleted by an admin" with no cause is
 * not something anybody can act on a year later.
 */
export function BulkDeleteBar({
  selected,
  onClear,
  onDeleted,
}: {
  selected: readonly string[];
  onClear: () => void;
  onDeleted: (count: number) => void;
}) {
  const { t, language } = useI18n();
  const [asking, setAsking] = useState(false);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);

  if (selected.length === 0) return null;

  const remove = async () => {
    setBusy(true);
    setError(null);
    try {
      const result = await api<{ deleted: number; skipped: number }>('/admin/people/delete', {
        method: 'POST',
        body: { userIds: [...selected], reason: reason.trim() },
        language,
        timeoutMs: 120_000,
      });
      onDeleted(result.deleted);
      onClear();
      setAsking(false);
      setReason('');
    } catch (caught) {
      setError(caught as ApiError);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mb-3 rounded-xl border border-danger-600 bg-danger-50 p-3">
      <ErrorAlert error={error} />

      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-medium text-ink-900">
          {t('bulk.selectedCount', { count: selected.length })}
        </p>
        <div className="flex gap-2">
          <button type="button" onClick={onClear} className="cc-btn-secondary">
            {t('common.cancel')}
          </button>
          <button
            type="button"
            onClick={() => setAsking(true)}
            className="min-h-touch rounded-lg bg-danger-600 px-3 text-sm font-medium text-white"
          >
            {t('bulk.deleteSelected')}
          </button>
        </div>
      </div>

      {asking && (
        <div className="mt-3 border-t border-danger-600/40 pt-3">
          <p className="text-sm font-semibold text-danger-600">
            {t('bulk.confirmTitle', { count: selected.length })}
          </p>
          <p className="mt-1 text-sm text-ink-900">{t('bulk.confirmBody')}</p>

          <label className="mt-2 block text-sm text-ink-900">
            {t('bulk.reasonLabel')}
            <input
              type="text"
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              className="cc-field mt-1 w-full"
            />
          </label>

          <div className="mt-2 flex gap-2">
            <button
              type="button"
              onClick={() => void remove()}
              disabled={busy || reason.trim().length < 4}
              className="min-h-touch rounded-lg bg-danger-600 px-3 text-sm font-medium text-white disabled:opacity-50"
            >
              {busy ? t('common.saving') : t('bulk.deleteSelected')}
            </button>
            <button
              type="button"
              onClick={() => setAsking(false)}
              className="cc-btn-secondary"
            >
              {t('common.cancel')}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
