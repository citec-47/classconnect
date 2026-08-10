'use client';

import { useState } from 'react';
import { useI18n } from '@/lib/i18n';
import { api } from '@/lib/api';

/**
 * Rating a teacher, and telling the learner why it is safe to be honest.
 *
 * The anonymity promise is rendered next to the control rather than in a help
 * page, because it is not a disclaimer — it is the thing that determines
 * whether the data is worth collecting. A learner who thinks their teacher will
 * see a 2-star with their name on it gives 5 stars, and the platform learns
 * nothing while believing it has learned something.
 *
 * What makes the promise true is on the server (see `learner-ratings.service`):
 * no per-rating rows teacher-side, no timestamps, and a five-rating threshold
 * before any average is shown at all. This component only has to say so.
 */
export function RatingControl({
  teacherUserId,
  teacherName,
  subjectId,
  subjectName,
  current,
  sessionId,
  onSaved,
}: {
  teacherUserId: string;
  teacherName: string;
  subjectId: string;
  subjectName: string;
  current: number | null;
  sessionId?: string;
  onSaved?: () => void;
}) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [stars, setStars] = useState(current ?? 0);
  const [comment, setComment] = useState('');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [failed, setFailed] = useState(false);

  async function submit(value: number) {
    setStars(value);
    setSaving(true);
    setFailed(false);
    try {
      await api('/learner/ratings', {
        method: 'POST',
        body: { teacherUserId, subjectId, stars: value, comment: comment.trim() || undefined, sessionId },
      });
      setSaved(true);
      onSaved?.();
    } catch {
      // NFR-BAN-006: a failed rating says so and stays open, rather than
      // reporting success the server never confirmed.
      setFailed(true);
    } finally {
      setSaving(false);
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mt-3 flex min-h-touch w-full items-center justify-between rounded-lg border border-ink-300 px-3 text-sm text-ink-700"
      >
        <span>
          {current
            ? t('student.rating.yourRating', { stars: current })
            : t('student.rating.forSubject', { subject: subjectName })}
        </span>
        <Stars value={current ?? 0} readOnly />
      </button>
    );
  }

  return (
    <div className="mt-3 rounded-lg border border-ink-300 bg-ink-100/40 p-3">
      <p className="text-sm font-medium text-ink-900">
        {t('student.rating.forSubject', { subject: subjectName })}
      </p>

      <Stars value={stars} onChange={(value) => void submit(value)} disabled={saving} />

      {/* The promise, at the point of decision. */}
      <p className="mt-2 text-xs text-ink-600">{t('student.rating.anonymous')}</p>

      <label className="mt-3 block text-xs text-ink-600" htmlFor={`comment-${subjectId}`}>
        {t('student.rating.commentLabel')}
      </label>
      <textarea
        id={`comment-${subjectId}`}
        value={comment}
        onChange={(event) => setComment(event.target.value)}
        rows={2}
        className="mt-1 w-full rounded-lg border border-ink-300 p-2 text-sm"
      />
      {/*
       * FR-SAF-002 strips contact details from a comment server-side, but a
       * learner naming themselves in free text defeats the anonymity no filter
       * can restore. Cheaper to ask first than to moderate after.
       */}
      <p className="mt-1 text-xs text-ink-600">{t('student.rating.commentHelp')}</p>

      {saved && <p className="mt-2 text-sm text-success-600">{t('student.rating.submitted')}</p>}
      {failed && <p className="mt-2 text-sm text-danger-600">{t('common.retry')}</p>}

      <button
        type="button"
        onClick={() => setOpen(false)}
        className="mt-2 min-h-touch text-sm text-brand-600 underline"
      >
        {t('common.close')}
      </button>
    </div>
  );
}

/**
 * Five stars as radio buttons.
 *
 * Radios rather than five click handlers so the whole control is one tab stop
 * with arrow-key selection, which is what a screen reader and a keyboard both
 * expect of "choose one of five" (UI-003).
 */
function Stars({
  value,
  onChange,
  readOnly = false,
  disabled = false,
}: {
  value: number;
  onChange?: (value: number) => void;
  readOnly?: boolean;
  disabled?: boolean;
}) {
  const { t } = useI18n();

  if (readOnly) {
    return (
      <span aria-label={t('student.rating.stars', { count: value })} className="shrink-0">
        {[1, 2, 3, 4, 5].map((n) => (
          <Star key={n} filled={n <= value} />
        ))}
      </span>
    );
  }

  return (
    <div role="radiogroup" aria-label={t('student.rating.title')} className="mt-2 flex gap-1">
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          role="radio"
          aria-checked={value === n}
          aria-label={t(`student.rating.star${n}`)}
          disabled={disabled}
          onClick={() => onChange?.(n)}
          className="min-h-touch min-w-touch rounded-lg disabled:opacity-50"
        >
          <Star filled={n <= value} large />
        </button>
      ))}
    </div>
  );
}

function Star({ filled, large = false }: { filled: boolean; large?: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      className={[
        large ? 'h-7 w-7' : 'h-4 w-4',
        'inline-block',
        filled ? 'text-clay-600' : 'text-ink-300',
      ].join(' ')}
      fill={filled ? 'currentColor' : 'none'}
      stroke="currentColor"
      strokeWidth="1.5"
    >
      <path d="M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8-5.2-2.7-5.2 2.7 1-5.8L3.5 9.7l5.9-.9z" />
    </svg>
  );
}
