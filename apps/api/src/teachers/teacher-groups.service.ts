import { Injectable } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';
import { AuditService } from '../audit/audit.service';
import { AppError } from '../common/http-exception.filter';
import {
  exerciseLockState,
  exerciseAcceptsSubmission,
  type CreateGroupInput,
  type CreateExerciseInput,
  type AwardGroupScoreInput,
  type GroupMembersInput,
} from '@classconnect/shared';
import type { AuthenticatedUser } from '../rbac/decorators';

/**
 * BUILD-PLAN Phase 3 — groups, and the exercises set in them.
 *
 * ## Why a group is a `Cohort`
 *
 * `Cohort` already means "learners taught together by one teacher, in one subject,
 * at one level", with a capacity and a membership table. The brief's group is that
 * exactly. A second `Group` table would have split the timetable, the live session
 * and the exam — all three of which already point at cohorts — from the thing a
 * teacher actually assembled.
 *
 * ## The lock is server-side, and that is the whole feature
 *
 * The brief wants a countdown appearing as the deadline approaches and the group
 * locking itself at the exact time. The countdown is a convenience rendered from
 * `locksAt`; the *lock* is `exerciseAcceptsSubmission` running here, against this
 * clock, on every submit. A learner with a slow phone does not get extra minutes
 * and one with a fast phone does not lose any, because neither phone is consulted.
 */
@Injectable()
export class TeacherGroupsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /**
   * Every group this teacher runs, with headcount and the exercises set in it.
   *
   * One call rather than a list endpoint plus a detail endpoint per group: the
   * screen shows both together, and a per-group round trip costs about 235ms on
   * the reference connection (§6.2).
   */
  async ownGroups(teacherId: string) {
    const cohorts = await this.prisma.cohort.findMany({
      where: { teacherId },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        name: true,
        capacity: true,
        active: true,
        createdAt: true,
        subject: { select: { id: true, nameEn: true, nameFr: true } },
        level: { select: { id: true, nameEn: true, nameFr: true } },
        members: {
          where: { leftAt: null },
          select: { learner: { select: { id: true, fullName: true } } },
        },
        groupScores: {
          select: { assignmentId: true, score: true, note: true, awardedAt: true },
        },
      },
    });

    // Exercises are keyed on the cohort through `targetCohortId`, which is a bare
    // column on `WorkAssignment` with no relation declared — so they are fetched
    // by id set rather than included above.
    const cohortIds = cohorts.map((cohort) => cohort.id);
    const exercises = cohortIds.length
      ? await this.prisma.workAssignment.findMany({
          where: { teacherId, targetCohortId: { in: cohortIds } },
          orderBy: { dueAt: 'desc' },
          select: {
            id: true,
            targetCohortId: true,
            title: true,
            instructions: true,
            dueAt: true,
            locksAt: true,
            unlockedAt: true,
            maxScore: true,
            createdAt: true,
            _count: { select: { submissions: true } },
          },
        })
      : [];

    const now = new Date();

    return {
      now: now.toISOString(),
      groups: cohorts.map((cohort) => ({
        id: cohort.id,
        name: cohort.name,
        capacity: cohort.capacity,
        active: cohort.active,
        subject: cohort.subject,
        level: cohort.level,
        learnerCount: cohort.members.length,
        members: cohort.members.map((member) => member.learner),
        exercises: exercises
          .filter((exercise) => exercise.targetCohortId === cohort.id)
          .map((exercise) => ({
            id: exercise.id,
            title: exercise.title,
            instructions: exercise.instructions,
            dueAt: exercise.dueAt.toISOString(),
            locksAt: exercise.locksAt?.toISOString() ?? null,
            maxScore: exercise.maxScore,
            submissionCount: exercise._count.submissions,
            // Computed from the shared rule, so the badge on the screen and the
            // refusal from the API cannot disagree.
            lockState: exerciseLockState(exercise, now),
            groupScore:
              cohort.groupScores.find((score) => score.assignmentId === exercise.id)?.score ??
              null,
          })),
      })),
    };
  }

  /**
   * Who may be put in this group.
   *
   * The brief's "any student offering the course will be able to see their
   * groups", read from the other end: the candidates are the approved learners at
   * the group's level who take its subject. Filtering by subject as well as level
   * is what stops a Maths group being filled with children who do not sit Maths.
   */
  async candidates(teacherId: string, cohortId: string) {
    const cohort = await this.mine(teacherId, cohortId);

    const learners = await this.prisma.learner.findMany({
      where: {
        levelId: cohort.levelId,
        approvalState: 'approved',
        archivedAt: null,
        subjects: { some: { subjectId: cohort.subjectId } },
      },
      orderBy: { fullName: 'asc' },
      select: {
        id: true,
        fullName: true,
        cohortSeats: {
          where: { cohortId, leftAt: null },
          select: { cohortId: true },
        },
      },
    });

    return {
      groupId: cohortId,
      capacity: cohort.capacity,
      candidates: learners.map((learner) => ({
        learnerId: learner.id,
        fullName: learner.fullName,
        member: learner.cohortSeats.length > 0,
      })),
    };
  }

  /** Creating a group. The teacher is the signed-in user, never a parameter. */
  async createGroup(user: AuthenticatedUser, input: CreateGroupInput) {
    /*
     * FR-TVR-005 again: a teacher may only assemble a group in a subject and
     * level they were verified to teach. Without this a teacher could create a
     * Form 5 Physics group they have no business running and then publish
     * exercises into it.
     */
    const teaches = await this.prisma.teacherSubject.findFirst({
      where: { teacherId: user.id, subjectId: input.subjectId, levelId: input.levelId },
    });
    if (!teaches) throw AppError.forbidden('errors.timetable.not_your_subject');

    const cohort = await this.prisma.cohort.create({
      data: {
        name: input.name.trim(),
        teacherId: user.id,
        subjectId: input.subjectId,
        levelId: input.levelId,
        capacity: input.capacity,
      },
      select: { id: true, name: true },
    });

    await this.audit.record({
      action: 'group.created',
      entity: 'cohort',
      entityId: cohort.id,
      actorId: user.id,
      after: { name: cohort.name, subjectId: input.subjectId, levelId: input.levelId },
    });

    return { groupId: cohort.id, name: cohort.name };
  }

  /**
   * Setting the membership.
   *
   * Replaces rather than appends, because the screen is a list of ticks and what
   * it means is "these are the members". Removal is `leftAt`, not a delete —
   * FR-HWK-005 keeps every submission, and a submission whose membership row
   * vanished is a mark that belongs to nobody.
   */
  async setMembers(user: AuthenticatedUser, cohortId: string, input: GroupMembersInput) {
    const cohort = await this.mine(user.id, cohortId);

    if (input.learnerIds.length > cohort.capacity) {
      // FR-SCH-006: capacity is a constraint, not a hint.
      throw AppError.badRequest('errors.group.over_capacity', { capacity: cohort.capacity });
    }

    /*
     * Only learners at the group's level.
     *
     * The picker offers the right ones, and this is what makes it true: a
     * Form 3 group cannot be filled with Class 2 children by posting their ids.
     */
    const eligible = await this.prisma.learner.findMany({
      where: { id: { in: input.learnerIds }, levelId: cohort.levelId },
      select: { id: true },
    });
    if (eligible.length !== input.learnerIds.length) {
      throw AppError.badRequest('errors.group.learner_not_at_level');
    }

    await this.prisma.$transaction(async (tx) => {
      // Anyone no longer ticked has left, as of now.
      await tx.cohortMember.updateMany({
        where: { cohortId, leftAt: null, learnerId: { notIn: input.learnerIds } },
        data: { leftAt: new Date() },
      });

      for (const learnerId of input.learnerIds) {
        await tx.cohortMember.upsert({
          where: { cohortId_learnerId: { cohortId, learnerId } },
          // A learner who left and was re-added rejoins the same row rather than
          // getting a second one.
          create: { cohortId, learnerId },
          update: { leftAt: null },
        });
      }
    });

    await this.audit.record({
      action: 'group.members_set',
      entity: 'cohort',
      entityId: cohortId,
      actorId: user.id,
      after: { learnerCount: input.learnerIds.length },
    });

    return { groupId: cohortId, learnerCount: input.learnerIds.length };
  }

  /** An exercise set to one group, with a due date and an optional hard lock. */
  async createExercise(user: AuthenticatedUser, input: CreateExerciseInput) {
    const cohort = await this.mine(user.id, input.cohortId);

    const exercise = await this.prisma.workAssignment.create({
      data: {
        teacherId: user.id,
        subjectId: cohort.subjectId,
        targetCohortId: cohort.id,
        title: input.title.trim(),
        instructions: input.instructions,
        dueAt: new Date(input.dueAt),
        locksAt: input.locksAt ? new Date(input.locksAt) : null,
        maxScore: input.maxScore,
      },
      select: { id: true, title: true, dueAt: true, locksAt: true },
    });

    await this.audit.record({
      action: 'exercise.created',
      entity: 'work_assignment',
      entityId: exercise.id,
      actorId: user.id,
      after: {
        cohortId: cohort.id,
        title: exercise.title,
        dueAt: exercise.dueAt,
        locksAt: exercise.locksAt,
      },
    });

    return {
      exerciseId: exercise.id,
      lockState: exerciseLockState(exercise, new Date()),
    };
  }

  /**
   * Reopening a locked exercise.
   *
   * The brief allows the teacher who set it or the main admin, and no one else.
   * Staff hold `report:generate`, which is the closest thing to "the main admin"
   * on this codebase's permission set, and the controller gates on it; here the
   * check is ownership, so a teacher cannot reopen a colleague's exercise.
   *
   * A reason is required and audited: reopening gives one group more time than
   * the rest of the class had, and "reopened by someone" is not a record anybody
   * can act on later.
   */
  async unlockExercise(
    user: AuthenticatedUser,
    exerciseId: string,
    reason: string,
    isStaff: boolean,
  ) {
    const exercise = await this.prisma.workAssignment.findUnique({
      where: { id: exerciseId },
      select: { id: true, teacherId: true, title: true, locksAt: true, targetCohortId: true },
    });
    if (!exercise) throw AppError.notFound();
    if (exercise.teacherId !== user.id && !isStaff) throw AppError.forbidden();

    if (!exercise.locksAt) {
      // Nothing to reopen. Said plainly rather than recording a no-op unlock that
      // would read, later, as though the exercise had been locked.
      throw AppError.badRequest('errors.exercise.never_locks');
    }

    const updated = await this.prisma.workAssignment.update({
      where: { id: exerciseId },
      data: { unlockedBy: user.id, unlockedAt: new Date() },
      select: { id: true, locksAt: true, unlockedAt: true },
    });

    await this.audit.record({
      action: 'exercise.unlocked',
      entity: 'work_assignment',
      entityId: exerciseId,
      actorId: user.id,
      reason,
      before: { locksAt: exercise.locksAt },
      after: { unlockedAt: updated.unlockedAt, byStaff: isStaff && exercise.teacherId !== user.id },
    });

    return { exerciseId, lockState: exerciseLockState(updated, new Date()) };
  }

  /**
   * The group's mark.
   *
   * One row per exercise per group, updated on a re-mark. Written to `GroupScore`
   * rather than to `Grade`, because a `Grade` needs a `Submission` and half the
   * group will not have made one — see the model comment.
   */
  async awardGroupScore(
    user: AuthenticatedUser,
    exerciseId: string,
    input: AwardGroupScoreInput,
  ) {
    const exercise = await this.prisma.workAssignment.findFirst({
      where: { id: exerciseId, teacherId: user.id },
      select: { id: true, maxScore: true, targetCohortId: true },
    });
    if (!exercise) throw AppError.notFound();
    if (exercise.targetCohortId !== input.cohortId) throw AppError.badRequest('errors.group.not_this_exercise');
    if (input.score > exercise.maxScore) {
      throw AppError.badRequest('errors.exercise.score_above_max', { maxScore: exercise.maxScore });
    }

    const score = await this.prisma.groupScore.upsert({
      where: { assignmentId_cohortId: { assignmentId: exerciseId, cohortId: input.cohortId } },
      create: {
        assignmentId: exerciseId,
        cohortId: input.cohortId,
        score: input.score,
        note: input.note ?? null,
        awardedBy: user.id,
      },
      update: { score: input.score, note: input.note ?? null, awardedBy: user.id, awardedAt: new Date() },
      select: { id: true, score: true },
    });

    await this.audit.record({
      action: 'exercise.group_scored',
      entity: 'group_score',
      entityId: score.id,
      actorId: user.id,
      after: { exerciseId, cohortId: input.cohortId, score: score.score },
    });

    return { score: score.score };
  }

  /** What the group handed in, for the marking screen. */
  async exerciseSubmissions(teacherId: string, exerciseId: string) {
    const exercise = await this.prisma.workAssignment.findFirst({
      where: { id: exerciseId, teacherId },
      select: {
        id: true,
        title: true,
        maxScore: true,
        dueAt: true,
        locksAt: true,
        unlockedAt: true,
        targetCohortId: true,
        submissions: {
          orderBy: { submittedAt: 'desc' },
          select: {
            id: true,
            submittedAt: true,
            isLate: true,
            bodyText: true,
            learner: { select: { id: true, fullName: true } },
            grade: { select: { score: true, feedbackText: true, gradedAt: true } },
            files: { select: { id: true, fileName: true, sizeBytes: true, mimeType: true } },
          },
        },
      },
    });
    if (!exercise) throw AppError.notFound();

    const now = new Date();
    return {
      exerciseId: exercise.id,
      title: exercise.title,
      maxScore: exercise.maxScore,
      lockState: exerciseLockState(exercise, now),
      acceptsSubmission: exerciseAcceptsSubmission(exercise, now),
      submissions: exercise.submissions.map((submission) => ({
        id: submission.id,
        learner: submission.learner,
        submittedAt: submission.submittedAt.toISOString(),
        isLate: submission.isLate,
        bodyText: submission.bodyText,
        files: submission.files,
        score: submission.grade?.score ?? null,
        feedback: submission.grade?.feedbackText ?? null,
      })),
    };
  }

  /** The group must be this teacher's. Used by every write above. */
  private async mine(teacherId: string, cohortId: string) {
    const cohort = await this.prisma.cohort.findFirst({
      where: { id: cohortId, teacherId },
      select: { id: true, capacity: true, levelId: true, subjectId: true },
    });
    // Not-found rather than forbidden: a group belonging to another teacher is
    // indistinguishable from one that does not exist (FR-RBA-003).
    if (!cohort) throw AppError.notFound();
    return cohort;
  }
}
