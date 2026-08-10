'use client';

import { useEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react';
import type { MessageComposeLimitsDto, PendingAttachmentDto } from '@classconnect/shared';
import { useI18n } from '@/lib/i18n';
import { api, apiBase, tokenStore, ApiError } from '@/lib/api';
import { fileSize } from '@/lib/student-format';
import { VoiceRecorder } from './VoiceRecorder';
import { AttachmentPreview } from './AttachmentPreview';

/**
 * Attaching a file, an image, a video or a voice note.
 *
 * Three steps, and the middle one goes straight to storage rather than through
 * the API: a 20 MB video over 3G would tie up an API worker for minutes
 * otherwise (SI-006).
 *
 *   1. `sign`    — policy check, then a signature scoped to one asset path
 *   2. upload    — direct to storage, with progress
 *   3. `confirm` — verify what storage received, then **scan** (FR-FIL-001)
 *
 * A file is not attachable until step three returns clean. That is why `state`
 * has a `scanning` value and why the send button waits for it: in a channel
 * between adults and children, "probably fine" is not a state we ship.
 */
export function AttachmentPicker({
  threadId,
  limits,
  attachments,
  onChange,
}: {
  threadId: string;
  limits?: MessageComposeLimitsDto;
  attachments: PendingAttachmentDto[];
  /*
   * A state updater, not a value.
   *
   * Taking a plain array meant each upload built its next list from the
   * `attachments` prop captured at render. Picking two files ran two uploads
   * against the same stale snapshot, and the second one's list silently dropped
   * the first. An updater composes instead of overwriting.
   */
  onChange: Dispatch<SetStateAction<PendingAttachmentDto[]>>;
}) {
  const { t, language } = useI18n();
  const mediaRef = useRef<HTMLInputElement>(null);
  const docRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  const maxFiles = limits?.maxAttachments ?? 5;
  const maxBytes = limits?.maxBytesPerFile ?? 25 * 1024 * 1024;
  const accept = limits?.acceptedMimeTypes?.join(',');

  async function upload(file: File) {
    // Checked here for a fast, plain message; re-checked server-side against
    // what storage actually received, because a declared size is a suggestion.
    // One id for the lifetime of the tile. The server's id arrives later and is
    // stored *alongside* it — matching on an id that changes mid-flight is what
    // left the tile stuck on "Uploading…" after the upload had succeeded.
    const localId = `local-${file.name}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    if (file.size > maxBytes) {
      onChange((prior) => [
        ...prior,
        {
          localId,
          attachmentId: localId,
          fileName: file.name,
          mimeType: file.type,
          sizeBytes: file.size,
          state: 'failed',
          errorKey: 'student.messages.attachmentTooBig',
          // Still previewed. Seeing which photo was too large is how you know
          // which one to replace.
          previewUrl: URL.createObjectURL(file),
        },
      ]);
      return;
    }

    const entry: PendingAttachmentDto = {
      localId,
      attachmentId: localId,
      fileName: file.name,
      mimeType: file.type,
      sizeBytes: file.size,
      state: 'uploading',
      /*
       * Made from the file in hand, so the preview is on screen before a single
       * byte has left the device. Revoked when the attachment is removed or the
       * composer unmounts — an object URL held past its use is a leak the tab
       * cannot reclaim.
       */
      previewUrl: URL.createObjectURL(file),
    };
    onChange((prior) => [...prior, entry]);

    /*
     * Patch by `localId`, always.
     *
     * The previous version reassigned `attachmentId` to the server's id and
     * then searched for that id in a list whose items still held the local one.
     * Nothing matched, so the tile never advanced past "Uploading…" even though
     * the file had uploaded and been scanned — which is exactly what the API
     * log showed while the UI insisted otherwise.
     */
    const patch = (changes: Partial<PendingAttachmentDto>) => {
      onChange((prior) =>
        prior.map((item) =>
          item.localId === localId ? { ...item, ...changes } : item,
        ),
      );
    };

    try {
      const signed = await api<{
        attachmentId: string;
        upload: { url: string; fields: Record<string, string>; resourceType: string };
      }>('/files/message-attachments/sign', {
        method: 'POST',
        body: {
          threadId,
          fileName: file.name,
          mimeType: file.type,
          sizeBytes: file.size,
        },
        language,
      });

      /*
       * The bytes go to our own API, not to storage directly.
       *
       * The browser used to POST straight to Cloudinary — cheaper, and what
       * SI-006 describes — but it failed with a bare `NetworkError`. Cloudinary
       * was reachable from the machine and the cross-origin POST still would not
       * complete, which is a class of failure neither we nor the learner can see
       * into. Through the API, the only link that has to work is
       * server-to-Cloudinary, and when storage refuses, its own message lands in
       * the API log.
       *
       * Raw body rather than multipart: there is exactly one file, and its type
       * was declared and checked in step 1.
       */
      /*
       * A bounded wait, so a stalled upload fails visibly.
       *
       * Without this the tile sat on "Sending…" indefinitely whenever the
       * request did not come back — no error, nothing in the console, nothing a
       * learner could act on. NFR-BAN-006: no operation fails silently.
       *
       * 90s covers 25 MB on a poor connection with room to spare, and is still
       * short enough that a stall is noticed rather than endured.
       */
      const response = await fetch(
        `${apiBase()}/files/message-attachments/${signed.attachmentId}/upload`,
        {
          method: 'POST',
          headers: {
            'Content-Type': file.type || 'application/octet-stream',
            ...(tokenStore.access ? { Authorization: `Bearer ${tokenStore.access}` } : {}),
          },
          body: file,
          signal: AbortSignal.timeout(90_000),
        },
      );

      if (!response.ok) {
        /*
         * Read the body as text and log the string.
         *
         * Logging the parsed object printed `{}` in the Next overlay, which
         * collapses objects and hid the very field we needed. A string cannot
         * be collapsed.
         */
        const raw = await response.text().catch(() => '');
        // eslint-disable-next-line no-console
        console.error(`[attachment] upload refused ${response.status}: ${raw}`);

        let key = 'errors.file.upload_rejected';
        try {
          const parsed = JSON.parse(raw) as { messageKey?: string };
          if (parsed?.messageKey) key = parsed.messageKey;
        } catch {
          // Not JSON. The status and the raw text are already logged.
        }
        throw new ApiError(response.status, key);
      }

      patch({ attachmentId: signed.attachmentId, state: 'scanning' });

      // FR-FIL-001: the file is not usable until this returns.
      await api(`/files/message-attachments/${signed.attachmentId}/confirm`, {
        method: 'POST',
        language,
      });

      patch({ state: 'ready' });
    } catch (caught) {
      /*
       * Surface the reason rather than a generic failure.
       *
       * The first version reported "could not be sent" for a signing refusal, a
       * storage timeout and a failed scan alike, which is useless to the learner
       * and useless to whoever has to fix it. The server sends a translatable
       * message key; if it is one we have wording for, show that.
       */
      const failure = caught as ApiError & { name?: string };
      const timedOut = failure?.name === 'TimeoutError' || failure?.name === 'AbortError';
      const key = timedOut
        ? 'student.messages.attachmentTimeout'
        : failure?.messageKey && failure.messageKey.startsWith('errors.')
          ? failure.messageKey
          : 'student.messages.attachmentBlocked';

      /*
       * Log the error itself, not only the fields an ApiError happens to carry.
       *
       * The first version logged `{status, messageKey, correlationId}` and
       * nothing else, so a plain TypeError — a failed fetch, a bad URL — printed
       * as `{}` and told nobody anything. The raw error goes first now.
       */
      // eslint-disable-next-line no-console
      console.error('[attachment] upload failed', caught, {
        name: (caught as Error)?.name,
        message: (caught as Error)?.message,
        fileName: file.name,
        mimeType: file.type,
        sizeBytes: file.size,
        status: failure?.status,
        messageKey: failure?.messageKey,
        correlationId: failure?.correlationId,
      });

      patch({ state: 'failed', errorKey: key });
    }
  }

  function remove(attachment: PendingAttachmentDto) {
    if (attachment.previewUrl) URL.revokeObjectURL(attachment.previewUrl);
    onChange((prior) => prior.filter((item) => item.localId !== attachment.localId));
  }

  async function pick(
    event: React.ChangeEvent<HTMLInputElement>,
    ref: React.RefObject<HTMLInputElement | null>,
  ) {
    const files = [...(event.target.files ?? [])].slice(
      0,
      Math.max(0, maxFiles - attachments.length),
    );
    setBusy(true);
    for (const file of files) await upload(file);
    setBusy(false);
    if (ref.current) ref.current.value = '';
  }

  /*
   * Release every object URL when the composer goes away.
   *
   * A blob URL keeps its file alive for the life of the document, so a learner
   * who picks and cancels a few videos on a 2 GB phone would otherwise hold
   * tens of megabytes for nothing.
   */
  useEffect(() => {
    return () => {
      for (const attachment of attachments) {
        if (attachment.previewUrl) URL.revokeObjectURL(attachment.previewUrl);
      }
    };
    // Intentionally on unmount only: revoking on every change would kill the
    // URL of an attachment that is still on screen.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="space-y-2">
      {/*
       * Two inputs rather than one.
       *
       * `accept="image/*,video/*"` with `capture` lets a phone offer the camera
       * directly, which is how a learner photographs their exercise book. A
       * single combined picker drops that and opens a file browser instead.
       */}
      <input
        ref={mediaRef}
        type="file"
        multiple
        accept="image/*,video/*"
        className="sr-only"
        onChange={(event) => void pick(event, mediaRef)}
      />
      <input
        ref={docRef}
        type="file"
        multiple
        accept={accept}
        className="sr-only"
        onChange={(event) => void pick(event, docRef)}
      />

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          disabled={busy || attachments.length >= maxFiles}
          onClick={() => mediaRef.current?.click()}
          className="min-h-touch rounded-lg border border-ink-300 px-3 text-sm text-ink-700 disabled:opacity-50"
        >
          {t('student.messages.attachPhoto')}
        </button>
        <button
          type="button"
          disabled={busy || attachments.length >= maxFiles}
          onClick={() => docRef.current?.click()}
          className="min-h-touch rounded-lg border border-ink-300 px-3 text-sm text-ink-700 disabled:opacity-50"
        >
          {t('student.messages.attachFile')}
        </button>
        <VoiceRecorder
          disabled={busy || attachments.length >= maxFiles}
          onRecorded={(file) => void upload(file)}
        />
      </div>

      {attachments.length > 0 && (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {attachments.map((attachment) => (
            <AttachmentPreview
              key={attachment.localId}
              attachment={attachment}
              onRemove={() => remove(attachment)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
