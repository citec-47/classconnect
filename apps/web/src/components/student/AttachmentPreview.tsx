'use client';

import { useState } from 'react';
import type { PendingAttachmentDto } from '@classconnect/shared';
import { useI18n } from '@/lib/i18n';
import { fileSize } from '@/lib/student-format';

/**
 * What you are about to send, before you send it.
 *
 * Previewed from the **local file**, not the uploaded copy. Waiting for the
 * upload and the scan before showing the sender what they picked is backwards:
 * the preview exists so they can check *before* committing, and on a metered
 * connection a local preview costs nothing.
 *
 * Every kind is shown as itself — a photo as a photo, a video that plays, a
 * voice note you can listen back to, a document as a card you can open. The
 * previous version showed a filename and a size for all four, which is exactly
 * as useful as no preview at all when someone has picked the wrong photo from a
 * camera roll.
 *
 * The upload state rides on top rather than replacing the preview, so a learner
 * watching "Being checked…" can still see what is being checked.
 */
export function AttachmentPreview({
  attachment,
  onRemove,
}: {
  attachment: PendingAttachmentDto;
  onRemove: () => void;
}) {
  const { t } = useI18n();
  const [expanded, setExpanded] = useState(false);

  const isImage = attachment.mimeType.startsWith('image/');
  const isVideo = attachment.mimeType.startsWith('video/');
  const isAudio = attachment.mimeType.startsWith('audio/');
  const url = attachment.previewUrl;

  const stateLabel =
    attachment.state === 'uploading'
      ? t('student.messages.uploading')
      : attachment.state === 'scanning'
        ? t('student.messages.attachmentPending')
        : attachment.state === 'ready'
          ? t('student.messages.attachmentReady')
          : t(attachment.errorKey ?? 'student.messages.attachmentBlocked');

  const stateTone =
    attachment.state === 'failed'
      ? 'bg-danger-50 text-danger-600'
      : attachment.state === 'ready'
        ? 'bg-success-50 text-success-600'
        : 'bg-ink-100 text-ink-600';

  return (
    <>
      <div className="relative overflow-hidden rounded-xl border border-ink-300 bg-white">
        <button
          type="button"
          onClick={onRemove}
          aria-label={t('common.delete')}
          className="absolute right-1 top-1 z-10 flex h-7 w-7 items-center justify-center rounded-full bg-ink-900/70 text-sm text-white"
        >
          ×
        </button>

        {isImage && url && (
          <button
            type="button"
            onClick={() => setExpanded(true)}
            aria-label={t('student.messages.openImage', { name: attachment.fileName })}
            className="block w-full"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={url}
              alt={attachment.fileName}
              className="h-28 w-full object-cover"
            />
          </button>
        )}

        {isVideo && url && (
          /*
           * `preload="metadata"` gives a first frame and a duration without
           * fetching the whole file. It is a local blob, so this costs nothing
           * on the network — but it keeps memory sane for a 25 MB clip.
           */
          <video src={url} controls preload="metadata" playsInline className="h-28 w-full bg-black" />
        )}

        {isAudio && url && (
          <div className="p-2">
            {/* Listen back before sending — the point of a voice note preview. */}
            <audio src={url} controls preload="metadata" className="w-full" />
          </div>
        )}

        {!isImage && !isVideo && !isAudio && (
          <div className="flex h-28 flex-col items-center justify-center gap-1 bg-ink-100 px-2">
            <DocIcon />
            {/* A PDF can be opened in the device viewer before it is sent. */}
            {url && (
              <a
                href={url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-brand-600 underline"
              >
                {t('student.messages.previewOpen')}
              </a>
            )}
          </div>
        )}

        <div className="space-y-0.5 p-2">
          <p className="truncate text-xs font-medium text-ink-900" title={attachment.fileName}>
            {attachment.fileName}
          </p>
          <p className="text-xs text-ink-600">{fileSize(attachment.sizeBytes)}</p>
          {/* Announced, not conveyed by colour alone (UI-003). */}
          <p className={`inline-block rounded px-1.5 py-0.5 text-xs ${stateTone}`}>
            {stateLabel}
          </p>
        </div>
      </div>

      {expanded && url && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={t('student.messages.preview')}
          onClick={() => setExpanded(false)}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-4"
        >
          <button
            type="button"
            onClick={() => setExpanded(false)}
            aria-label={t('common.close')}
            className="absolute right-3 top-3 min-h-touch min-w-touch rounded-full bg-white/15 text-lg text-white"
          >
            ×
          </button>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={url}
            alt={attachment.fileName}
            className="max-h-[85vh] max-w-[92vw] object-contain"
            onClick={(event) => event.stopPropagation()}
          />
        </div>
      )}
    </>
  );
}

function DocIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      className="h-8 w-8 text-ink-600"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M14 3H7a1 1 0 0 0-1 1v16a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1V7z" />
      <path d="M14 3v4h4" />
    </svg>
  );
}
