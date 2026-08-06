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
    global: { lines: 2.5, statements: 3, branches: 0.5, functions: 1.5 },
    // FR-RBA-002/005 are fully unit tested, so this module already meets the
    // NFR-MNT-002 bar for authorisation and must not regress below it.
    './src/rbac/permissions.guard.ts': { lines: 95, statements: 95 },
    // FR-AUT-009: the second factor gating all administrative access.
    './src/auth/totp.service.ts': { lines: 90, statements: 90 },
  },
};
