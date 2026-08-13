'use client';

import { useEffect, useState } from 'react';
import { useI18n } from '@/lib/i18n';
import { api } from '@/lib/api';

export interface ReviewDocument {
  id: string;
  type: string;
  fileName: string;
  scanStatus: string;
}

/**
 * The evidence, on the screen where the decision is made.
 *
 * FR-TVR-005 asks a reviewer to affirmatively record that they checked the
 * identity document, the certificate and the introduction. The queue listed the
 * checklist and the applicant's typed details but never rendered the files at
 * all — so the only way to honour the checklist was to tick boxes about
 * documents that could not be seen, or to go and find them by hand.
 *
 * FR-FIL-003: every URL here is short-lived and fetched per file, on demand.
 * There is no permanent link to a teacher's identity document, so nothing on
 * this page can be copied out and shared.
 */
export function TeacherDocuments({
  documents,
  onRemoved,
}: {
  documents: readonly ReviewDocument[];
  /** Called after a file is destroyed, so the queue can drop it from view. */
  onRemoved?: (documentId: string) => void;
}) {
  const { t } = useI18n();

  if (documents.length === 0) {
    return (
      <div className="mb-4 rounded-lg border border-warning-600 bg-warning-50 p-3">
        <p className="text-sm font-medium text-warning-600">{t('admin.review.noDocuments')}</p>
      </div>
    );
  }

  /*
   * The introduction first, then the paperwork.
   *
   * It is the one piece that shows the applicant themselves, and the check that
   * the face matches the ID depends on watching it — so it leads rather than
   * sitting wherever upload order happened to put it.
   */
  const video = documents.filter((d) => d.type === 'intro_video');
  const papers = documents.filter((d) => d.type !== 'intro_video');

  return (
    <div className="mb-4">
      <h4 className="mb-2 text-sm font-semibold text-ink-900">{t('admin.review.documents')}</h4>

      {video.map((document) => (
        <div key={document.id} className="mb-3">
          <p className="mb-1 text-xs text-ink-600">
            {t(`teacher.documentType.${document.type}`)} · {document.fileName}
          </p>
          {document.scanStatus === 'clean' ? (
            <IntroVideo documentId={document.id} />
          ) : (
            <UnavailableNotice scanStatus={document.scanStatus} />
          )}
          <div className="mt-1 flex justify-end">
            <RemoveDocument document={document} onRemoved={onRemoved} />
          </div>
        </div>
      ))}

      <ul className="flex flex-col gap-2">
        {papers.map((document) => (
          <li
            key={document.id}
            className="flex items-center justify-between gap-3 rounded-lg border border-ink-300 p-2"
          >
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-ink-900">{document.fileName}</p>
              <p className="text-xs text-ink-600">{t(`teacher.documentType.${document.type}`)}</p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              {document.scanStatus === 'clean' ? (
                <OpenDocument documentId={document.id} />
              ) : (
                <UnavailableNotice scanStatus={document.scanStatus} />
              )}
              <RemoveDocument document={document} onRemoved={onRemoved} />
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * Removing a document — the one control here that destroys something.
 *
 * Two steps on purpose. The first click asks for a reason, and the reason is
 * required: this deletes the file and its stored asset, the audit entry is all
 * that survives, and "removed by an admin" with no cause is a record nobody can
 * act on later. It is also the difference between a misclick and a decision.
 *
 * The applicant is told which file went and why, so they send the right one
 * rather than the same one again.
 */
function RemoveDocument({
  document,
  onRemoved,
}: {
  document: ReviewDocument;
  onRemoved?: (documentId: string) => void;
}) {
  const { t, language } = useI18n();
  const [asking, setAsking] = useState(false);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  const remove = async () => {
    setBusy(true);
    setFailed(false);
    try {
      await api(`/files/teacher-documents/${document.id}`, {
        method: 'DELETE',
        body: { reason: reason.trim() },
        language,
      });
      setAsking(false);
      onRemoved?.(document.id);
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  };

  if (!asking) {
    return (
      <button
        type="button"
        onClick={() => setAsking(true)}
        className="min-h-touch shrink-0 rounded-lg border border-danger-600 px-3 text-sm font-medium text-danger-600"
      >
        {t('admin.review.removeDocument')}
      </button>
    );
  }

  return (
    <div className="w-full rounded-lg border border-danger-600 bg-danger-50 p-2">
      <p className="text-xs font-medium text-danger-600">
        {t('admin.review.removeConfirm', { fileName: document.fileName })}
      </p>
      <input
        type="text"
        value={reason}
        onChange={(event) => setReason(event.target.value)}
        placeholder={t('admin.review.removeReason')}
        className="cc-field mt-2 w-full"
        aria-label={t('admin.review.removeReason')}
      />
      {failed && <p className="mt-1 text-xs text-danger-600">{t('errors.generic')}</p>}
      <div className="mt-2 flex gap-2">
        <button
          type="button"
          onClick={() => void remove()}
          // The floor the API enforces, so the button cannot promise what the
          // server will refuse.
          disabled={busy || reason.trim().length < 4}
          className="min-h-touch rounded-lg bg-danger-600 px-3 text-sm font-medium text-white disabled:opacity-50"
        >
          {busy ? t('common.saving') : t('admin.review.removeConfirmAction')}
        </button>
        <button
          type="button"
          onClick={() => {
            setAsking(false);
            setReason('');
          }}
          className="min-h-touch rounded-lg border border-ink-300 px-3 text-sm"
        >
          {t('common.cancel')}
        </button>
      </div>
    </div>
  );
}

/**
 * A file that has not come back clean is not opened here.
 *
 * FR-FIL-001 quarantines what the scanner rejects, and "the reviewer is staff"
 * is not a reason to hand them the one file the platform has already decided is
 * unsafe. A pending scan is simply not ready yet.
 */
function UnavailableNotice({ scanStatus }: { scanStatus: string }) {
  const { t } = useI18n();
  return (
    <span className="shrink-0 text-xs text-warning-600">
      {scanStatus === 'quarantined'
        ? t('teacher.documentQuarantined')
        : t('teacher.documentPendingScan')}
    </span>
  );
}

/**
 * Fetched on click, not on render.
 *
 * A queue of twenty applicants would otherwise mint a signed URL for every file
 * of every one of them on open — a burst of requests for documents nobody has
 * asked to see, each one a short-lived key to somebody's identity papers.
 */
function OpenDocument({ documentId }: { documentId: string }) {
  const { t, language } = useI18n();
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  const open = async () => {
    setBusy(true);
    setFailed(false);
    try {
      const result = await api<{ url: string }>(
        `/files/teacher-documents/${documentId}/download-url`,
        { language },
      );
      // `noopener` — the opened tab must not be able to reach back into this one.
      window.open(result.url, '_blank', 'noopener,noreferrer');
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  };

  return (
    <button
      type="button"
      onClick={() => void open()}
      disabled={busy}
      className="min-h-touch shrink-0 rounded-lg border border-brand-600 px-3 text-sm font-medium text-brand-700"
    >
      {busy ? t('common.loading') : failed ? t('errors.generic') : t('admin.review.openDocument')}
    </button>
  );
}

/** The introduction, played in place — the reviewer should not have to leave. */
function IntroVideo({ documentId }: { documentId: string }) {
  const { t, language } = useI18n();
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const result = await api<{ url: string }>(
          `/files/teacher-documents/${documentId}/download-url`,
          { language },
        );
        if (!cancelled) setUrl(result.url);
      } catch {
        if (!cancelled) setFailed(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [documentId, language]);

  if (failed) return <p className="text-xs text-warning-600">{t('errors.generic')}</p>;
  if (!url) return <div className="h-56 w-full animate-pulse rounded-lg bg-ink-100" />;

  return (
    <video
      src={url}
      controls
      preload="metadata"
      playsInline
      className="h-56 w-full rounded-lg bg-black"
      aria-label={t('admin.review.watchIntro')}
    />
  );
}
