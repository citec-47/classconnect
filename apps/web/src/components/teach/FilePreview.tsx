'use client';

import { useEffect, useState } from 'react';
import { useI18n } from '@/lib/i18n';

/**
 * What you picked, before it goes anywhere.
 *
 * Made from the local file with `URL.createObjectURL`, so it appears before a
 * single byte leaves the device. Previewing the *uploaded* copy would mean
 * waiting for the upload and the scan before the applicant can see what they
 * chose — backwards, since the preview exists so they can check before
 * committing. It also costs nothing on a metered connection.
 *
 * Each kind shows as itself:
 *
 *   · image → a thumbnail
 *   · video → a player with a first frame
 *   · PDF   → an inline viewer, because "is this the right page?" is the whole
 *             question with a scanned document, and a filename cannot answer it
 *   · other → a card with the name and size
 */
export function FilePreview({
  file,
  onRemove,
  state,
  errorKey,
}: {
  file: File;
  onRemove?: () => void;
  state?: 'ready' | 'uploading' | 'scanning' | 'failed';
  errorKey?: string;
}) {
  const { t } = useI18n();
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    const objectUrl = URL.createObjectURL(file);
    setUrl(objectUrl);
    // An object URL keeps its file alive for the life of the document. On a
    // 2 GB phone, a few abandoned videos is tens of megabytes held for nothing.
    return () => URL.revokeObjectURL(objectUrl);
  }, [file]);

  const isImage = file.type.startsWith('image/');
  const isVideo = file.type.startsWith('video/');
  const isPdf = file.type === 'application/pdf';

  return (
    <div className="overflow-hidden rounded-lg border border-ink-300 bg-white">
      {url && isImage && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt={file.name} className="max-h-56 w-full object-contain bg-ink-100" />
      )}

      {url && isVideo && (
        <video src={url} controls preload="metadata" playsInline className="max-h-56 w-full bg-black" />
      )}

      {url && isPdf && (
        /*
         * An actual page, not an icon.
         *
         * With a scanned certificate the only question is "is this the right
         * document, and is it readable?" — and a filename answers neither. The
         * browser's own viewer is used rather than a rendering library: no
         * dependency, and it handles multi-page files.
         */
        <object data={url} type="application/pdf" className="h-56 w-full bg-ink-100">
          <p className="p-3 text-xs text-ink-600">{t('teach.preview.noPdfViewer')}</p>
        </object>
      )}

      <div className="flex items-center gap-2 p-2.5">
        <div className="min-w-0 flex-1">
          <p className="truncate text-xs font-medium text-ink-900" title={file.name}>
            {file.name}
          </p>
          <p className="text-xs text-ink-600">
            {formatSize(file.size)}
            {state && ` · ${t(`teach.preview.${state}`)}`}
          </p>
          {state === 'failed' && errorKey && (
            <p className="mt-0.5 text-xs text-danger-600">{t(errorKey)}</p>
          )}
        </div>

        {onRemove && (
          <button
            type="button"
            onClick={onRemove}
            aria-label={t('common.delete')}
            className="shrink-0 rounded-full px-2 text-ink-600"
          >
            ×
          </button>
        )}
      </div>
    </div>
  );
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
