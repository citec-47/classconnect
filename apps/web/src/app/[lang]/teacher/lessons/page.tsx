'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useI18n } from '@/lib/i18n';
import { api, apiUpload, ApiError } from '@/lib/api';
import { PageHeader } from '@/components/admin/ui';
import { ErrorAlert, SuccessAlert } from '@/components/Alert';
import { TeacherGate } from '@/components/teacher/TeacherGate';

interface Lesson {
  id: string;
  title: string;
  topic: string | null;
  mimeType: string;
  sizeBytes: number;
  scanStatus: string;
  published: boolean;
  /** Clean and not yet released: the Publish button is live for exactly these. */
  publishable: boolean;
  createdAt: string;
  subject: { id: string; nameEn: string; nameFr: string };
  level: { id: string; nameEn: string; nameFr: string };
}

interface TeachingPair {
  subject: { id: string; nameEn: string; nameFr: string };
  level: { id: string; nameEn: string; nameFr: string };
}

interface SignResponse {
  materialId: string;
}

interface ConfirmResponse {
  materialId: string;
  scanStatus: string;
  published: boolean;
}

/**
 * BUILD-PLAN Phase 2 — publishing a lesson to a class.
 *
 * The audience is not a field on this form, and that is the design: a lesson
 * goes to the class, so choosing the class *is* choosing who receives it. There
 * is no learner list to tick, which means there is no way for one to drift out
 * of step with the register.
 *
 * The three-step upload is `DocumentUpload.tsx`'s, unchanged — sign, send the
 * bytes through our API, confirm and scan. It is not repeated here because a
 * third copy of it is a third place for the Cloudinary path to go wrong.
 */
function TeacherLessonsPage() {
  const { t, language } = useI18n();

  const [lessons, setLessons] = useState<Lesson[] | null>(null);
  const [pairs, setPairs] = useState<TeachingPair[]>([]);
  const [error, setError] = useState<ApiError | null>(null);
  const [localErrorKey, setLocalErrorKey] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<'published' | 'pending' | null>(null);
  const [busy, setBusy] = useState(false);

  const [form, setForm] = useState({ pair: '', title: '', topic: '' });
  const fileRef = useRef<HTMLInputElement>(null);

  const name = (item: { nameEn: string; nameFr: string }) =>
    language === 'fr' ? item.nameFr : item.nameEn;

  const load = useCallback(async () => {
    try {
      const [mine, application] = await Promise.all([
        api<{ lessons: Lesson[] }>('/teacher/lessons', { language }),
        api<{ subjects: TeachingPair[] }>('/teachers/me/application', { language }),
      ]);
      setLessons(mine.lessons);
      setPairs(application.subjects);
      setForm((current) =>
        current.pair || application.subjects.length === 0
          ? current
          : {
              ...current,
              pair: `${application.subjects[0]!.subject.id}:${application.subjects[0]!.level.id}`,
            },
      );
    } catch (caught) {
      setError(caught as ApiError);
      setLessons([]);
    }
  }, [language]);

  useEffect(() => {
    void load();
  }, [load]);

  const publish = async () => {
    const file = fileRef.current?.files?.[0];
    const [subjectId, levelId] = form.pair.split(':');
    if (!file || !subjectId || !levelId) return;

    setError(null);
    setLocalErrorKey(null);
    setOutcome(null);

    // Refuse locally before troubling the API — NFR-USA-004 wants the teacher to
    // learn the problem immediately, not after 100 MB has crossed a 3G link.
    if (file.size === 0) {
      setLocalErrorKey('errors.file.empty');
      return;
    }
    if (file.size > MAX_BYTES) {
      setLocalErrorKey('errors.file.too_large');
      return;
    }

    setBusy(true);
    try {
      // Step 1 — policy check, and a signature for exactly one asset path.
      const signed = await api<SignResponse>('/teacher/lessons/sign', {
        method: 'POST',
        body: {
          levelId,
          subjectId,
          title: form.title.trim(),
          ...(form.topic.trim() ? { topic: form.topic.trim() } : {}),
          fileName: file.name,
          mimeType: file.type || guessMime(file.name),
          sizeBytes: file.size,
        },
        language,
        timeoutMs: 120_000,
      });

      // Step 2 — the bytes, through our API. A direct cross-origin POST to
      // Cloudinary fails here with a bare NetworkError; see cloudinary.service.
      const sent = await apiUpload(`/teacher/lessons/${signed.materialId}/upload`, file, {
        // A 100 MB lesson on a Cameroonian mobile connection is not a 2-minute
        // request. Ten minutes, then it is genuinely stuck rather than slow.
        timeoutMs: 600_000,
      });
      if (!sent.ok) {
        const raw = await sent.text().catch(() => '');
        let key: string | null = null;
        try {
          const parsed = JSON.parse(raw) as { messageKey?: string };
          if (parsed?.messageKey) key = parsed.messageKey;
        } catch {
          /* not JSON */
        }
        throw new ApiError(sent.status, key ?? 'errors.file.upload_rejected');
      }

      // Step 3 — confirm against what storage received, and scan (FR-FIL-001).
      const confirmed = await api<ConfirmResponse>(
        `/teacher/lessons/${signed.materialId}/confirm`,
        { method: 'POST', language, timeoutMs: 120_000 },
      );

      /*
       * Two different pieces of news, said differently.
       *
       * With no malware scanner contracted the verdict is `pending`, the file is
       * stored, and no learner can open it. "Published" would be a lie, and the
       * teacher would find out by a child telling them the lesson is missing.
       */
      setOutcome(confirmed.published ? 'published' : 'pending');
      setForm((current) => ({ ...current, title: '', topic: '' }));
      if (fileRef.current) fileRef.current.value = '';
      await load();
    } catch (caught) {
      setError(caught as ApiError);
    } finally {
      setBusy(false);
    }
  };

  /**
   * Releasing a draft to the class.
   *
   * Reloads rather than flipping the row locally: publishing is the moment the
   * teacher most wants to be sure it took, and a badge changed optimistically
   * would say "Published" even when the request failed.
   */
  const releaseToClass = async (id: string) => {
    setBusy(true);
    setError(null);
    try {
      await api(`/teacher/lessons/${id}/publish`, {
        method: 'POST',
        language,
        timeoutMs: 120_000,
      });
      await load();
      setOutcome('published');
    } catch (caught) {
      setError(caught as ApiError);
    } finally {
      setBusy(false);
    }
  };

  const remove = async (id: string) => {
    setBusy(true);
    setError(null);
    try {
      await api(`/teacher/lessons/${id}`, { method: 'DELETE', language, timeoutMs: 120_000 });
      await load();
    } catch (caught) {
      setError(caught as ApiError);
    } finally {
      setBusy(false);
    }
  };

  const canPublish = form.pair !== '' && form.title.trim().length >= 2 && !busy;

  return (
    <>
      <PageHeader
        title={t('teacherNav.lessons')}
        description={t('lessons.teacherDescription')}
      />

      <ErrorAlert error={error} />
      {localErrorKey && (
        <p className="cc-error" role="alert">
          <span aria-hidden="true">⚠</span>
          <span>{t(localErrorKey, { maxMb: 100 })}</span>
        </p>
      )}
      {outcome === 'published' && <SuccessAlert>{t('lessons.publishedOk')}</SuccessAlert>}
      {/*
       * Not an error and not a success — the file is safe and stored, and nobody
       * can read it yet. Its own tone, because both of the other two would
       * mislead.
       */}
      {outcome === 'pending' && (
        <div className="mb-4 rounded-xl border border-warning-600 bg-warning-50 p-3">
          <p className="text-sm text-ink-900">{t('lessons.pendingOk')}</p>
        </div>
      )}

      <section className="mb-6 rounded-xl border border-ink-200 bg-white p-4">
        <h2 className="mb-3 font-display text-base font-semibold text-ink-900">
          {t('lessons.publishTitle')}
        </h2>

        {pairs.length === 0 ? (
          <p className="text-sm text-ink-600">{t('lessons.noSubjects')}</p>
        ) : (
          <>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block">
                <span className="cc-label">{t('lessons.classAndSubject')}</span>
                <select
                  className="cc-field w-full"
                  value={form.pair}
                  onChange={(e) => setForm({ ...form, pair: e.target.value })}
                >
                  {pairs.map((pair) => (
                    <option
                      key={`${pair.subject.id}:${pair.level.id}`}
                      value={`${pair.subject.id}:${pair.level.id}`}
                    >
                      {name(pair.level)} · {name(pair.subject)}
                    </option>
                  ))}
                </select>
              </label>

              <label className="block">
                <span className="cc-label">{t('lessons.titleLabel')}</span>
                <input
                  type="text"
                  className="cc-field w-full"
                  maxLength={300}
                  value={form.title}
                  placeholder={t('lessons.titlePlaceholder')}
                  onChange={(e) => setForm({ ...form, title: e.target.value })}
                />
              </label>

              <label className="block">
                <span className="cc-label">
                  {t('lessons.topicLabel')}
                  <span className="ml-1 font-normal text-ink-600">({t('common.optional')})</span>
                </span>
                <input
                  type="text"
                  className="cc-field w-full"
                  maxLength={200}
                  value={form.topic}
                  onChange={(e) => setForm({ ...form, topic: e.target.value })}
                />
              </label>

              <label className="block">
                <span className="cc-label">{t('lessons.chooseFile')}</span>
                <input
                  ref={fileRef}
                  type="file"
                  accept={ACCEPTED}
                  disabled={busy}
                  className="cc-field w-full py-2"
                />
              </label>
            </div>

            <p className="cc-hint">{t('lessons.accepted')}</p>

            <div aria-live="polite">
              {/*
               * Indeterminate, honestly. The upload goes through our API with
               * `fetch`, which reports no progress, so a percentage would sit at
               * 0% for the whole transfer and read as frozen.
               */}
              {busy && (
                <div className="mt-3">
                  <div className="h-2 overflow-hidden rounded-full bg-ink-100">
                    <div className="h-full w-1/3 animate-pulse rounded-full bg-brand-600" />
                  </div>
                  <p className="cc-hint">{t('lessons.uploading')}</p>
                </div>
              )}
            </div>

            <button
              type="button"
              className="cc-btn-primary mt-3"
              disabled={!canPublish}
              onClick={() => void publish()}
            >
              {busy ? t('lessons.uploading') : t('lessons.publish')}
            </button>
          </>
        )}
      </section>

      <h2 className="mb-3 font-display text-base font-semibold text-ink-900">
        {t('lessons.listTitle')}
      </h2>

      {lessons === null ? (
        <p className="text-sm text-ink-600">{t('common.loading')}</p>
      ) : lessons.length === 0 ? (
        <p className="rounded-xl border border-ink-200 bg-white p-4 text-sm text-ink-600">
          {t('lessons.none')}
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {lessons.map((lesson) => (
            <li
              key={lesson.id}
              className="flex flex-wrap items-center gap-3 rounded-xl border border-ink-200 bg-white p-3"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-ink-900">{lesson.title}</p>
                <p className="truncate text-xs text-ink-600">
                  {name(lesson.level)} · {name(lesson.subject)}
                  {lesson.topic ? ` · ${lesson.topic}` : ''}
                </p>
              </div>

              {/* NFR-BAN-002: the size is what a learner pays to download. */}
              <span className="shrink-0 text-xs tabular-nums text-ink-600">
                {megabytes(lesson.sizeBytes)}
              </span>

              {/*
                * Two facts, said separately, because they are two facts.
                *
                * The scan is the platform's business — clean, waiting, refused.
                * Publication is the teacher's decision. Showing only one badge
                * meant a clean-but-unpublished draft read as "published", and
                * the teacher believed the class had it.
                */}
              <span
                className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium ${
                  lesson.scanStatus === 'clean'
                    ? 'bg-success-50 text-success-600'
                    : 'bg-warning-50 text-warning-600'
                }`}
              >
                {t(`lessons.state.${lesson.scanStatus}`)}
              </span>

              <span
                className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium ${
                  lesson.published ? 'bg-success-50 text-success-600' : 'bg-ink-100 text-ink-600'
                }`}
              >
                {lesson.published ? t('lessons.badgePublished') : t('lessons.badgeDraft')}
              </span>

              {/*
                * Live for exactly the lessons that can be published: scanned
                * clean and not yet released. The API refuses the rest anyway —
                * this stops the teacher pressing a button that says no.
                */}
              {lesson.publishable && (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void releaseToClass(lesson.id)}
                  className="shrink-0 rounded-lg bg-brand-700 px-3 py-1 text-xs font-semibold text-white disabled:opacity-50"
                >
                  {t('lessons.publish')}
                </button>
              )}

              <button
                type="button"
                disabled={busy}
                onClick={() => void remove(lesson.id)}
                className="shrink-0 text-xs font-medium text-danger-600 underline"
              >
                {t('lessons.remove')}
              </button>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

/** Kept in step with `LESSON_KINDS` and `LESSON_MAX_BYTES` in the API. */
const ACCEPTED = '.pdf,.jpg,.jpeg,.png,.heic,.docx,.mp4,.webm,.mp3';
const MAX_BYTES = 100 * 1024 * 1024;

function megabytes(bytes: number): string {
  const mb = bytes / (1024 * 1024);
  return mb < 1 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${mb.toFixed(1)} MB`;
}

/**
 * A browser that reports no MIME type for a chosen file — which happens for
 * `.docx` on some Android builds — would otherwise be refused at signing for a
 * file the policy allows.
 */
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
    case 'docx':
      return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
    case 'mp4':
    case 'm4v':
      return 'video/mp4';
    case 'webm':
      return 'video/webm';
    case 'mp3':
      return 'audio/mpeg';
    default:
      return 'application/octet-stream';
  }
}

/**
 * Closed until an Admin approves the application (FR-TVR-005).
 *
 * The gate wraps the screen rather than living inside it, so the component above
 * never renders — and therefore never fires the API calls that would 403 — while
 * the teacher is unapproved. See `TeacherGate`.
 */
export default function Page() {
  return (
    <TeacherGate titleKey="teacherNav.lessons">
      <TeacherLessonsPage />
    </TeacherGate>
  );
}
