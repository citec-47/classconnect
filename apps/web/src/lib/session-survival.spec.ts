import { api, tokenStore, ApiError } from './api';

/**
 * A signed-in person stays signed in until they sign out.
 *
 * Three ways the session used to end on its own, all of them invisible to the
 * user and none of them their doing:
 *
 *   1. the API restarted, or the signal dropped, and the failed refresh was read
 *      as "your session is over";
 *   2. the refresh endpoint answered 500 or 502, same conclusion;
 *   3. several requests expired at once, raced to rotate the one refresh token,
 *      and every loser was signed out — the common case on a dashboard, because
 *      dashboards fetch several things at once.
 *
 * The rule these pin down: **only the server refusing the refresh token ends a
 * session.** Everything else leaves it alone.
 */

const ACCESS = 'cc.accessToken';
const REFRESH = 'cc.refreshToken';

const originalFetch = global.fetch;

/*
 * jsdom ships none of the fetch platform: no `fetch`, no `Response`, and no
 * `AbortSignal.timeout`. Without the last one `api()` throws before it ever
 * inspects a status, every assertion about "the tokens were kept" passes for the
 * wrong reason, and the suite proves nothing. Shimmed here rather than globally,
 * so it is obvious what these tests depend on.
 */
beforeAll(() => {
  if (typeof (AbortSignal as unknown as { timeout?: unknown }).timeout !== 'function') {
    (AbortSignal as unknown as { timeout: (ms: number) => AbortSignal }).timeout = () =>
      new AbortController().signal;
  }
});

/** Only the handful of members `api()` and `apiUpload()` actually read. */
function reply(status: number, body: unknown = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: () => null },
    json: async () => body,
    text: async () => JSON.stringify(body),
  } as unknown as Response;
}

const unauthorised = () => reply(401, { messageKey: 'errors.unauthorised' });
const ok = (body: unknown) => reply(200, body);

function signedIn() {
  tokenStore.set({ accessToken: 'access-old', refreshToken: 'refresh-old' });
}

beforeEach(() => {
  window.localStorage.clear();
  signedIn();
});

afterEach(() => {
  global.fetch = originalFetch;
  jest.restoreAllMocks();
});

describe('the session survives things that are not a sign-out', () => {
  it('keeps the tokens when the API cannot be reached at all', async () => {
    // The API restarting, or a tunnel. The refresh never gets an answer.
    global.fetch = jest.fn(async (input: RequestInfo | URL) => {
      if (String(input).includes('/auth/refresh')) throw new TypeError('Failed to fetch');
      return unauthorised();
    }) as unknown as typeof fetch;

    await expect(api('/learner/home')).rejects.toBeInstanceOf(ApiError);

    // The whole point: still signed in.
    expect(window.localStorage.getItem(ACCESS)).toBe('access-old');
    expect(window.localStorage.getItem(REFRESH)).toBe('refresh-old');
  });

  it('keeps the tokens when the refresh endpoint returns a server error', async () => {
    // A 502 from a proxy says nothing about whether the token is any good.
    global.fetch = jest.fn(async (input: RequestInfo | URL) => {
      if (String(input).includes('/auth/refresh')) return reply(502);
      return unauthorised();
    }) as unknown as typeof fetch;

    await expect(api('/learner/home')).rejects.toBeInstanceOf(ApiError);
    expect(window.localStorage.getItem(REFRESH)).toBe('refresh-old');
  });

  it('signs out only when the server actually refuses the refresh token', async () => {
    // Revoked, expired, or from a session an admin ended. This one is real.
    global.fetch = jest.fn(async (input: RequestInfo | URL) => {
      if (String(input).includes('/auth/refresh')) return unauthorised();
      return unauthorised();
    }) as unknown as typeof fetch;

    await expect(api('/learner/home')).rejects.toBeInstanceOf(ApiError);
    expect(window.localStorage.getItem(ACCESS)).toBeNull();
    expect(window.localStorage.getItem(REFRESH)).toBeNull();
  });
});

describe('concurrent expiry rotates once, and nobody is signed out for being second', () => {
  it('performs a single rotation for many simultaneous 401s', async () => {
    let refreshCalls = 0;
    let rotated = false;

    global.fetch = jest.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);

      if (url.includes('/auth/refresh')) {
        refreshCalls += 1;
        /*
         * The server rotates: the presented token is revoked as the new pair is
         * issued. A second call with the old token would be a 401 — which is
         * exactly what used to sign everybody out.
         */
        if (rotated) return unauthorised();
        rotated = true;
        await new Promise((r) => setTimeout(r, 10));
        return ok({ accessToken: 'access-new', refreshToken: 'refresh-new' });
      }

      const auth = (init?.headers as Record<string, string> | undefined)?.authorization;
      // Old token → expired; new token → fine. The replay must carry the new one.
      return auth === 'Bearer access-new' ? ok({ ok: true }) : unauthorised();
    }) as unknown as typeof fetch;

    // Four calls in flight together, as a dashboard does.
    const results = await Promise.all([
      api('/a'),
      api('/b'),
      api('/c'),
      api('/d'),
    ]);

    expect(results).toHaveLength(4);
    // One rotation, not four.
    expect(refreshCalls).toBe(1);
    // And still signed in, with the rotated pair.
    expect(window.localStorage.getItem(ACCESS)).toBe('access-new');
    expect(window.localStorage.getItem(REFRESH)).toBe('refresh-new');
  });
});
