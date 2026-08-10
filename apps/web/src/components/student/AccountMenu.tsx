'use client';

import { useEffect, useId, useRef, useState } from 'react';
import Link from 'next/link';
import type { Language } from '@classconnect/shared';
import { useI18n } from '@/lib/i18n';
import { useAuth } from '@/lib/auth-context';
import { LanguageSwitcher } from '@/components/LanguageSwitcher';
import { AvatarIcon } from './icons';

/**
 * §4 — profile, language, notifications and help, behind the avatar.
 *
 * "They are not destinations." Four settings screens in the tab bar would spend
 * most of UI-005's five-item budget on things a learner touches once a term,
 * and leave no room for the ones they touch daily.
 *
 * A disclosure rather than `role="menu"`, for the same reason as the admin
 * sidebar: these are links to pages, and a menu role would take ownership of the
 * arrow keys and collapse Tab to a single stop.
 */
export function AccountMenu({ language }: { language: Language }) {
  const { t } = useI18n();
  const { user, signOut } = useAuth();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelId = useId();

  useEffect(() => {
    if (!open) return;

    const dismiss = (returnFocus: boolean) => {
      setOpen(false);
      if (returnFocus) buttonRef.current?.focus();
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') dismiss(true);
    };
    const onPointerDown = (event: Event) => {
      const root = rootRef.current;
      if (!root) return;
      if (event.target instanceof Node && root.contains(event.target)) return;
      // Focus returns only if it was inside the panel; the learner has just
      // tapped something else deliberately.
      dismiss(root.contains(document.activeElement));
    };

    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('pointerdown', onPointerDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('pointerdown', onPointerDown);
    };
  }, [open]);

  const base = `/${language}/student`;

  const itemClass = [
    'flex min-h-touch items-center rounded-lg px-3 text-sm font-medium text-ink-900',
    'hover:bg-ink-100',
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600',
    'focus-visible:ring-offset-1 focus-visible:ring-offset-white',
  ].join(' ');

  return (
    <div ref={rootRef} className="relative">
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen((current) => !current)}
        aria-expanded={open}
        aria-controls={panelId}
        aria-label={t('student.account.open')}
        className={[
          'flex min-h-touch min-w-touch items-center justify-center rounded-full',
          'text-ink-900 hover:bg-ink-100',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600',
          'focus-visible:ring-offset-1 focus-visible:ring-offset-white',
        ].join(' ')}
      >
        <AvatarIcon />
      </button>

      {open && (
        <div
          id={panelId}
          className={[
            'absolute right-0 top-full z-40 mt-1 w-64 rounded-xl border border-ink-300',
            'bg-white p-2 shadow-lg',
          ].join(' ')}
        >
          {/*
           * FR-SAF-007: the learner's own name is fine here — this is their own
           * device and their own account. Nothing else identifying goes in.
           */}
          {user && (
            <p className="truncate px-3 py-2 text-sm font-semibold text-ink-900">
              {user.fullName}
            </p>
          )}

          <ul className="flex flex-col">
            {/*
             * Past lessons and Fees are real screens without a tab. The nav is
             * at its ceiling, and neither earns a slot: past lessons is reached
             * from Classes and from any subject, and fees is something a learner
             * checks when they are wondering, not daily.
             */}
            <li>
              <Link href={`${base}/attendance`} className={itemClass}>
                {t('student.attendance.title')}
              </Link>
            </li>
            <li>
              <Link href={`${base}/lessons`} className={itemClass}>
                {t('student.lessons.title')}
              </Link>
            </li>
            <li>
              <Link href={`${base}/fees`} className={itemClass}>
                {t('student.fees.title')}
              </Link>
            </li>
            <li>
              <Link href={`${base}/profile`} className={itemClass}>
                {t('student.account.profile')}
              </Link>
            </li>
            <li>
              <Link href={`${base}/notifications`} className={itemClass}>
                {t('student.account.notifications')}
              </Link>
            </li>
            <li>
              <Link href={`${base}/help`} className={itemClass}>
                {t('student.account.help')}
              </Link>
            </li>
            <li>
              {/* UI-006: the guided tour is re-runnable, not a one-off. */}
              <Link href={`${base}?tour=1`} className={itemClass}>
                {t('student.account.tour')}
              </Link>
            </li>
          </ul>

          {/* UI-004: switchable from any screen, and persisted to the profile. */}
          <div className="mt-2 border-t border-ink-300 px-3 pt-3">
            <LanguageSwitcher current={language} />
          </div>

          <button
            type="button"
            onClick={() => void signOut()}
            className={`${itemClass} mt-1 w-full text-left`}
          >
            {t('common.signOut')}
          </button>
        </div>
      )}
    </div>
  );
}
