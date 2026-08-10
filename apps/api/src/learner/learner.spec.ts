import { NotFoundException } from '@nestjs/common';
import { LearnerService } from './learner.service';
import { levelFromCatalogue, ROLE_PERMISSIONS, hasPermission } from '@classconnect/shared';
import type { PrismaService } from '../common/prisma.service';
import type { AuthenticatedUser } from '../rbac/decorators';

/**
 * §5, §6 and §7 of the student brief, at the only place they can be enforced.
 *
 * The brief is explicit that the prohibitions are server-side rather than
 * "hidden controls", so these test the payload the API would actually send — not
 * what a component would do with it.
 */

const learnerUser: AuthenticatedUser = {
  id: 'user-1',
  roles: ['student'],
  preferredLanguage: 'en',
};

/** Sixteen years old as of the `asOf` used throughout: a minor. */
const MINOR_DOB = new Date('2010-05-12T00:00:00Z');
const ADULT_DOB = new Date('1995-02-14T00:00:00Z');

interface FakeState {
  learner: Record<string, unknown> | null;
  freeze: Record<string, unknown> | null;
  session: Record<string, unknown> | null;
  instalments: Array<{ amountXaf: bigint }>;
}

function serviceWith(state: Partial<FakeState>): LearnerService {
  const full: FakeState = {
    learner: {
      id: 'learner-1',
      fullName: 'Ariane Fotso',
      dob: MINOR_DOB,
      targetExamDate: null,
      archivedAt: null,
      level: { code: 'FORM_5', category: 'secondary' },
    },
    freeze: null,
    session: null,
    instalments: [],
    ...state,
  };

  const prisma = {
    learner: { findUnique: async () => full.learner },
    accountFreeze: { findFirst: async () => full.freeze },
    session: { findUnique: async () => full.session },
    instalment: { findMany: async () => full.instalments },
  } as unknown as PrismaService;

  return new LearnerService(prisma);
}

describe('§3 — the catalogue collapses onto five surfaces', () => {
  it('maps every seeded level code', () => {
    const cases: Array<[string, string, ReturnType<typeof levelFromCatalogue>]> = [
      ['PRIMARY_1', 'primary', { key: 'primary' }],
      ['PRIMARY_6', 'primary', { key: 'primary' }],
      ['FORM_1', 'secondary', { key: 'secondary', finalYear: false }],
      ['FORM_4', 'secondary', { key: 'secondary', finalYear: false }],
      // The O-level year, which §3 gives papers, a countdown and readiness.
      ['FORM_5', 'secondary', { key: 'secondary', finalYear: true }],
      ['LOWER_SIXTH', 'high_school', { key: 'lower_sixth' }],
      ['UPPER_SIXTH', 'high_school', { key: 'upper_sixth' }],
      ['GCE_OL', 'exam', { key: 'secondary', finalYear: true }],
      ['GCE_AL', 'exam', { key: 'upper_sixth' }],
      ['ADULT_GCE', 'adult', { key: 'adult', board: 'o_level' }],
    ];

    for (const [code, category, expected] of cases) {
      expect(levelFromCatalogue({ code, category })).toEqual(expected);
    }
  });

  it('falls back to a surface that over-exposes nobody', () => {
    // An unrecognised category is a data problem. Secondary is the safe guess:
    // no billing, no booking, no examination furniture.
    const fallback = levelFromCatalogue({ code: 'SOMETHING_NEW', category: 'unknown' });
    expect(fallback).toEqual({ key: 'secondary' });
  });
});

describe('§7 / FR-SCH-002 — a minor cannot browse teachers', () => {
  it('withholds the permission from the student role itself', () => {
    // Enforced in the permission table, not by hiding a button. A `student`
    // that held this and was merely shown no control is the arrangement §7
    // rules out.
    expect(hasPermission(['student'], 'teacher:browse')).toBe(false);
    expect(ROLE_PERMISSIONS.student).not.toContain('teacher:browse');
  });

  it('keeps it for the roles FR-SCH-004 allows to book', () => {
    expect(hasPermission(['adult_learner'], 'teacher:browse')).toBe(true);
    expect(hasPermission(['parent'], 'teacher:browse')).toBe(true);
  });

  it('leaves every learner role able to read its own profile', () => {
    expect(hasPermission(['student'], 'profile:read:own')).toBe(true);
    expect(hasPermission(['adult_learner'], 'profile:read:own')).toBe(true);
  });
});

describe('GET /learner/me', () => {
  it('resolves the surface from the learner’s own level', async () => {
    const dto = await serviceWith({}).me(learnerUser);
    expect(dto.level).toEqual({ key: 'secondary', finalYear: true });
  });

  it('greets a learner by first name only — FR-SAF-007', async () => {
    const dto = await serviceWith({}).me(learnerUser);
    // The surface is a shared family phone in a shared room.
    expect(dto.displayName).toBe('Ariane');
    expect(JSON.stringify(dto)).not.toContain('Fotso');
  });

  it('sends the exam date as a plain calendar date', async () => {
    const dto = await serviceWith({
      learner: {
        id: 'learner-1',
        fullName: 'Njoya Bertrand',
        dob: MINOR_DOB,
        targetExamDate: new Date('2027-06-01T00:00:00Z'),
        archivedAt: null,
        level: { code: 'UPPER_SIXTH', category: 'high_school' },
      },
    }).me(learnerUser);

    expect(dto.targetExamDate).toBe('2027-06-01');
  });

  it('404s a learner role with no learner row', async () => {
    await expect(serviceWith({ learner: null }).me(learnerUser)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('404s an archived learner rather than serving a dead surface', async () => {
    await expect(
      serviceWith({
        learner: {
          id: 'learner-1',
          fullName: 'Ariane Fotso',
          dob: MINOR_DOB,
          targetExamDate: null,
          archivedAt: new Date('2026-01-01T00:00:00Z'),
          level: { code: 'FORM_5', category: 'secondary' },
        },
      }).me(learnerUser),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});

/**
 * §6 and §10 criterion 9 — "no monetary amount anywhere in the response
 * payload, not merely hidden in the UI".
 */
describe('§6 — the frozen state', () => {
  const activeFreeze = { deferredForSessionId: null };

  it('reports no freeze when there is none', async () => {
    const dto = await serviceWith({}).me(learnerUser);
    expect(dto.freeze).toEqual({ active: false });
  });

  it('tells a minor nothing about the money', async () => {
    const dto = await serviceWith({
      freeze: activeFreeze,
      // Present in the database, and it must not reach the wire.
      instalments: [{ amountXaf: 25_000n }],
    }).me(learnerUser);

    expect(dto.freeze).toEqual({ active: true, payer: 'guardian' });

    // Criterion 9, asserted against the serialised payload rather than the
    // object: no amount, no currency, no digits at all in the freeze branch.
    const wire = JSON.stringify(dto.freeze);
    expect(wire).not.toContain('25000');
    expect(wire).not.toMatch(/amount/i);
    expect(wire).not.toMatch(/\d/);
  });

  it('gives an adult learner the balance they are responsible for', async () => {
    const dto = await serviceWith({
      learner: {
        id: 'learner-1',
        fullName: 'Bernadette Meka',
        dob: ADULT_DOB,
        targetExamDate: null,
        archivedAt: null,
        level: { code: 'ADULT_GCE', category: 'adult' },
      },
      freeze: activeFreeze,
      instalments: [{ amountXaf: 15_000n }, { amountXaf: 10_000n }],
    }).me(learnerUser);

    expect(dto.freeze).toEqual({
      active: true,
      payer: 'self',
      amountOutstandingXaf: 25_000,
    });
  });

  it('never freezes mid-session', async () => {
    // §6: a freeze that falls due while the learner is in a live class is
    // recorded now and applies at session end.
    const dto = await serviceWith({
      freeze: { deferredForSessionId: 'session-1' },
      session: { status: 'in_progress', endedAt: null },
    }).me(learnerUser);

    expect(dto.freeze).toEqual({ active: false });
  });

  it('applies the deferred freeze once the session has ended', async () => {
    const dto = await serviceWith({
      freeze: { deferredForSessionId: 'session-1' },
      session: { status: 'completed', endedAt: new Date('2026-08-08T10:00:00Z') },
    }).me(learnerUser);

    expect(dto.freeze).toEqual({ active: true, payer: 'guardian' });
  });
});
