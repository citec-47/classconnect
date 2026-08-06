import { Injectable } from '@nestjs/common';
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

/**
 * Time-based one-time passwords (RFC 6238), used for the multi-factor step.
 *
 * FR-AUT-009: multi-factor authentication is required for all Admin and Support
 * roles. Without this, those roles cannot sign in at all — the password path
 * fails closed — so the admin verification queue in FR-TVR-004 depends on it.
 *
 * Implemented against node:crypto rather than a dependency: TOTP is a short,
 * well-specified algorithm, and the compatibility surface that matters is the
 * authenticator app, not a library API.
 */

const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
const DIGITS = 6;
const PERIOD_SECONDS = 30;
/**
 * Accept the immediately previous and next window. One step either side covers
 * ordinary clock drift on a phone without meaningfully widening the window an
 * attacker can guess into.
 */
const DRIFT_WINDOWS = 1;

@Injectable()
export class TotpService {
  /** Generates a new base32 secret for enrolment. */
  generateSecret(): string {
    return this.toBase32(randomBytes(20));
  }

  /**
   * The otpauth:// URI an authenticator app consumes, usually via QR code.
   * The issuer and account name are what the user sees in their app.
   */
  provisioningUri(secret: string, accountName: string): string {
    const params = new URLSearchParams({
      secret,
      issuer: 'ClassConnect',
      algorithm: 'SHA1',
      digits: String(DIGITS),
      period: String(PERIOD_SECONDS),
    });
    return `otpauth://totp/ClassConnect:${encodeURIComponent(accountName)}?${params.toString()}`;
  }

  /**
   * Verifies a code against the secret, allowing for clock drift.
   *
   * Comparison is constant-time so a timing signal cannot be used to recover
   * the expected code digit by digit.
   */
  verify(secret: string, code: string, at: Date = new Date()): boolean {
    if (!/^\d{6}$/.test(code)) return false;

    const counter = Math.floor(at.getTime() / 1000 / PERIOD_SECONDS);
    for (let offset = -DRIFT_WINDOWS; offset <= DRIFT_WINDOWS; offset++) {
      const expected = this.generate(secret, counter + offset);
      const a = Buffer.from(expected);
      const b = Buffer.from(code);
      if (a.length === b.length && timingSafeEqual(a, b)) return true;
    }
    return false;
  }

  /** HOTP (RFC 4226) for a given counter, which TOTP derives from the clock. */
  private generate(secret: string, counter: number): string {
    const key = this.fromBase32(secret);

    const counterBuffer = Buffer.alloc(8);
    counterBuffer.writeBigUInt64BE(BigInt(counter));

    const digest = createHmac('sha1', key).update(counterBuffer).digest();

    // Dynamic truncation, RFC 4226 §5.4.
    const offset = digest[digest.length - 1]! & 0x0f;
    const binary =
      ((digest[offset]! & 0x7f) << 24) |
      ((digest[offset + 1]! & 0xff) << 16) |
      ((digest[offset + 2]! & 0xff) << 8) |
      (digest[offset + 3]! & 0xff);

    return (binary % 10 ** DIGITS).toString().padStart(DIGITS, '0');
  }

  private toBase32(buffer: Buffer): string {
    let bits = 0;
    let value = 0;
    let output = '';

    for (const byte of buffer) {
      value = (value << 8) | byte;
      bits += 8;
      while (bits >= 5) {
        output += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
        bits -= 5;
      }
    }
    if (bits > 0) output += BASE32_ALPHABET[(value << (5 - bits)) & 31];
    return output;
  }

  private fromBase32(input: string): Buffer {
    const cleaned = input.toUpperCase().replace(/=+$/, '').replace(/\s/g, '');
    let bits = 0;
    let value = 0;
    const bytes: number[] = [];

    for (const char of cleaned) {
      const index = BASE32_ALPHABET.indexOf(char);
      if (index === -1) throw new Error('Invalid base32 character in TOTP secret');
      value = (value << 5) | index;
      bits += 5;
      if (bits >= 8) {
        bytes.push((value >>> (bits - 8)) & 0xff);
        bits -= 8;
      }
    }
    return Buffer.from(bytes);
  }
}
