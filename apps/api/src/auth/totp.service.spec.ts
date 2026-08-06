import { TotpService } from './totp.service';

/**
 * FR-AUT-009: multi-factor authentication for all Admin and Support roles.
 * The admin verification queue (FR-TVR-004) is unreachable without this, so a
 * fault here is a fault in teacher onboarding.
 */
describe('TotpService — FR-AUT-009', () => {
  const totp = new TotpService();

  it('generates a base32 secret an authenticator app can consume', () => {
    const secret = totp.generateSecret();
    expect(secret).toMatch(/^[A-Z2-7]+$/);
    // 20 random bytes -> 32 base32 characters.
    expect(secret.length).toBe(32);
  });

  it('generates a different secret each time', () => {
    expect(totp.generateSecret()).not.toBe(totp.generateSecret());
  });

  it('produces a provisioning URI carrying the issuer and parameters', () => {
    const uri = totp.provisioningUri('JBSWY3DPEHPK3PXP', 'admin@classconnect.local');
    expect(uri).toContain('otpauth://totp/ClassConnect:');
    expect(uri).toContain('secret=JBSWY3DPEHPK3PXP');
    expect(uri).toContain('issuer=ClassConnect');
    expect(uri).toContain('digits=6');
    expect(uri).toContain('period=30');
  });

  it('matches the RFC 6238 reference vector', () => {
    // RFC 6238 Appendix B: secret "12345678901234567890" (ASCII) at T=59
    // yields 94287082 for SHA-1. Base32 of that ASCII secret is GEZDGNBVGY3TQOJQ...
    const secret = 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ';
    const at = new Date(59 * 1000);
    // The 6-digit truncation of the reference 8-digit value.
    expect(totp.verify(secret, '287082', at)).toBe(true);
  });

  it('accepts a code generated for the current window', () => {
    const secret = totp.generateSecret();
    const now = new Date();
    // Derive the expected code by asking the service to verify each candidate
    // is not practical; instead assert round-trip through a known instant.
    const code = currentCodeFor(totp, secret, now);
    expect(totp.verify(secret, code, now)).toBe(true);
  });

  it('tolerates one step of clock drift either side', () => {
    const secret = totp.generateSecret();
    const now = new Date();
    const code = currentCodeFor(totp, secret, now);

    expect(totp.verify(secret, code, new Date(now.getTime() + 30_000))).toBe(true);
    expect(totp.verify(secret, code, new Date(now.getTime() - 30_000))).toBe(true);
  });

  it('rejects a code two steps away, so the window stays narrow', () => {
    const secret = totp.generateSecret();
    const now = new Date();
    const code = currentCodeFor(totp, secret, now);
    expect(totp.verify(secret, code, new Date(now.getTime() + 90_000))).toBe(false);
  });

  it('rejects a malformed code without throwing', () => {
    const secret = totp.generateSecret();
    for (const bad of ['', '12345', '1234567', 'abcdef', '12 34 56']) {
      expect(totp.verify(secret, bad)).toBe(false);
    }
  });

  it('rejects a code from a different secret', () => {
    const now = new Date();
    const a = totp.generateSecret();
    const b = totp.generateSecret();
    expect(totp.verify(b, currentCodeFor(totp, a, now), now)).toBe(false);
  });
});

/**
 * Finds the code the service currently expects, by probing the verifier at a
 * fixed instant. Keeps the test independent of the private generator while
 * still exercising the real algorithm.
 */
function currentCodeFor(totp: TotpService, secret: string, at: Date): string {
  // Reconstruct via the same public surface the caller has: brute-force over
  // the 6-digit space is impractical, so use the documented internal contract
  // through a narrow cast. The algorithm itself remains under test above.
  const generate = (totp as unknown as {
    generate(secret: string, counter: number): string;
  }).generate.bind(totp);
  return generate(secret, Math.floor(at.getTime() / 1000 / 30));
}
