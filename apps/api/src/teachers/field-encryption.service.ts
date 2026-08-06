import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

/**
 * NFR-SEC-003: identity documents, payout details and safeguarding reports are
 * encrypted at the application layer with a key separate from the database
 * credentials, accessible only to the roles that require them.
 *
 * AES-256-GCM: authenticated, so a tampered ciphertext fails to decrypt rather
 * than yielding plausible garbage. The stored form is `v1:iv:tag:ciphertext`,
 * base64url per part, with the version prefix so the key can be rotated
 * (NFR-SEC-007 requires annual rotation) without ambiguity about which key
 * produced an existing value.
 */
@Injectable()
export class FieldEncryptionService {
  private readonly logger = new Logger(FieldEncryptionService.name);
  private readonly key: Buffer;

  constructor(env: ConfigService) {
    const raw = env.get<string>('FIELD_ENCRYPTION_KEY');
    if (!raw) {
      throw new Error(
        'FIELD_ENCRYPTION_KEY is required (NFR-SEC-003). Generate one with: ' +
          'node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'base64\'))"',
      );
    }
    const key = Buffer.from(raw, 'base64');
    if (key.length !== 32) {
      throw new Error('FIELD_ENCRYPTION_KEY must decode to exactly 32 bytes for AES-256-GCM');
    }
    this.key = key;
  }

  encrypt(plaintext: string): string {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.key, iv);
    const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    return [
      'v1',
      iv.toString('base64url'),
      tag.toString('base64url'),
      ciphertext.toString('base64url'),
    ].join(':');
  }

  decrypt(stored: string): string {
    const [version, ivPart, tagPart, dataPart] = stored.split(':');
    if (version !== 'v1' || !ivPart || !tagPart || !dataPart) {
      throw new Error('Unrecognised ciphertext format');
    }
    const decipher = createDecipheriv(
      'aes-256-gcm',
      this.key,
      Buffer.from(ivPart, 'base64url'),
    );
    decipher.setAuthTag(Buffer.from(tagPart, 'base64url'));
    return Buffer.concat([
      decipher.update(Buffer.from(dataPart, 'base64url')),
      decipher.final(),
    ]).toString('utf8');
  }

  /**
   * Renders a payout wallet for a Finance Admin without exposing the full value
   * in a list view. NFR-SEC-009 keeps the full value out of logs entirely.
   */
  maskedPreview(stored: string): string {
    try {
      const plain = this.decrypt(stored);
      return plain.length <= 4 ? '****' : `****${plain.slice(-4)}`;
    } catch {
      this.logger.warn('Failed to decrypt a stored field for preview');
      return '****';
    }
  }
}
