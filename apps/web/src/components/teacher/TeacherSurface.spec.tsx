import { render, screen, within } from '@testing-library/react';
import { homeFor } from '@/lib/home-for';
import { I18nProvider } from '@/lib/i18n';
import { TeacherSidebar } from './Sidebar';
import type { Role } from '@classconnect/shared';

/**
 * Where a teacher lands, and what is open when they get there.
 *
 * Both halves of a reported bug: signing in as a teacher did not lead to the
 * teacher dashboard, and it was not obvious that an unapproved teacher should
 * still see the surface with only Verification usable.
 *
 * The redirect half is a pure function and is tested as one. The gating half is
 * asserted against the rendered sidebar, which is the part a pure-function test
 * cannot reach — `isTeacherNavItemUsable` agreeing with itself proves nothing
 * about what a teacher can actually click.
 */

let pathname = '/en/teacher';
jest.mock('next/navigation', () => ({
  usePathname: () => pathname,
}));

/** The signed-in user and the approval status, both swapped per test. */
let roles: Role[] = ['teacher'];
let approval: { status: string | null; approved: boolean; loading: boolean } = {
  status: 'approved',
  approved: true,
  loading: false,
};

jest.mock('@/lib/auth-context', () => ({
  useAuth: () => ({ user: { id: 't1', fullName: 'Test Teacher', roles }, loading: false }),
}));

jest.mock('@/lib/use-teacher-approval', () => ({
  useTeacherApproval: () => approval,
}));

beforeEach(() => {
  pathname = '/en/teacher';
  roles = ['teacher'];
  approval = { status: 'approved', approved: true, loading: false };
});

function renderSidebar(language: 'en' | 'fr' = 'en') {
  return render(
    <I18nProvider language={language}>
      <TeacherSidebar language={language} />
    </I18nProvider>,
  );
}

const linkNames = () =>
  within(screen.getByRole('navigation'))
    .getAllByRole('link')
    .map((link) => link.textContent?.trim());

describe('where a signed-in person lands', () => {
  it('sends a teacher to the teacher dashboard, not the public page', () => {
    /*
     * The reported bug. The register page pushed `/${language}` regardless of
     * role, so a teacher who signed up was authenticated and then dropped on a
     * page headed "Create a parent account".
     */
    expect(homeFor(['teacher'], 'en')).toBe('/en/teacher');
    expect(homeFor(['teacher'], 'fr')).toBe('/fr/teacher');
    expect(homeFor(['teacher'], 'en')).not.toBe('/en');
  });

  it('sends a teacher to their dashboard whether or not they are approved', () => {
    // Approval is not a role, so it cannot change the destination — the dashboard
    // is what explains an unapproved teacher's position to them.
    expect(homeFor(['teacher'], 'en')).toBe('/en/teacher');
  });

  it('prefers the staff surface for someone holding both', () => {
    // A super admin who is also a parent signed in to be an admin.
    expect(homeFor(['parent', 'super_admin'], 'en')).toBe('/en/admin');
    expect(homeFor(['admin_ops'], 'en')).toBe('/en/admin');
    expect(homeFor(['support_agent'], 'en')).toBe('/en/admin');
  });

  it('routes every other role to its own surface', () => {
    expect(homeFor(['parent'], 'en')).toBe('/en/children');
    expect(homeFor(['student'], 'en')).toBe('/en/student');
    expect(homeFor(['adult_learner'], 'en')).toBe('/en/student');
  });

  it('falls back to the landing page for a session with no usable role', () => {
    expect(homeFor([], 'en')).toBe('/en');
  });
});

describe('a new teacher — only Verification is active', () => {
  beforeEach(() => {
    approval = { status: 'submitted', approved: false, loading: false };
  });

  it('leaves exactly the overview and Verification clickable', () => {
    renderSidebar();
    /*
     * FR-TVR-005: nothing that touches a class, a learner or a payout opens before
     * an Admin has approved the application. These two are the exceptions, and
     * Verification is the only one with anything to do on it.
     */
    expect(linkNames()).toEqual(['Overview', 'Verification']);
  });

  it('still shows the locked destinations, so the wait is legible', () => {
    renderSidebar();
    /*
     * Rendered, not hidden. A teacher who can see Lessons and Exams coming
     * understands the wait; one shown a two-item sidebar concludes the platform is
     * empty.
     */
    expect(screen.getByText('Lessons')).toBeInTheDocument();
    expect(screen.getByText('Exams')).toBeInTheDocument();
    expect(screen.getByText('Go live')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Lessons' })).toBeNull();
  });

  it('says "locked" rather than "soon", because the two mean different things', () => {
    renderSidebar();
    // "Soon" is on us and needs no action. "Locked" is waiting on their own
    // verification and tells them where to go.
    expect(screen.getAllByText('Locked').length).toBeGreaterThan(0);
    expect(screen.queryByText('Soon')).toBeNull();
  });
});

describe('an approved teacher — everything is active', () => {
  it('makes every destination on the surface clickable', () => {
    renderSidebar();
    expect(linkNames()).toEqual([
      'Overview',
      'Verification',
      'Classes',
      'Timetable',
      'Lessons',
      'Groups',
      'Go live',
      'My live classes',
      'Exams',
      'Report sheets',
      'Earnings',
      'Messages',
      'My profile',
    ]);
  });

  it('locks nothing once approved', () => {
    renderSidebar();
    expect(screen.queryByText('Locked')).toBeNull();
    expect(screen.queryByText('Soon')).toBeNull();
  });

  it('renders every destination in French with no key left showing', () => {
    renderSidebar('fr');
    const names = linkNames();
    expect(names).toHaveLength(13);
    // A missing translation renders as the key itself, which always contains a dot.
    expect(names.every((name) => name && !name.includes('.'))).toBe(true);
    expect(names).toContain('Emploi du temps');
    expect(names).toContain('Bulletins');
  });
});

describe('while the approval status is still in flight', () => {
  it('locks the teaching screens rather than flashing them open', () => {
    /*
     * The honest answer during the request is "not yet". An optimistic open would
     * flash every teaching link live for a moment on each load, and would give an
     * unapproved teacher one clickable instant on a screen they cannot use.
     */
    approval = { status: null, approved: false, loading: true };
    renderSidebar();
    expect(linkNames()).toEqual(['Overview', 'Verification']);
  });
});
