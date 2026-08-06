/**
 * API client.
 *
 * NFR-BAN-006: no user-facing operation fails silently on a network error —
 * every failure produces a message key the caller can render with a retry.
 * NFR-MNT-005: the correlation ID from the response is preserved so a user can
 * quote it to support and it can be traced through the API logs.
 */

export const API_BASE =
  process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api/v1';

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
 */
const DEFAULT_TIMEOUT_MS = 15_000;

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  body?: unknown;
  language?: string;
  /** Set false for the auth endpoints themselves to avoid a refresh loop. */
  retryOnUnauthorised?: boolean;
  timeoutMs?: number;
}

export async function api<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const {
    method = 'GET',
    body,
    language = 'en',
    retryOnUnauthorised = true,
    timeoutMs = DEFAULT_TIMEOUT_MS,
  } = options;

  let response: Response;
  try {
    response = await fetch(`${API_BASE}${path}`, {
      method,
      headers: {
        'content-type': 'application/json',
        'accept-language': language,
        ...(tokenStore.access ? { authorization: `Bearer ${tokenStore.access}` } : {}),
      },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
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
    const rotated = await tryRefresh();
    if (rotated) {
      return api<T>(path, { ...options, retryOnUnauthorised: false });
    }
    tokenStore.clear();
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

async function tryRefresh(): Promise<boolean> {
  const refreshToken = tokenStore.refresh;
  if (!refreshToken) return false;

  try {
    const response = await fetch(`${API_BASE}/auth/refresh`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ refreshToken }),
      signal: AbortSignal.timeout(DEFAULT_TIMEOUT_MS),
    });
    if (!response.ok) return false;

    const tokens = (await response.json()) as { accessToken: string; refreshToken: string };
    tokenStore.set(tokens);
    return true;
  } catch {
    return false;
  }
}
