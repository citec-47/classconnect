'use client';

import { useEffect, useRef, useState } from 'react';
import { useI18n } from '@/lib/i18n';
import { api, ApiError, API_BASE } from '@/lib/api';
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

  const [source, setSource] = useState<{ url: string; audioOnly: boolean; format?: 'hls' } | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);

  /*
   * Attaching an HLS playlist, which no browser but Safari will do for itself.
   *
   * Declared above every early return below, because a hook that only sometimes
   * runs is a hook React will complain about on the second render.
   *
   * hls.js is imported here rather than at the top of the file so that the
   * library — a few hundred kilobytes — is fetched by the people who press play
   * and by nobody else. On the connections this platform is built for, shipping
   * it to every page that merely *lists* lessons would be the most expensive
   * thing on the screen.
   */
  useEffect(() => {
    const video = videoRef.current;
    if (!source || source.format !== 'hls' || source.audioOnly || !video) return;

    /* Safari and iOS play the playlist directly, and do it better than we can. */
    if (video.canPlayType('application/vnd.apple.mpegurl')) {
      video.src = source.url;
      return;
    }

    let destroy: (() => void) | undefined;
    let cancelled = false;

    void import('hls.js').then(({ default: Hls }) => {
      if (cancelled || !Hls.isSupported()) {
        if (!cancelled) setFailure('recordings.unavailable');
        return;
      }
      const hls = new Hls({
        /*
         * The segment URLs inside the playlist are already signed, and the
         * playlist itself carries its ticket in the query string. Nothing here
         * needs cookies, and asking for them would trip CORS for no gain.
         */
        xhrSetup: (xhr) => {
          xhr.withCredentials = false;
        },
      });
      hls.loadSource(source.url);
      hls.attachMedia(video);
      /*
       * A fatal error is reported in words rather than left as a black
       * rectangle — the same rule the rest of this component follows.
       */
      hls.on(Hls.Events.ERROR, (_event, data) => {
        if (data.fatal) {
          setFailure('recordings.unavailable');
          hls.destroy();
        }
      });
      destroy = () => hls.destroy();
    });

    return () => {
      cancelled = true;
      destroy?.();
    };
  }, [source]);

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

      const result = await api<{ url: string; audioOnly: boolean; format?: 'hls' }>(
        `${base}/${recordingId}/url${audio ? '?audio=1' : ''}`,
        { language },
      );
      /*
       * Resolved against the API's origin, not the page's.
       *
       * A playlist URL comes back as `/api/v1/recordings/…`, which is absolute
       * *for the API* — and the browser, sitting on the web origin, resolved it
       * against port 3000 and got a 404 from Next. Signed segment URLs already
       * carry their own host, so `new URL` leaves those untouched.
       */
      setSource({
        url: new URL(result.url, API_BASE).toString(),
        audioOnly: result.audioOnly,
        format: result.format,
      });
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
            ref={videoRef}
            /*
             * An HLS playlist is attached by the effect below, not set here.
             *
             * Safari plays `.m3u8` from `src` natively; Chrome, Edge and Firefox
             * do not, and setting it there would leave most of this platform's
             * students — Android, on Chrome — with a player that reports an
             * unsupported format for a recording that is perfectly fine.
             */
            src={source.format === 'hls' ? undefined : source.url}
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
