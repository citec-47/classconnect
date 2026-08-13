'use client';

import { useId, useRef, useState } from 'react';
import { useT } from '@/lib/i18n';
import { api, apiUpload, ApiError } from '@/lib/api';
import type { Language } from '@classconnect/shared';

/**
 * Teacher credential upload — SI-006, FR-TVR-002.
 *
 * The file goes straight from the browser to object storage using a signature
 * the API issues for exactly one asset path. It never passes through our API,
 * which keeps a 10 MB upload off the server on a §6.2 bandwidth budget.
 *
 * NFR-BAN-005 wants resumable uploads that survive an interruption. This is a
 * single POST and is *not* resumable — a dropped connection means starting
 * again. For a 10 MB credential that is tolerable; for the 25 MB homework
 * submissions of FR-HWK-003 it will not be, and that path needs chunked upload.
 */
/*
 * Qualifications only.
 *
 * `national_id` and `passport` have their own slot now (see `IdentityUpload`),
 * which holds exactly one and replaces rather than accumulates. Leaving them in
 * this list too would let an applicant attach four identity documents through
 * the back door and leave a reviewer guessing which to check against the video.
 *
 * `intro_video` is absent for the same reason: it is recorded, not filed.
 */
const DOCUMENT_TYPES = [
  'degree_certificate',
  'diploma',
  'teaching_authorisation',
  'other',
] as const;

type DocumentType = (typeof DOCUMENT_TYPES)[number];

const ACCEPTED = '.pdf,.jpg,.jpeg,.png,.heic';
const MAX_BYTES = 10 * 1024 * 1024;

interface SignResponse {
  documentId: string;
  upload: {
    url: string;
    fields: Record<string, string>;
    resourceType: string;
  };
}

export interface UploadedDocument {
  id: string;
  type: string;
  fileName: string;
  sizeBytes: number;
  scanStatus: string;
  downloadable: boolean;
}

export function DocumentUpload({
  language,
  onUploaded,
}: {
  language: Language;
  onUploaded: (document: UploadedDocument) => void;
}) {
  const t = useT();
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);

  const [type, setType] = useState<DocumentType>('degree_certificate');
  const [expiresOn, setExpiresOn] = useState('');
  const [progress, setProgress] = useState<number | null>(null);
  /** The server's own words, when the failure had no message we recognise. */
  const [rawFailure, setRawFailure] = useState<string | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [localErrorKey, setLocalErrorKey] = useState<string | null>(null);

  const upload = async (file: File) => {
    setError(null);
    setLocalErrorKey(null);

    // Refuse locally before troubling the API — NFR-USA-004 wants the user to
    // learn the problem immediately, not after a round trip on a 3G link.
    if (file.size > MAX_BYTES) {
      setLocalErrorKey('errors.file.too_large');
      return;
    }
    if (file.size === 0) {
      setLocalErrorKey('errors.file.empty');
      return;
    }

    setProgress(0);
    setRawFailure(null);
    try {
      // Step 1: the API checks policy and signs one asset path.
      const signed = await api<SignResponse>('/files/teacher-documents/sign', {
        method: 'POST',
        body: {
          type,
          fileName: file.name,
          mimeType: file.type || guessMime(file.name),
          sizeBytes: file.size,
          ...(expiresOn ? { expiresOn } : {}),
        },
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

        /*
         * Show the raw reason on screen, not only in the console.
         *
         * "Something went wrong on our side" is true and useless: it is the
         * fallback for a failure that carried no message key, so the one person
         * who could act on the detail — whoever is running the platform — never
         * sees it. A console line only helps someone who thinks to open the
         * console.
         *
         * NFR-USA-004 asks errors to say what happened and what to do. For an
         * applicant that is the translated message; for an unmapped failure the
         * honest version is the status and the server's own words.
         */
        let key: string | null = null;
        try {
          const parsed = JSON.parse(raw) as { messageKey?: string };
          if (parsed?.messageKey) key = parsed.messageKey;
        } catch {
          /* not JSON */
        }

        if (key) throw new ApiError(put.status, key);

        setRawFailure(`${put.status} ${raw.slice(0, 300) || '(no response body)'}`);
        throw new ApiError(put.status, 'errors.file.upload_rejected');
      }

      // Step 3: the API confirms against what storage actually received, and
      // scans it (FR-FIL-001).
      const confirmed = await api<UploadedDocument>(
        `/files/teacher-documents/${signed.documentId}/confirm`,
        { method: 'POST', language },
      );

      onUploaded(confirmed);
      if (inputRef.current) inputRef.current.value = '';
      setExpiresOn('');
    } catch (caught) {
      setError(caught as ApiError);
    } finally {
      setProgress(null);
    }
  };

  return (
    <div className="cc-card">
      <h3 className="font-medium text-ink-900">{t('teacher.documents')}</h3>
      <p className="cc-hint">{t('teacher.documentsHint')}</p>

      <div className="mt-3">
        <label htmlFor={`${inputId}-type`} className="cc-label">
          {t('teach.documentKind')}
        </label>
        <select
          id={`${inputId}-type`}
          className="cc-field"
          value={type}
          onChange={(event) => setType(event.target.value as DocumentType)}
        >
          {DOCUMENT_TYPES.map((value) => (
            <option key={value} value={value}>
              {t(`teacher.documentType.${value}`)}
            </option>
          ))}
        </select>
      </div>

      {/* FR-TVR-007: an expiry date drives the re-verification prompt. */}
      <div className="mt-3">
        <label htmlFor={`${inputId}-expiry`} className="cc-label">
          {t('teacher.documentExpiry')}
          <span className="ml-1 font-normal text-ink-600">({t('common.optional')})</span>
        </label>
        <input
          id={`${inputId}-expiry`}
          type="date"
          className="cc-field"
          value={expiresOn}
          onChange={(event) => setExpiresOn(event.target.value)}
        />
      </div>

      <div className="mt-3">
        <label htmlFor={inputId} className="cc-label">
          {t('teacher.chooseFile')}
        </label>
        <input
          ref={inputRef}
          id={inputId}
          type="file"
          accept={ACCEPTED}
          disabled={progress !== null}
          className="cc-field py-2"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) void upload(file);
          }}
          aria-describedby={`${inputId}-status`}
        />
      </div>

      <div id={`${inputId}-status`} aria-live="polite">
        {/*
         * Indeterminate, honestly.
         *
         * The upload goes through our API with `fetch`, which reports no
         * progress — so a percentage bar would sit at 0% for the whole transfer
         * and read as frozen. A moving stripe says "working" without claiming
         * to know how far along it is.
         *
         * A real percentage would need XHR and a second upload path; on a 10 MB
         * ceiling that is not worth the divergence.
         */}
        {progress !== null && (
          <div className="mt-3">
            <div className="h-2 overflow-hidden rounded-full bg-ink-100">
              <div className="h-full w-1/3 animate-pulse rounded-full bg-brand-600" />
            </div>
            <p className="cc-hint">{t('teach.preview.uploading')}</p>
          </div>
        )}

        {rawFailure && (
          <p className="mt-2 rounded bg-danger-50 p-2 font-mono text-xs text-danger-600">
            {rawFailure}
          </p>
        )}

        {localErrorKey && (
          <p className="cc-error" role="alert">
            <span aria-hidden="true">⚠</span>
            <span>{t(localErrorKey, { maxMb: 10 })}</span>
          </p>
        )}

        {error && (
          <p className="cc-error" role="alert">
            <span aria-hidden="true">⚠</span>
            {/*
             * Not every failure carries a message key.
             *
             * A network error thrown by `fetch` has none, and passing
             * `undefined` into `t()` crashed the whole page inside the lookup —
             * so an upload that merely failed took the application form down
             * with it, and hid its own cause. The generic message is the floor.
             */}
            <span>{t(error.messageKey ?? 'errors.generic', error.params)}</span>
          </p>
        )}
      </div>
    </div>
  );
}

function guessMime(fileName: string): string {
  const extension = fileName.slice(fileName.lastIndexOf('.') + 1).toLowerCase();
  switch (extension) {
    case 'pdf':
      return 'application/pdf';
    case 'jpg':
    case 'jpeg':
      return 'image/jpeg';
    case 'png':
      return 'image/png';
    case 'heic':
    case 'heif':
      return 'image/heic';
    default:
      return 'application/octet-stream';
  }
}
