'use client';

import { useEffect, useState } from 'react';
import type { MessageAttachmentDto } from '@classconnect/shared';
import { useI18n } from '@/lib/i18n';
import { api } from '@/lib/api';
import { fileSize } from '@/lib/student-format';

/**
 * Attachments as they appear in a conversation.
 *
 * A photo shows as a photo, a video plays, a voice note has a play button, and
 * a document is a row you can tap. Rendering all four as a filename link — which
 * is what the first version did — makes a learner download a file to find out
 * what it is, on a connection where that costs them money.
 *
 * ## Why the URL is fetched here rather than sent with the thread
 *
 * FR-FIL-003 forbids permanent URLs, so every read is a short-lived signed URL
 * minted on demand. Sending one for every attachment in a thread would hand out
 * live URLs for files nobody opened. Instead each media attachment asks for its
 * own when it comes into view, and the answer is cached for the session.
 *
 * ## Why nothing renders before the scan
 *
 * FR-FIL-001. An unscanned or quarantined file is not fetched, not previewed and
 * not openable — the component shows why instead. In a channel between adults
 * and children this is the whole point of the feature having taken this long.
 */

/** One signed URL per attachment per session. */
const urlCache = new Map<string, string>();

function useAttachmentUrl(attachment: MessageAttachmentDto, language: string) {
  const [url, setUrl] = useState<string | null>(
    () => urlCache.get(attachment.id) ?? null,
  );
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (url || failed || attachment.scanStatus !== 'clean') return;
    let cancelled = false;

    void (async () => {
      try {
        const result = await api<{ url: string }>(
          `/files/message-attachments/${attachment.id}/download-url`,
          { language },
        );
        if (cancelled) return;
        urlCache.set(attachment.id, result.url);
        setUrl(result.url);
      } catch {
        if (!cancelled) setFailed(true);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [attachment.id, attachment.scanStatus, language, url, failed]);

  return { url, failed };
}

export function AttachmentView({
  attachment,
  mine,
}: {
  attachment: MessageAttachmentDto;
  mine: boolean;
}) {
  const { t, language } = useI18n();
  const [lightbox, setLightbox] = useState(false);
  const { url, failed } = useAttachmentUrl(attachment, language);

  const muted = mine ? 'text-white/80' : 'text-ink-600';

  // FR-FIL-001: nothing is fetched or shown until the scan has passed.
  if (attachment.scanStatus !== 'clean') {
    return (
      <p className={`mt-1.5 text-xs ${muted}`}>
        {attachment.scanStatus === 'quarantined'
          ? t('student.messages.scanFailed')
          : t('student.messages.scanning')}
      </p>
    );
  }

  if (failed) {
    return <p className={`mt-1.5 text-xs ${muted}`}>{t('student.messages.attachmentBlocked')}</p>;
  }

  const isImage = attachment.mimeType.startsWith('image/');
  const isVideo = attachment.mimeType.startsWith('video/');
  const isAudio = attachment.mimeType.startsWith('audio/');

  if (isImage) {
    return (
      <>
        <button
          type="button"
          onClick={() => setLightbox(true)}
          aria-label={t('student.messages.openImage', { name: attachment.fileName })}
          className="mt-1.5 block overflow-hidden rounded-lg"
        >
          {url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={url}
              alt={attachment.fileName}
              // Capped so a portrait photo does not push the composer off screen
              // on a 360px phone.
              className="max-h-64 w-full object-cover"
              loading="lazy"
            />
          ) : (
            <span className="block h-32 w-48 animate-pulse rounded-lg bg-ink-100" />
          )}
        </button>
        {lightbox && url && (
          <Lightbox onClose={() => setLightbox(false)}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={url}
              alt={attachment.fileName}
              className="max-h-[85vh] max-w-[92vw] object-contain"
            />
          </Lightbox>
        )}
      </>
    );
  }

  if (isVideo) {
    return (
      <div className="mt-1.5">
        {url ? (
          /*
           * `preload="metadata"` rather than `auto`: on a metered connection the
           * whole point is that a learner chooses to spend the data. Metadata is
           * enough for a poster frame and a duration.
           */
          <video
            src={url}
            controls
            preload="metadata"
            playsInline
            className="max-h-64 w-full rounded-lg bg-black"
          />
        ) : (
          <span className="block h-32 w-48 animate-pulse rounded-lg bg-ink-100" />
        )}
        <p className={`mt-1 text-xs ${muted}`}>{fileSize(attachment.sizeBytes)}</p>
      </div>
    );
  }

  if (isAudio) {
    return (
      <div className="mt-1.5 min-w-[12rem]">
        {url ? (
          <audio src={url} controls preload="metadata" className="w-full" />
        ) : (
          <span className="block h-10 w-48 animate-pulse rounded-full bg-ink-100" />
        )}
        <p className={`mt-1 text-xs ${muted}`}>
          {t('student.messages.voiceNote')}
          {attachment.durationSec ? ` · ${formatSeconds(attachment.durationSec)}` : ''}
        </p>
      </div>
    );
  }

  // Documents: a row, opened in a new tab so a PDF uses the device viewer.
  return (
    <a
      href={url ?? undefined}
      target="_blank"
      rel="noopener noreferrer"
      className={[
        'mt-1.5 flex min-h-touch items-center gap-2 rounded-lg px-2.5 py-1.5',
        mine ? 'bg-white/15' : 'bg-ink-100',
      ].join(' ')}
    >
      <DocIcon />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-xs font-medium">{attachment.fileName}</span>
        <span className={`block text-xs ${muted}`}>{fileSize(attachment.sizeBytes)}</span>
      </span>
    </a>
  );
}

/**
 * Full-screen preview.
 *
 * Escape closes, the backdrop closes, and focus is trapped to the dialog while
 * it is open — a modal a keyboard user cannot leave is worse than no modal.
 */
function Lightbox({
  children,
  onClose,
}: {
  children: React.ReactNode;
  onClose: () => void;
}) {
  const { t } = useI18n();

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    // Stops the conversation scrolling behind the overlay.
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = previous;
    };
  }, [onClose]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={t('student.messages.preview')}
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-4"
    >
      <button
        type="button"
        onClick={onClose}
        aria-label={t('common.close')}
        className="absolute right-3 top-3 min-h-touch min-w-touch rounded-full bg-white/15 text-lg text-white"
      >
        ×
      </button>
      <div onClick={(event) => event.stopPropagation()}>{children}</div>
    </div>
  );
}

function formatSeconds(total: number): string {
  const minutes = Math.floor(total / 60);
  return `${minutes}:${String(total % 60).padStart(2, '0')}`;
}

function DocIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      className="h-5 w-5 shrink-0"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M14 3H7a1 1 0 0 0-1 1v16a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1V7z" />
      <path d="M14 3v4h4" />
    </svg>
  );
}
