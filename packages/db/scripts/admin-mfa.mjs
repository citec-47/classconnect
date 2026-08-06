/**
 * Manage the second factor on a staff account.
 *
 * FR-AUT-009 requires MFA for Admin and Support roles, and the API enforces it.
 * That is right in production and painful on a laptop: without an authenticator
 * app to hand, a six-digit code that changes every thirty seconds stands
 * between you and your own development environment.
 *
 * This is the escape hatch. It changes one account's data, not the rule — the
 * API still demands a second factor from anyone who has one enrolled.
 *
 *   node scripts/admin-mfa.mjs status  you@example.com
 *   node scripts/admin-mfa.mjs code    you@example.com   # current code, for copying
 *   node scripts/admin-mfa.mjs off     you@example.com   # sign in with just a password
 *   node scripts/admin-mfa.mjs on      you@example.com   # re-enrol, prints a new secret
 *
 * Refuses to run on deployed infrastructure. `off` in production would leave an
 * account that can approve teachers and read children's data behind a password
 * alone.
 */
import { PrismaClient } from '@prisma/client';
import { createHmac, randomBytes, createCipheriv, createDecipheriv } from 'node:crypto';

const PLATFORM_MARKERS = [
  'VERCEL', 'RAILWAY_ENVIRONMENT', 'RENDER', 'FLY_APP_NAME',
  'DYNO', 'K_SERVICE', 'AWS_EXECUTION_ENV', 'WEBSITE_INSTANCE_ID',
  'KUBERNETES_SERVICE_HOST',
];

if (process.env.NODE_ENV === 'production' || PLATFORM_MARKERS.some((m) => process.env[m])) {
  console.error('Refusing to run: this is deployed infrastructure. FR-AUT-009 applies.');
  process.exit(1);
}

const [action, email] = process.argv.slice(2);
if (!action || !email || !['status', 'code', 'off', 'on'].includes(action)) {
  console.error('Usage: node scripts/admin-mfa.mjs <status|code|off|on> <email>');
  process.exit(1);
}

const key = process.env.FIELD_ENCRYPTION_KEY;
if (!key) {
  console.error('FIELD_ENCRYPTION_KEY must be set (NFR-SEC-003).');
  process.exit(1);
}

// Mirrors FieldEncryptionService: AES-256-GCM as v1:iv:tag:ciphertext.
const encrypt = (plaintext) => {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', Buffer.from(key, 'base64'), iv);
  const body = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  return ['v1', iv.toString('base64url'), cipher.getAuthTag().toString('base64url'), body.toString('base64url')].join(':');
};

const decrypt = (stored) => {
  const [version, iv, tag, data] = stored.split(':');
  if (version !== 'v1') throw new Error('Unrecognised ciphertext');
  const decipher = createDecipheriv('aes-256-gcm', Buffer.from(key, 'base64'), Buffer.from(iv, 'base64url'));
  decipher.setAuthTag(Buffer.from(tag, 'base64url'));
  return Buffer.concat([decipher.update(Buffer.from(data, 'base64url')), decipher.final()]).toString('utf8');
};

/** Mirrors MFA_REQUIRED_ROLES in @classconnect/shared (FR-AUT-009). */
const MFA_REQUIRED_ROLES = ['support_agent', 'admin_ops', 'admin_finance', 'super_admin'];

const BASE32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

function toBase32(buffer) {
  let bits = 0, value = 0, out = '';
  for (const byte of buffer) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) { out += BASE32[(value >>> (bits - 5)) & 31]; bits -= 5; }
  }
  if (bits > 0) out += BASE32[(value << (5 - bits)) & 31];
  return out;
}

function currentCode(secret) {
  let bits = 0, value = 0;
  const bytes = [];
  for (const char of secret) {
    value = (value << 5) | BASE32.indexOf(char);
    bits += 5;
    if (bits >= 8) { bytes.push((value >>> (bits - 8)) & 0xff); bits -= 8; }
  }
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 1000 / 30)));
  const digest = createHmac('sha1', Buffer.from(bytes)).update(counter).digest();
  const offset = digest[digest.length - 1] & 0x0f;
  const binary =
    ((digest[offset] & 0x7f) << 24) |
    ((digest[offset + 1] & 0xff) << 16) |
    ((digest[offset + 2] & 0xff) << 8) |
    (digest[offset + 3] & 0xff);
  return (binary % 1_000_000).toString().padStart(6, '0');
}

const prisma = new PrismaClient();
const user = await prisma.user.findUnique({
  where: { email: email.toLowerCase() },
  include: { roles: true },
});

if (!user) {
  console.error(`No account with email ${email}.`);
  await prisma.$disconnect();
  process.exit(1);
}

const roles = user.roles.map((r) => r.role).join(', ');

if (action === 'status') {
  console.log(`\n  ${user.fullName} <${user.email}>`);
  console.log(`  roles       : ${roles}`);
  console.log(`  status      : ${user.status}`);
  console.log(`  MFA enabled : ${user.mfaEnabled}`);
  console.log(`  locked      : ${user.lockedUntil && user.lockedUntil > new Date() ? user.lockedUntil.toISOString() : 'no'}`);
  console.log(`  failed signs: ${user.failedLoginCount}\n`);
} else if (action === 'code') {
  if (!user.mfaEnabled || !user.mfaSecret) {
    console.log('\n  MFA is not enabled on this account; sign in with the password alone.\n');
  } else {
    const secondsLeft = 30 - (Math.floor(Date.now() / 1000) % 30);
    console.log(`\n  code: ${currentCode(decrypt(user.mfaSecret))}   (valid ${secondsLeft}s)\n`);
  }
} else if (action === 'off') {
  /*
   * The API requires a second factor by ROLE, not by this flag:
   * `requiresMfa(roles)` in auth.service.ts, and `verifyMfa` returns false when
   * no secret is enrolled. Clearing the flag on a staff account therefore does
   * not remove the requirement — it removes the only way to satisfy it, and the
   * account can never sign in again. Refuse, and say what to do instead.
   */
  if (user.roles.some((r) => MFA_REQUIRED_ROLES.includes(r.role))) {
    console.error(`\n  ${user.email} holds ${roles}, and FR-AUT-009 requires a second factor`);
    console.error('  for those roles. The API checks the role, not this flag, so turning it off');
    console.error('  would lock the account out permanently rather than let it in.\n');
    console.error('  Enrol once in an authenticator app instead:');
    console.error(`      node scripts/admin-mfa.mjs on ${user.email}\n`);
    console.error('  Or read a code off the console each time you sign in:');
    console.error(`      node scripts/admin-mfa.mjs code ${user.email}\n`);
    await prisma.$disconnect();
    process.exit(1);
  }

  await prisma.user.update({
    where: { id: user.id },
    data: { mfaEnabled: false, mfaSecret: null, failedLoginCount: 0, lockedUntil: null },
  });
  // FR-RBA-004: weakening a staff account's authentication is an audited event.
  await prisma.auditLog.create({
    data: {
      actorId: user.id,
      action: 'user.mfa_disabled',
      entity: 'user',
      entityId: user.id,
      after: { mfaEnabled: false, via: 'admin-mfa script', environment: 'development' },
      reason: 'Second factor disabled for local development',
    },
  });
  console.log(`\n  MFA disabled for ${user.email}.`);
  console.log('  Sign in with the email and password alone. Any lockout was cleared.');
  console.log(`  Re-enable with: node scripts/admin-mfa.mjs on ${user.email}\n`);
} else if (action === 'on') {
  const secret = toBase32(randomBytes(20));
  await prisma.user.update({
    where: { id: user.id },
    data: { mfaEnabled: true, mfaSecret: encrypt(secret) },
  });
  const uri = `otpauth://totp/ClassConnect:${encodeURIComponent(user.email)}?secret=${secret}&issuer=ClassConnect&algorithm=SHA1&digits=6&period=30`;
  console.log(`\n  MFA enabled for ${user.email}.`);
  console.log(`  secret : ${secret}`);
  console.log(`  uri    : ${uri}`);
  console.log(`  code   : ${currentCode(secret)}\n`);
}

await prisma.$disconnect();
