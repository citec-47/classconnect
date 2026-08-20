'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { MAX_BOTTOM_BAR_TABS, type LevelConfig, type TabKey } from '@classconnect/shared';
import { useI18n } from '@/lib/i18n';
import {
  BookIcon,
  ChartIcon,
  ExamIcon,
  FileTextIcon,
  HomeIcon,
  MessageIcon,
  MoreIcon,
  PencilIcon,
  VideoIcon,
} from './icons';

/**
 * §4 — the primary navigation.
 *
 * A bottom bar on the phone, a left rail from the tablet breakpoint up. The same
 * `TabKey` list drives both, so there is one answer to "what are the
 * destinations".
 *
 * Bottom rather than top on mobile because the reference device is a shared
 * family Android phone held in one hand: the top of a 360px screen is the part
 * a thumb cannot reach.
 *
 * ## Why the two render differently now
 *
 * UI-005 capped the destinations at five, and the product owner raised it to
 * seven so Exams and Messages are one tap away rather than buried. The cap was
 * never arbitrary though — it was about a 360px bottom bar, where a seventh item
 * takes each target to 51px and each label to about five characters.
 *
 * So the constraint is honoured where it actually applies. The rail has vertical
 * room and shows everything; the bottom bar shows the first five and puts the
 * rest behind an overflow, which keeps every target above the UI-002 floor and
 * every label readable.
 */

/** The route each destination owns, relative to `/{lang}/student`. */
const TAB_PATHS: Record<TabKey, string> = {
  home: '',
  subjects: '/subjects',
  classes: '/classes',
  exams: '/exams',
  work: '/work',
  messages: '/messages',
  practice: '/practice',
  progress: '/progress',
  /* The screen already exists at /lessons; this gives it a way in. */
  videos: '/lessons',
};

const TAB_ICONS: Record<TabKey, (props: { className?: string }) => ReactNode> = {
  home: HomeIcon,
  subjects: BookIcon,
  classes: VideoIcon,
  exams: ExamIcon,
  work: PencilIcon,
  messages: MessageIcon,
  practice: FileTextIcon,
  progress: ChartIcon,
  videos: VideoIcon,
};

export function TabBar({ language, config }: { language: string; config: LevelConfig }) {
  const { t } = useI18n();
  const pathname = usePathname() ?? '';
  const root = `/${language}/student`;
  const [isDesktop, setIsDesktop] = useState<boolean | null>(() => {
    if (typeof window === 'undefined') return null;
    return window.matchMedia('(min-width: 768px)').matches;
  });

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const query = window.matchMedia('(min-width: 768px)');
    const update = () => setIsDesktop(query.matches);
    update();
    query.addEventListener?.('change', update);
    return () => query.removeEventListener?.('change', update);
  }, []);

  // NFR-USA-005: primary-level learners get larger type and larger targets. The
  // 44px floor (UI-002) is the minimum for everyone, not the value for anyone.
  const large = config.typeScale === 'large';

  const tabs = config.tabs;
  const overflows = tabs.length > MAX_BOTTOM_BAR_TABS;
  // One slot goes to the overflow control itself, so the bar shows four plus it.
  const onBar = overflows ? tabs.slice(0, MAX_BOTTOM_BAR_TABS - 1) : tabs;
  const inMenu = overflows ? tabs.slice(MAX_BOTTOM_BAR_TABS - 1) : [];

  const isActive = (tab: TabKey) => {
    const href = `${root}${TAB_PATHS[tab]}`;
    // Home lives at the bare student path, so a prefix match would light it up
    // on every screen.
    return tab === 'home' ? pathname === href : pathname.startsWith(href);
  };

  return (
    <nav
      aria-label={t('student.navLabel')}
      className={[
        /*
         * The bar stays white; the rail takes a tint.
         *
         * On a phone the bar sits under the thumb over scrolling content, and a
         * coloured strip there competes with the lesson the learner is reading.
         * The desktop rail is a different object — a persistent frame beside the
         * content rather than on top of it — so it can carry the brand without
         * fighting anything.
         *
         * `brand-50` is a tint, not the brand colour: a saturated rail would
         * pull the eye away from the screen the learner came for, and the active
         * item would have nothing left to distinguish it with.
         */
        'z-30 border-ink-300 bg-white',
        'fixed inset-x-0 bottom-0 border-t pb-[env(safe-area-inset-bottom)]',
        'md:sticky md:inset-x-auto md:bottom-auto md:top-0 md:h-screen md:w-56',
        'md:shrink-0 md:border-r md:border-t-0 md:pb-0',
        'md:border-brand-100 md:bg-gradient-to-b md:from-brand-50 md:to-white',
      ].join(' ')}
    >
      {isDesktop !== true && (
        <ul className="flex items-stretch justify-around md:hidden">
          {onBar.map((tab) => (
            <li key={tab} className="flex-1">
              <TabLink
                href={`${root}${TAB_PATHS[tab]}`}
                label={t(`student.tab.${tab}`)}
                Icon={TAB_ICONS[tab]}
                active={isActive(tab)}
                large={large}
              />
            </li>
          ))}
          {overflows && (
            <li className="flex-1">
              <OverflowMenu
                items={inMenu.map((tab) => ({
                  key: tab,
                  href: `${root}${TAB_PATHS[tab]}`,
                  label: t(`student.tab.${tab}`),
                  Icon: TAB_ICONS[tab],
                  active: isActive(tab),
                }))}
                label={t('student.navMore')}
                menuLabel={t('student.navMoreLabel')}
                large={large}
              />
            </li>
          )}
        </ul>
      )}

      {isDesktop === true && (
        <ul className="flex flex-col justify-start gap-1 p-3 md:flex">
          {tabs.map((tab) => (
            <li key={tab}>
              <TabLink
                href={`${root}${TAB_PATHS[tab]}`}
                label={t(`student.tab.${tab}`)}
                Icon={TAB_ICONS[tab]}
                active={isActive(tab)}
                large={large}
                rail
              />
            </li>
          ))}
        </ul>
      )}
    </nav>
  );
}

function TabLink({
  href,
  label,
  Icon,
  active,
  large,
  rail = false,
}: {
  href: string;
  label: string;
  Icon: (props: { className?: string }) => ReactNode;
  active: boolean;
  large: boolean;
  rail?: boolean;
}) {
  return (
    <Link
      href={href}
      aria-current={active ? 'page' : undefined}
      className={[
        // UI-002: 44 x 44 CSS px minimum, before any type scaling.
        'relative flex min-h-touch min-w-touch flex-col items-center justify-center',
        'gap-1 rounded-lg px-1 py-2 text-center transition-colors',
        rail ? 'flex-row justify-start gap-3 px-3 text-left' : '',
        // UI-003: a visible focus ring meeting AA against white.
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600',
        'focus-visible:ring-offset-1 focus-visible:ring-offset-white',
        large ? 'py-2.5' : '',
        /*
         * The active item gets a filled pill on the rail. Reading a colour
         * change alone across a vertical list is harder than it sounds — the
         * fill gives it an edge, and the indicator bar below still carries the
         * state for anyone who cannot use either (UI-003).
         */
        active
          ? rail
            ? 'bg-white text-brand-700 shadow-sm ring-1 ring-brand-100'
            : 'text-brand-700'
          : rail
            ? 'text-ink-700 hover:bg-white/70 hover:text-brand-700'
            : 'text-ink-600 hover:bg-ink-100 hover:text-ink-900',
      ].join(' ')}
    >
      {/*
       * UI-003: the active destination is not marked by colour alone. A bar
       * above it on the phone, beside it on the rail.
       */}
      {active && (
        <span
          aria-hidden="true"
          className={[
            'absolute rounded-full bg-brand-600',
            rail
              ? 'left-0 top-1/2 h-7 w-[3px] -translate-y-1/2'
              : 'left-1/2 top-0 h-[3px] w-8 -translate-x-1/2',
          ].join(' ')}
        />
      )}
      <Icon className={large ? 'h-7 w-7' : 'h-6 w-6'} />
      <span
        className={[
          'leading-tight',
          // NFR-LOC-002: "Entraînement" is twice the width of "Practice", so a
          // label wraps rather than being clipped.
          rail ? 'text-sm' : large ? 'text-[0.8125rem]' : 'text-[0.6875rem]',
          active ? 'font-semibold' : 'font-medium',
        ].join(' ')}
      >
        {label}
      </span>
    </Link>
  );
}

interface OverflowItem {
  key: string;
  href: string;
  label: string;
  Icon: (props: { className?: string }) => ReactNode;
  active: boolean;
}

/**
 * The phone overflow.
 *
 * A popover rather than a route, so reaching Messages from Classes is one tap
 * and a second tap, not a page load on a connection that charges for it.
 */
function OverflowMenu({
  items,
  label,
  menuLabel,
  large,
}: {
  items: OverflowItem[];
  label: string;
  menuLabel: string;
  large: boolean;
}) {
  const [open, setOpen] = useState(false);
  const container = useRef<HTMLDivElement>(null);
  const anyActive = items.some((item) => item.active);

  useEffect(() => {
    if (!open) return;

    const onPointerDown = (event: MouseEvent | TouchEvent) => {
      if (!container.current?.contains(event.target as Node)) setOpen(false);
    };
    // Escape closes it, because a popover a keyboard cannot dismiss is a trap.
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };

    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('touchstart', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('touchstart', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  return (
    <div ref={container} className="relative">
      <button
        type="button"
        onClick={() => setOpen((was) => !was)}
        aria-expanded={open}
        aria-haspopup="menu"
        className={[
          'relative flex min-h-touch min-w-touch w-full flex-col items-center justify-center',
          'gap-1 rounded-lg px-1 py-2 text-center transition-colors',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600',
          'focus-visible:ring-offset-1 focus-visible:ring-offset-white',
          large ? 'py-2.5' : '',
          anyActive ? 'text-brand-700' : 'text-ink-600 hover:bg-ink-100 hover:text-ink-900',
        ].join(' ')}
      >
        {anyActive && (
          <span
            aria-hidden="true"
            className="absolute left-1/2 top-0 h-[3px] w-8 -translate-x-1/2 rounded-full bg-brand-600"
          />
        )}
        <MoreIcon className={large ? 'h-7 w-7' : 'h-6 w-6'} />
        <span
          className={[
            'leading-tight',
            large ? 'text-[0.8125rem]' : 'text-[0.6875rem]',
            anyActive ? 'font-semibold' : 'font-medium',
          ].join(' ')}
        >
          {label}
        </span>
      </button>

      {open && (
        <div
          role="menu"
          aria-label={menuLabel}
          // Opens upward: it is anchored to the bottom of the screen.
          className={[
            'absolute bottom-full right-0 z-40 mb-2 w-52 overflow-hidden',
            'rounded-xl border border-ink-300 bg-white shadow-lg',
          ].join(' ')}
        >
          {items.map((item) => (
            <Link
              key={item.key}
              href={item.href}
              role="menuitem"
              onClick={() => setOpen(false)}
              aria-current={item.active ? 'page' : undefined}
              className={[
                'flex min-h-touch items-center gap-3 px-4 py-3 text-sm',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset',
                'focus-visible:ring-brand-600',
                item.active
                  ? 'bg-brand-50 font-semibold text-brand-700'
                  : 'font-medium text-ink-700 hover:bg-ink-100',
              ].join(' ')}
            >
              <item.Icon className="h-5 w-5" />
              {item.label}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
