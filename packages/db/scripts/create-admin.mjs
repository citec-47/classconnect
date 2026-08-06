/**
 * Creates the first administrator.
 *
 * NFR-SEC-012: administrative access requires MFA and is restricted to named
 * individuals; shared administrative accounts are prohibited. This script
 * therefore takes a real name and email, and enrols MFA immediately — an admin
 * account cannot sign in until it does (FR-AUT-009).
 *
 * There is deliberately no self-service admin registration endpoint: a role
 * that can approve teachers and read minors' data is granted deliberately, at
 * the console, by someone with database access.
 *
 * Usage:
 *   node scripts/create-admin.mjs "Full Name" email@example.com 'password' [role]
 *   role defaults to admin_ops; use super_admin for the break-glass account.
 */
import { PrismaClient } from '@prisma/client';
import { hash } from '@node-rs/argon2';
import { createHmac, randomBytes, createCipheriv } from 'node:crypto';

const [fullName, email, password, role = 'admin_ops'] = process.argv.slice(2);

if (!fullName || !email || !password) {
  console.error(
    'Usage: node scripts/create-admin.mjs "Full Name" email@example.com \'password\' [admin_ops|admin_finance|support_agent|super_admin]',
  );
  process.exit(1);
}

const VALID_ROLES = ['admin_ops', 'admin_finance', 'support_agent', 'super_admin'];
if (!VALID_ROLES.includes(role)) {
  console.error(`Role must be one of: ${VALID_ROLES.join(', ')}`);
  process.exit(1);
}

if (password.length < 10) {
  console.error('Password must be at least 10 characters.');
  process.exit(1);
}

const key = process.env.FIELD_ENCRYPTION_KEY;
if (!key) {
  console.error('FIELD_ENCRYPTION_KEY must be set (NFR-SEC-003).');
  process.exit(1);
}

// Mirrors FieldEncryptionService: AES-256-GCM, stored as v1:iv:tag:ciphertext.
function encrypt(plaintext) {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', Buffer.from(key, 'base64'), iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  return [
    'v1',
    iv.toString('base64url'),
    cipher.getAuthTag().toString('base64url'),
    ciphertext.toString('base64url'),
  ].join(':');
}

const BASE32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
function toBase32(buffer) {
  let bits = 0, value = 0, output = '';
  for (const byte of buffer) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      output += BASE32[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) output += BASE32[(value << (5 - bits)) & 31];
  return output;
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

const existing = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });
if (existing) {
  console.error(`A user already exists with ${email}.`);
  await prisma.$disconnect();
  process.exit(1);
}

const secret = toBase32(randomBytes(20));

const user = await prisma.user.create({
  data: {
    email: email.toLowerCase(),
    fullName,
    passwordHash: await hash(password, {
      algorithm: 2, // Argon2id — NFR-SEC-001
      memoryCost: 19456,
      timeCost: 2,
      parallelism: 1,
    }),
    status: 'active',
    emailVerifiedAt: new Date(),
    // FR-AUT-009: enrolled up front, because an admin cannot sign in without it.
    mfaEnabled: true,
    mfaSecret: encrypt(secret),
    roles: { create: { role } },
  },
});

// FR-RBA-004: granting an administrative role is itself an audited event.
await prisma.auditLog.create({
  data: {
    actorId: null,
    action: 'role.granted',
    entity: 'user',
    entityId: user.id,
    after: { role, via: 'create-admin script' },
    reason: 'Initial administrator provisioning',
  },
});

const uri = `otpauth://totp/ClassConnect:${encodeURIComponent(email)}?secret=${secret}&issuer=ClassConnect&algorithm=SHA1&digits=6&period=30`;

console.log(`\nCreated ${role}: ${fullName} <${email}>`);
console.log(`\nMFA secret (add to your authenticator app now — it is not shown again):`);
console.log(`  ${secret}`);
console.log(`\notpauth URI:\n  ${uri}`);
console.log(`\nCurrent code (valid ~30s): ${currentCode(secret)}`);
console.log(`\nSign in at POST /api/v1/auth/login with email, password and mfaCode.\n`);

await prisma.$disconnect();
