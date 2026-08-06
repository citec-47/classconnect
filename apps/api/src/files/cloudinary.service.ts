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
    const signed: Record<string, string | number> = {
      folder: input.folder,
      public_id: input.publicId,
      timestamp,
      type: 'authenticated',
      upload_preset: this.uploadPreset,
    };

    return {
      cloudName: this.cloudName,
      apiKey: this.apiKey,
      timestamp,
      signature: this.sign(signed),
      uploadPreset: this.uploadPreset,
      folder: input.folder,
      publicId: input.publicId,
      type: 'authenticated',
      resourceType: input.resourceType,
      uploadUrl: `https://api.cloudinary.com/v1_1/${this.cloudName}/${input.resourceType}/upload`,
    };
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

    // Transformation components participate in the signature and must appear in
    // the URL in the same order they were signed.
    const parts: string[] = [`e_${expiresAtEpoch}`];
    if (resourceType === 'image') {
      // FR-FIL-004: strip the metadata profile from delivered images.
      parts.push('fl_strip_profile');
    }
    if (options.download) parts.push('fl_attachment');

    const transformation = parts.join(',');
    const toSign = `${transformation}/${publicId}`;
    const signature = createHash('sha1')
      .update(`${toSign}${this.apiSecret}`)
      .digest('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .slice(0, 8);

    const url =
      `https://res.cloudinary.com/${this.cloudName}/${resourceType}/authenticated/` +
      `s--${signature}--/${transformation}/${publicId}`;

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
