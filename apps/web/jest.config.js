/**
 * Component tests for the web app.
 *
 * jsdom rather than node: the behaviour worth testing here is the DOM's — what
 * is in the tab order, what a screen reader would be told, what `hidden` is
 * actually set on. Those are the acceptance criteria, and none of them can be
 * asserted against a render tree.
 *
 * `@classconnect/shared` resolves to its TypeScript source, exactly as the API
 * suite does it, so a test never runs against a stale build of the catalogue.
 */
module.exports = {
  rootDir: '.',
  testEnvironment: 'jsdom',
  testRegex: '.*\\.spec\\.tsx?$',
  moduleFileExtensions: ['ts', 'tsx', 'js', 'json'],
  setupFilesAfterEnv: ['<rootDir>/jest.setup.ts'],
  transform: {
    '^.+\\.tsx?$': ['ts-jest', { tsconfig: '<rootDir>/tsconfig.spec.json' }],
  },
  moduleNameMapper: {
    '^@classconnect/shared$': '<rootDir>/../../packages/shared/src',
    '^@/(.*)$': '<rootDir>/src/$1',
  },
};
