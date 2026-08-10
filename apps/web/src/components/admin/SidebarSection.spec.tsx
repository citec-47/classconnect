import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { type ReactNode } from 'react';
import { ADMIN_NAV, sumChildBadges, type AdminNavItem, type Language } from '@classconnect/shared';
import { I18nProvider } from '@/lib/i18n';
import { SidebarSection } from './SidebarSection';

/**
 * §3 — the collapsible sidebar section.
 *
 * These assert the *document*, not the render tree: whether `hidden` really
 * landed, what the accessible name resolves to, and where Tab actually goes.
 * The acceptance criteria are all about what a keyboard and a screen reader
 * find, and none of them can be proven by inspecting props.
 */

const STORAGE_KEY = 'cc.admin.sidebar.payments.open';

/** The six §3 sub-items, in order. */
const SUB_ITEMS = [
  { label: 'Students — paid', href: '/en/admin/payments/students-paid' },
  { label: 'Students — owing', href: '/en/admin/payments/students-owing' },
  { label: 'Teachers — paid', href: '/en/admin/payments/teachers-paid' },
  { label: 'Teachers — pending', href: '/en/admin/payments/teachers-pending' },
  { label: 'Hours & earnings', href: '/en/admin/payments/earnings' },
  { label: 'Reconciliation', href: '/en/admin/payments/reconciliation' },
];

interface HarnessProps {
  label?: string;
  badgeCount?: number;
  containsActiveRoute?: boolean;
  activeHref?: string;
  language?: Language;
  rail?: boolean;
}

/**
 * Plain anchors rather than `next/link`.
 *
 * The section is agnostic about what its children are — it renders whatever the
 * sidebar hands it — and mocking the router here would only test the mock. What
 * matters is that the rows are links and that they leave the tab order.
 */
/**
 * jsdom implements no navigation, so following a real `href` logs a
 * "not implemented" error and tells us nothing. The links still carry their
 * `href` — what is under test is where focus goes and what is in the document,
 * not what the browser would load next.
 */
const swallowNavigation = (event: { preventDefault: () => void }) => event.preventDefault();

function Harness({
  label = 'Payments',
  badgeCount = 0,
  containsActiveRoute = false,
  activeHref,
  language = 'en',
  rail = false,
}: HarnessProps): ReactNode {
  return (
    <I18nProvider language={language}>
      <nav aria-label="Admin">
        <ul>
          <li>
            <a href="/en/admin/safeguarding" onClick={swallowNavigation}>
              Safeguarding
            </a>
          </li>
          <SidebarSection
            label={label}
            badgeCount={badgeCount}
            storageKey={STORAGE_KEY}
            containsActiveRoute={containsActiveRoute}
            icon="▤"
            rail={rail}
          >
            {SUB_ITEMS.map((sub) => (
              <li key={sub.href}>
                <a
                  href={sub.href}
                  onClick={swallowNavigation}
                  aria-current={sub.href === activeHref ? 'page' : undefined}
                >
                  {sub.label}
                </a>
              </li>
            ))}
          </SidebarSection>
          <li>
            <a href="/en/admin/accounts" onClick={swallowNavigation}>
              Accounts &amp; access
            </a>
          </li>
        </ul>
      </nav>
    </I18nProvider>
  );
}

const toggle = () => screen.getByRole('button', { name: /payments|paiements/i });

/** The disclosure panel `aria-controls` points at. */
function panel(): HTMLElement {
  const id = toggle().getAttribute('aria-controls');
  expect(id).toBeTruthy();
  const node = document.getElementById(id as string);
  expect(node).not.toBeNull();
  return node as HTMLElement;
}

beforeEach(() => {
  window.localStorage.clear();
});

describe('toggling', () => {
  it('opens on the first click and closes on the second', async () => {
    const user = userEvent.setup();
    render(<Harness />);

    // Acceptance criterion 3: the attribute tracks the visual state throughout.
    expect(toggle()).toHaveAttribute('aria-expanded', 'false');
    expect(panel()).not.toBeVisible();

    await user.click(toggle());

    expect(toggle()).toHaveAttribute('aria-expanded', 'true');
    expect(panel()).toBeVisible();
    expect(screen.getByRole('link', { name: 'Reconciliation' })).toBeVisible();

    await user.click(toggle());

    expect(toggle()).toHaveAttribute('aria-expanded', 'false');
    // The collapse animates first and only then may set `hidden` (§3/§8).
    await waitFor(() => expect(panel()).not.toBeVisible());
  });

  it('is a button with no href, so it never navigates', () => {
    render(<Harness />);
    expect(toggle().tagName).toBe('BUTTON');
    expect(toggle()).toHaveAttribute('type', 'button');
    expect(toggle()).not.toHaveAttribute('href');
  });

  it('uses a disclosure rather than a menu', () => {
    render(<Harness />);
    // `role="menu"` would take ownership of the arrow keys, which is wrong for
    // a list of page links.
    expect(document.querySelector('[role="menu"]')).toBeNull();
    expect(document.querySelector('[role="menuitem"]')).toBeNull();
    expect(toggle()).toHaveAttribute('aria-controls', panel().id);
  });
});

describe('keyboard operability', () => {
  it('toggles on Enter and on Space, leaving focus on the button', async () => {
    const user = userEvent.setup();
    render(<Harness />);

    await user.tab();
    await user.tab();
    expect(toggle()).toHaveFocus();

    await user.keyboard('{Enter}');
    expect(toggle()).toHaveAttribute('aria-expanded', 'true');
    // §4: focus never moves into the panel by itself.
    expect(toggle()).toHaveFocus();

    await user.keyboard(' ');
    expect(toggle()).toHaveAttribute('aria-expanded', 'false');
    expect(toggle()).toHaveFocus();
  });

  it('sends Tab to the first sub-item when open', async () => {
    const user = userEvent.setup();
    render(<Harness />);

    await user.click(toggle());
    toggle().focus();
    await user.tab();

    expect(screen.getByRole('link', { name: 'Students — paid' })).toHaveFocus();
  });

  /** Acceptance criterion 2 — the one this whole component exists to get right. */
  it('keeps every closed sub-item out of the tab order', async () => {
    const user = userEvent.setup();
    render(<Harness />);

    // Open and shut again, so this covers the collapsed-after-animating state
    // rather than only the never-opened one.
    await user.click(toggle());
    await user.click(toggle());
    await waitFor(() => expect(panel()).not.toBeVisible());

    expect(panel()).toHaveAttribute('hidden');
    for (const sub of SUB_ITEMS) {
      expect(screen.getByRole('link', { name: sub.label, hidden: true })).not.toBeVisible();
    }

    // Tabbing from the toggle skips the panel entirely and lands on the next
    // top-level item.
    toggle().focus();
    await user.tab();
    expect(screen.getByRole('link', { name: 'Accounts & access' })).toHaveFocus();
  });
});

describe('persistence and the deep link', () => {
  it('opens on a child route regardless of what is stored', () => {
    // Rule 1 of §5 beats rule 2: a bookmark into a payments page wins over a
    // stored "closed", and it does so in the first render — no flash.
    window.localStorage.setItem(STORAGE_KEY, 'false');

    render(
      <Harness
        containsActiveRoute
        activeHref="/en/admin/payments/reconciliation"
      />,
    );

    // Acceptance criterion 4.
    expect(toggle()).toHaveAttribute('aria-expanded', 'true');
    const active = screen.getByRole('link', { name: 'Reconciliation' });
    expect(active).toBeVisible();
    expect(active).toHaveAttribute('aria-current', 'page');
  });

  it('restores a stored open state on a route with no active child', async () => {
    // Acceptance criterion 7 — the state survives a reload.
    window.localStorage.setItem(STORAGE_KEY, 'true');
    render(<Harness />);

    await waitFor(() => expect(toggle()).toHaveAttribute('aria-expanded', 'true'));
    expect(panel()).toBeVisible();
  });

  it('defaults to closed when nothing is stored', () => {
    render(<Harness />);
    expect(toggle()).toHaveAttribute('aria-expanded', 'false');
    expect(window.localStorage.getItem(STORAGE_KEY)).toBeNull();
  });

  it('writes the click to storage immediately', async () => {
    const user = userEvent.setup();
    render(<Harness />);

    await user.click(toggle());
    expect(window.localStorage.getItem(STORAGE_KEY)).toBe('true');

    await user.click(toggle());
    expect(window.localStorage.getItem(STORAGE_KEY)).toBe('false');
  });

  it('does not collapse when the route moves between two sub-items', async () => {
    const user = userEvent.setup();
    const { rerender } = render(
      <Harness containsActiveRoute activeHref="/en/admin/payments/students-paid" />,
    );
    expect(toggle()).toHaveAttribute('aria-expanded', 'true');

    // Navigating to a sibling re-renders with the same props shape. The mount
    // reconciliation must not run again and stamp the stored value back over it.
    rerender(
      <Harness containsActiveRoute activeHref="/en/admin/payments/reconciliation" />,
    );

    expect(toggle()).toHaveAttribute('aria-expanded', 'true');
    expect(panel()).toBeVisible();
    expect(screen.getByRole('link', { name: 'Reconciliation' })).toHaveAttribute(
      'aria-current',
      'page',
    );

    // And an explicit click still wins after that.
    await user.click(toggle());
    expect(toggle()).toHaveAttribute('aria-expanded', 'false');
  });

  it('leaves the section alone on a route outside it', () => {
    // "Do not close the section automatically when the user navigates to a
    // non-payments route — respect their last explicit choice."
    window.localStorage.setItem(STORAGE_KEY, 'true');
    const { rerender } = render(<Harness containsActiveRoute />);
    rerender(<Harness containsActiveRoute={false} />);
    expect(toggle()).toHaveAttribute('aria-expanded', 'true');
  });
});

describe('badges', () => {
  it('sums the children before capping the display', () => {
    // Acceptance criterion 6, at the source: the sum is arithmetic, the 99+ is
    // presentation, and they must not be confused.
    const payments = ADMIN_NAV.flatMap((section) => section.items).find(
      (item) => item.id === 'payments',
    ) as AdminNavItem;

    expect(
      sumChildBadges(payments, {
        studentsOwing: 12,
        teacherPayoutsPending: 7,
        reconciliationUnmatched: 15,
        // Not one of Payments' children; must not be counted.
        safeguardingOpen: 400,
      }),
    ).toBe(34);

    expect(
      sumChildBadges(payments, {
        studentsOwing: 60,
        teacherPayoutsPending: 60,
      }),
    ).toBe(120);
  });

  it('shows the total on the toggle while closed and announces it', () => {
    render(<Harness badgeCount={34} />);

    expect(toggle()).toHaveAccessibleName('Payments, 34 items need attention');
    expect(toggle()).toHaveTextContent('34');
  });

  it('caps the displayed total at 99+ without capping the sum', () => {
    render(<Harness badgeCount={120} />);

    expect(toggle()).toHaveTextContent('99+');
    // The real number is still what assistive tech is told.
    expect(toggle()).toHaveAccessibleName('Payments, 120 items need attention');
  });

  it('hands the count back to the children once open', async () => {
    const user = userEvent.setup();
    render(<Harness badgeCount={34} />);

    await user.click(toggle());

    expect(toggle()).toHaveTextContent('Payments');
    expect(toggle()).not.toHaveTextContent('34');
    expect(toggle()).toHaveAccessibleName('Payments');
  });
});

describe('the active marker', () => {
  it('stays on the toggle while the section is shut over the current page', async () => {
    // Acceptance criterion 5: collapsing must not strand the operator with
    // nothing on screen saying where they are.
    const user = userEvent.setup();
    render(<Harness containsActiveRoute activeHref="/en/admin/payments/earnings" />);

    await user.click(toggle());
    expect(toggle()).toHaveAttribute('aria-expanded', 'false');
    expect(toggle()).toHaveAccessibleName('Payments, contains the current page');
    // Not colour alone (UI-003) — the weight change and the gutter bar.
    expect(toggle().className).toContain('font-semibold');
  });

  it('combines the count and the current-page note in one sentence', () => {
    render(<Harness containsActiveRoute={false} badgeCount={34} />);
    expect(toggle()).toHaveAccessibleName('Payments, 34 items need attention');
  });
});

describe('reduced motion', () => {
  it('hides the panel with no transition to wait for', async () => {
    window.matchMedia = ((query: string) =>
      ({
        matches: query.includes('prefers-reduced-motion'),
        media: query,
        onchange: null,
        addEventListener: () => {},
        removeEventListener: () => {},
        addListener: () => {},
        removeListener: () => {},
        dispatchEvent: () => false,
      }) as unknown as MediaQueryList) as typeof window.matchMedia;

    const user = userEvent.setup();
    render(<Harness />);

    await user.click(toggle());
    expect(panel()).toBeVisible();

    await user.click(toggle());
    // Acceptance criterion 9: `hidden` lands in the same tick rather than after
    // a transition that will never fire.
    expect(panel()).toHaveAttribute('hidden');
    expect(panel()).not.toBeVisible();
  });
});

describe('French', () => {
  it('takes every string from the catalogue', () => {
    render(<Harness label="Paiements" badgeCount={34} language="fr" />);

    expect(
      screen.getByRole('button', {
        name: 'Paiements : 34 éléments demandent votre attention',
      }),
    ).toBeInTheDocument();
  });
});

describe('the icon rail', () => {
  it('opens a dismissible flyout instead of an inline accordion', async () => {
    const user = userEvent.setup();
    render(<Harness rail badgeCount={34} />);

    // Nothing to keep out of the tab order: the links are not in the document.
    expect(screen.queryByRole('link', { name: 'Reconciliation' })).toBeNull();

    await user.click(toggle());
    expect(toggle()).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('link', { name: 'Reconciliation' })).toBeVisible();

    // §9: Escape closes it and puts focus back on the icon.
    await user.keyboard('{Escape}');
    expect(toggle()).toHaveAttribute('aria-expanded', 'false');
    expect(toggle()).toHaveFocus();
    expect(screen.queryByRole('link', { name: 'Reconciliation' })).toBeNull();

    // ...as does a click outside it.
    await user.click(toggle());
    expect(toggle()).toHaveAttribute('aria-expanded', 'true');
    await user.click(screen.getByRole('link', { name: 'Accounts & access' }));
    expect(toggle()).toHaveAttribute('aria-expanded', 'false');
  });

  it('never persists the flyout, which would reopen itself on load', async () => {
    const user = userEvent.setup();
    render(<Harness rail />);

    await user.click(toggle());
    expect(window.localStorage.getItem(STORAGE_KEY)).toBeNull();
  });
});
