/**
 * Creates a Teacher account at the console.
 *
 * The companion to `create-admin.mjs` and `create-student.mjs`, and it exists
 * for a sharper reason than either: a teacher cannot self-serve into a usable
 * state at all. The public `/teach` form produces an *application* — a record in
 * `draft`/`submitted` with documents attached — and an Admin must then work the
 * verification checklist before that person may teach anything (FR-TVR-004/005).
 *
 * That is the right process and it should stay. But it makes provisioning a test
 * teacher a multi-step chore through two surfaces, so this does what an Admin
 * would do, in one command, and says so in the audit trail.
 *
 * What it mirrors from `TeachersService`:
 *
 *   · FR-TVR-005 — approval is a decision, so this records `verifiedBy` and
 *     `verifiedAt`. A teacher who is simply `approved` with nobody attached is
 *     exactly the state the checklist exists to prevent.
 *   · FR-TVR-008 — an approved teacher may not receive assignments until they
 *     have accepted the code of conduct, the safeguarding policy and the
 *     commercial terms. Those live on the teacher surface, which does not exist
 *     yet; this notes the gap rather than pretending it is satisfied.
 *   · FR-ERN-010 — a payout needs a verified wallet and complete KYC. Left
 *     false, because inventing verified KYC for a test account is how a
 *     safeguard quietly stops meaning anything.
 *
 * Usage:
 *   node packages/db/scripts/create-teacher.mjs "Full Name" +237670000050 'password' [subjectCode] [levelCode] [en|fr]
 *
 * Run with no subject to list what this database offers.
 */
import { PrismaClient } from '@prisma/client';
import { hash } from '@node-rs/argon2';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

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

const [fullName, phone, password, subjectCode, levelCode, language = 'en'] = process.argv.slice(2);

const prisma = new PrismaClient();

async function listOfferings() {
  const levels = await prisma.level.findMany({
    where: { active: true },
    orderBy: [{ schoolType: 'asc' }, { sortOrder: 'asc' }],
    select: {
      code: true,
      nameEn: true,
      subjects: { select: { subject: { select: { code: true, nameEn: true } } } },
    },
  });

  console.log('\nLevels and the subjects taught at them:\n');
  for (const level of levels) {
    const subjects = level.subjects.map((s) => s.subject.code).join(', ');
    console.log(`  ${level.code.padEnd(16)} ${level.nameEn.padEnd(16)} ${subjects || '(none)'}`);
  }
  console.log('');
}

if (!fullName || !phone || !password) {
  console.error(
    '\nUsage: node packages/db/scripts/create-teacher.mjs "Full Name" +237670000050 password [subjectCode] [levelCode]\n',
  );
  await listOfferings();
  await prisma.$disconnect();
  process.exit(1);
}

// NFR-SEC-002: the same floor the API enforces. A test account with a weak
// password teaches the wrong habit and eventually escapes into a real one.
if (password.length < 10) {
  console.error('\nThe password must be at least 10 characters.\n');
  await prisma.$disconnect();
  process.exit(1);
}

if (!/^\+237\d{9}$/.test(phone)) {
  console.error('\nThe phone number must be Cameroon E.164, e.g. +237670000050.\n');
  await prisma.$disconnect();
  process.exit(1);
}

const existing = await prisma.user.findFirst({ where: { phoneE164: phone }, select: { id: true } });
if (existing) {
  console.error(`\nA user already exists with ${phone}. Use a different number.\n`);
  await prisma.$disconnect();
  process.exit(1);
}

/*
 * The approving admin, named.
 *
 * FR-TVR-005 makes approval a decision by a person. Recording the script as the
 * decider would be a lie in the audit trail, so it borrows a real admin — and
 * refuses if there is not one, rather than inventing an approver.
 */
const approver = await prisma.userRole.findFirst({
  where: { role: { in: ['super_admin', 'admin_ops'] } },
  select: { userId: true, user: { select: { fullName: true } } },
});

if (!approver) {
  console.error('\nNo admin exists to record as the approver. Run create-admin.mjs first.\n');
  await prisma.$disconnect();
  process.exit(1);
}

const level = levelCode
  ? await prisma.level.findFirst({ where: { code: levelCode }, select: { id: true, nameEn: true } })
  : null;
const subject = subjectCode
  ? await prisma.subject.findFirst({
      where: { code: subjectCode },
      select: { id: true, nameEn: true },
    })
  : null;

if (levelCode && !level) {
  console.error(`\nNo level with code ${levelCode}.\n`);
  await listOfferings();
  await prisma.$disconnect();
  process.exit(1);
}
if (subjectCode && !subject) {
  console.error(`\nNo subject with code ${subjectCode}.\n`);
  await listOfferings();
  await prisma.$disconnect();
  process.exit(1);
}

const passwordHash = await hash(password);
const now = new Date();

const user = await prisma.$transaction(async (tx) => {
  const created = await tx.user.create({
    data: {
      fullName,
      phoneE164: phone,
      phoneVerifiedAt: now,
      passwordHash,
      preferredLanguage: language === 'fr' ? 'fr' : 'en',
      status: 'active',
      roles: { create: [{ role: 'teacher' }] },
    },
    select: { id: true },
  });

  await tx.teacher.create({
    data: {
      userId: created.id,
      yearsExperience: 5,
      highestQualification: 'HND',
      institution: 'Provisioned for testing',
      qualificationYear: 2020,
      languages: ['en'],
      // FR-TVR-005: approved, and by somebody.
      verificationStatus: 'approved',
      verifiedBy: approver.userId,
      verifiedAt: now,
      submittedAt: now,
      createdBy: approver.userId,
      /*
       * KYC and wallet stay false.
       *
       * FR-ERN-010 blocks a payout to an unverified wallet, and pre-satisfying
       * that here would mean the one safeguard standing between a test account
       * and real money is switched off by a convenience script.
       */
      walletVerified: false,
      kycComplete: false,
    },
  });

  if (subject && level) {
    await tx.teacherSubject.create({
      data: { teacherId: created.id, subjectId: subject.id, levelId: level.id },
    });
  }

  await tx.auditLog.create({
    data: {
      actorId: approver.userId,
      action: 'teacher.approved',
      entity: 'teacher',
      entityId: created.id,
      after: {
        via: 'create-teacher.mjs',
        note: 'Provisioned at the console for development. Verification checklist not worked.',
      },
    },
  });

  return created;
}, {
  /*
   * Prisma's default interactive-transaction budget is five seconds, which is
   * generous against a database on the same machine and far too tight against a
   * managed one. This transaction makes a dozen round trips, and to a database
   * in another region each costs its own latency — enough to blow the default
   * and fail with P2028 "transaction already closed" after having created
   * nothing. The work is identical either way; only the clock differs.
   */
  timeout: 60_000,
  maxWait: 30_000,
});

console.log(`
Teacher created.

  Name      ${fullName}
  Phone     ${phone}
  Password  ${password}
  Approved  by ${approver.user.fullName}
  Teaches   ${subject && level ? `${subject.nameEn} at ${level.nameEn}` : '(no subject assigned)'}

Sign in at http://localhost:3000/${language}/sign-in

Two things this account cannot do yet, and both are correct:

  · There is no teacher surface. The app has (site), admin and student routes
    only, so signing in leads nowhere until one is built.
  · Payouts are blocked. Wallet and KYC are unverified (FR-ERN-010), which is
    deliberate — the script does not switch off the check that stands between a
    test account and real money.
`);

await prisma.$disconnect();
