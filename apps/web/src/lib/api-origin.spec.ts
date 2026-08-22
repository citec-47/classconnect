import { upstreamOrigin } from './api-origin';

/**
 * Where the bridge decides to send a request.
 *
 * This one function decides whether sign-in works on a two-service deployment,
 * and every failure it has actually had was a value typed into a hosting
 * dashboard rather than a bug in the forwarding itself. So the cases below are
 * the mistakes, not the happy path: the `/api/v1` suffix that would be doubled,
 * the variable name pasted along with its value, shell quoting carried across,
 * and a stray space. Each is unambiguous about what was meant, and each used to
 * end in a 503 that read as "the API is down".
 */
describe('upstreamOrigin', () => {
  const saved = { ...process.env };

  afterEach(() => {
    process.env = { ...saved };
  });

  function withEnv(values: Record<string, string | undefined>): string | undefined {
    delete process.env.API_ORIGIN;
    delete process.env.NEXT_PUBLIC_API_URL;
    for (const [key, value] of Object.entries(values)) {
      if (value !== undefined) process.env[key] = value;
    }
    return upstreamOrigin();
  }

  it('forwards nowhere when neither variable is set', () => {
    expect(withEnv({})).toBeUndefined();
  });

  it('treats a same-origin path as in-process, not as a target', () => {
    // The documented Vercel value. It names this deployment, so there is
    // nothing to forward to.
    expect(withEnv({ NEXT_PUBLIC_API_URL: '/api/v1' })).toBeUndefined();
  });

  it('keeps only the origin, so the prefix is never doubled', () => {
    // The fetch helper needs the suffix and the target must not have it:
    // joining it onto a path that already carries the prefix asks the API for
    // /api/v1/api/v1/auth/login, which is a 404 that looks like a routing bug.
    expect(withEnv({ API_ORIGIN: 'https://api.example.com/api/v1' })).toBe(
      'https://api.example.com',
    );
  });

  it('accepts a bare origin', () => {
    expect(withEnv({ API_ORIGIN: 'https://api.example.com' })).toBe('https://api.example.com');
  });

  it('assumes TLS for a host written without a scheme', () => {
    expect(withEnv({ API_ORIGIN: 'api.example.com' })).toBe('https://api.example.com');
  });

  it('absorbs the value pasted with its own variable name', () => {
    expect(withEnv({ API_ORIGIN: 'API_ORIGIN=https://api.example.com/api/v1' })).toBe(
      'https://api.example.com',
    );
  });

  it('absorbs shell quoting and surrounding whitespace', () => {
    expect(withEnv({ API_ORIGIN: '  "https://api.example.com/api/v1"  ' })).toBe(
      'https://api.example.com',
    );
    expect(withEnv({ API_ORIGIN: "'https://api.example.com'" })).toBe('https://api.example.com');
  });

  it('prefers the runtime variable over the build-time one', () => {
    // NEXT_PUBLIC_API_URL is inlined into the client bundle and cannot be
    // changed without a rebuild; API_ORIGIN is read per request. When they
    // disagree, the one that can be corrected today wins.
    expect(
      withEnv({
        API_ORIGIN: 'https://new-api.example.com',
        NEXT_PUBLIC_API_URL: 'https://old-api.example.com/api/v1',
      }),
    ).toBe('https://new-api.example.com');
  });

  it('falls back to the documented variable when only it is set', () => {
    expect(withEnv({ NEXT_PUBLIC_API_URL: 'https://api.example.com/api/v1' })).toBe(
      'https://api.example.com',
    );
  });

  it('forwards nowhere when the value is not a usable host', () => {
    // Better to serve in-process and log the bootstrap failure than to forward
    // every request to a URL that cannot be parsed.
    expect(withEnv({ API_ORIGIN: 'SET-ME' })).toBe('https://set-me');
    expect(withEnv({ API_ORIGIN: '   ' })).toBeUndefined();
  });
});
