'use client';

import { useState } from 'react';
import { useI18n } from '@/lib/i18n';
import { api, ApiError } from '@/lib/api';
import type { RecordingStateDto } from '@classconnect/shared';

/**
 * Watching a lesson back, on any of the three surfaces.
 *
 * ## Why the URL is fetched on the tap rather than sent with the list
 *
 * Every link to a recording is signed and expires (FR-FIL-003). Sending one for
 * every row would mint live links to rooms full of children that nobody asked to
 * open, and they would still be valid in whatever the response was cached in. So
 * the list carries ids, and a link is minted only when somebody presses play.
 *
 * This is also where the entitlement is re-checked. The list was already filtered
 * server-side, but the id in a URL is not permission — a classmate who forwards
 * one gets a 404 from this same request.
 *
 * ## Why it plays inline instead of navigating
 *
 * A signed URL in the address bar is a signed URL in the browser history, the
 * "recently closed" list, and whatever the phone syncs. Loading it into a
 * `<video>` keeps it in the page, where it dies with the tab.
 *
 * ## Why a failure is spelled out
 *
 * The brief: "If a recording is missing or failed, say so plainly rather than
 * showing a broken player." A `<video>` pointed at a dead object shows a spinner
 * and then a mute grey rectangle, which sends a teacher to check their own
 * connection. Every state below has words instead.
 */
export function RecordingPlayer({
  /** Where to ask for the link. The three surfaces have three prefixes. */
  endpoint,
  recordingId,
  state,
  audioAvailable = false,
  audioSizeBytes = null,
  sizeBytes = null,
}: {
  endpoint: 'learner' | 'teacher' | 'admin';
  recordingId: string;
  state: RecordingStateDto;
  audioAvailable?: boolean;
  audioSizeBytes?: number | null;
  sizeBytes?: number | null;
}) {
  const { t, language } = useI18n();

  const [source, setSource] = useState<{ url: string; audioOnly: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);

  /*
   * A row the platform cannot serve says so before anyone presses anything.
   *
   * `failed` and `expired` are different pieces of news — one is a fault and the
   * other is the retention policy working — so they get different sentences.
   */
  if (state !== 'ready') {
    return (
      <p className="mt-2 rounded-lg bg-ink-100 px-3 py-2 text-xs text-ink-600" role="status">
        {t(`recordings.state.${state}`)}
      </p>
    );
  }

  const open = async (audio: boolean) => {
    setBusy(true);
    setFailure(null);
    try {
      const base =
        endpoint === 'learner'
          ? '/learner/recordings'
          : endpoint === 'teacher'
            ? '/teacher/recordings'
            : '/admin/recordings';

      const result = await api<{ url: string; audioOnly: boolean }>(
        `${base}/${recordingId}/url${audio ? '?audio=1' : ''}`,
        { language },
      );
      setSource({ url: result.url, audioOnly: result.audioOnly });
    } catch (caught) {
      const error = caught as ApiError;
      /*
       * A 404 here is the entitlement check, the retention date, or a rendition
       * that was never made — and from outside they are indistinguishable on
       * purpose (see `recordings.service.ts`). "We cannot play this for you" is
       * the honest summary of all three.
       */
      setFailure(error.messageKey ?? 'recordings.unavailable');
    } finally {
      setBusy(false);
    }
  };

  if (source) {
    return (
      <div className="mt-2 space-y-1.5">
        {source.audioOnly ? (
          <audio src={source.url} controls autoPlay preload="metadata" className="w-full" />
        ) : (
          /*
           * `preload="metadata"`: on a metered connection the learner chose to
           * spend this data, and metadata is enough for a duration and a scrubber.
           */
          <video
            src={source.url}
            controls
            autoPlay
            playsInline
            preload="metadata"
            className="max-h-80 w-full rounded-lg bg-black"
          />
        )}
        <p className="text-xs text-ink-600">{t('recordings.linkExpires')}</p>
      </div>
    );
  }

  return (
    <div className="mt-2 space-y-1.5">
      <button
        type="button"
        disabled={busy}
        onClick={() => void open(false)}
        className="flex min-h-touch w-full items-center justify-center rounded-lg bg-brand-600 px-3 text-sm font-medium text-white disabled:opacity-60"
      >
        {busy ? t('recordings.opening') : t('recordings.watch')}
        {sizeBytes !== null && (
          <span className="ml-2 text-xs font-normal text-white/80">{megabytes(sizeBytes)}</span>
        )}
      </button>

      {/*
       * NFR-BAN-001/002: audio is roughly a twelfth of the bytes. On a metered
       * 3G connection that is the difference between revising a lesson and
       * deciding you cannot afford to.
       */}
      {audioAvailable && (
        <button
          type="button"
          disabled={busy}
          onClick={() => void open(true)}
          className="flex min-h-touch w-full items-center justify-center rounded-lg border border-ink-300 px-3 text-sm text-ink-700 disabled:opacity-60"
        >
          {t('recordings.audioOnly')}
          {audioSizeBytes !== null && (
            <span className="ml-2 text-xs text-ink-600">{megabytes(audioSizeBytes)}</span>
          )}
        </button>
      )}

      {failure && (
        <p className="text-xs text-danger-600" role="alert">
          {t(failure)}
        </p>
      )}
    </div>
  );
}

function megabytes(bytes: number): string {
  const mb = bytes / (1024 * 1024);
  return mb < 1 ? '<1 MB' : `${mb.toFixed(0)} MB`;
}
