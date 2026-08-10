'use client';

import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { formatBadge } from '@classconnect/shared';
import { useI18n } from '@/lib/i18n';

/**
 * §3 — a collapsible group of sidebar links.
 *
 * Generic on purpose: Payments is the first section to need this, and Approvals
 * and Operations are the next two. Nothing below names a route or a queue; the
 * caller passes the label, the summed badge and the children.
 *
 * It is a *disclosure*, not a menu. `role="menu"` would take ownership of the
 * arrow keys and turn Tab into a single stop, which is right for an application
 * menu bar and wrong for a list of page links — an operator who has learned to
 * Tab through the rail would find it behaves differently here for no reason.
 * A `<button>` plus a plain `<ul>` of links is the whole pattern.
 */

/** §8: 150–200ms. Long enough to read as movement, short enough not to wait on. */
const TRANSITION_MS = 180;

export interface SidebarSectionProps {
  /** Already translated. The component never sees a message key (NFR-LOC-002). */
  label: string;
  /**
   * The sum of the children's badges, uncapped.
   *
   * §3's rule that a badge counts work waiting means collapsing a section must
   * not make that work disappear — so when the section is closed the toggle
   * carries the total. Summing happens before the 99+ cap, so two children of
   * 60 read as `99+` rather than as `60`.
   */
  badgeCount?: number;
  /** Versioned `localStorage` key holding the open state. */
  storageKey: string;
  /**
   * True when the current route is one of this section's own children.
   *
   * Drives two things: the section opens on mount regardless of what is stored
   * (someone arriving from a bookmark or an email must land with the section
   * showing where they are), and the toggle keeps an active marker while closed
   * so collapsing never strands them with nothing indicating their position.
   */
  containsActiveRoute?: boolean;
  /** Glyph for the toggle row, matched to the sibling links. */
  icon?: ReactNode;
  /**
   * The sidebar is collapsed to the icon rail.
   *
   * An inline accordion has nowhere to open into at 3.5rem wide, so the children
   * move to a flyout beside the rail instead.
   */
  rail?: boolean;
  /** The `<li>` rows. */
  children: ReactNode;
}

function readStored(key: string): boolean {
  try {
    return window.localStorage.getItem(key) === 'true';
  } catch {
    // Safari in private mode, and any browser with site data blocked, throws on
    // access rather than returning null. A section that cannot remember its
    // state is a much smaller problem than a sidebar that will not render.
    return false;
  }
}

function writeStored(key: string, value: boolean): void {
  try {
    window.localStorage.setItem(key, String(value));
  } catch {
    /* see readStored */
  }
}

/**
 * §8: honoured in CSS *and* in JavaScript.
 *
 * The CSS half (`motion-reduce:`) stops the movement. The JavaScript half
 * matters because the collapse only becomes genuinely `hidden` when the
 * transition ends, and with the transition suppressed there is no
 * `transitionend` to wait for.
 */
function usePrefersReducedMotion(): boolean {
  // False on the server, so the markup is the same either way and the
  // preference is applied after mount like every other client-only fact.
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    const query = window.matchMedia('(prefers-reduced-motion: reduce)');
    const sync = () => setReduced(query.matches);
    sync();
    query.addEventListener('change', sync);
    return () => query.removeEventListener('change', sync);
  }, []);

  return reduced;
}

export function SidebarSection({
  label,
  badgeCount = 0,
  storageKey,
  containsActiveRoute = false,
  icon,
  rail = false,
  children,
}: SidebarSectionProps) {
  const { t } = useI18n();
  const generatedId = useId();
  const panelId = `${generatedId}-panel`;
  const buttonId = `${generatedId}-toggle`;

  const rootRef = useRef<HTMLLIElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const reducedMotion = usePrefersReducedMotion();

  /**
   * §5, rule 1, applied as the *initial* value rather than in an effect.
   *
   * The route is known during render on both the server and the client, so
   * deriving the deep-link case from it produces identical markup on both —
   * no hydration mismatch, and no frame where the section is shut over the page
   * the operator just opened. `localStorage` is the only part that has to wait
   * for mount, and it is read below.
   */
  const [open, setOpen] = useState(containsActiveRoute);

  /**
   * §5, rules 2 and 3 — and exactly once.
   *
   * Navigating between two child routes re-renders this component, and if the
   * stored value were re-applied on every render the section would collapse
   * under an operator who had opened it, or spring back open after they shut it.
   */
  const reconciled = useRef(false);
  useEffect(() => {
    if (reconciled.current) return;
    reconciled.current = true;
    // Rule 1 already decided this case; the stored value does not get a vote.
    if (containsActiveRoute) return;
    // Rule 3 falls out of this: nothing stored reads as `false`.
    setOpen(readStored(storageKey));
  }, [containsActiveRoute, storageKey]);

  /** Transient, and never persisted: a popover that reopened itself on load. */
  const [flyoutOpen, setFlyoutOpen] = useState(false);
  useEffect(() => {
    if (!rail) setFlyoutOpen(false);
  }, [rail]);

  const expandedNow = rail ? flyoutOpen : open;

  const toggle = useCallback(() => {
    if (rail) {
      setFlyoutOpen((current) => !current);
      return;
    }
    const next = !open;
    setOpen(next);
    // §5: "an explicit user click always wins and is written to storage
    // immediately" — not batched, not deferred to an effect.
    writeStored(storageKey, next);
  }, [rail, open, storageKey]);

  /**
   * `hidden` on the panel, and `grid-template-rows` for the movement.
   *
   * `visible` is the `hidden` attribute; `grown` is the row track. They are
   * separate because the two directions need opposite orders: opening has to
   * un-hide before it can animate, and closing has to finish animating before it
   * hides. §3 is unambiguous that the end state must be a real `hidden` —
   * zero-height-with-overflow leaves six focusable links behind an invisible box.
   */
  const [visible, setVisible] = useState(containsActiveRoute);
  const [grown, setGrown] = useState(containsActiveRoute);

  useEffect(() => {
    // The rail renders a flyout instead, mounted and unmounted outright.
    if (rail) return;

    if (open) {
      setVisible(true);
      if (reducedMotion) {
        setGrown(true);
        return;
      }
      /*
       * Two frames, not one. The panel goes from `display: none` to laid out in
       * this commit, so it has no previous computed style for the browser to
       * transition from; the second frame gives it one at 0fr.
       */
      let second = 0;
      const first = requestAnimationFrame(() => {
        second = requestAnimationFrame(() => setGrown(true));
      });
      return () => {
        cancelAnimationFrame(first);
        cancelAnimationFrame(second);
      };
    }

    setGrown(false);
    if (reducedMotion) {
      setVisible(false);
      return;
    }

    const node = panelRef.current;
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      setVisible(false);
    };
    const onTransitionEnd = (event: TransitionEvent) => {
      if (event.target === node && event.propertyName === 'grid-template-rows') finish();
    };
    node?.addEventListener('transitionend', onTransitionEnd);
    /*
     * `transitionend` does not fire in a backgrounded tab, or when an ancestor
     * is `display: none` (the rail's own breakpoint does this). The links have
     * to leave the tab order either way, so the timer is the floor, not an
     * optimisation.
     */
    const guard = setTimeout(finish, TRANSITION_MS + 120);
    return () => {
      node?.removeEventListener('transitionend', onTransitionEnd);
      clearTimeout(guard);
    };
  }, [open, rail, reducedMotion]);

  /**
   * §9: Escape and outside click dismiss the flyout.
   *
   * Escape always returns focus to the icon — the operator asked to come back.
   * An outside click only does so if focus was inside the panel, because they
   * have just clicked something else deliberately and yanking focus off it would
   * be a second action they did not ask for.
   */
  useEffect(() => {
    if (!rail || !flyoutOpen) return;

    const dismiss = (returnFocus: boolean) => {
      setFlyoutOpen(false);
      if (returnFocus) buttonRef.current?.focus();
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') dismiss(true);
    };
    const onPointerDown = (event: Event) => {
      const root = rootRef.current;
      if (!root) return;
      if (event.target instanceof Node && root.contains(event.target)) return;
      dismiss(root.contains(document.activeElement));
    };

    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('pointerdown', onPointerDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('pointerdown', onPointerDown);
    };
  }, [rail, flyoutOpen]);

  /**
   * §3 / UI-003: while the section is shut, the toggle carries what the children
   * would otherwise be saying — the summed count, and the fact that one of them
   * is the page currently open. In the rail the children are never inline, so
   * both markers stay put whatever the flyout is doing.
   */
  const showBadge = badgeCount > 0 && (rail || !open);
  const marksActive = containsActiveRoute && (rail || !open);

  /*
   * One whole sentence per case rather than fragments joined with a comma:
   * French puts a space before its colon and orders the clauses differently, and
   * a translator handed "{label}, {detail}" cannot fix either.
   */
  const accessibleName =
    showBadge && marksActive
      ? t('adminNav.sectionBadgeCurrentLabel', { label, count: badgeCount })
      : showBadge
        ? t('adminNav.sectionBadgeLabel', { label, count: badgeCount })
        : marksActive
          ? t('adminNav.sectionCurrentLabel', { label })
          : undefined;

  const panel = (
    <ul className="flex flex-col gap-0.5">{children}</ul>
  );

  return (
    <li ref={rootRef} className="relative">
      <button
        ref={buttonRef}
        id={buttonId}
        type="button"
        // §1: it toggles and nothing else. No `href`, so no navigation to
        // undo and no ambiguity about what a click did.
        onClick={toggle}
        aria-expanded={expandedNow}
        aria-controls={panelId}
        aria-label={accessibleName}
        title={rail ? label : undefined}
        className={[
          'relative flex min-h-touch w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-sm',
          'transition-colors',
          // §4: a focus ring that clears WCAG 2.1 AA at 3:1 against both the
          // white rail and the brand-50 active fill.
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600',
          'focus-visible:ring-offset-1 focus-visible:ring-offset-white',
          rail ? 'justify-center' : '',
          marksActive
            ? 'bg-white font-semibold text-brand-700 shadow-sm ring-1 ring-brand-100'
            : 'text-ink-900 hover:bg-ink-100',
        ].join(' ')}
      >
        {/* §6: never colour alone — a bar in the gutter as well as the fill. */}
        {marksActive && (
          <span
            aria-hidden="true"
            className="absolute left-0 top-1.5 bottom-1.5 w-[3px] rounded-r bg-brand-600"
          />
        )}

        <span aria-hidden="true" className="w-4 shrink-0 text-center text-ink-600">
          {icon}
        </span>

        {!rail && <span className="truncate text-left">{label}</span>}

        {showBadge && (
          <span
            aria-hidden="true"
            className={[
              'inline-flex min-w-[1.5rem] shrink-0 justify-center rounded-full px-1.5 py-0.5',
              'bg-ink-100 text-xs font-semibold tabular-nums text-ink-900',
              rail ? 'absolute right-1 top-1' : 'ml-auto',
            ].join(' ')}
          >
            {formatBadge(badgeCount)}
          </span>
        )}

        {!rail && (
          <span
            aria-hidden="true"
            className={[
              'shrink-0 text-ink-600 transition-transform ease-out',
              'motion-reduce:transition-none',
              showBadge ? 'ml-1' : 'ml-auto',
              open ? 'rotate-90' : '',
            ].join(' ')}
            style={{ transitionDuration: `${TRANSITION_MS}ms` }}
          >
            ▸
          </span>
        )}
      </button>

      {rail ? (
        /*
         * §9. Rendered only while open, so there is nothing to keep out of the
         * tab order — the links are not in the document at all when it is shut.
         */
        flyoutOpen && (
          <div
            id={panelId}
            ref={panelRef}
            aria-labelledby={buttonId}
            className={[
              'absolute left-full top-0 z-20 ml-1 w-56 rounded-md border border-ink-300',
              'bg-white p-1 shadow-lg',
            ].join(' ')}
          >
            {panel}
          </div>
        )
      ) : (
        <div
          id={panelId}
          ref={panelRef}
          // §3: the real thing. Tailwind's `grid` would otherwise beat the user
          // agent's `[hidden] { display: none }`, so the class goes too.
          hidden={!visible}
          className={
            visible
              ? [
                  'grid transition-[grid-template-rows] ease-out',
                  'motion-reduce:transition-none',
                  grown ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]',
                ].join(' ')
              : 'hidden'
          }
          style={{ transitionDuration: `${TRANSITION_MS}ms` }}
        >
          {/*
           * The overflow clip the 0fr→1fr technique needs. All of the spacing
           * lives in here rather than on the grid, so a collapsed section
           * contributes exactly nothing to the rail's height and the items
           * below it do not jump as it closes.
           */}
          <div className="overflow-hidden">
            <div className="pt-0.5">{panel}</div>
          </div>
        </div>
      )}
    </li>
  );
}
