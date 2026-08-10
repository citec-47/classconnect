'use client';

import { useEffect, useRef, useState } from 'react';
import { useI18n } from '@/lib/i18n';

/**
 * Recording a voice note.
 *
 * On a shared family phone, speaking is often faster than typing — and for a
 * Primary learner it is sometimes the only practical way to ask a question. So
 * this is a first-class way to send a message, not a convenience.
 *
 * ## Why the container is chosen at runtime
 *
 * `MediaRecorder` supports different formats per browser: Chrome and Firefox
 * emit `audio/webm` (Opus), Safari emits `audio/mp4` (AAC). Picking one and
 * hoping would mean recording works on some phones and silently fails on
 * others, and the reference device is whatever the family happens to own. So
 * the first supported type wins, and all of them are in the file policy.
 *
 * ## Why the microphone is released on stop
 *
 * Leaving the track live keeps the browser's recording indicator lit after the
 * user has finished. On a device a child shares, an indicator that stays on
 * looks exactly like being listened to, and it would be right to be alarmed.
 */

const CANDIDATE_TYPES = [
  'audio/webm;codecs=opus',
  'audio/webm',
  'audio/mp4',
  'audio/ogg;codecs=opus',
];

/** The longest a voice note may run. Long enough to explain, short enough to send on 3G. */
const MAX_SECONDS = 120;

export function VoiceRecorder({
  onRecorded,
  disabled,
}: {
  onRecorded: (file: File) => void;
  disabled?: boolean;
}) {
  const { t } = useI18n();
  const [recording, setRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [unsupported, setUnsupported] = useState(false);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    return () => {
      // The microphone is released even if the component unmounts mid-recording.
      streamRef.current?.getTracks().forEach((track) => track.stop());
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  async function start() {
    if (typeof window === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      setUnsupported(true);
      return;
    }

    const mimeType = CANDIDATE_TYPES.find(
      (type) => typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(type),
    );
    if (!mimeType) {
      setUnsupported(true);
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      chunksRef.current = [];

      const recorder = new MediaRecorder(stream, { mimeType });
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunksRef.current.push(event.data);
      };
      recorder.onstop = () => {
        const base = mimeType.split(';')[0]!;
        const extension = base.includes('mp4') ? 'm4a' : base.includes('ogg') ? 'ogg' : 'webm';
        const blob = new Blob(chunksRef.current, { type: base });
        onRecorded(
          new File([blob], `voice-${Date.now()}.${extension}`, { type: base }),
        );
        streamRef.current?.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
      };

      recorder.start();
      recorderRef.current = recorder;
      setRecording(true);
      setSeconds(0);

      timerRef.current = setInterval(() => {
        setSeconds((current) => {
          // Stops itself at the ceiling rather than recording a file too large
          // to send and failing at the last step.
          if (current + 1 >= MAX_SECONDS) stop();
          return current + 1;
        });
      }, 1000);
    } catch {
      // Permission refused, or no microphone. Either way there is nothing to
      // record, and the button says so rather than appearing broken.
      setUnsupported(true);
    }
  }

  function stop() {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    recorderRef.current?.stop();
    recorderRef.current = null;
    setRecording(false);
  }

  function cancel() {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    const recorder = recorderRef.current;
    if (recorder) {
      // Discard: drop the handler before stopping so nothing is emitted.
      recorder.onstop = null;
      recorder.stop();
    }
    recorderRef.current = null;
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    setRecording(false);
    setSeconds(0);
  }

  if (unsupported) {
    return <p className="text-xs text-ink-600">{t('student.messages.voiceUnsupported')}</p>;
  }

  if (!recording) {
    return (
      <button
        type="button"
        disabled={disabled}
        onClick={() => void start()}
        aria-label={t('student.messages.recordVoice')}
        className="flex min-h-touch min-w-touch items-center justify-center rounded-full border border-ink-300 text-ink-700 disabled:opacity-50"
      >
        <MicIcon />
      </button>
    );
  }

  return (
    <div className="flex items-center gap-2 rounded-full border border-danger-600 px-3 py-1">
      <span aria-hidden="true" className="h-2 w-2 animate-pulse rounded-full bg-danger-600" />
      <span className="text-sm tabular-nums text-ink-900" aria-live="polite">
        {formatSeconds(seconds)} / {formatSeconds(MAX_SECONDS)}
      </span>
      <button
        type="button"
        onClick={cancel}
        className="min-h-touch px-2 text-sm text-ink-600"
      >
        {t('common.cancel')}
      </button>
      <button
        type="button"
        onClick={stop}
        className="min-h-touch rounded-full bg-brand-600 px-3 text-sm font-medium text-white"
      >
        {t('student.messages.stopRecording')}
      </button>
    </div>
  );
}

function formatSeconds(total: number): string {
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

function MicIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      className="h-5 w-5"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="9" y="3" width="6" height="11" rx="3" />
      <path d="M5 11a7 7 0 0 0 14 0M12 18v3" />
    </svg>
  );
}
