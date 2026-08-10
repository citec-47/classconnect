'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { api, type ApiError } from './api';

/**
 * A GET with stale-while-revalidate.
 *
 * ## Why
 *
 * The database is in another region and a single round trip to it costs about
 * 235ms. A roster screen legitimately needs several, so it takes a couple of
 * seconds — and every time an operator moved between two screens they paid that
 * again, from a blank page, for data they had seen thirty seconds earlier.
 *
 * The fix is not to make the query faster, because the floor is the network.
 * It is to stop showing an empty screen while we ask: keep the last answer,
 * render it immediately, and refresh behind it. Going back to a screen becomes
 * instant, and the refresh lands quietly.
 *
 * ## What it deliberately does not do
 *
 * Only reads, and only reads that tolerate being a few seconds old — rosters,
 * timetables, counts. Anything a decision is made on is fetched normally: an
 * approval checklist or a payout eligibility check must be current, because a
 * stale answer there is a wrong decision rather than a slightly old list.
 *
 * The cache is module-level and lives for the tab. A sign-out clears it, since
 * the next person at the keyboard must not inherit the last one's data.
 */

interface CacheEntry {
  data: unknown;
  fetchedAt: number;
}

const cache = new Map<string, CacheEntry>();

/** Cleared on sign-out. Exported so `auth-context` can call it. */
export function clearApiCache(): void {
  cache.clear();
}

export interface CachedState<T> {
  data: T | null;
  /** True only when there is nothing to show yet — never on a background refresh. */
  loading: boolean;
  /** True while a refresh is in flight behind data that is already on screen. */
  refreshing: boolean;
  error: ApiError | null;
  /** Refetch now, bypassing the cache. Call after an action changes the data. */
  refresh: () => Promise<void>;
}

export function useCachedApi<T>(
  path: string | null,
  options: { language: string; maxAgeMs?: number } ,
): CachedState<T> {
  const maxAge = options.maxAgeMs ?? 30_000;
  const key = path ? `${options.language}:${path}` : null;

  // Seeded synchronously from the cache, so a revisited screen paints with data
  // on its very first render rather than flashing a loading state first.
  const cached = key ? cache.get(key) : undefined;
  const [data, setData] = useState<T | null>((cached?.data as T) ?? null);
  const [loading, setLoading] = useState(!cached);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);

  // Guards against a slow response for a path the user has already navigated
  // away from overwriting the newer screen's data.
  const activeKey = useRef(key);
  activeKey.current = key;

  const load = useCallback(
    async (force: boolean) => {
      if (!key || !path) return;

      const hit = cache.get(key);
      const fresh = hit && Date.now() - hit.fetchedAt < maxAge;

      if (hit) {
        setData(hit.data as T);
        setLoading(false);
      }
      // Fresh enough, and not an explicit refresh: nothing to do.
      if (fresh && !force) return;

      if (hit) setRefreshing(true);
      else setLoading(true);

      try {
        const result = await api<T>(path, { language: options.language });
        cache.set(key, { data: result, fetchedAt: Date.now() });
        if (activeKey.current !== key) return;
        setData(result);
        setError(null);
      } catch (caught) {
        if (activeKey.current !== key) return;
        // A failed background refresh keeps the stale data on screen rather than
        // blanking it — old data beats no data, and the error still surfaces.
        setError(caught as ApiError);
      } finally {
        if (activeKey.current === key) {
          setLoading(false);
          setRefreshing(false);
        }
      }
    },
    [key, path, maxAge, options.language],
  );

  useEffect(() => {
    void load(false);
  }, [load]);

  /*
   * Recover on its own when the connection comes back.
   *
   * AS-08: connectivity interruptions here are normal, not exceptional. A screen
   * that failed while the network was down and then sits there showing an error
   * after it returns makes the learner reload manually — which on a shared phone
   * usually means they give up instead.
   *
   * Three triggers, because each catches a case the others miss:
   *   · `online`         — the browser noticed the interface came back
   *   · `visibilitychange` — the tab was backgrounded and returned, which is what
   *                        actually happens when someone takes a call mid-lesson
   *   · `focus`          — the window regained focus without either of the above,
   *                        which is the desktop case
   *
   * Only refetches when something is actually wrong or stale, so returning to a
   * tab does not spend a learner's data reloading a screen that is already
   * correct.
   */
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const recover = () => {
      if (!navigator.onLine) return;
      const hit = key ? cache.get(key) : undefined;
      const stale = !hit || Date.now() - hit.fetchedAt >= maxAge;
      if (error || stale) void load(true);
    };

    const onVisible = () => {
      if (document.visibilityState === 'visible') recover();
    };

    window.addEventListener('online', recover);
    window.addEventListener('focus', recover);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.removeEventListener('online', recover);
      window.removeEventListener('focus', recover);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [load, key, maxAge, error]);

  return {
    data,
    loading,
    refreshing,
    error,
    refresh: useCallback(() => load(true), [load]),
  };
}
