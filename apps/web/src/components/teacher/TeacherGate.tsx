'use client';

import Link from 'next/link';
import type { ReactNode } from 'react';
import { useI18n } from '@/lib/i18n';
import { useTeacherApproval } from '@/lib/use-teacher-approval';
import { PageHeader } from '@/components/admin/ui';

/**
 * Closes a teaching screen until an Admin has approved the application.
 *
 * FR-TVR-005 puts a verified teacher in front of children, so every screen that
 * touches a class, a learner or a payout is shut until then. The sidebar already
 * renders those destinations locked and unlinked — but hiding a link is not access
 * control, and it is not the whole job either: a teacher who types the URL, or
 * follows one from an old bookmark or an email, reaches the screen anyway.
 *
 * Without this they got the screen, which immediately asked the API for something
 * their permissions do not cover, and rendered the 403 as a generic failure. The
 * platform looked broken at exactly the moment a new teacher is deciding whether
 * to trust it, and the message they needed — *you are approved for nothing yet,
 * here is the form* — was the one thing not on screen.
 *
 * The server-side check is unchanged and remains the real control: every endpoint
 * behind these screens enforces its own permission (FR-RBA-002). This decides what
 * is *shown*, and it says the true reason.
 */
export function TeacherGate({
  /** Message key for the screen's own title, so the heading is right while closed. */
  titleKey,
  children,
}: {
  titleKey: string;
  children: ReactNode;
}) {
  const { t, language } = useI18n();
  const { approved, status, loading } = useTeacherApproval(language);

  /*
   * Nothing is rendered while the answer is outstanding.
   *
   * Not the children, and not the locked notice. Showing the screen optimistically
   * would fire its API calls — the ones that 403 — before we know whether it is
   * open, and showing the notice first would flash "locked" at an approved teacher
   * on every navigation.
   */
  if (loading) {
    return (
      <>
        <PageHeader title={t(titleKey)} />
        <div className="h-32 animate-pulse rounded-xl bg-ink-100" />
      </>
    );
  }

  if (!approved) {
    return (
      <>
        <PageHeader title={t(titleKey)} description={t('teacher.locked.description')} />

        <div className="rounded-xl border border-brand-600 bg-brand-50 p-4">
          <h2 className="font-display text-lg font-semibold text-brand-700">
            {t('teacher.locked.title')}
          </h2>
          {/*
           * The status, not a generic "pending".
           *
           * Four situations a teacher would act on differently — finish the form,
           * wait, correct something and resend, or accept a refusal — and telling
           * them which is the whole value of this panel.
           */}
          <p className="mt-1 max-w-prose text-sm text-ink-900">
            {t(`teacher.locked.status.${status ?? 'draft'}`)}
          </p>
          <Link
            href={`/${language}/teacher/verification`}
            className="cc-btn-primary mt-3 inline-flex"
          >
            {t('teacher.locked.action')}
          </Link>
        </div>
      </>
    );
  }

  return <>{children}</>;
}
