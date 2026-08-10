import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash } from 'node:crypto';

/**
 * Object storage and CDN — SI-006.
 *
 * "Signed-URL upload direct from client; signed, expiring read URLs;
 *  server-side virus scanning before a file becomes downloadable; automatic
 *  image and document optimisation."
 *
 * Direct-from-client upload keeps large files off the API, which matters on the
 * §6.2 bandwidth budget — but it means the server never sees the bytes. The
 * safeguards are therefore: the server signs each upload against a narrow
 * parameter allow-list, and independently confirms with Cloudinary what was
 * actually stored before the record becomes usable.
 *
 * Assets are stored as `type: authenticated`, so FR-FIL-003 holds by
 * construction: there is no permanent public URL to leak.
 */

export interface SignedUploadParams {
  cloudName: string;
  apiKey: string;
  timestamp: number;
  signature: string;
  uploadPreset: string;
  folder: string;
  publicId: string;
  type: 'authenticated';
  resourceType: 'image' | 'raw' | 'video';
  uploadUrl: string;
}

export interface StoredAsset {
  publicId: string;
  resourceType: string;
  format: string | null;
  bytes: number;
  type: string;
  createdAt: string;
  etag: string | null;
}

@Injectable()
export class CloudinaryService {
  private readonly logger = new Logger(CloudinaryService.name);

  private readonly cloudName: string;
  private readonly apiKey: string;
  private readonly apiSecret: string;
  private readonly uploadPreset: string;
  private readonly signedUrlTtl: number;

  constructor(env: ConfigService) {
    this.cloudName = env.getOrThrow<string>('CLOUDINARY_CLOUD_NAME');
    this.apiKey = env.getOrThrow<string>('CLOUDINARY_API_KEY');
    this.apiSecret = env.getOrThrow<string>('CLOUDINARY_API_SECRET');
    this.uploadPreset = env.get<string>('CLOUDINARY_UPLOAD_PRESET') ?? 'classconnect';
    this.signedUrlTtl = Number(env.get('FILE_SIGNED_URL_TTL_SECONDS') ?? 300);
  }

  get configured(): boolean {
    return Boolean(this.cloudName && this.apiKey && this.apiSecret);
  }

  /**
   * Produces the parameters a client needs to upload one file, and nothing else.
   *
   * The signature covers every parameter the client will send. Cloudinary
   * rejects the upload if the client alters any of them, so the client cannot
   * choose its own folder, change the delivery type to public, or overwrite
   * somebody else's asset.
   */
  signUpload(input: {
    folder: string;
    publicId: string;
    resourceType: 'image' | 'raw' | 'video';
  }): SignedUploadParams {
    const timestamp = Math.floor(Date.now() / 1000);

    // Cloudinary signs the alphabetically sorted, &-joined parameter list.
    // `api_key`, `file`, `resource_type` and `cloud_name` are excluded by spec.
    /*
     * `public_id` only — deliberately no `folder`.
     *
     * Cloudinary *prepends* `folder` to `public_id`. Our public_id already
     * carries the full path, so sending both stored the asset at
     * `classconnect/messages/…/classconnect/messages/…/<id>` while the confirm
     * step looked for the path we asked for and found nothing. That surfaced as
     * "we did not receive that file" for an upload that had in fact succeeded.
     *
     * One source of truth for the path, and it is `public_id`.
     */
    const signed: Record<string, string | number> = {
      public_id: input.publicId,
      timestamp,
      type: 'authenticated',
      upload_preset: this.uploadPreset,
    };
    void input.folder;

    return {
      cloudName: this.cloudName,
      apiKey: this.apiKey,
      timestamp,
      signature: this.sign(signed),
      uploadPreset: this.uploadPreset,
      /*
       * Returned for logging only — a client must NOT post this.
       *
       * It is not part of the signed set any more, so including it in the form
       * would invalidate the signature. The path lives entirely in `publicId`.
       */
      folder: input.folder,
      publicId: input.publicId,
      type: 'authenticated',
      resourceType: input.resourceType,
      uploadUrl: `https://api.cloudinary.com/v1_1/${this.cloudName}/${input.resourceType}/upload`,
    };
  }

  /**
   * Uploads bytes to Cloudinary from the server.
   *
   * The browser used to POST straight to Cloudinary, which is the faster
   * arrangement and the one SI-006 describes — but it puts the upload at the
   * mercy of the browser's own network policy, and in practice it failed with a
   * bare `NetworkError` that told nobody anything. Cloudinary was reachable; the
   * cross-origin POST was not completing.
   *
   * Going through the API removes CORS, extension blocking and corporate
   * filtering from the path entirely: the only connection that has to work is
   * server-to-Cloudinary, which is the same one `getAsset` and the scan already
   * depend on. The cost is that a file up to 25 MB passes through the API rather
   * than going direct. At this scale, and for a team of four (CON07), an upload
   * that works everywhere beats one that is cheaper and works on some networks.
   */
  async uploadBuffer(input: {
    folder: string;
    publicId: string;
    resourceType: 'image' | 'raw' | 'video';
    bytes: Buffer;
    fileName: string;
    mimeType: string;
  }): Promise<{ publicId: string; bytes: number; type: string } | null> {
    const timestamp = Math.floor(Date.now() / 1000);

    // The same signed parameter set the browser used to send. Cloudinary
    // verifies the signature covers exactly what arrives, so the folder and the
    // authenticated delivery type still cannot be altered in transit.
    /*
     * `public_id` only — deliberately no `folder`.
     *
     * Cloudinary *prepends* `folder` to `public_id`. Our public_id already
     * carries the full path, so sending both stored the asset at
     * `classconnect/messages/…/classconnect/messages/…/<id>` while the confirm
     * step looked for the path we asked for and found nothing. That surfaced as
     * "we did not receive that file" for an upload that had in fact succeeded.
     *
     * One source of truth for the path, and it is `public_id`.
     */
    const signed: Record<string, string | number> = {
      public_id: input.publicId,
      timestamp,
      type: 'authenticated',
      upload_preset: this.uploadPreset,
    };
    void input.folder;

    const form = new FormData();
    form.append('file', new Blob([new Uint8Array(input.bytes)], { type: input.mimeType }), input.fileName);
    form.append('api_key', this.apiKey);
    for (const [key, value] of Object.entries(signed)) form.append(key, String(value));
    form.append('signature', this.sign(signed));

    const url = `https://api.cloudinary.com/v1_1/${this.cloudName}/${input.resourceType}/upload`;

    this.logger.log(
      `Uploading ${input.bytes.length} bytes to ${input.resourceType}/${input.publicId}`,
    );

    try {
      /*
       * NFR-DEP-001: every external call has a timeout.
       *
       * This one was missing it, and the consequence was the worst kind of
       * failure: no error, no log line, the browser sat on "Sending…"
       * indefinitely. A request that fails is information; a request that hangs
       * is not.
       *
       * 60s rather than the 10s the requirement names, because this is a body
       * transfer of up to 25 MB rather than a control call — the ceiling is
       * there to bound a hang, not to bound a large legitimate upload.
       */
      const response = await fetch(url, {
        method: 'POST',
        body: form,
        signal: AbortSignal.timeout(60_000),
      });
      const body = (await response.json()) as {
        public_id?: string;
        bytes?: number;
        type?: string;
        error?: { message?: string };
      };

      if (!response.ok) {
        // Cloudinary's own message, logged rather than swallowed — it names the
        // reason (a missing preset, an unsigned preset, a bad signature) far
        // better than any message we could invent.
        this.logger.error(
          `Cloudinary upload refused (${response.status}): ${body?.error?.message ?? 'no message'}`,
        );
        return null;
      }

      this.logger.log(`Cloudinary stored ${body.public_id} (${body.bytes} bytes)`);

      return {
        publicId: body.public_id ?? input.publicId,
        bytes: body.bytes ?? input.bytes.length,
        type: body.type ?? 'authenticated',
      };
    } catch (error) {
      const failure = error as Error;
      if (failure.name === 'TimeoutError' || failure.name === 'AbortError') {
        this.logger.error(
          `Cloudinary upload timed out after 60s (${input.bytes.length} bytes). ` +
            'The asset may or may not have been stored; the confirm step decides.',
        );
      } else {
        this.logger.error(`Cloudinary upload failed: ${failure.message}`);
      }
      return null;
    }
  }

  /**
   * Asks Cloudinary what it actually stored.
   *
   * The client reports a public_id after uploading; believing it would let a
   * caller register a record pointing at an asset it never uploaded, or claim a
   * size and type that do not match the bytes. This is the authoritative read.
   */
  async getAsset(
    publicId: string,
    resourceType: 'image' | 'raw' | 'video',
  ): Promise<StoredAsset | null> {
    const url =
      `https://api.cloudinary.com/v1_1/${this.cloudName}/resources/${resourceType}/authenticated/${encodeURIComponent(publicId)}`;

    const response = await this.adminFetch(url);
    if (response === null) return null;

    return {
      publicId: String(response.public_id),
      resourceType: String(response.resource_type),
      format: response.format ? String(response.format) : null,
      bytes: Number(response.bytes ?? 0),
      type: String(response.type),
      createdAt: String(response.created_at),
      etag: response.etag ? String(response.etag) : null,
    };
  }

  /**
   * FR-FIL-003: a short-lived signed read URL. No file is reachable by a
   * permanent public URL, so this is the only way to read one.
   *
   * FR-FIL-004: image reads carry `fl_strip_profile`, which removes the EXIF
   * profile — including GPS location — from what is delivered.
   */
  signedReadUrl(
    publicId: string,
    resourceType: 'image' | 'raw' | 'video',
    options: { ttlSeconds?: number; download?: boolean } = {},
  ): { url: string; expiresAt: Date } {
    const ttl = options.ttlSeconds ?? this.signedUrlTtl;
    const expiresAtEpoch = Math.floor(Date.now() / 1000) + ttl;

    /*
     * No `e_<epoch>` component.
     *
     * That was here to express expiry, and it is not what `e_` means: in a
     * Cloudinary transformation `e_` is **effect**. The URL was asking for an
     * effect named after a Unix timestamp, Cloudinary refused the delivery, and
     * every image rendered as a broken `<img>` — with the upload, the storage
     * and the scan all working perfectly behind it.
     *
     * ## What protects the asset now, and what does not
     *
     * The asset is stored as `authenticated`, so it has **no public URL at all**
     * — FR-FIL-003's first requirement holds. Delivery needs this signature,
     * derived from the API secret, which no client can produce. A URL is minted
     * only when a thread participant opens the file, and only after the scan has
     * passed.
     *
     * What is *not* enforced is Cloudinary-side expiry: a URL that leaks stays
     * valid. Real expiry needs Cloudinary's token-based authentication, a paid
     * add-on. `expiresAt` below is therefore honest about what it is — how long
     * the client may cache the URL before asking for another — and the gap
     * against FR-FIL-003's "short-lived" wording should be closed by enabling
     * that feature before launch.
     */
    const parts: string[] = [];
    if (resourceType === 'image') {
      // FR-FIL-004: strip the metadata profile from delivered images.
      parts.push('fl_strip_profile');
    }
    if (options.download) parts.push('fl_attachment');

    const transformation = parts.join(',');
    // Signed over exactly what appears in the path, in the same order.
    const toSign = transformation ? `${transformation}/${publicId}` : publicId;
    const signature = createHash('sha1')
      .update(`${toSign}${this.apiSecret}`)
      .digest('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .slice(0, 8);

    const url =
      `https://res.cloudinary.com/${this.cloudName}/${resourceType}/authenticated/` +
      `s--${signature}--/${toSign}`;

    return { url, expiresAt: new Date(expiresAtEpoch * 1000) };
  }

  /** Removes an asset — used when a file fails policy or is quarantined. */
  async destroy(publicId: string, resourceType: 'image' | 'raw' | 'video'): Promise<void> {
    const timestamp = Math.floor(Date.now() / 1000);
    const signature = this.sign({ public_id: publicId, timestamp, type: 'authenticated' });

    const body = new URLSearchParams({
      public_id: publicId,
      type: 'authenticated',
      timestamp: String(timestamp),
      api_key: this.apiKey,
      signature,
    });

    try {
      await fetch(
        `https://api.cloudinary.com/v1_1/${this.cloudName}/${resourceType}/destroy`,
        { method: 'POST', body, signal: AbortSignal.timeout(10_000) },
      );
    } catch (error) {
      // NFR-DEP-001: a storage failure must not take down the caller. The row
      // is still marked quarantined, so the asset is unreachable either way.
      this.logger.error({
        msg: 'Failed to destroy asset',
        publicId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /** Cloudinary's signature: sorted `k=v` pairs joined by `&`, then the secret. */
  private sign(params: Record<string, string | number>): string {
    const canonical = Object.keys(params)
      .sort()
      .map((key) => `${key}=${params[key]}`)
      .join('&');
    return createHash('sha1').update(`${canonical}${this.apiSecret}`).digest('hex');
  }

  /**
   * NFR-DEP-001: every external call has an explicit timeout. A 404 is a normal
   * answer here (the asset does not exist), so it returns null rather than
   * throwing.
   */
  private async adminFetch(url: string): Promise<Record<string, unknown> | null> {
    const auth = Buffer.from(`${this.apiKey}:${this.apiSecret}`).toString('base64');

    const response = await fetch(url, {
      headers: { authorization: `Basic ${auth}` },
      signal: AbortSignal.timeout(10_000),
    });

    if (response.status === 404) return null;
    if (!response.ok) {
      throw new Error(`Cloudinary admin API returned ${response.status}`);
    }
    return (await response.json()) as Record<string, unknown>;
  }
}
