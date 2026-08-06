'use client';

import { useId, useRef, useState } from 'react';
import { useT } from '@/lib/i18n';
import { api, ApiError } from '@/lib/api';
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
const DOCUMENT_TYPES = [
  'national_id',
  'passport',
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

      // Step 2: straight to storage.
      await uploadWithProgress(signed.upload.url, signed.upload.fields, file, setProgress);

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
          {t('teacher.identityDocument')}
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
        {progress !== null && (
          <div className="mt-3">
            <div className="h-2 overflow-hidden rounded-full bg-ink-100">
              <div
                className="h-full bg-brand-600 transition-[width]"
                style={{ width: `${progress}%` }}
              />
            </div>
            <p className="cc-hint">{t('teacher.uploading', { percent: progress })}</p>
          </div>
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
            <span>{t(error.messageKey, error.params)}</span>
          </p>
        )}
      </div>
    </div>
  );
}

/**
 * XHR rather than fetch: the upload needs a progress event, and NFR-BAN-002
 * asks the client to show what a transfer will cost before the user commits.
 */
function uploadWithProgress(
  url: string,
  fields: Record<string, string>,
  file: File,
  onProgress: (percent: number) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const form = new FormData();
    for (const [key, value] of Object.entries(fields)) form.append(key, value);
    form.append('file', file);

    const request = new XMLHttpRequest();
    request.open('POST', url);

    request.upload.addEventListener('progress', (event) => {
      if (event.lengthComputable) {
        onProgress(Math.round((event.loaded / event.total) * 100));
      }
    });

    request.addEventListener('load', () => {
      if (request.status >= 200 && request.status < 300) resolve();
      else reject(new Error(`Upload failed with ${request.status}`));
    });
    request.addEventListener('error', () => reject(new Error('Upload failed')));
    request.addEventListener('abort', () => reject(new Error('Upload cancelled')));

    request.send(form);
  });
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
