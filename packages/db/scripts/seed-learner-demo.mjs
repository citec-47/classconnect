/**
 * Fills a learner's account with realistic work, so the §5 screens can be seen.
 *
 * Development only, and deliberately not part of `npm run db:seed`: that seeds
 * reference data (levels, subjects, plans, templates) which every environment
 * needs. This seeds *someone's* history, which only a demo does.
 *
 * Everything written here is idempotent-ish by phone number: run it twice and
 * you get two weeks of timetable, not a crash. Delete the learner to reset.
 *
 * Usage:
 *   node packages/db/scripts/seed-learner-demo.mjs +237678100002
 */
import { PrismaClient } from '@prisma/client';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
for (const candidate of [join(repoRoot, '.env'), join(process.cwd(), '.env')]) {
  if (existsSync(candidate) && !process.env.DATABASE_URL) process.loadEnvFile(candidate);
}

const phone = process.argv[2];
if (!phone) {
  console.error('\nUsage: node packages/db/scripts/seed-learner-demo.mjs +237678100002\n');
  process.exit(1);
}

const prisma = new PrismaClient();

const learner = await prisma.learner.findFirst({
  where: { user: { phoneE164: phone } },
  include: { subjects: { include: { subject: true } }, level: true },
});

if (!learner) {
  console.error(`\nNo learner with sign-in ${phone}.\n`);
  await prisma.$disconnect();
  process.exit(1);
}
if (!learner.levelId) {
  console.error('\nThat learner has no level, so nothing can be targeted at them.\n');
  await prisma.$disconnect();
  process.exit(1);
}

/** A verified teacher who already teaches at this level, or any verified one. */
const teacher =
  (await prisma.teacher.findFirst({
    where: {
      verificationStatus: 'approved',
      subjects: { some: { levelId: learner.levelId } },
    },
    include: { user: { select: { fullName: true } } },
  })) ??
  (await prisma.teacher.findFirst({
    where: { verificationStatus: 'approved' },
    include: { user: { select: { fullName: true } } },
  }));

if (!teacher) {
  console.error('\nNo approved teacher in this database. Create one first.\n');
  await prisma.$disconnect();
  process.exit(1);
}

const subjects = learner.subjects.map((row) => row.subject);
if (subjects.length === 0) {
  console.error('\nThat learner has no subjects.\n');
  await prisma.$disconnect();
  process.exit(1);
}

const pick = (index) => subjects[index % subjects.length];
const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const now = Date.now();

/**
 * Sessions on a 16:00 Douala slot, which is after school and before supper.
 *
 * DAT-004 makes (teacher, start) unique, so two learners seeded against the same
 * teacher would collide slot for slot and the second would silently get an empty
 * timetable. The minute offset is derived from the learner id, so each learner
 * lands in their own lane and reruns stay stable.
 */
const learnerLane = [...learner.id].reduce((sum, ch) => sum + ch.charCodeAt(0), 0) % 20;
const created = { sessions: 0, homework: 0, grades: 0, materials: 0, attempts: 0 };

for (let offset = -10; offset <= 6; offset += 1) {
  if (offset === 0) continue;
  const day = new Date(now + offset * DAY);
  // 16:00 Africa/Douala is 15:00 UTC — the zone is a fixed UTC+1.
  day.setUTCHours(15, (learnerLane * 3 + ((offset + 12) % 3)) % 60, 0, 0);

  const past = offset < 0;
  const subject = pick(offset + 10);

  try {
    const session = await prisma.session.create({
      data: {
        teacherId: teacher.userId,
        learnerId: learner.id,
        subjectId: subject.id,
        startsAtUtc: day,
        durationMin: 60,
        type: 'one_to_one',
        // A no-show every so often, so attendance is not a flat 100%.
        status: past ? (offset === -7 ? 'no_show_learner' : 'completed') : 'scheduled',
        // FR-SAF-004: minor one-to-one sessions default to recording enabled.
        recordingEnabled: true,
        endedAt: past ? new Date(day.getTime() + 60 * 60_000) : null,
      },
    });
    created.sessions += 1;

    if (past && session.status === 'completed') {
      await prisma.sessionParticipant.create({
        data: {
          sessionId: session.id,
          userId: learner.userId,
          firstJoinAt: day,
          lastLeaveAt: new Date(day.getTime() + 58 * 60_000),
          attendedMinutes: 58,
        },
      });
      // FR-LIV-013: available until the retention date, which the UI shows.
      await prisma.recording.create({
        data: {
          sessionId: session.id,
          storageKey: `demo/recordings/${session.id}.mp4`,
          durationSec: 58 * 60,
          availableUntil: new Date(day.getTime() + 90 * DAY),
        },
      });
    }
  } catch {
    // A unique-constraint clash means that slot is already taken. Skipping is
    // the right answer for a demo seeder — it must never destroy real rows.
  }
}

/** Homework: two waiting, one handed in, three marked. */
const HOMEWORK = [
  { title: 'Quadratic equations — exercises 1 to 12', dueIn: 2, state: 'to_do' },
  { title: 'Reading comprehension: the water cycle', dueIn: 5, state: 'to_do' },
  { title: 'Photosynthesis diagram, labelled', dueIn: -1, state: 'submitted' },
  { title: 'Simultaneous equations worksheet', dueIn: -4, state: 'graded', score: 0.82 },
  { title: 'Essay: my village during the rainy season', dueIn: -8, state: 'graded', score: 0.64 },
  { title: 'Past tense verbs — drill sheet', dueIn: -12, state: 'graded', score: 0.91 },
];

const FEEDBACK = [
  'Good working shown throughout. Watch the sign when you move a term across the equals sign.',
  'Your ideas are strong. Break the longer sentences in two and the argument will be easier to follow.',
  'Very well done. Nearly all correct — check number 7 again.',
];

for (const [index, spec] of HOMEWORK.entries()) {
  const subject = pick(index);
  const dueAt = new Date(now + spec.dueIn * DAY);

  const assignment = await prisma.workAssignment.create({
    data: {
      teacherId: teacher.userId,
      subjectId: subject.id,
      targetLearnerId: learner.id,
      title: spec.title,
      instructions: 'Photograph each page of your working and upload it here.',
      dueAt,
      maxScore: 20,
    },
  });
  created.homework += 1;

  if (spec.state === 'to_do') continue;

  const submittedAt = new Date(dueAt.getTime() - 6 * HOUR);
  const submission = await prisma.submission.create({
    data: {
      assignmentId: assignment.id,
      learnerId: learner.id,
      bodyText: null,
      submittedAt,
      isLate: submittedAt > dueAt,
      version: 1,
    },
  });

  // FR-HWK-002: the dominant path is a photograph of handwritten work.
  await prisma.submissionFile.create({
    data: {
      submissionId: submission.id,
      fileName: `page-1.jpg`,
      storageKey: `demo/submissions/${submission.id}/page-1.jpg`,
      mimeType: 'image/jpeg',
      sizeBytes: 384_000,
      scanStatus: 'clean',
    },
  });

  if (spec.state === 'graded') {
    await prisma.grade.create({
      data: {
        submissionId: submission.id,
        score: Math.round(20 * spec.score),
        feedbackText: FEEDBACK[index % FEEDBACK.length],
        gradedBy: teacher.userId,
        gradedAt: new Date(submittedAt.getTime() + 2 * DAY),
      },
    });
    created.grades += 1;
  }
}

/** Materials, marked clean so FR-FIL-001 lets them be listed. */
const MATERIALS = [
  { title: 'Algebra: revision notes', topic: 'Algebra', size: 240_000 },
  { title: 'The water cycle — diagram sheet', topic: 'Earth science', size: 512_000 },
  { title: 'Essay planning template', topic: 'Writing', size: 96_000 },
];

for (const [index, spec] of MATERIALS.entries()) {
  await prisma.material.create({
    data: {
      uploadedBy: teacher.userId,
      subjectId: pick(index).id,
      levelId: learner.levelId,
      topic: spec.topic,
      title: spec.title,
      storageKey: `demo/materials/${index}.pdf`,
      mimeType: 'application/pdf',
      sizeBytes: spec.size,
      visibilityScope: 'level',
      scanStatus: 'clean',
    },
  });
  created.materials += 1;
}

/**
 * Quizzes, and attempts against two of them.
 *
 * `perTopicJson` is what the Progress screen folds into strengths and
 * weaknesses, so the shape here is the shape that file reads defensively.
 */
const QUIZZES = [
  { title: 'Quadratics — quick check', topics: { Algebra: [7, 10], Factorising: [3, 8] } },
  { title: 'Comprehension practice 3', topics: { Inference: [6, 10], Vocabulary: [9, 10] } },
  { title: 'Mock paper 1', mock: true, topics: null },
];

for (const [index, spec] of QUIZZES.entries()) {
  const assessment = await prisma.assessment.create({
    data: {
      subjectId: pick(index).id,
      title: spec.title,
      type: spec.mock ? 'mock_exam' : 'quiz',
      durationMin: spec.mock ? 120 : 20,
      attemptsAllowed: spec.mock ? 1 : 3,
      releasePolicy: 'immediate',
      createdBy: teacher.userId,
      questions: {
        create: Array.from({ length: spec.mock ? 40 : 10 }, (_, q) => ({
          type: 'single_choice',
          prompt: `Question ${q + 1}`,
          marks: 1,
          sortOrder: q + 1,
          // Present in the database, and never sent to the client (FR-ASM-009).
          answerKey: { correct: 'a' },
          options: {
            create: ['a', 'b', 'c', 'd'].map((label, o) => ({
              label: `Option ${label.toUpperCase()}`,
              isCorrect: o === 0,
              sortOrder: o + 1,
            })),
          },
        })),
      },
    },
  });

  if (spec.topics) {
    const total = Object.values(spec.topics).reduce((sum, [, t]) => sum + t, 0);
    const correct = Object.values(spec.topics).reduce((sum, [c]) => sum + c, 0);
    await prisma.attempt.create({
      data: {
        assessmentId: assessment.id,
        learnerId: learner.id,
        startedAt: new Date(now - (index + 3) * DAY),
        submittedAt: new Date(now - (index + 3) * DAY + 18 * 60_000),
        score: correct,
        percentage: Math.round((correct / total) * 100),
        timeTakenSec: 18 * 60,
        perTopicJson: Object.fromEntries(
          Object.entries(spec.topics).map(([topic, [c, t]]) => [topic, { correct: c, total: t }]),
        ),
      },
    });
    created.attempts += 1;
  }
}

console.log(`\nSeeded demo data for ${learner.fullName} (${phone}):`);
console.log(`  ${created.sessions} sessions, ${created.homework} homework`);
console.log(`  ${created.grades} marked, ${created.materials} materials, ${created.attempts} quiz attempts`);
console.log(`  Teacher: ${teacher.user.fullName}\n`);

await prisma.$disconnect();
