import { fireEvent, render, screen, within } from '@testing-library/react';
import { resolveLevelConfig, type LearnerLevel } from '@classconnect/shared';
import { I18nProvider } from '@/lib/i18n';
import { StudentProvider, type LearnerProfile } from '@/lib/student-context';
import { TabBar } from './TabBar';
import { FrozenNotice } from './FrozenNotice';

/**
 * §10 acceptance criteria 1, 2, 9 and 12, at the surface.
 *
 * The level table itself is proven in `apps/api/src/student-levels.spec.ts`;
 * these assert that the rendered surface actually follows it, which is the half
 * a pure-function test cannot reach.
 */

let pathname = '/en/student';
jest.mock('next/navigation', () => ({
  usePathname: () => pathname,
  notFound: () => {
    throw new Error('notFound');
  },
}));

beforeEach(() => {
  pathname = '/en/student';
});

function learner(level: LearnerLevel, over: Partial<LearnerProfile> = {}): LearnerProfile {
  return {
    id: 'l1',
    displayName: 'Ariane',
    level,
    targetExamDate: null,
    freeze: { active: false },
    ...over,
  };
}

function renderTabs(level: LearnerLevel, language: 'en' | 'fr' = 'en') {
  return render(
    <I18nProvider language={language}>
      <TabBar language={language} config={resolveLevelConfig(level)} />
    </I18nProvider>,
  );
}

const tabNames = () =>
  within(screen.getByRole('navigation'))
    .getAllByRole('link')
    .map((link) => link.textContent?.trim());

describe('§10 criterion 1 — the destination count', () => {
  /*
   * The bar shows `MAX_BOTTOM_BAR_TABS`; the rest are behind More.
   *
   * This asserted Home, Classes, Work, Progress,
   * which was the destination set before Subjects and My class videos existed.
   * Both are real destinations — Subjects is where a learner sees the subjects
   * they offer — so the list was right and the expectation was the stale half.
   * What has not changed, and is what this test is actually for: Primary does
   * not get Practice or Exams.
   */
  it('fills the Primary bar and offers neither Practice nor Exams', () => {
    renderTabs({ key: 'primary' });
    expect(tabNames()).toEqual(['Home', 'Subjects', 'Classes', 'Work']);
    expect(screen.queryByRole('link', { name: 'Practice' })).toBeNull();
    expect(screen.queryByRole('link', { name: 'Exams' })).toBeNull();
  });

  it('shows the extra student destinations through the overflow control', () => {
    for (const key of ['secondary', 'lower_sixth', 'upper_sixth', 'adult'] as const) {
      const { unmount } = renderTabs({ key });
      const overflow = screen.getByRole('button', { name: /more/i });
      expect(overflow).toBeInTheDocument();
      fireEvent.click(overflow);
      expect(screen.getByRole('menuitem', { name: 'Exams' })).toBeInTheDocument();
      expect(screen.getByRole('menuitem', { name: 'Messages' })).toBeInTheDocument();
      expect(screen.getByRole('menuitem', { name: 'Practice' })).toBeInTheDocument();
      unmount();
    }
  });
});

describe('§10 criterion 2 — a level change re-renders the surface', () => {
  it('adds the Practice destination when a learner leaves Primary', () => {
    const { rerender } = render(
      <I18nProvider language="en">
        <TabBar language="en" config={resolveLevelConfig({ key: 'primary' })} />
      </I18nProvider>,
    );
    expect(tabNames()).toHaveLength(4);

    // The only thing that changed is the level on the profile.
    rerender(
      <I18nProvider language="en">
        <TabBar language="en" config={resolveLevelConfig({ key: 'secondary' })} />
      </I18nProvider>,
    );
    const overflow = screen.getByRole('button', { name: /more/i });
    expect(overflow).toBeInTheDocument();
    fireEvent.click(overflow);
    expect(screen.getByRole('menuitem', { name: 'Exams' })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: 'Messages' })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: 'Practice' })).toBeInTheDocument();
  });
});

describe('the active destination', () => {
  it('marks the current one and only the current one', () => {
    pathname = '/en/student/work';
    renderTabs({ key: 'secondary' });

    expect(screen.getByRole('link', { name: 'Work' })).toHaveAttribute('aria-current', 'page');
    // Home lives at the bare student path; a prefix match would light it up on
    // every screen.
    expect(screen.getByRole('link', { name: 'Home' })).not.toHaveAttribute('aria-current');
  });

  it('marks Home only at the root', () => {
    pathname = '/en/student';
    renderTabs({ key: 'secondary' });
    expect(screen.getByRole('link', { name: 'Home' })).toHaveAttribute('aria-current', 'page');
  });

  it('meets the 44px target floor on every destination', () => {
    renderTabs({ key: 'secondary' });
    for (const link of screen.getAllByRole('link')) {
      // UI-002. Tailwind's `min-h-touch`/`min-w-touch` are the 2.75rem tokens.
      expect(link.className).toContain('min-h-touch');
      expect(link.className).toContain('min-w-touch');
    }
  });
});

describe('§10 criterion 12 — French', () => {
  it('renders every destination from the catalogue, with no key left showing', () => {
    renderTabs({ key: 'upper_sixth' }, 'fr');
    const overflow = screen.getByRole('button', { name: /plus/i });
    expect(overflow).toBeInTheDocument();
    fireEvent.click(overflow);
    expect(screen.getByRole('menuitem', { name: 'Examens' })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: 'Messages' })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: 'Entraînement' })).toBeInTheDocument();
    expect(screen.getByRole('navigation').textContent).not.toMatch(/student\./);
  });
});

/**
 * §6 and §10 criterion 9.
 *
 * The server is the enforcement; these prove the client cannot undo it, and
 * that the minor variant has nothing to leak in the first place.
 */
describe('§6 — the frozen state', () => {
  const renderFrozen = (profile: LearnerProfile, language: 'en' | 'fr' = 'en') =>
    render(
      <I18nProvider language={language}>
        <StudentProvider language={language} initialLearner={profile}>
          <FrozenNotice />
        </StudentProvider>
      </I18nProvider>,
    );

  it('shows nothing at all when the account is not frozen', () => {
    const { container } = renderFrozen(learner({ key: 'primary' }));
    expect(container).toBeEmptyDOMElement();
  });

  it('tells a minor what is happening without naming a single figure', () => {
    const { container } = renderFrozen(
      learner({ key: 'primary' }, { freeze: { active: true, payer: 'guardian' } }),
    );

    const text = container.textContent ?? '';
    expect(text).toContain('A payment is needed');
    expect(text).toContain('parent or guardian');

    // Criterion 9: no monetary amount anywhere. Not the currency, not a figure,
    // not a due date.
    expect(text).not.toMatch(/FCFA|XAF/);
    expect(text).not.toMatch(/\d/);

    // §6: do not blame the learner.
    expect(text).not.toMatch(/suspend|non-payment|your fault|overdue/i);

    // §6: say what still works, and offer a person.
    expect(text).toContain('You can still use these');
    expect(screen.getByRole('link', { name: 'Get help' })).toBeInTheDocument();
    // No pay control on a minor's surface — FR-PAY-003.
    expect(screen.queryByRole('link', { name: /payment/i })).toBeNull();
  });

  it('gives an adult learner the full detail and a way to settle it', () => {
    renderFrozen(
      learner(
        { key: 'adult' },
        { freeze: { active: true, payer: 'self', amountOutstandingXaf: 25_000 } },
      ),
    );

    expect(screen.getByText(/25/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Make a payment' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Get help' })).toBeInTheDocument();
  });

  it('announces as a standing condition rather than interrupting every screen', () => {
    renderFrozen(learner({ key: 'primary' }, { freeze: { active: true, payer: 'guardian' } }));
    // `alert` would re-interrupt a screen reader on every navigation for days.
    expect(screen.getByRole('status')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('renders the minor notice in French with no key left showing', () => {
    const { container } = renderFrozen(
      learner({ key: 'primary' }, { freeze: { active: true, payer: 'guardian' } }),
      'fr',
    );
    expect(container.textContent).toContain('Un paiement est nécessaire');
    expect(container.textContent).not.toMatch(/student\./);
    expect(container.textContent).not.toMatch(/\d/);
  });
});
