import { createHash, createHmac } from 'node:crypto';
import { Injectable, Logger } from '@nestjs/common';

/**
 * Signed, expiring links to lesson recordings in S3-compatible storage.
 *
 * ## Why the URL is signed rather than the bucket public
 *
 * A recording is a room full of children. A public object URL is a permanent,
 * unauthenticated key to it that keeps working after it is forwarded, screenshot
 * or indexed — and nothing in the platform can withdraw it. Every link handed
 * out here expires, so a shared link becomes useless rather than becoming a
 * distribution channel.
 *
 * Signing is deliberately separate from deciding *who may watch*. This class
 * mints a link for a key it is given and asks no questions; the entitlement
 * check lives with the session rules, where the answer is knowable. Keeping the
 * two apart means holding this service alone gets nobody a recording.
 *
 * ## Why SigV4 by hand instead of the AWS SDK
 *
 * `@aws-sdk/client-s3` and its presigner are tens of megabytes for one
 * deterministic string-building routine, on a platform whose development machine
 * has four cores and whose deployment target is not generous either. The
 * algorithm below is the published one, and it is verified against the real
 * bucket rather than trusted.
 *
 * Works with any S3-compatible store — Supabase, R2, B2, MinIO, AWS.
 */
@Injectable()
export class RecordingStorageService {
  private readonly logger = new Logger(RecordingStorageService.name);

  /** Long enough to watch a 45-minute lesson, short enough that sharing fails. */
  static readonly TTL_SECONDS = 3 * 60 * 60;

  get configured(): boolean {
    return Boolean(
      process.env.LIVEKIT_S3_BUCKET &&
        process.env.LIVEKIT_S3_ACCESS_KEY &&
        process.env.LIVEKIT_S3_SECRET,
    );
  }

  /**
   * A time-limited link to one stored object.
   *
   * The expiry is part of what is signed, so it cannot be extended by editing
   * the URL: any tampering invalidates the signature and the store returns 403.
   */
  signedUrl(storageKey: string, ttlSeconds = RecordingStorageService.TTL_SECONDS): string | null {
    return this.presign('GET', storageKey, ttlSeconds);
  }

  /**
   * Does this object exist, and how big is it?
   *
   * The question the platform should have been asking all along. LiveKit
   * reported an egress as COMPLETE while returning no result details at all, so
   * the ingest concluded nothing had been produced — while the segments sat in
   * the bucket. The store is where the file is; it is also where to ask whether
   * the file is there.
   *
   * Null means absent, which is a real answer and not an error.
   */
  async head(storageKey: string): Promise<{ sizeBytes: number } | null> {
    const url = this.presign('HEAD', storageKey, 60);
    if (!url) return null;

    try {
      const response = await fetch(url, { method: 'HEAD', signal: AbortSignal.timeout(20_000) });
      if (!response.ok) return null;
      return { sizeBytes: Number(response.headers.get('content-length') ?? 0) };
    } catch (error) {
      this.logger.error(`Could not stat ${storageKey}: ${(error as Error).message}`);
      return null;
    }
  }

  /**
   * The contents of a small text object, or null.
   *
   * For playlists only. A `.m3u8` is a few kilobytes of line-separated text, and
   * the API rewrites it before handing it to a player. Nothing else should read
   * an object through the server: segments are megabytes and go straight from
   * the store to the browser on their own signed URLs, because proxying them
   * would put every lesson's video through this process.
   */
  async fetchText(storageKey: string): Promise<string | null> {
    const url = this.presign('GET', storageKey, 60);
    if (!url) return null;

    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(20_000) });
      if (!response.ok) {
        this.logger.error(`Could not read ${storageKey}: HTTP ${response.status}`);
        return null;
      }
      return await response.text();
    } catch (error) {
      this.logger.error(`Could not read ${storageKey}: ${(error as Error).message}`);
      return null;
    }
  }

  /**
   * Every object under a prefix, with its size.
   *
   * A segmented recording is a folder, so its size is the sum of its parts and
   * its integrity is "the playlist and at least one segment are present". Both
   * need the listing rather than a single stat.
   *
   * Deliberately unpaginated: a lesson is a few hundred segments at most, well
   * inside one response. A prefix that could exceed a thousand keys would need
   * the continuation token, and nothing here produces one.
   */
  async list(prefix: string): Promise<{ key: string; sizeBytes: number }[]> {
    const url = this.presign('GET', '', 60, { 'list-type': '2', prefix });
    if (!url) return [];

    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(30_000) });
      if (!response.ok) {
        this.logger.error(`Could not list ${prefix}: HTTP ${response.status}`);
        return [];
      }

      /*
       * Parsed with a regular expression rather than an XML library.
       *
       * S3 list responses are a flat, machine-generated shape — `<Contents>`
       * holding `<Key>` and `<Size>` — and adding an XML parser to the
       * dependency tree for two fields is not a trade worth making on a
       * four-core machine. Anything more structural than this should use one.
       */
      const body = await response.text();
      return [...body.matchAll(/<Contents>[\s\S]*?<\/Contents>/g)].flatMap((match) => {
        const key = /<Key>([^<]+)<\/Key>/.exec(match[0])?.[1];
        const size = /<Size>(\d+)<\/Size>/.exec(match[0])?.[1];
        return key ? [{ key, sizeBytes: Number(size ?? 0) }] : [];
      });
    } catch (error) {
      this.logger.error(`Could not list ${prefix}: ${(error as Error).message}`);
      return [];
    }
  }

  /**
   * Deletes a stored object. Admin-only at the callers; unauthenticated here.
   *
   * Reported, never swallowed: a row disappearing while the file remains would
   * leave a recording of children in storage that the platform believes it has
   * destroyed — and nobody would look again.
   */
  async remove(storageKey: string): Promise<boolean> {
    /*
     * Signed for DELETE specifically. The read link cannot authorise this, which
     * is the entire point of scoping a signature to a verb.
     */
    const url = this.presign('DELETE', storageKey, 60);
    if (!url) return false;

    try {
      const response = await fetch(url, { method: 'DELETE', signal: AbortSignal.timeout(20_000) });
      /* Already gone is the outcome we wanted, so 404 is success, not failure. */
      if (!response.ok && response.status !== 404) {
        this.logger.error(`Could not delete ${storageKey}: HTTP ${response.status}`);
        return false;
      }
      return true;
    } catch (error) {
      this.logger.error(`Could not delete ${storageKey}: ${(error as Error).message}`);
      return false;
    }
  }

  /**
   * AWS Signature Version 4, query-parameter form, for one verb and one object.
   *
   * One routine for every verb: writing it twice is how a delete ends up signed
   * as a read, which fails in production and nowhere else.
   */
  private presign(
    method: 'GET' | 'HEAD' | 'DELETE',
    storageKey: string,
    ttlSeconds: number,
    /**
     * Extra query parameters, which must be signed along with everything else.
     *
     * Used for listing, where `list-type` and `prefix` are part of the request
     * rather than decoration: appending them after signing produces a URL whose
     * signature covers a different request, and the store answers 403 with no
     * indication of which parameter was the problem.
     */
    extraQuery?: Record<string, string>,
  ): string | null {
    if (!this.configured) return null;

    const bucket = process.env.LIVEKIT_S3_BUCKET!;
    const accessKey = process.env.LIVEKIT_S3_ACCESS_KEY!;
    const secret = process.env.LIVEKIT_S3_SECRET!;
    const region = process.env.LIVEKIT_S3_REGION || 'auto';
    const endpoint = process.env.LIVEKIT_S3_ENDPOINT || `https://s3.${region}.amazonaws.com`;

    const base = new URL(endpoint);

    /*
     * Path-style, always: `<endpoint>/<bucket>/<key>`.
     *
     * Supabase, MinIO and R2 all serve this way and AWS still accepts it. The
     * virtual-host form would need a different signing host per store, which is
     * one more thing to get wrong for no gain.
     *
     * The endpoint's own path is part of the signature and is easy to drop:
     * Supabase's ends in `/storage/v1/s3`, and a signature computed without it
     * is valid for a URL nobody will ever request.
     */
    const prefix = base.pathname.replace(/\/$/, '');
    /*
     * An empty key addresses the bucket itself, which is what a listing asks
     * for. The trailing slash matters to the signature and must not be added.
     */
    const canonicalUri = storageKey
      ? `${prefix}/${bucket}/${this.encodeKey(storageKey)}`
      : `${prefix}/${bucket}`;

    const amzDate = new Date().toISOString().replace(/[:-]|\.\d{3}/g, '');
    const dateStamp = amzDate.slice(0, 8);
    const scope = `${dateStamp}/${region}/s3/aws4_request`;

    const params = new URLSearchParams({
      ...extraQuery,
      'X-Amz-Algorithm': 'AWS4-HMAC-SHA256',
      'X-Amz-Credential': `${accessKey}/${scope}`,
      'X-Amz-Date': amzDate,
      'X-Amz-Expires': String(ttlSeconds),
      'X-Amz-SignedHeaders': 'host',
    });
    params.sort();
    const canonicalQuery = this.encodeQuery(params);

    const canonicalRequest = [
      method,
      canonicalUri,
      canonicalQuery,
      `host:${base.host}\n`,
      'host',
      /* A presigned request carries no body, and a browser cannot add one. */
      'UNSIGNED-PAYLOAD',
    ].join('\n');

    const stringToSign = [
      'AWS4-HMAC-SHA256',
      amzDate,
      scope,
      createHash('sha256').update(canonicalRequest).digest('hex'),
    ].join('\n');

    const signature = this.sign(secret, dateStamp, region, stringToSign);
    return `${base.protocol}//${base.host}${canonicalUri}?${canonicalQuery}&X-Amz-Signature=${signature}`;
  }

  /** The signing key: four chained HMACs, narrowing secret → date → region → service. */
  private sign(secret: string, dateStamp: string, region: string, stringToSign: string): string {
    const hmac = (key: Buffer | string, data: string) =>
      createHmac('sha256', key).update(data).digest();

    const dateKey = hmac(`AWS4${secret}`, dateStamp);
    const regionKey = hmac(dateKey, region);
    const serviceKey = hmac(regionKey, 's3');
    const signingKey = hmac(serviceKey, 'aws4_request');
    return createHmac('sha256', signingKey).update(stringToSign).digest('hex');
  }

  /**
   * Percent-encoding as S3 defines it, which is not what `encodeURIComponent` does.
   *
   * Slashes stay literal — they separate path segments, and encoding them signs a
   * different object. `!*'()` must be escaped, which `encodeURIComponent` leaves
   * alone; a key containing an apostrophe would otherwise sign correctly for a
   * string the store never sees, failing on some recordings and not others.
   */
  private encodeKey(key: string): string {
    return key
      .split('/')
      .map((segment) => this.rfc3986(encodeURIComponent(segment)))
      .join('/');
  }

  private encodeQuery(params: URLSearchParams): string {
    return [...params.entries()]
      .map(([k, v]) => `${this.rfc3986(encodeURIComponent(k))}=${this.rfc3986(encodeURIComponent(v))}`)
      .join('&');
  }

  private rfc3986(value: string): string {
    return value.replace(/[!*'()]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
  }
}
