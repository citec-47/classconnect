'use client';

import { useEffect, useRef, useState } from 'react';
import { useI18n } from '@/lib/i18n';

/**
 * The applicant's spoken introduction, recorded in the browser.
 *
 * A certificate says what somebody studied. It says nothing about whether they
 * can hold a Form 3 class's attention, and nothing about whether the person
 * holding the certificate is the person applying. Three minutes of them talking
 * answers both, and it is the cheapest identity check available to a reviewer:
 * the face and voice either match the ID document or they do not.
 *
 * ## Why it records rather than only accepting an upload
 *
 * An upload can be anyone's video. A recording made here, now, with the camera
 * on, is much harder to borrow — not impossible, but it raises the effort from
 * "download a file" to "stage a performance", which is the right bar for a
 * volunteer safeguarding control.
 *
 * A file picker is offered alongside it, because a phone that refuses camera
 * permission should not end the application.
 *
 * ## Why the bitrate is pinned
 *
 * Three minutes of default phone video is 100–300 MB. On a Cameroonian mobile
 * connection that is an upload nobody finishes and a bill nobody wants. At
 * 600 kbps video and 64 kbps audio, three minutes is about 13 MB — legible on a
 * reviewer's screen and sendable on 3G. That is the whole reason this component
 * exists rather than an `<input type="file" capture>`.
 */

const MAX_SECONDS = 180;
const VIDEO_BITS_PER_SECOND = 600_000;
const AUDIO_BITS_PER_SECOND = 64_000;

const CANDIDATE_TYPES = [
  'video/webm;codecs=vp9,opus',
  'video/webm;codecs=vp8,opus',
  'video/webm',
  'video/mp4',
];

export function IntroVideoRecorder({
  onRecorded,
  disabled,
}: {
  onRecorded: (file: File) => void;
  disabled?: boolean;
}) {
  const { t } = useI18n();
  const [state, setState] = useState<'idle' | 'ready' | 'recording' | 'review' | 'unsupported'>(
    'idle',
  );
  const [seconds, setSeconds] = useState(0);
  const [preview, setPreview] = useState<string | null>(null);

  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const fileRef = useRef<File | null>(null);

  useEffect(() => {
    return () => {
      // The camera light must go out when this component does. On a shared
      // device a lens that stays live is indistinguishable from being watched.
      streamRef.current?.getTracks().forEach((track) => track.stop());
      if (timerRef.current) clearInterval(timerRef.current);
      if (preview) URL.revokeObjectURL(preview);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function enableCamera() {
    if (typeof window === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      setState('unsupported');
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        // 640×480 is enough to recognise a face and read a room. Asking for more
        // costs bytes the applicant pays for and tells a reviewer nothing extra.
        video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: 'user' },
        audio: true,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.muted = true;
        await videoRef.current.play().catch(() => undefined);
      }
      setState('ready');
    } catch {
      setState('unsupported');
    }
  }

  function start() {
    const stream = streamRef.current;
    if (!stream) return;

    const mimeType = CANDIDATE_TYPES.find(
      (type) => typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(type),
    );
    if (!mimeType) {
      setState('unsupported');
      return;
    }

    chunksRef.current = [];
    const recorder = new MediaRecorder(stream, {
      mimeType,
      videoBitsPerSecond: VIDEO_BITS_PER_SECOND,
      audioBitsPerSecond: AUDIO_BITS_PER_SECOND,
    });

    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) chunksRef.current.push(event.data);
    };
    recorder.onstop = () => {
      const base = mimeType.split(';')[0]!;
      const extension = base.includes('mp4') ? 'mp4' : 'webm';
      const blob = new Blob(chunksRef.current, { type: base });
      const file = new File([blob], `intro-${Date.now()}.${extension}`, { type: base });
      fileRef.current = file;

      const url = URL.createObjectURL(blob);
      setPreview(url);

      /*
       * Hand the element from the live camera to the recording.
       *
       * `srcObject` outranks `src`: while the stream is still attached, setting
       * a source does nothing and the applicant watches themselves live,
       * believing that is the playback. It has to be cleared explicitly.
       */
      if (videoRef.current) {
        videoRef.current.srcObject = null;
        videoRef.current.src = url;
        videoRef.current.muted = false;
        videoRef.current.load();
      }

      setState('review');
    };

    recorder.start();
    recorderRef.current = recorder;
    setSeconds(0);
    setState('recording');

    timerRef.current = setInterval(() => {
      setSeconds((current) => {
        // Stops itself at the ceiling rather than producing a file too large to
        // send and failing at the last step.
        if (current + 1 >= MAX_SECONDS) stop();
        return current + 1;
      });
    }, 1000);
  }

  function stop() {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    recorderRef.current?.stop();
    recorderRef.current = null;
  }

  function retake() {
    if (preview) URL.revokeObjectURL(preview);
    setPreview(null);
    fileRef.current = null;
    setSeconds(0);
    setState('ready');
    if (videoRef.current && streamRef.current) {
      // Back to the live camera: clear the recorded source first, for the same
      // reason as above but in reverse.
      videoRef.current.src = '';
      videoRef.current.srcObject = streamRef.current;
      videoRef.current.muted = true;
      void videoRef.current.play().catch(() => undefined);
    }
  }

  function use() {
    if (fileRef.current) onRecorded(fileRef.current);
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
  }

  return (
    <div className="space-y-2 rounded-xl border border-ink-300 p-3">
      <p className="text-sm font-medium text-ink-900">{t('teach.intro.title')}</p>
      <p className="text-xs text-ink-600">{t('teach.intro.help')}</p>

      {state === 'unsupported' ? (
        <p className="text-xs text-danger-600">{t('teach.intro.unsupported')}</p>
      ) : (
        <>
          <div className="relative overflow-hidden rounded-lg bg-ink-900">
            <video
              ref={videoRef}
              playsInline
              controls={state === 'review'}
              className="h-48 w-full bg-ink-900 object-contain"
            />
            {state === 'recording' && (
              <span className="absolute left-2 top-2 flex items-center gap-1.5 rounded-full bg-danger-600 px-2 py-0.5 text-xs text-white">
                <span aria-hidden="true" className="h-1.5 w-1.5 animate-pulse rounded-full bg-white" />
                <span aria-live="polite" className="tabular-nums">
                  {format(seconds)} / {format(MAX_SECONDS)}
                </span>
              </span>
            )}
          </div>

          <div className="flex flex-wrap gap-2">
            {state === 'idle' && (
              <button
                type="button"
                disabled={disabled}
                onClick={() => void enableCamera()}
                className="min-h-touch rounded-lg border border-ink-300 px-3 text-sm"
              >
                {t('teach.intro.enableCamera')}
              </button>
            )}
            {state === 'ready' && (
              <button
                type="button"
                onClick={start}
                className="min-h-touch rounded-lg bg-brand-600 px-4 text-sm font-medium text-white"
              >
                {t('teach.intro.start')}
              </button>
            )}
            {state === 'recording' && (
              <button
                type="button"
                onClick={stop}
                className="min-h-touch rounded-lg bg-danger-600 px-4 text-sm font-medium text-white"
              >
                {t('teach.intro.stop')}
              </button>
            )}
            {state === 'review' && (
              <>
                <span className="w-full text-xs text-ink-600">
                  {t('teach.intro.reviewHint')}
                </span>
                <button
                  type="button"
                  onClick={use}
                  className="min-h-touch rounded-lg bg-brand-600 px-4 text-sm font-medium text-white"
                >
                  {t('teach.intro.use')}
                </button>
                {/* Nobody gets one take at the thing that decides their job. */}
                <button
                  type="button"
                  onClick={retake}
                  className="min-h-touch rounded-lg border border-ink-300 px-3 text-sm"
                >
                  {t('teach.intro.retake')}
                </button>
              </>
            )}
          </div>
        </>
      )}

      {/* A refused camera permission must not end the application. */}
      <label className="block text-xs text-ink-600">
        {t('teach.intro.orUpload')}
        <input
          type="file"
          accept="video/*"
          disabled={disabled}
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) onRecorded(file);
          }}
          className="mt-1 block w-full text-xs"
        />
      </label>
    </div>
  );
}

function format(total: number): string {
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}
