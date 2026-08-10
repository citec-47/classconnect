/**
 * Unit test configuration.
 *
 * NFR-MNT-002 requires >= 80% line coverage overall and >= 95% on the payment,
 * ledger, earnings, authorisation and safeguarding modules.
 *
 * That target is NOT yet met. The thresholds below are set to what this suite
 * actually achieves, so the build tells the truth rather than passing against
 * an aspiration or failing permanently against one.
 *
 * The gap is integration coverage of the Nest service layer: the domain rules
 * (money, roles, validation, TOTP, age derivation, i18n completeness) are unit
 * tested here, and the HTTP behaviour is covered by the end-to-end suite in
 * `test/e2e`, which runs against a live API and database and is therefore not
 * counted by this instrumentation.
 *
 * Raising these numbers to the NFR-MNT-002 targets means adding in-process
 * integration tests that boot the Nest application against a throwaway
 * database. That work is tracked as part of the verification matrix (§9.1).
 *
 * The admin surface widened that gap rather than closing it. Its *rules* are
 * unit tested and its *services* are not:
 *
 *   covered   — the earnings pool and its distribution, instalment schedules,
 *               the freeze rule, payout blocking, the role and badge tables.
 *               These live in `@classconnect/shared` as pure functions
 *               precisely so they can be tested without a database, which is
 *               why they carry the acceptance criteria that name exact francs.
 *   not yet   — the Nest services that persist those decisions. Whether paying
 *               an instalment actually lifts an automatic freeze but not a
 *               manual one, and whether the ledger and audit tables reject
 *               UPDATE and DELETE, are database behaviours. §8 requires both to
 *               be proven "by test, not by inspection", and proving them needs
 *               a live Postgres in `test/e2e`.
 *
 * `collectCoverageFrom` covers `src/` only, so the shared engines' own coverage
 * does not appear in these figures at all.
 */
module.exports = {
  moduleFileExtensions: ['js', 'json', 'ts'],
  rootDir: '.',
  testRegex: '.*\\.spec\\.ts$',
  transform: { '^.+\\.ts$': ['ts-jest', { tsconfig: '<rootDir>/tsconfig.spec.json' }] },
  collectCoverageFrom: ['src/**/*.ts', '!src/**/*.module.ts', '!src/main.ts', '!src/**/*.spec.ts'],
  coverageDirectory: './coverage',
  testEnvironment: 'node',
  moduleNameMapper: {
    '^@classconnect/shared$': '<rootDir>/../../packages/shared/src',
    '^@classconnect/db$': '<rootDir>/../../packages/db/src',
  },
  coverageThreshold: {
    // Current achieved floor for everything not named below. Jest excludes
    // path-thresholded files from this pool, so this figure covers the
    // as-yet-unintegration-tested service layer only. Ratchet it upwards as
    // integration tests land; never lower it to accommodate a regression.
    global: { lines: 6, statements: 5.9, branches: 4.7, functions: 4.8 },
    // FR-RBA-002/005 are fully unit tested, so this module already meets the
    // NFR-MNT-002 bar for authorisation and must not regress below it.
    './src/rbac/permissions.guard.ts': { lines: 95, statements: 95 },
    // FR-AUT-009: the second factor gating all administrative access.
    './src/auth/totp.service.ts': { lines: 90, statements: 90 },
  },
};
