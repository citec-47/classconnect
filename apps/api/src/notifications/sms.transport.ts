import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { maskPhone } from '@classconnect/shared';
import { currentContext } from '../common/correlation.middleware';
import { encodeSms } from './gsm7';

/**
 * SMS delivery — SI-007.
 *
 * AS-04 assumes an aggregator with reliable delivery to MTN, Orange and
 * Camtel/Nexttel numbers. The SRS does not name one, and different aggregators
 * disagree about almost everything except "POST some JSON with a bearer token",
 * so the request shape is configurable rather than hard-coded to one vendor.
 *
 * NFR-DEP-001 governs the behaviour: an explicit timeout, bounded retries with
 * exponential backoff and jitter, and a circuit breaker that fails fast when the
 * provider is unhealthy. §3.2 additionally requires a correlation ID on every
 * outbound call.
 *
 * NFR-SEC-009: the message body is never logged. An OTP travels this path.
 */

export type SmsResult =
  | { status: 'sent'; providerRef: string | null; segments: number; encoding: string }
  | { status: 'failed'; reason: string; retryable: boolean };

/** Circuit breaker states, per NFR-DEP-001. */
type BreakerState = 'closed' | 'open' | 'half_open';

@Injectable()
export class SmsTransport {
  private readonly logger = new Logger(SmsTransport.name);

  private readonly url: string | undefined;
  private readonly token: string | undefined;
  private readonly senderId: string;
  private readonly timeoutMs: number;
  private readonly maxAttempts: number;

  // Circuit breaker. Deliberately in-process: it protects this instance from
  // hammering a dead provider. A shared breaker across instances would need
  // Redis and is not worth the coupling at this scale (NFR-AVL-003).
  private breaker: BreakerState = 'closed';
  private consecutiveFailures = 0;
  private openedAt = 0;
  private readonly failureThreshold = 5;
  private readonly cooldownMs = 30_000;

  constructor(env: ConfigService) {
    this.url = env.get<string>('SMS_PROVIDER_URL') || undefined;
    this.token = env.get<string>('SMS_PROVIDER_TOKEN') || undefined;
    this.senderId = env.get<string>('SMS_SENDER_ID') ?? 'ClassConnect';
    this.timeoutMs = Number(env.get('SMS_TIMEOUT_MS') ?? 10_000);
    this.maxAttempts = Number(env.get('SMS_MAX_ATTEMPTS') ?? 3);
  }

  /** True when both a URL and a token are present. One without the other is a misconfiguration. */
  get configured(): boolean {
    return Boolean(this.url && this.token);
  }

  /**
   * Sends one message.
   *
   * Never throws: the caller records a delivery status either way (FR-NOT-006),
   * and a provider outage must not take down the request that triggered it.
   */
  async send(destination: string, body: string): Promise<SmsResult> {
    if (!this.configured) {
      return { status: 'failed', reason: 'not_configured', retryable: false };
    }

    if (!this.allowRequest()) {
      // Fail fast rather than queue behind a provider we know is down.
      return { status: 'failed', reason: 'circuit_open', retryable: true };
    }

    // SI-007: keep the message on GSM-7 where the typography allows it.
    const encoded = encodeSms(body);

    let lastReason = 'unknown';
    for (let attempt = 1; attempt <= this.maxAttempts; attempt++) {
      const result = await this.attempt(destination, encoded.body);

      if (result.status === 'sent') {
        this.recordSuccess();
        this.logger.log({
          msg: 'SMS sent',
          destination: maskPhone(destination),
          encoding: encoded.encoding,
          segments: encoded.segments,
          transliterated: encoded.transliterated,
          attempt,
          providerRef: result.providerRef,
        });
        return { ...result, segments: encoded.segments, encoding: encoded.encoding };
      }

      lastReason = result.reason;

      // A rejected number or a malformed request will be rejected identically
      // on every retry; only transient faults are worth repeating.
      if (!result.retryable) {
        this.recordFailure();
        break;
      }

      if (attempt < this.maxAttempts) await this.backoff(attempt);
    }

    this.recordFailure();
    this.logger.warn({
      msg: 'SMS delivery failed',
      destination: maskPhone(destination),
      reason: lastReason,
      attempts: this.maxAttempts,
    });
    return { status: 'failed', reason: lastReason, retryable: true };
  }

  private async attempt(
    destination: string,
    body: string,
  ): Promise<
    { status: 'sent'; providerRef: string | null } | { status: 'failed'; reason: string; retryable: boolean }
  > {
    const correlationId = currentContext()?.correlationId;

    try {
      const response = await fetch(this.url!, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${this.token}`,
          // §3.2: every outbound call carries a correlation ID.
          ...(correlationId ? { 'x-correlation-id': correlationId } : {}),
        },
        body: JSON.stringify({
          to: destination,
          from: this.senderId,
          text: body,
        }),
        // NFR-DEP-001: an explicit timeout on every external call.
        signal: AbortSignal.timeout(this.timeoutMs),
      });

      if (response.ok) {
        // Aggregators disagree on the field name for their message id; take the
        // first that looks like one, and treat its absence as non-fatal.
        const payload = (await response.json().catch(() => ({}))) as Record<string, unknown>;
        const ref =
          payload.messageId ?? payload.message_id ?? payload.id ?? payload.reference ?? null;
        return { status: 'sent', providerRef: ref === null ? null : String(ref) };
      }

      // 4xx is our fault and will not improve; 408 and 429 are the exceptions.
      const retryable =
        response.status >= 500 || response.status === 408 || response.status === 429;
      return { status: 'failed', reason: `http_${response.status}`, retryable };
    } catch (error) {
      const timedOut = error instanceof DOMException && error.name === 'TimeoutError';
      return {
        status: 'failed',
        reason: timedOut ? 'timeout' : 'network_error',
        retryable: true,
      };
    }
  }

  /**
   * Exponential backoff with full jitter.
   *
   * The jitter matters more than the backoff: without it, every message queued
   * during an outage retries at the same instant and the provider is hit by a
   * synchronised burst the moment it recovers.
   */
  private async backoff(attempt: number): Promise<void> {
    const ceiling = Math.min(1000 * 2 ** (attempt - 1), 8000);
    const delay = Math.random() * ceiling;
    await new Promise((resolve) => setTimeout(resolve, delay));
  }

  private allowRequest(): boolean {
    if (this.breaker === 'closed') return true;

    if (this.breaker === 'open') {
      if (Date.now() - this.openedAt < this.cooldownMs) return false;
      // Cooldown elapsed: let a single request through to test the water.
      this.breaker = 'half_open';
      this.logger.log({ msg: 'SMS circuit breaker half-open, probing provider' });
      return true;
    }

    // half_open: one probe is already in flight.
    return true;
  }

  private recordSuccess(): void {
    if (this.breaker !== 'closed') {
      this.logger.log({ msg: 'SMS circuit breaker closed, provider healthy' });
    }
    this.breaker = 'closed';
    this.consecutiveFailures = 0;
  }

  private recordFailure(): void {
    this.consecutiveFailures++;
    if (this.consecutiveFailures >= this.failureThreshold && this.breaker !== 'open') {
      this.breaker = 'open';
      this.openedAt = Date.now();
      // NFR-MNT-006 wants provider degradation to reach the on-call channel.
      this.logger.error({
        msg: 'SMS circuit breaker OPEN: provider unhealthy, failing fast',
        consecutiveFailures: this.consecutiveFailures,
        cooldownMs: this.cooldownMs,
      });
    }
  }

  /** Exposed for the health probe and for NFR-DEP-004 provider metrics. */
  get health(): { configured: boolean; breaker: BreakerState; consecutiveFailures: number } {
    return {
      configured: this.configured,
      breaker: this.breaker,
      consecutiveFailures: this.consecutiveFailures,
    };
  }
}
