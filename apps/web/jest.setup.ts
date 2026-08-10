import '@testing-library/jest-dom';

/**
 * jsdom evaluates no media queries and ships no `matchMedia`.
 *
 * The default here is "no preference", so the animated path is the one under
 * test — the collapse that has to wait for a transition before it may set
 * `hidden` is the case with something to get wrong. The reduced-motion tests
 * replace this per test.
 */
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  configurable: true,
  value: (query: string): MediaQueryList =>
    ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    }) as unknown as MediaQueryList,
});
