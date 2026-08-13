import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { z } from 'zod';
import {
  schoolTypeSchema,
  assignTeacherSubjectsSchema,
  assignLearnerClassSchema,
  deleteUsersSchema,
  type AssignTeacherSubjectsInput,
  type AssignLearnerClassInput,
  type DeleteUsersInput,
} from '@classconnect/shared';
import { zodBody, uuidParam } from '../common/zod-validation.pipe';
import { CurrentUser, RequirePermissions, type AuthenticatedUser } from '../rbac/decorators';
import { RosterService } from './roster.service';
import { LiveService } from './live.service';
import { ScheduleService, type ScheduleGrouping } from './schedule.service';
import { BadgesGateway } from './badges.gateway';

/**
 * The roster and the live board.
 *
 * Teachers and learners grouped by teaching band, one teacher's subjects and
 * hours, and every lesson currently in progress.
 */

/** `unclassified` is a real filter, not an absent one: it finds the gaps. */
const bandFilterSchema = z.union([schoolTypeSchema, z.literal('unclassified')]);

/** The four choices the Schedules screen offers: three bands, plus private. */
const groupingSchema = z.union([schoolTypeSchema, z.literal('private')]);

const classifySchema = z.object({
  schoolType: schoolTypeSchema,
});

@Controller('admin')
export class RosterController {
  constructor(
    private readonly roster: RosterService,
    private readonly live: LiveService,
    private readonly schedules: ScheduleService,
    private readonly badges: BadgesGateway,
  ) {}

  // --- Teachers ------------------------------------------------------------

  @Get('people/teachers')
  @RequirePermissions('teacher:browse')
  async teachers(@Query() query: Record<string, string>) {
    return this.roster.teachers({
      schoolType: query.band ? bandFilterSchema.parse(query.band) : undefined,
      query: query.q || undefined,
    });
  }

  /** Every subject this teacher covers, and the hours behind each of them. */
  @Get('people/teachers/:teacherId')
  @RequirePermissions('teacher:browse')
  async teacherDetail(@Param('teacherId') teacherId: string) {
    return this.roster.teacherDetail(teacherId);
  }

  /**
   * FR-SCH-002: which learners this teacher can be put in front of.
   *
   * `teacher:classify` rather than `teacher:verification:decide` — deciding
   * someone is qualified and deciding which band they teach are different
   * judgements, and Finance holds neither.
   */
  @Post('people/teachers/:teacherId/classification')
  @RequirePermissions('teacher:classify')
  async classify(
    @CurrentUser() admin: AuthenticatedUser,
    @Param('teacherId') teacherId: string,
    @Body(zodBody(classifySchema)) body: z.infer<typeof classifySchema>,
  ) {
    const result = await this.roster.classify({
      teacherId,
      schoolType: body.schoolType,
      actorId: admin.id,
    });
    // The unclassified badge falls the moment a band is chosen.
    await this.badges.broadcast();
    return result;
  }

  /**
   * The catalogue an admin picks from, and what this teacher already holds.
   *
   * `teacher:classify` — choosing which classes and subjects somebody teaches
   * is the same judgement as choosing their band, and neither is a verification
   * decision about whether they are qualified at all.
   */
  @Get('people/teachers/:teacherId/assignable')
  @RequirePermissions('teacher:classify')
  async assignable(@Param('teacherId', uuidParam()) teacherId: string) {
    return this.roster.assignableSubjects(teacherId);
  }

  /**
   * Sets exactly the classes and subjects this teacher may teach.
   *
   * What the teacher sees afterwards follows from this and nothing else: the
   * Classes screen lists these pairings, and the timetable offers only these
   * subjects for the class being timetabled.
   */
  @Post('people/teachers/:teacherId/subjects')
  @RequirePermissions('teacher:classify')
  async assignSubjects(
    @CurrentUser() admin: AuthenticatedUser,
    @Param('teacherId', uuidParam()) teacherId: string,
    @Body(zodBody(assignTeacherSubjectsSchema)) body: AssignTeacherSubjectsInput,
  ) {
    return this.roster.assignSubjects({
      teacherId,
      actorId: admin.id,
      assignments: body.assignments,
    });
  }

  /**
   * The classes a learner may be placed in, and what they offer today.
   *
   * `learner:class:assign` rather than `learner:approve` — deciding whether an
   * account may exist and deciding which class it sits in are different acts,
   * and customer service does the second without doing the first.
   */
  @Get('people/students/:learnerId/assignable')
  @RequirePermissions('learner:class:assign')
  async assignableClasses(@Param('learnerId', uuidParam()) learnerId: string) {
    return this.roster.assignableClasses(learnerId);
  }

  /**
   * Places the learner in a class with the subjects they will offer.
   *
   * One endpoint for both halves: a learner whose level moved but whose
   * subjects did not is enrolled in lessons nobody teaches them.
   */
  @Post('people/students/:learnerId/class')
  @RequirePermissions('learner:class:assign')
  async assignClass(
    @CurrentUser() staff: AuthenticatedUser,
    @Param('learnerId', uuidParam()) learnerId: string,
    @Body(zodBody(assignLearnerClassSchema)) body: AssignLearnerClassInput,
  ) {
    const result = await this.roster.assignClass({
      learnerId,
      actorId: staff.id,
      levelId: body.levelId,
      subjectIds: body.subjectIds,
    });
    // The unassigned-learner badge falls the moment a class is chosen.
    await this.badges.broadcast();
    return result;
  }

  /**
   * Deletes the accounts an admin selected, on Students or on Teachers.
   *
   * `user:delete`, which Ops and the super admin hold and customer service does
   * not — "only the admin can delete any user".
   *
   * A POST rather than a DELETE: this carries a list and a reason in its body,
   * and a DELETE with a body is the kind of thing proxies and clients drop.
   */
  @Post('people/delete')
  @RequirePermissions('user:delete')
  async deleteUsers(
    @CurrentUser() admin: AuthenticatedUser,
    @Body(zodBody(deleteUsersSchema)) body: DeleteUsersInput,
  ) {
    const result = await this.roster.deleteUsers({
      userIds: body.userIds,
      actorId: admin.id,
      reason: body.reason,
    });
    await this.badges.broadcast();
    return result;
  }

  // --- Learners ------------------------------------------------------------

  @Get('people/students')
  @RequirePermissions('user:read:any')
  async students(
    @CurrentUser() admin: AuthenticatedUser,
    @Query() query: Record<string, string>,
  ) {
    return this.roster.students(
      {
        schoolType: query.band ? bandFilterSchema.parse(query.band) : undefined,
        query: query.q || undefined,
      },
      admin.id,
    );
  }

  @Get('people/counts')
  @RequirePermissions('user:read:any')
  async counts() {
    return this.roster.bandCounts();
  }

  // --- Live lessons --------------------------------------------------------

  /**
   * Every lesson in progress: who is teaching, the subject, whether it is
   * private, and who has joined.
   *
   * FR-RBA-004: opening this writes an audit entry naming the watcher and the
   * lessons they saw. Oversight that leaves no trace is not oversight.
   */
  @Get('live')
  @RequirePermissions('live:watch')
  async liveNow(
    @CurrentUser() admin: AuthenticatedUser,
    @Query('startingSoonMinutes') startingSoonMinutes?: string,
  ) {
    return this.live.current({
      actorId: admin.id,
      startingSoonMinutes: startingSoonMinutes ? Number(startingSoonMinutes) : undefined,
    });
  }

  // --- Schedules -----------------------------------------------------------

  /**
   * A week of lessons for one grouping, Monday to Sunday.
   *
   * `week` is an ISO date anywhere inside the week being asked for; omitted, it
   * means this week.
   */
  @Get('schedule')
  @RequirePermissions('user:read:any')
  async schedule(
    @CurrentUser() admin: AuthenticatedUser,
    @Query('grouping') grouping: string,
    @Query('week') week?: string,
  ) {
    return this.schedules.week({
      grouping: groupingSchema.parse(grouping) as ScheduleGrouping,
      reference: week ? new Date(week) : undefined,
      actorId: admin.id,
    });
  }

  /** The teacher behind a slot, and the lesson they are in right now. */
  @Get('schedule/slots/:sessionId')
  @RequirePermissions('user:read:any')
  async scheduleSlot(
    @CurrentUser() admin: AuthenticatedUser,
    @Param('sessionId') sessionId: string,
  ) {
    return this.schedules.slotDetail(sessionId, admin.id);
  }
}
