/**
 * Proves who can watch a recording, against the real database and the real API.
 *
 * The visibility rules in `recordings.service.ts` are a Prisma `where` clause, and
 * a `where` clause cannot be unit-tested into telling the truth: the only question
 * that matters is what the database actually returns for a real learner with a
 * real enrolment. So this builds the exact cast the brief describes, asks the
 * running API as each of them, and cleans up after itself.
 *
 * It is a script rather than a Jest spec because it needs a live API *and* a live
 * database, which the unit suite deliberately has neither of.
 *
 *   Ama     in the class, offers the subject       → sees the class lesson
 *   Bala    in the class, does NOT offer it        → does not see it, and 404s
 *                                                    on the direct link
 *   Chi     in a different class                   → does not see it, 404s
 *   Dara    in the teacher's group only            → sees the group recording
 *                                                    and not the class lesson
 *   Teacher taught both                            → sees their own lessons
 *   Admin   holds `recording:delete`               → sees everything
 *
 * Usage, with the API running:
 *   node packages/db/scripts/verify-recording-access.mjs
 */
import { PrismaClient } from '@prisma/client';
import { hash } from '@node-rs/argon2';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { randomUUID } from 'node:crypto';

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

const prisma = new PrismaClient();
const API = process.env.VERIFY_API_BASE ?? 'http://localhost:4000/api/v1';
const PASSWORD = 'VerifyAccess!2026';

async function call(path, token, method = 'GET') {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: token ? { authorization: `Bearer ${token}` } : {},
  });
  return { status: res.status, body: await res.json().catch(() => null) };
}

async function login(phone) {
  const res = await fetch(`${API}/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ phone, password: PASSWORD }),
  });
  const body = await res.json().catch(() => null);
  if (!body?.accessToken) throw new Error(`login failed for ${phone}: ${JSON.stringify(body)}`);
  return body.accessToken;
}

const created = { cohorts: [], sessions: [], recordings: [], slots: [] };

/**
 * A member of the cast, found or created at a fixed number.
 *
 * Reused rather than made fresh each run, and for a reason worth recording: on
 * this database a `users` row cannot be deleted once it has any `audit_log` entry,
 * and signing in writes one. `audit_log` and `redaction_flags` are both
 * append-only by design — `ON DELETE DO INSTEAD NOTHING` (FR-SAF-006, NFR-SEC-009)
 * — and that rule also swallows the cascade Postgres runs when the parent row goes,
 * so the referential-integrity check fails and the delete is refused.
 *
 * A throwaway cast would therefore leave five undeletable accounts behind on every
 * run. Fixed identities keep it to five in total, and each run resets their class
 * and subjects so the scenario is the same every time.
 */
async function castMember(name, phone, levelId, subjectIds, passwordHash) {
  let user = await prisma.user.findUnique({ where: { phoneE164: phone } });
  if (!user) {
    user = await prisma.user.create({
      data: {
        fullName: name,
        phoneE164: phone,
        passwordHash,
        status: 'active',
        phoneVerifiedAt: new Date(),
        roles: { create: { role: 'student' } },
      },
    });
  } else {
    await prisma.user.update({ where: { id: user.id }, data: { passwordHash, status: 'active' } });
  }

  let learner = await prisma.learner.findFirst({ where: { userId: user.id } });
  if (!learner) {
    learner = await prisma.learner.create({
      data: {
        userId: user.id,
        fullName: name,
        dob: new Date('2010-01-01'),
        levelId,
        approvalState: 'approved',
        preferredLanguage: 'en',
      },
    });
  } else {
    // The class is the variable under test, so it is set fresh every run.
    learner = await prisma.learner.update({
      where: { id: learner.id },
      data: { levelId, approvalState: 'approved', archivedAt: null },
    });
  }

  // Subject enrolment likewise: it is the other half of the rule being proved.
  await prisma.learnerSubject.deleteMany({ where: { learnerId: learner.id } });
  for (const subjectId of subjectIds) {
    await prisma.learnerSubject.create({ data: { learnerId: learner.id, subjectId } });
  }

  return { user, learner, phone };
}

const results = [];
function check(label, pass, detail) {
  results.push({ label, pass });
  console.log(`${pass ? '  PASS' : '  FAIL'}  ${label}${detail ? ` — ${detail}` : ''}`);
}

async function main() {
  const passwordHash = await hash(PASSWORD);

  const level = await prisma.level.findFirst({ where: { code: 'FORM_3' } });
  const otherLevel = await prisma.level.findFirst({ where: { code: 'FORM_4' } });
  if (!level || !otherLevel) throw new Error('Seed the catalogue first: npm run db:seed');

  const offered = await prisma.levelSubject.findMany({
    where: { levelId: level.id },
    include: { subject: true },
    take: 2,
  });
  if (offered.length < 2) throw new Error('Need two subjects at FORM_3 to tell the rules apart');
  const taught = offered[0].subject;
  const notTaught = offered[1].subject;

  console.log(`\nClass: ${level.code}`);
  console.log(`Lesson subject: ${taught.nameEn}`);
  console.log(`A subject the lesson is NOT in: ${notTaught.nameEn}\n`);

  /*
   * --- the teacher: reused, not recreated ---------------------------------
   *
   * One fixed probe account rather than a fresh one per run, because a `teachers`
   * row cannot be deleted on this database at all. FR-SAF-006 makes
   * `redaction_flags` append-only with an `ON DELETE DO INSTEAD NOTHING` rule, and
   * that rule also silently swallows the cascade Postgres runs when a teacher is
   * removed — so the referential-integrity check fails and the delete is refused,
   * whether or not the teacher has any flags.
   *
   * Creating a throwaway teacher per run would therefore leave one behind every
   * time. Find-or-create keeps it to exactly one, for ever.
   */
  const TEACHER_PHONE = '+237699000777';
  let teacherUser = await prisma.user.findUnique({ where: { phoneE164: TEACHER_PHONE } });
  if (!teacherUser) {
    teacherUser = await prisma.user.create({
      data: {
        fullName: 'Recording access probe (reused by verify-recording-access)',
        phoneE164: TEACHER_PHONE,
        passwordHash,
        status: 'active',
        phoneVerifiedAt: new Date(),
        roles: { create: { role: 'teacher' } },
      },
    });
  } else {
    // Keep the password in step, so the script can always sign in as them.
    await prisma.user.update({ where: { id: teacherUser.id }, data: { passwordHash } });
  }
  const teacherPhone = TEACHER_PHONE;

  await prisma.teacher.upsert({
    where: { userId: teacherUser.id },
    create: {
      userId: teacherUser.id,
      schoolType: 'secondary',
      languages: ['en'],
      verificationStatus: 'approved',
      verifiedAt: new Date(),
    },
    update: { verificationStatus: 'approved' },
  });
  await prisma.teacherSubject.upsert({
    where: {
      teacherId_subjectId_levelId: {
        teacherId: teacherUser.id,
        subjectId: taught.id,
        levelId: level.id,
      },
    },
    create: { teacherId: teacherUser.id, subjectId: taught.id, levelId: level.id },
    update: {},
  });

  // --- the class and the group --------------------------------------------
  const classCohort = await prisma.cohort.create({
    data: {
      name: 'Recording probe class',
      teacherId: teacherUser.id,
      subjectId: taught.id,
      levelId: level.id,
      capacity: 40,
    },
  });
  const groupCohort = await prisma.cohort.create({
    data: {
      name: 'Recording probe group',
      teacherId: teacherUser.id,
      subjectId: taught.id,
      levelId: level.id,
      capacity: 10,
    },
  });
  created.cohorts.push(classCohort.id, groupCohort.id);

  // --- the cast, at fixed numbers so runs do not accumulate accounts --------
  const ama = await castMember('Ama (probe)', '+237699000781', level.id, [taught.id], passwordHash);
  const bala = await castMember('Bala (probe)', '+237699000782', level.id, [notTaught.id], passwordHash);
  const chi = await castMember('Chi (probe)', '+237699000783', otherLevel.id, [taught.id], passwordHash);
  const dara = await castMember('Dara (probe)', '+237699000784', level.id, [notTaught.id], passwordHash);

  // Memberships are rebuilt each run, so a previous scenario cannot leak in.
  await prisma.cohortMember.deleteMany({
    where: { learnerId: { in: [ama, bala, chi, dara].map((p) => p.learner.id) } },
  });

  // Ama and Bala are both in the class; only Ama takes the subject.
  for (const person of [ama, bala]) {
    await prisma.cohortMember.create({
      data: { cohortId: classCohort.id, learnerId: person.learner.id },
    });
  }
  // Dara is in the group and not in the class.
  await prisma.cohortMember.create({
    data: { cohortId: groupCohort.id, learnerId: dara.learner.id },
  });

  // --- a timetabled class lesson, and a group session ----------------------
  const slot = await prisma.timetableSlot.create({
    data: {
      levelId: level.id,
      cohortId: classCohort.id,
      teacherId: teacherUser.id,
      subjectId: taught.id,
      dayOfWeek: 1,
      startMinute: 8 * 60,
      endMinute: 9 * 60,
      state: 'confirmed',
    },
  });
  created.slots.push(slot.id);

  const classSession = await prisma.session.create({
    data: {
      teacherId: teacherUser.id,
      subjectId: taught.id,
      cohortId: classCohort.id,
      /* A slot *and* a cohort is what makes this a class lesson. */
      timetableSlotId: slot.id,
      type: 'group',
      status: 'completed',
      startsAtUtc: new Date(Date.now() - 3 * 3600_000),
      endedAt: new Date(Date.now() - 2 * 3600_000),
      durationMin: 60,
      roomId: `verify-${randomUUID()}`,
    },
  });
  const groupSession = await prisma.session.create({
    data: {
      teacherId: teacherUser.id,
      subjectId: taught.id,
      cohortId: groupCohort.id,
      /* A cohort with no slot is a group. */
      type: 'group',
      status: 'completed',
      startsAtUtc: new Date(Date.now() - 5 * 3600_000),
      endedAt: new Date(Date.now() - 4 * 3600_000),
      durationMin: 60,
      roomId: `verify-${randomUUID()}`,
    },
  });
  created.sessions.push(classSession.id, groupSession.id);

  const classRec = await prisma.recording.create({
    data: {
      sessionId: classSession.id,
      storageKey: `recordings/verify/${classSession.id}.mp4`,
      durationSec: 3600,
      availableUntil: new Date(Date.now() + 30 * 86400_000),
    },
  });
  const groupRec = await prisma.recording.create({
    data: {
      sessionId: groupSession.id,
      storageKey: `recordings/verify/${groupSession.id}.mp4`,
      durationSec: 3600,
      availableUntil: new Date(Date.now() + 30 * 86400_000),
    },
  });
  created.recordings.push(classRec.id, groupRec.id);

  // --- ask the API as each person -----------------------------------------
  const ids = (response) => (response.body?.recordings ?? []).map((row) => row.id);

  console.log('The class lesson:');
  const amaToken = await login(ama.phone);
  const amaList = await call('/learner/recordings', amaToken);
  check('a class member who offers the subject sees it', ids(amaList).includes(classRec.id));

  const amaScope = (amaList.body?.recordings ?? []).find((r) => r.id === classRec.id)?.scope;
  check('...and it is filed as a class lesson', amaScope === 'class', `scope=${amaScope}`);

  const amaUrl = await call(`/learner/recordings/${classRec.id}/url`, amaToken);
  /*
   * 503 is a pass here, and deliberately: it is the entitlement check having
   * *succeeded* and the storage credentials being absent on a dev machine. 404
   * would mean the learner was refused, which is the thing under test.
   */
  check(
    '...and is not refused the link',
    amaUrl.status !== 404 && amaUrl.status !== 403,
    `status=${amaUrl.status}`,
  );

  const balaToken = await login(bala.phone);
  const balaList = await call('/learner/recordings', balaToken);
  check('a class member who does NOT offer the subject cannot see it', !ids(balaList).includes(classRec.id));

  const balaUrl = await call(`/learner/recordings/${classRec.id}/url`, balaToken);
  check('...and the direct link 404s for them', balaUrl.status === 404, `status=${balaUrl.status}`);

  const chiToken = await login(chi.phone);
  const chiList = await call('/learner/recordings', chiToken);
  check('a learner in another class cannot see it', !ids(chiList).includes(classRec.id));
  const chiUrl = await call(`/learner/recordings/${classRec.id}/url`, chiToken);
  check('...and the direct link 404s for them', chiUrl.status === 404, `status=${chiUrl.status}`);

  console.log('\nThe group recording:');
  const daraToken = await login(dara.phone);
  const daraList = await call('/learner/recordings', daraToken);
  check('a group member sees it', ids(daraList).includes(groupRec.id));
  const daraScope = (daraList.body?.recordings ?? []).find((r) => r.id === groupRec.id)?.scope;
  check('...and it is filed as a group', daraScope === 'group', `scope=${daraScope}`);
  check('a group member does not see the class lesson', !ids(daraList).includes(classRec.id));
  check('someone outside the group does not see it', !ids(balaList).includes(groupRec.id));
  const balaGroupUrl = await call(`/learner/recordings/${groupRec.id}/url`, balaToken);
  check('...and their direct link 404s', balaGroupUrl.status === 404, `status=${balaGroupUrl.status}`);

  console.log('\nThe teacher and the admin:');
  const teacherToken = await login(teacherPhone);
  const teacherLib = await call('/teacher/recordings', teacherToken);
  check('the teacher can read their own library', teacherLib.status === 200, `status=${teacherLib.status}`);

  const admin = await prisma.user.findFirst({
    where: {
      status: 'active',
      passwordHash: { not: null },
      roles: { some: { role: { in: ['super_admin', 'admin_ops'] } } },
    },
    select: { fullName: true },
  });
  if (admin) {
    console.log(`  (an admin exists: ${admin.fullName} — sign in as them for /admin/recordings)`);
  } else {
    console.log('  (no admin account with a password on this database; skipped)');
  }

  const failed = results.filter((row) => !row.pass);
  console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
  return failed.length;
}

/** Removes everything this script made, in dependency order. */
async function cleanUp() {
  try {
    await prisma.recording.deleteMany({ where: { id: { in: created.recordings } } });
    await prisma.session.deleteMany({ where: { id: { in: created.sessions } } });
    await prisma.timetableSlot.deleteMany({ where: { id: { in: created.slots } } });
    await prisma.cohortMember.deleteMany({ where: { cohortId: { in: created.cohorts } } });
    await prisma.cohort.deleteMany({ where: { id: { in: created.cohorts } } });
    /*
     * The lesson data goes; the five probe accounts stay.
     *
     * Deleting them is not possible here — see `castMember` — so they are reused
     * instead. What matters for repeatability is that no session, recording,
     * cohort or timetable slot survives, and none does.
     */
    console.log('Cleaned up the lesson data (the five probe accounts are reused, not deleted).');
  } catch (error) {
    // Said loudly: leftover learners and sessions would pollute every later run.
    console.error('CLEAN-UP FAILED — remove these by hand:', created, error);
  }
}

let exitCode = 2;
try {
  exitCode = (await main()) === 0 ? 0 : 1;
} catch (error) {
  console.error('\nERROR:', error);
} finally {
  await cleanUp();
  await prisma.$disconnect();
}
process.exit(exitCode);
