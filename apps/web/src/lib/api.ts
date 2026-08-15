/**
 * API client.
 *
 * NFR-BAN-006: no user-facing operation fails silently on a network error —
 * every failure produces a message key the caller can render with a retry.
 * NFR-MNT-005: the correlation ID from the response is preserved so a user can
 * quote it to support and it can be traced through the API logs.
 */

/**
 * Where the API lives.
 *
 * `NEXT_PUBLIC_API_URL` is the answer whenever it is set, and it must be set
 * for any real deployment — it is read at build time and baked into the bundle.
 *
 * With it unset, the host is derived from the page's own address rather than
 * hard-coded to localhost. Otherwise a build served on a LAN address works on
 * the machine that made it and fails on every other device: the phone dutifully
 * calls its own localhost, finds nothing, and reports the site unreachable.
 */
function defaultApiBase(): string {
  if (typeof window === 'undefined') return 'http://localhost:4000/api/v1';
  const port = process.env.NEXT_PUBLIC_API_PORT ?? '4000';
  return `${window.location.protocol}//${window.location.hostname}:${port}/api/v1`;
}

export function apiBase(): string {
  return process.env.NEXT_PUBLIC_API_URL || defaultApiBase();
}

/** @deprecated Prefer `apiBase()`, which resolves at call time. */
export const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api/v1';

export interface ApiFieldError {
  path: string;
  messageKey: string;
}

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly messageKey: string,
    readonly params: Record<string, string | number> = {},
    readonly fields: ApiFieldError[] = [],
    readonly correlationId?: string,
  ) {
    super(messageKey);
    this.name = 'ApiError';
  }

  /** Field-level lookup for form rendering. */
  fieldError(path: string): string | undefined {
    return this.fields.find((f) => f.path === path)?.messageKey;
  }
}

const ACCESS_TOKEN_KEY = 'cc.accessToken';
const REFRESH_TOKEN_KEY = 'cc.refreshToken';

export const tokenStore = {
  get access(): string | null {
    if (typeof window === 'undefined') return null;
    return window.localStorage.getItem(ACCESS_TOKEN_KEY);
  },
  get refresh(): string | null {
    if (typeof window === 'undefined') return null;
    return window.localStorage.getItem(REFRESH_TOKEN_KEY);
  },
  set(tokens: { accessToken: string; refreshToken: string }): void {
    window.localStorage.setItem(ACCESS_TOKEN_KEY, tokens.accessToken);
    window.localStorage.setItem(REFRESH_TOKEN_KEY, tokens.refreshToken);
  },
  clear(): void {
    window.localStorage.removeItem(ACCESS_TOKEN_KEY);
    window.localStorage.removeItem(REFRESH_TOKEN_KEY);
  },
};

/**
 * NFR-DEP-001 applies to the client too: every call needs an explicit timeout.
 *
 * Without one, a request that never settles leaves the caller's loading state
 * pending forever — the user sees a spinner with no error and no retry, which
 * NFR-BAN-006 explicitly forbids ("no user-facing operation shall fail
 * silently on network error"). On the 3G target of §6.2 this is a normal
 * condition, not an edge case.
 *
 * 30s, not the 15s this started at, because §6.2's target network and a managed
 * database are slow in ways that are not faults. A cold connection pool alone
 * measured 6.6s on registration, and a mobile connection outside a city can
 * spend longer than that on the round trip before the API has done anything at
 * all. Cutting those off reports a *failure* for a request that was merely
 * slow, and the user's remedy — retry — pays the same cost again on a link that
 * is already struggling.
 *
 * The ceiling still has to exist, and still has to be well under the point
 * where someone concludes the app is broken and reloads. A caller that knows
 * its own operation is heavier can pass `timeoutMs`.
 */
const DEFAULT_TIMEOUT_MS = 30_000;

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  body?: unknown;
  language?: string;
  /** Set false for the auth endpoints themselves to avoid a refresh loop. */
  retryOnUnauthorised?: boolean;
  timeoutMs?: number;
  /**
   * Let the request outlive the page that made it.
   *
   * For the fire-and-forget call sent immediately before a deliberate
   * navigation: the browser cancels in-flight fetches when the document goes
   * away, so without this the request is abandoned before it reaches the API
   * and the caller cannot tell, because it never waits for the answer.
   *
   * Only for small, response-less writes — the body is capped at 64KB across
   * all keepalive requests in flight, and a rejection there is not something
   * the caller is in a position to handle.
   */
  keepalive?: boolean;
}

export async function api<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const {
    method = 'GET',
    body,
    language = 'en',
    retryOnUnauthorised = true,
    timeoutMs = DEFAULT_TIMEOUT_MS,
    keepalive = false,
  } = options;

  let response: Response;
  try {
    response = await fetch(`${apiBase()}${path}`, {
      method,
      headers: {
        'content-type': 'application/json',
        'accept-language': language,
        ...(tokenStore.access ? { authorization: `Bearer ${tokenStore.access}` } : {}),
      },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
      ...(keepalive ? { keepalive: true } : {}),
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (caught) {
    // NFR-BAN-006 / NFR-USA-004: a reachability failure is distinguishable from
    // a server error, because the user's remedy is different. A timeout is
    // reported as such rather than as a generic failure.
    const timedOut = caught instanceof DOMException && caught.name === 'TimeoutError';
    throw new ApiError(0, timedOut ? 'errors.timeout' : 'errors.network');
  }

  // FR-AUT-006: a short-lived access token is expected to expire mid-session.
  // Rotate once and replay, so the user never sees a spurious sign-in prompt.
  if (response.status === 401 && retryOnUnauthorised && tokenStore.refresh) {
    const outcome = await tryRefresh();
    if (outcome === 'rotated') {
      return api<T>(path, { ...options, retryOnUnauthorised: false });
    }
    /*
     * Signed out only when the server actually refused the refresh token.
     *
     * `offline` leaves the tokens alone: the session outlives a restart, a tunnel
     * and a flat patch of signal, and the user is asked to sign in again only
     * when they genuinely are signed out.
     */
    if (outcome === 'refused') tokenStore.clear();
  }

  const correlationId = response.headers.get('x-correlation-id') ?? undefined;

  if (response.status === 204) return undefined as T;

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    payload = {};
  }

  if (!response.ok) {
    const data = payload as {
      messageKey?: string;
      params?: Record<string, string | number>;
      fields?: ApiFieldError[];
    };
    throw new ApiError(
      response.status,
      data.messageKey ?? 'errors.generic',
      data.params ?? {},
      data.fields ?? [],
      correlationId,
    );
  }

  return payload as T;
}

/**
 * A file upload that survives an expired access token.
 *
 * The three-step upload path sends raw bytes, not JSON, so it could not go
 * through `api()` and was written as a bare `fetch` instead — which quietly
 * cost it the one thing `api()` does that matters most here: rotate the access
 * token on a 401 and replay the request.
 *
 * An access token lives 15 minutes. Recording a three-minute introduction,
 * watching it back and re-recording it comfortably outlives that, and the
 * refresh token is good for 30 days — so the session had not ended at all. The
 * upload simply refused, permanently, at the last step of an application the
 * applicant had already finished. That is the failure that reads as "it logged
 * me out" when nothing of the sort happened.
 *
 * Same rotate-once-and-replay as `api()`; a second 401 is a real one.
 */
export async function apiUpload(
  path: string,
  file: File,
  options: { timeoutMs?: number; retryOnUnauthorised?: boolean } = {},
): Promise<Response> {
  const { timeoutMs = 120_000, retryOnUnauthorised = true } = options;

  let response: Response;
  try {
    response = await fetch(`${apiBase()}${path}`, {
      method: 'POST',
      headers: {
        'Content-Type': file.type || 'application/octet-stream',
        ...(tokenStore.access ? { Authorization: `Bearer ${tokenStore.access}` } : {}),
      },
      body: file,
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (caught) {
    const timedOut = caught instanceof DOMException && caught.name === 'TimeoutError';
    throw new ApiError(0, timedOut ? 'errors.timeout' : 'errors.network');
  }

  if (response.status === 401 && retryOnUnauthorised && tokenStore.refresh) {
    const outcome = await tryRefresh();
    if (outcome === 'rotated') {
      return apiUpload(path, file, { ...options, retryOnUnauthorised: false });
    }
    // Same rule as `api()`: only an outright refusal ends the session. An
    // upload that failed because the network dropped must not sign the teacher
    // out — they are usually mid-way through a 100 MB lesson when it happens.
    if (outcome === 'refused') tokenStore.clear();
  }

  return response;
}

/**
 * The outcome of trying to rotate an expired access token.
 *
 * Three states, not two, and the distinction is the whole point:
 *
 *   rotated   a fresh pair is in hand; replay the request.
 *   refused   the server looked at the refresh token and said no — it is
 *             revoked, expired or forged. The session really is over.
 *   offline   we never got an answer. The session is untouched and probably
 *             still perfectly good.
 *
 * These used to collapse into `false`, and the caller wiped the tokens on it.
 * So an API restart, a dropped connection or a momentary 502 signed the user out
 * — indistinguishable, from their side, from being kicked out for no reason, and
 * on a Cameroonian mobile connection (§6.2) it happened constantly.
 */
type RefreshOutcome = 'rotated' | 'refused' | 'offline';

/**
 * The one rotation in flight, shared by everyone waiting on it.
 *
 * `POST /auth/refresh` rotates: it revokes the token presented and issues a new
 * pair, so that a stolen token works at most once. Correct — and it makes
 * concurrent refreshes fatal. A dashboard fires several requests at once; fifteen
 * minutes in they all return 401 together; each calls `tryRefresh` with the same
 * token; the first rotates it and the rest present one the server has just
 * revoked. They get 401, read it as "your session is over", and sign the user out
 * — in the middle of a lesson, having done nothing wrong.
 *
 * So the first caller performs the rotation and the others await its result.
 * One rotation per expiry, no race, and nobody is signed out for being second.
 */
let inFlightRefresh: Promise<RefreshOutcome> | null = null;

function tryRefresh(): Promise<RefreshOutcome> {
  inFlightRefresh ??= performRefresh().finally(() => {
    inFlightRefresh = null;
  });
  return inFlightRefresh;
}

async function performRefresh(): Promise<RefreshOutcome> {
  const refreshToken = tokenStore.refresh;
  if (!refreshToken) return 'refused';

  let response: Response;
  try {
    response = await fetch(`${apiBase()}/auth/refresh`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ refreshToken }),
      signal: AbortSignal.timeout(DEFAULT_TIMEOUT_MS),
    });
  } catch {
    // Never reached the server. Says nothing about whether the token is valid.
    return 'offline';
  }

  if (response.ok) {
    const tokens = (await response.json().catch(() => null)) as
      | { accessToken: string; refreshToken: string }
      | null;
    if (!tokens?.accessToken) return 'offline';
    tokenStore.set(tokens);
    return 'rotated';
  }

  /*
   * Only a judgement on the token itself ends the session.
   *
   * 401 and 403 mean the server read it and rejected it. A 5xx, a 429 or a
   * gateway error mean the server could not answer — which is the same
   * information as no answer at all, so it is treated the same way.
   */
  if (response.status === 401 || response.status === 403) return 'refused';
  return 'offline';
}
