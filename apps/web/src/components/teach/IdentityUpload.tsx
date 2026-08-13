'use client';

import { useRef, useState } from 'react';
import { useI18n } from '@/lib/i18n';
import { api, apiUpload, ApiError } from '@/lib/api';
import type { UploadedDocument } from '@/components/DocumentUpload';
import { FilePreview } from './FilePreview';

/**
 * The identity document, in a place of its own.
 *
 * It was previously one option in a dropdown alongside degree certificates and
 * teaching authorisations, which had two consequences. An applicant could submit
 * without ever attaching it — it looked like one of several optional extras
 * rather than the thing that establishes who they are. And nothing stopped them
 * attaching four, leaving a reviewer to guess which one to check against the
 * video.
 *
 * So: **exactly one slot.** Uploading again replaces what is there rather than
 * adding to it, which is the behaviour a person expects from "your ID" and the
 * behaviour a reviewer needs.
 *
 * Type is chosen between national ID and passport, because Cameroon issues both
 * and a form that only accepts one turns a valid applicant away.
 */

interface Existing {
  id: string;
  type: string;
  fileName: string;
  scanStatus: string;
}

export function IdentityUpload({
  existing,
  onUploaded,
  onReplaced,
}: {
  existing: Existing | null;
  onUploaded: (document: UploadedDocument) => void;
  onReplaced: (removedId: string) => void;
}) {
  const { t, language } = useI18n();
  const [type, setType] = useState<'national_id' | 'passport'>('national_id');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  /*
   * The chosen file is held, not sent.
   *
   * An ID photographed on a phone is as often the wrong side, a thumb over the
   * number, or the previous document still in frame. Seeing it before it goes
   * costs one tap and saves a round trip through review.
   */
  const [pending, setPending] = useState<File | null>(null);

  async function upload(file: File) {
    setBusy(true);
    setError(null);
    try {
      const signed = await api<{
        documentId: string;
        upload: { url: string; fields: Record<string, string> };
      }>('/files/teacher-documents/sign', {
        method: 'POST',
        body: { type, fileName: file.name, mimeType: file.type, sizeBytes: file.size },
        language,
      });

      // Step 2: the bytes go through our API, not straight to storage. See the
      // service for why — a direct cross-origin POST fails silently here and
      // leaves the row stuck at `awaiting_upload`.
      const put = await apiUpload(
        `/files/teacher-documents/${signed.documentId}/upload`,
        file,
      );
      if (!put.ok) {
        const raw = await put.text().catch(() => '');
        // eslint-disable-next-line no-console
        console.error('[upload] refused', put.status, raw);
        let key = 'errors.file.upload_rejected';
        try {
          const parsed = JSON.parse(raw) as { messageKey?: string };
          if (parsed?.messageKey) key = parsed.messageKey;
        } catch {
          /* not JSON — status and body already logged */
        }
        throw new ApiError(put.status, key);
      }

      const confirmed = await api<UploadedDocument>(
        `/files/teacher-documents/${signed.documentId}/confirm`,
        { method: 'POST', language },
      );

      // Replacing, not accumulating: the old one goes when the new one lands.
      if (existing) onReplaced(existing.id);
      onUploaded(confirmed);
      setPending(null);
      if (inputRef.current) inputRef.current.value = '';
    } catch (caught) {
      setError(caught as ApiError);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-xl border border-ink-300 p-3">
      <p className="text-sm font-medium text-ink-900">{t('teach.identityUpload')}</p>
      <p className="mt-0.5 text-xs text-ink-600">{t('teach.identityUploadHint')}</p>

      {existing ? (
        <div className="mt-3 flex items-center gap-3 rounded-lg bg-ink-100 p-2.5">
          <span
            aria-hidden="true"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-success-600 text-sm text-white"
          >
            ✓
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm text-ink-900">{existing.fileName}</p>
            <p className="text-xs text-ink-600">
              {t(`teacher.documentType.${existing.type}`)} · {t('teach.identityUploaded')}
            </p>
          </div>
          <button
            type="button"
            disabled={busy}
            onClick={() => inputRef.current?.click()}
            className="shrink-0 text-xs text-brand-600 underline disabled:opacity-50"
          >
            {t('teach.identityReplace')}
          </button>
        </div>
      ) : (
        <div className="mt-3 space-y-2">
          <div className="flex gap-2">
            {(['national_id', 'passport'] as const).map((option) => (
              <label
                key={option}
                className="flex min-h-touch flex-1 cursor-pointer items-center gap-2 rounded-lg border border-ink-300 px-3 text-sm"
              >
                <input
                  type="radio"
                  name="identity-type"
                  checked={type === option}
                  onChange={() => setType(option)}
                />
                {t(`teacher.documentType.${option}`)}
              </label>
            ))}
          </div>

          <button
            type="button"
            disabled={busy}
            onClick={() => inputRef.current?.click()}
            className="min-h-touch w-full rounded-lg border border-dashed border-ink-300 px-3 text-sm text-ink-700 disabled:opacity-50"
          >
            {busy ? t('common.saving') : t('teacher.chooseFile')}
          </button>
        </div>
      )}

      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/heic,application/pdf"
        className="sr-only"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) setPending(file);
        }}
      />

      {/*
       * Not every failure carries a message key — a network error thrown by
       * `fetch` has none, and passing `undefined` to `t()` crashed the page
       * inside the lookup. The generic message is the floor, not the norm.
       */}
      {pending && (
        <div className="mt-3 space-y-2">
          <FilePreview
            file={pending}
            state={busy ? 'uploading' : undefined}
            onRemove={busy ? undefined : () => setPending(null)}
          />
          <div className="flex gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={() => void upload(pending)}
              className="min-h-touch flex-1 rounded-lg bg-brand-600 px-3 text-sm font-medium text-white disabled:opacity-50"
            >
              {busy ? t('common.saving') : t('teach.preview.confirm')}
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                setPending(null);
                inputRef.current?.click();
              }}
              className="min-h-touch rounded-lg border border-ink-300 px-3 text-sm disabled:opacity-50"
            >
              {t('teach.preview.chooseAnother')}
            </button>
          </div>
        </div>
      )}

      {error && (
        <p className="mt-2 text-xs text-danger-600">
          {t(error.messageKey ?? 'errors.generic')}
        </p>
      )}
    </div>
  );
}
