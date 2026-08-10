/**
 * Creates a Student or Adult Learner account at the console.
 *
 * The companion to `create-admin.mjs`, and it exists for the same reason: there
 * is no self-service student registration (FR-AUT-001 as amended — only an Admin
 * creates Student accounts), so a developer who wants to sign in as a learner
 * otherwise has to provision an admin, enrol MFA and drive the admin UI first.
 *
 * It mirrors `AdminAccountsService.createStudent` exactly, including the rules
 * that service enforces:
 *
 *   · FR-FAM-006 — minor status is derived from the date of birth, never stored.
 *     Under 18 gets the `student` role; 18 and over gets `adult_learner`, which
 *     is what turns on self-serve booking and billing on the learner surface.
 *   · FR-PRO-002 — a learner may only take subjects offered at their level.
 *   · §4.2 — a learner may not transact or attend until an Admin has approved
 *     them. This script approves immediately and records that it did so, because
 *     an account that cannot do anything is not a useful test account.
 *
 * Usage:
 *   node packages/db/scripts/create-student.mjs "Full Name" +237670000001 'password' 2011-04-15 [levelCode] [en|fr]
 *
 * Run it with no level code to list the levels this database actually has.
 */
import { PrismaClient } from '@prisma/client';
import { hash } from '@node-rs/argon2';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

/**
 * The Prisma CLI loads `.env` for itself; a plain node script does not, and the
 * failure mode without this is a 40-line Prisma stack trace whose actual message
 * is "Environment variable not found: DATABASE_URL". Load it here so the usage
 * in the README works from any directory.
 */
const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
for (const candidate of [join(repoRoot, '.env'), join(process.cwd(), '.env')]) {
  if (existsSync(candidate) && !process.env.DATABASE_URL) {
    process.loadEnvFile(candidate);
  }
}

if (!process.env.DATABASE_URL) {
  console.error('\nDATABASE_URL is not set, and no .env was found at the repository root.\n');
  process.exit(1);
}

const [fullName, phone, password, dobInput, levelCode, language = 'en'] = process.argv.slice(2);

const prisma = new PrismaClient();

async function listLevels() {
  const levels = await prisma.level.findMany({
    where: { active: true },
    orderBy: [{ schoolType: 'asc' }, { sortOrder: 'asc' }],
    include: { _count: { select: { subjects: true } } },
  });

  if (levels.length === 0) {
    console.error('\nNo levels in this database. Run `npm run db:seed` first.\n');
    return;
  }

  console.log('\nAvailable levels:\n');
  for (const level of levels) {
    console.log(
      `  ${level.code.padEnd(18)} ${level.nameEn.padEnd(24)} ` +
        `${level.schoolType.padEnd(12)} ${level._count.subjects} subjects`,
    );
  }
  console.log('');
}

if (!fullName || !phone || !password || !dobInput) {
  console.error(
    '\nUsage: node packages/db/scripts/create-student.mjs "Full Name" +237670000001 \'password\' YYYY-MM-DD [levelCode] [en|fr]\n',
  );
  await listLevels();
  await prisma.$disconnect();
  process.exit(1);
}

// FR-AUT-002: a Cameroonian mobile number, in E.164. The `6` prefix rule keeps
// landlines out, because the number has to be able to receive an OTP.
if (!/^\+2376\d{8}$/.test(phone)) {
  console.error(`\n"${phone}" is not a Cameroonian mobile number in E.164.`);
  console.error('Expected +2376 followed by eight digits, e.g. +237670000001.\n');
  await prisma.$disconnect();
  process.exit(1);
}

if (password.length < 10) {
  console.error('\nPassword must be at least 10 characters.\n');
  await prisma.$disconnect();
  process.exit(1);
}

const dob = new Date(`${dobInput}T00:00:00Z`);
if (Number.isNaN(dob.getTime()) || dob > new Date()) {
  console.error('\nDate of birth must be a real past date, as YYYY-MM-DD.\n');
  await prisma.$disconnect();
  process.exit(1);
}

if (!levelCode) {
  console.error('\nChoose a level code from the list below and pass it as the fifth argument.');
  await listLevels();
  await prisma.$disconnect();
  process.exit(1);
}

const level = await prisma.level.findFirst({
  where: { code: levelCode, active: true },
  include: { subjects: { select: { subjectId: true } } },
});

if (!level) {
  console.error(`\nNo active level with code "${levelCode}".`);
  await listLevels();
  await prisma.$disconnect();
  process.exit(1);
}

if (level.subjects.length === 0) {
  console.error(`\nLevel "${levelCode}" has no subjects, so a learner cannot be enrolled in it.\n`);
  await prisma.$disconnect();
  process.exit(1);
}

const taken = await prisma.user.findUnique({ where: { phoneE164: phone } });
if (taken) {
  console.error(`\nA user already exists with ${phone}.\n`);
  await prisma.$disconnect();
  process.exit(1);
}

/** FR-FAM-006, derived rather than stored. */
function ageInYears(birth, asOf = new Date()) {
  let age = asOf.getUTCFullYear() - birth.getUTCFullYear();
  const monthDelta = asOf.getUTCMonth() - birth.getUTCMonth();
  if (monthDelta < 0 || (monthDelta === 0 && asOf.getUTCDate() < birth.getUTCDate())) age -= 1;
  return age;
}

const age = ageInYears(dob);
const minor = age < 18;
const role = minor ? 'student' : 'adult_learner';

// FR-PRO-002: everything offered at this level, capped so the account is
// realistic rather than enrolled in twenty subjects.
const subjectIds = level.subjects.slice(0, 6).map((row) => row.subjectId);

const passwordHash = await hash(password, {
  algorithm: 2, // Argon2id — NFR-SEC-001
  memoryCost: 19456,
  timeCost: 2,
  parallelism: 1,
});

const learner = await prisma.$transaction(async (tx) => {
  const account = await tx.user.create({
    data: {
      phoneE164: phone,
      passwordHash,
      fullName,
      preferredLanguage: language === 'fr' ? 'fr' : 'en',
      status: 'active',
      // Provisioned at the console, so there is no OTP round trip to make. The
      // API treats an unverified phone as unable to receive notifications.
      phoneVerifiedAt: new Date(),
      roles: { create: { role } },
    },
  });

  const created = await tx.learner.create({
    data: {
      userId: account.id,
      fullName,
      dob,
      levelId: level.id,
      preferredLanguage: language === 'fr' ? 'fr' : 'en',
      preferredStudyDays: [],
      // §4.2: approved up front. An account queued for a decision cannot attend
      // or transact, which is not what a test account is for.
      approvalState: 'approved',
      submittedAt: new Date(),
      approvedAt: new Date(),
    },
  });

  await tx.learnerSubject.createMany({
    data: subjectIds.map((subjectId) => ({ learnerId: created.id, subjectId })),
    skipDuplicates: true,
  });

  return created;
},
  {
    // Prisma's 5s default is generous against a local Postgres and not against a
    // managed one several hundred milliseconds away: three round trips plus the
    // learner-subject insert overran it on a Neon direct endpoint.
    maxWait: 15_000,
    timeout: 30_000,
  },
);

// FR-RBA-004: creating a learner is an audited event however it was done. An
// account that appeared with no trace is exactly what the audit log is for.
await prisma.auditLog.create({
  data: {
    actorId: null,
    action: 'learner.created',
    entity: 'learner',
    entityId: learner.id,
    after: { fullName, role, level: level.code, via: 'create-student script' },
    reason: 'Developer provisioning at the console',
  },
});

console.log(`\nCreated ${role}: ${fullName}`);
console.log(`  Phone     ${phone}`);
console.log(`  Password  ${password}`);
console.log(`  Level     ${level.code} — ${level.nameEn}`);
console.log(`  Age       ${age} (${minor ? 'minor' : 'adult learner'})`);
console.log(`  Subjects  ${subjectIds.length}`);
console.log(`  Learner   ${learner.id}`);
console.log(`\nSign in at /en/sign-in with the phone number and password above.\n`);

await prisma.$disconnect();
