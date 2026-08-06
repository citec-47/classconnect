import { Injectable } from '@nestjs/common';
import { hash, verify, Algorithm } from '@node-rs/argon2';
import { randomInt, timingSafeEqual, createHash } from 'node:crypto';

/**
 * NFR-SEC-001: passwords are hashed with Argon2id. Plaintext passwords are
 * never logged, stored or emailed.
 *
 * The same primitive protects one-time codes: an OTP is a short-lived
 * credential, and storing it in clear would let a database read impersonate
 * every pending sign-in.
 */
@Injectable()
export class PasswordService {
  // OWASP-recommended baseline for Argon2id (NFR-SEC-004 references the Top 10).
  private readonly options = {
    algorithm: Algorithm.Argon2id,
    memoryCost: 19456, // 19 MiB
    timeCost: 2,
    parallelism: 1,
  };

  async hash(plaintext: string): Promise<string> {
    return hash(plaintext, this.options);
  }

  /**
   * Returns false rather than throwing on a malformed stored hash, so a corrupt
   * row is a failed sign-in rather than a 500 that leaks the shape of the data.
   */
  async verify(storedHash: string, plaintext: string): Promise<boolean> {
    try {
      return await verify(storedHash, plaintext);
    } catch {
      return false;
    }
  }

  /**
   * FR-AUT-002: a 6-digit one-time code.
   *
   * `randomInt` is drawn from the CSPRNG. Codes are generated over the full
   * 000000–999999 range, including leading zeros, so the space is not reduced
   * by formatting.
   */
  generateOtp(): string {
    return randomInt(0, 1_000_000).toString().padStart(6, '0');
  }

  /**
   * Constant-time comparison for values that are already digests — refresh
   * tokens and reset tokens, where the candidate is hashed the same way.
   */
  safeEquals(a: string, b: string): boolean {
    const bufferA = Buffer.from(a);
    const bufferB = Buffer.from(b);
    if (bufferA.length !== bufferB.length) return false;
    return timingSafeEqual(bufferA, bufferB);
  }

  /**
   * SHA-256 for high-entropy opaque tokens (refresh tokens). Argon2 is for
   * user-chosen secrets; a 384-bit random token needs no key stretching, and
   * hashing it cheaply keeps refresh off the CPU-bound path.
   */
  digest(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }
}
