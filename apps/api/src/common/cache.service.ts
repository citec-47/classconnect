import { Injectable } from '@nestjs/common';

/**
 * A small in-process cache with a time-to-live.
 *
 * ## Why this exists
 *
 * The database is managed and in another region. A single round trip to it was
 * measured at 235ms — that is the floor for *any* query, before it does any
 * work. The admin dashboard reads the same handful of counts on every page load
 * and again every sixty seconds on every open tab, and each of those reads was
 * paying the full latency for an answer that had not changed.
 *
 * Caching is the only lever that beats a network round trip. Query tuning
 * cannot: nine perfectly indexed counts still cost 235ms if they are one hop
 * away.
 *
 * ## What may be cached
 *
 * Only reads where a few seconds of staleness is harmless, and only where the
 * write path can invalidate. Concretely:
 *
 *   yes — badge counts, band counts, a designation flag. Being one action behind
 *         for ten seconds is invisible; the sidebar already reconciles on a
 *         sixty-second poll (COM-003), so the cache is strictly fresher than
 *         the contract already promises.
 *   no  — anything a decision is made on. An approval checklist, a payout
 *         eligibility check, a freeze state. Those read through, every time,
 *         because a stale answer there is a wrong decision.
 *
 * ## Why in-process rather than Redis
 *
 * CON-07: four people run this platform. An in-process map has no service to
 * operate, no failure mode of its own, and is correct on a single instance. On
 * serverless each instance keeps its own copy, which is still correct — the
 * TTL bounds the divergence, and every entry here is a count rather than a
 * decision. A shared store becomes worth its operational cost when the counts
 * do, not before.
 */
interface Entry<T> {
  value: T;
  expiresAt: number;
}

@Injectable()
export class CacheService {
  private readonly store = new Map<string, Entry<unknown>>();

  /**
   * In-flight loads, keyed the same way.
   *
   * Without this, ten tabs polling at the same second each miss the cache and
   * each start their own query — the stampede the cache exists to prevent. They
   * share one promise instead.
   */
  private readonly inFlight = new Map<string, Promise<unknown>>();

  /**
   * Returns the cached value, or loads and caches it.
   *
   * `ttlMs` is deliberately per-call rather than global: a badge count and a
   * designation flag tolerate very different staleness, and the caller is the
   * only one who knows which.
   */
  async get<T>(key: string, ttlMs: number, load: () => Promise<T>): Promise<T> {
    const now = Date.now();
    const hit = this.store.get(key);
    if (hit && hit.expiresAt > now) return hit.value as T;

    const pending = this.inFlight.get(key);
    if (pending) return pending as Promise<T>;

    const promise = load()
      .then((value) => {
        this.store.set(key, { value, expiresAt: Date.now() + ttlMs });
        return value;
      })
      .finally(() => {
        this.inFlight.delete(key);
      });

    this.inFlight.set(key, promise);
    return promise;
  }

  /** Drops one entry. Called by the write that made it wrong. */
  invalidate(key: string): void {
    this.store.delete(key);
  }

  /**
   * Drops every entry whose key starts with `prefix`.
   *
   * Badge counts are cached per user, so an action that changes a queue has to
   * clear all of them rather than only the actor's — the whole point of the
   * badge is that the other three operators see it move.
   */
  invalidatePrefix(prefix: string): void {
    for (const key of this.store.keys()) {
      if (key.startsWith(prefix)) this.store.delete(key);
    }
  }

  /** Everything. Used by tests, and by a configuration change. */
  clear(): void {
    this.store.clear();
    this.inFlight.clear();
  }

  /** Cache keys, in one place so a typo cannot silently miss forever. */
  static readonly KEYS = {
    badges: (userId: string) => `badges:${userId}`,
    badgesPrefix: 'badges:',
    designation: (userId: string) => `designated:${userId}`,
    bandCounts: 'roster:bandCounts',
  } as const;

  /**
   * How long each kind of entry lives.
   *
   * Short enough that nobody notices, long enough to collapse a burst of page
   * loads into one query.
   */
  static readonly TTL = {
    /** COM-003 already permits a sixty-second reconciliation window. */
    badges: 10_000,
    /** FR-SAF-006: revocation must bite quickly, and `setDesignation` also
     *  invalidates explicitly — this is only the backstop. */
    designation: 15_000,
    bandCounts: 30_000,
  } as const;
}
