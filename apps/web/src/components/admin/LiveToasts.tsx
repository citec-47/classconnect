'use client';

import Link from 'next/link';
import { useI18n } from '@/lib/i18n';
import { useAdminShell } from '@/lib/admin-badges';

/**
 * "The admin should always be notified when a particular class is going on."
 *
 * Rendered by the admin shell, so it reaches an operator wherever they are in
 * the dashboard rather than only on the live board.
 *
 * What it says, and what it deliberately does not:
 *
 *   says     — the teacher's name, the actual subject, and whether the lesson
 *              is private. Those are the three the brief asks for.
 *   omits    — the learners' names. A toast can sit unattended on a screen in a
 *              shared office; naming a child in a one-to-one lesson there is a
 *              disclosure nobody chose. The names are one click away, on a
 *              screen whose opening is audited (FR-RBA-004).
 *
 * `role="status"` rather than `alert`: a lesson starting is information, and
 * `alert` would interrupt a screen reader mid-sentence every time one did
 * (UI-003).
 */
export function LiveToasts({ language }: { language: string }) {
  const { t } = useI18n();
  const { liveAnnouncements, dismissAnnouncement } = useAdminShell();

  if (liveAnnouncements.length === 0) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="pointer-events-none fixed bottom-4 right-4 z-50 flex w-full max-w-sm flex-col gap-2"
    >
      {liveAnnouncements.map((announcement) => (
        <div
          key={announcement.sessionId}
          className={[
            'pointer-events-auto rounded-lg border bg-white p-3 shadow-lg',
            announcement.isPrivate ? 'border-brand-600 border-l-4' : 'border-ink-300',
          ].join(' ')}
        >
          <div className="flex items-start justify-between gap-2">
            <p className="flex items-center gap-1.5 text-xs font-semibold text-success-600">
              <span aria-hidden="true" className="h-2 w-2 rounded-full bg-success-600" />
              {announcement.isPrivate ? t('live.private') : t('live.group')}
            </p>
            <button
              type="button"
              onClick={() => dismissAnnouncement(announcement.sessionId)}
              aria-label={t('common.close')}
              className="-mt-1 -mr-1 h-6 w-6 rounded text-ink-600 hover:bg-ink-100"
            >
              <span aria-hidden="true">×</span>
            </button>
          </div>

          <p className="mt-1 text-sm text-ink-900">
            {t('live.newClassStarted', {
              teacher: announcement.teacherName,
              kind: announcement.isPrivate ? t('live.private') : t('live.group'),
              subject:
                language === 'fr' ? announcement.subject.nameFr : announcement.subject.nameEn,
            })}
          </p>

          {/* FR-SAF-004: whether a lesson with a minor is being recorded is
              exactly what an admin glancing at this needs to know. */}
          {announcement.isPrivate && !announcement.recordingEnabled && (
            <p className="mt-1 text-xs font-medium text-warning-600">
              {t('live.recordingOff')}
            </p>
          )}

          <Link
            href={`/${language}/admin/live`}
            onClick={() => dismissAnnouncement(announcement.sessionId)}
            className="mt-2 inline-block text-xs text-brand-700 underline"
          >
            {t('live.attending')}
          </Link>
        </div>
      ))}
    </div>
  );
}
