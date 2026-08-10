import {
  mayDelete,
  mayReach,
  pairingExists,
  redactContactDetails,
  warrantsReview,
  type Role,
} from '@classconnect/shared';

/**
 * §5 and §6 — the messaging acceptance criteria.
 *
 * Criteria 11 (no learner-to-learner), 12 (a phone number is redacted and
 * flagged), 13 (a tombstone both parties see) and 14 (no role hard-deletes).
 */

describe('§5.1 / criterion 11 — who may message whom', () => {
  it('has no learner-to-learner pairing at all', () => {
    // FR-SAF-008: absent, not disabled. The 404 the endpoint returns is a
    // consequence of there being nothing to route to.
    for (const a of ['student', 'adult_learner'] as Role[]) {
      for (const b of ['student', 'adult_learner'] as Role[]) {
        expect(pairingExists(a, b)).toBe(false);
      }
    }
  });

  it('refuses a learner reaching another learner', () => {
    const decision = mayReach({
      initiatorRoles: ['student'],
      counterpartRoles: ['student'],
      assigned: true,
    });
    expect(decision.allowed).toBe(false);
    expect(decision.kind).toBeNull();
  });

  it('lets a learner reach their assigned teacher', () => {
    expect(
      mayReach({ initiatorRoles: ['student'], counterpartRoles: ['teacher'], assigned: true }),
    ).toEqual({ allowed: true, kind: 'learner_teacher', refusalKey: null });
  });

  it('refuses a teacher the learner is not assigned to', () => {
    const decision = mayReach({
      initiatorRoles: ['student'],
      counterpartRoles: ['teacher'],
      assigned: false,
    });
    expect(decision.allowed).toBe(false);
    expect(decision.refusalKey).toBe('errors.messaging.not_assigned');
  });

  it('lets a learner reach support without any assignment', () => {
    // Someone who cannot reach anyone is exactly who most needs to.
    expect(
      mayReach({
        initiatorRoles: ['student'],
        counterpartRoles: ['support_agent'],
        assigned: false,
      }).allowed,
    ).toBe(true);
  });

  it('lets a guardian reach their child’s teacher', () => {
    expect(
      mayReach({ initiatorRoles: ['parent'], counterpartRoles: ['teacher'], assigned: true }).kind,
    ).toBe('guardian_teacher');
  });
});

describe('§5.2 / criterion 12 — contact-detail redaction', () => {
  it('removes a Cameroonian mobile number however it is written', () => {
    for (const written of [
      'call me on +237 677 12 34 56',
      'my number is 677123456',
      'reach me: 6 77-12-34-56',
      'try 237677123456 tomorrow',
    ]) {
      const result = redactContactDetails(written);
      expect(result.redactions.length).toBeGreaterThan(0);
      expect(result.text).not.toMatch(/\d{6,}/);
    }
  });

  it('removes an email address, including the obvious evasions', () => {
    for (const written of [
      'mail me at teacher@example.com',
      'teacher (at) example (dot) com',
      'teacher at example dot com',
    ]) {
      expect(redactContactDetails(written).redactions.some((r) => r.kind === 'email')).toBe(true);
    }
  });

  it('removes a messaging handle', () => {
    const result = redactContactDetails('add me on WhatsApp jonas237');
    expect(result.redactions.some((r) => r.kind === 'handle')).toBe(true);
    expect(result.text).not.toContain('jonas237');
  });

  it('catches a number spelled out in words', () => {
    const result = redactContactDetails('six seven seven one two three four five six');
    expect(result.redactions.length).toBeGreaterThan(0);
  });

  it('leaves an ordinary message alone', () => {
    // A redactor that eats normal text is one teachers route around.
    for (const innocent of [
      'Well done on question 4, your working was clear.',
      'The fee is 15 000 FCFA per month.',
      'See you in class at 3pm on Tuesday.',
    ]) {
      expect(redactContactDetails(innocent).redactions).toEqual([]);
    }
  });

  it('keeps the original as evidence rather than discarding it', () => {
    const result = redactContactDetails('ring 677123456');
    expect(result.redactions[0]!.excerpt).toContain('677123456');
  });

  it('flags a repeated pattern, not a single slip', () => {
    expect(warrantsReview(0)).toBe(false);
    expect(warrantsReview(1)).toBe(false);
    expect(warrantsReview(2)).toBe(true);
  });
});

describe('§5.4 / criteria 13 and 14 — deletion', () => {
  const base = {
    senderUserId: 'u1',
    actorUserId: 'u1',
    actorRoles: ['student'] as Role[],
    threadUnderSafeguardingHold: false,
    alreadyDeleted: false,
  };

  it('lets the sender hide their own message', () => {
    expect(mayDelete(base).allowed).toBe(true);
  });

  it('lets an admin hide a message they did not send', () => {
    expect(
      mayDelete({ ...base, actorUserId: 'staff', actorRoles: ['admin_ops'] }).allowed,
    ).toBe(true);
  });

  it('refuses an unrelated learner', () => {
    expect(
      mayDelete({ ...base, actorUserId: 'someone-else', actorRoles: ['student'] }).allowed,
    ).toBe(false);
  });

  it('refuses everyone once the thread is under investigation', () => {
    // Including staff. Evidence does not become deletable because the person
    // asking outranks the person who reported it.
    for (const roles of [['student'], ['admin_ops'], ['super_admin']] as Role[][]) {
      const decision = mayDelete({
        ...base,
        actorUserId: 'u1',
        actorRoles: roles,
        threadUnderSafeguardingHold: true,
      });
      expect(decision.allowed).toBe(false);
      expect(decision).toHaveProperty('refusalKey', 'errors.messaging.safeguarding_hold');
    }
  });

  it('exposes no hard-delete anywhere in the module', () => {
    // Criterion 14. The absence is the guarantee: erasure is a documented
    // data-subject workflow with legal sign-off, not an API a role holds.
    const messaging = require('@classconnect/shared') as Record<string, unknown>;
    const dangerous = Object.keys(messaging).filter((name) =>
      /hardDelete|purgeMessage|destroyMessage|eraseMessage/i.test(name),
    );
    expect(dangerous).toEqual([]);
  });
});
