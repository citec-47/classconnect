import { Body, Controller, Delete, Get, Param, Post, Query, NotFoundException } from '@nestjs/common';
import { LearnerService } from './learner.service';
/*
 * The live service is shared rather than duplicated.
 *
 * A lesson has one set of rules about who may join and who may speak; writing a
 * learner-side copy would be two implementations of the same safeguarding
 * decision, free to drift apart.
 */
import { TeacherLiveService } from '../teachers/teacher-live.service';
import { LearnerScheduleService } from './learner-schedule.service';
import { LearnerWorkService } from './learner-work.service';
import { LearnerPracticeService } from './learner-practice.service';
import { LearnerProgressService } from './learner-progress.service';
import { LearnerSubjectsService } from './learner-subjects.service';
import { LearnerLessonsService } from './learner-lessons.service';
import { LearnerMaterialsService } from './learner-materials.service';
import { LearnerMessagingService, COMPOSE_LIMITS } from './learner-messaging.service';
import { LearnerFeesService } from './learner-fees.service';
import { LearnerRatingsService } from './learner-ratings.service';
import { LearnerContactsService } from './learner-contacts.service';
import { LearnerAttendanceService } from './learner-attendance.service';
import { LearnerStudyGroupsService } from './learner-study-groups.service';
import { LearnerReportsService } from './learner-reports.service';
import { CurrentUser, RequirePermissions, type AuthenticatedUser } from '../rbac/decorators';
import { uuidParam, ZodValidationPipe, zodBody } from '../common/zod-validation.pipe';
import { RecordingsService } from '../teachers/recordings.service';
import {
  PLATFORM_TIMEZONE,
  resolveLevelConfig,
  recordingUrlQuerySchema,
  submitWorkSchema,
  type SubmitWorkInput,
  type RecordingUrlQuery,
  type LearnerHomeDto,
  createStudyGroupSchema,
  type CreateStudyGroupInput,
  updateStudyGroupMembersSchema,
  type UpdateStudyGroupMembersInput,
  setStudyGroupLockSchema,
  type SetStudyGroupLockInput,
  setStudyGroupMemberPermissionSchema,
  inviteToStudyGroupSchema,
  respondToInvitationSchema,
  createStudyGroupTaskSchema,
  setTaskDoneSchema,
  type SetStudyGroupMemberPermissionInput,
  type InviteToStudyGroupInput,
  type RespondToInvitationInput,
  type CreateStudyGroupTaskInput,
  type SetTaskDoneInput,
} from '@classconnect/shared';

/**
 * The learner's own surface (§5 of the student brief).
 *
 * Mounted at `/learner`, singular and self-referential, distinct from the
 * existing `/learners` collection a Parent or an Admin manages. The difference
 * is the point: no route here takes a learner id, so FR-RBA-003 is satisfied by
 * the shape of the API rather than by a check inside it. There is no request a
 * signed-in learner can make for someone else's record.
 *
 * §7's prohibitions hold by absence in the same way. There is no
 * learner-to-learner messaging endpoint on this controller or anywhere else, so
 * §10's criterion 11 — "those endpoints do not exist and return 404" — is true
 * because nothing was written, not because something refuses.
 */
@Controller('learner')
export class LearnerController {
  constructor(
    private readonly learner: LearnerService,
    private readonly schedule: LearnerScheduleService,
    private readonly work: LearnerWorkService,
    private readonly practice: LearnerPracticeService,
    private readonly progress: LearnerProgressService,
    private readonly subjects: LearnerSubjectsService,
    private readonly lessons: LearnerLessonsService,
    private readonly materials: LearnerMaterialsService,
    private readonly messaging: LearnerMessagingService,
    private readonly fees: LearnerFeesService,
    private readonly ratings: LearnerRatingsService,
    private readonly recordings: RecordingsService,
    private readonly contacts: LearnerContactsService,
    private readonly attendance: LearnerAttendanceService,
    private readonly live: TeacherLiveService,
    private readonly studyGroups: LearnerStudyGroupsService,
    private readonly reports: LearnerReportsService,
  ) {}

  @Get('me')
  @RequirePermissions('profile:read:own')
  async me(@CurrentUser() user: AuthenticatedUser) {
    return this.learner.me(user);
  }

  /**
   * §5.1 — the whole home screen in one response.
   *
   * Five cards fetched separately is five round trips at 300ms RTT before
   * anything on the screen is legible, which NFR-PER-001 cannot afford. The
   * server already knows the level, so it computes only the cards this learner's
   * configuration actually shows: a Primary learner's response contains no exam
   * countdown and no weakest topic, rather than containing them for a component
   * to discard.
   */
  @Get('home')
  @RequirePermissions('profile:read:own')
  async home(@CurrentUser() user: AuthenticatedUser): Promise<LearnerHomeDto> {
    const context = await this.learner.context(user);
    const config = resolveLevelConfig(context.level);
    const { id, language } = context;

    const [nextSession, homeworkDue, newlyGraded, weakestTopic] = await Promise.all([
      this.schedule.next(id, language),
      this.work.due(id, language),
      this.work.newlyGraded(id, language),
      config.showReadiness ? this.progress.weakestTopic(id, language) : Promise.resolve(null),
    ]);

    return {
      nextSession,
      homeworkDue,
      newlyGraded,
      examCountdown:
        config.showExamCountdown && context.targetExamDate
          ? {
              targetDate: context.targetExamDate,
              daysRemaining: daysUntil(context.targetExamDate),
            }
          : null,
      weakestTopic,
    };
  }

  /** §5.2 */
  @Get('schedule')
  @RequirePermissions('profile:read:own')
  async scheduleFor(@CurrentUser() user: AuthenticatedUser) {
    const { id, language } = await this.learner.context(user);
    const [upcoming, past] = await Promise.all([
      this.schedule.upcoming(id, language),
      this.schedule.past(id, language),
    ]);
    return { upcoming, past };
  }

  /** §5.3 */
  @Get('work')
  @RequirePermissions('profile:read:own')
  async workFor(@CurrentUser() user: AuthenticatedUser) {
    const context = await this.learner.context(user);
    const [homework, materials] = await Promise.all([
      this.work.all(context.id, context.language),
      this.work.materials(context.id, context.levelId, context.language),
    ]);

    // Split at the edge rather than in three queries — see the service.
    return {
      toDo: homework.filter((item) => item.state === 'to_do'),
      submitted: homework.filter((item) => item.state === 'submitted'),
      graded: homework.filter((item) => item.state === 'graded'),
      materials,
    };
  }

  /**
   * §5.4 — hidden at Primary level.
   *
   * 404 rather than an empty list. §3 gives Primary four destinations, and the
   * honest answer to a request for a destination that does not exist at this
   * level is that it does not exist. FR-RBA-002 requires the endpoint to say so
   * itself rather than trusting the tab bar to have hidden the link.
   */
  @Get('practice')
  @RequirePermissions('profile:read:own')
  async practiceFor(@CurrentUser() user: AuthenticatedUser) {
    const context = await this.learner.context(user);
    if (!resolveLevelConfig(context.level).showPractice) {
      throw new NotFoundException({ messageKey: 'errors.route.not_found' });
    }

    const items = await this.practice.list(
      context.id,
      context.level,
      context.levelId,
      context.language,
    );

    return {
      quizzes: items.filter((item) => item.kind === 'quiz'),
      mocks: items.filter((item) => item.kind === 'mock'),
      pastPapers: items.filter((item) => item.kind === 'past_paper'),
    };
  }

  /** Student-created, class-scoped study groups for the Practice surface. */
  @Get('practice/study-groups')
  @RequirePermissions('profile:read:own')
  async studyGroupsFor(@CurrentUser() user: AuthenticatedUser) {
    return this.studyGroups.list(user.id);
  }

  @Get('practice/study-groups/candidates')
  @RequirePermissions('profile:read:own')
  async studyGroupCandidates(@CurrentUser() user: AuthenticatedUser) {
    const context = await this.learner.context(user);
    return this.studyGroups.candidates(context.levelId ?? '', user.id);
  }

  @Post('practice/study-groups')
  @RequirePermissions('profile:read:own')
  async createStudyGroup(
    @CurrentUser() user: AuthenticatedUser,
    @Body(zodBody(createStudyGroupSchema)) body: CreateStudyGroupInput,
  ) {
    const context = await this.learner.context(user);
    return this.studyGroups.create(context.levelId, user.id, body);
  }

  @Post('practice/study-groups/:groupId/leave')
  @RequirePermissions('profile:read:own')
  async leaveStudyGroup(@CurrentUser() user: AuthenticatedUser, @Param('groupId', uuidParam()) groupId: string) {
    return this.studyGroups.leave(groupId, user.id);
  }

  @Post('practice/study-groups/:groupId/members')
  @RequirePermissions('profile:read:own')
  async addStudyGroupMembers(@CurrentUser() user: AuthenticatedUser, @Param('groupId', uuidParam()) groupId: string, @Body(zodBody(updateStudyGroupMembersSchema)) body: UpdateStudyGroupMembersInput) {
    return this.studyGroups.addMembers(groupId, user.id, body.memberUserIds);
  }

  @Delete('practice/study-groups/:groupId/members/:memberUserId')
  @RequirePermissions('profile:read:own')
  async removeStudyGroupMember(@CurrentUser() user: AuthenticatedUser, @Param('groupId', uuidParam()) groupId: string, @Param('memberUserId', uuidParam()) memberUserId: string) {
    return this.studyGroups.removeMember(groupId, user.id, memberUserId);
  }

  @Post('practice/study-groups/:groupId/lock')
  @RequirePermissions('profile:read:own')
  async lockStudyGroup(@CurrentUser() user: AuthenticatedUser, @Param('groupId', uuidParam()) groupId: string, @Body(zodBody(setStudyGroupLockSchema)) body: SetStudyGroupLockInput) {
    return this.studyGroups.setLocked(groupId, user.id, body.locked);
  }

  @Post('practice/study-groups/:groupId/members/:memberUserId/permission')
  @RequirePermissions('profile:read:own')
  async setStudyGroupMemberPermission(@CurrentUser() user: AuthenticatedUser, @Param('groupId', uuidParam()) groupId: string, @Param('memberUserId', uuidParam()) memberUserId: string, @Body(zodBody(setStudyGroupMemberPermissionSchema)) body: SetStudyGroupMemberPermissionInput) {
    return this.studyGroups.setMemberPermission(groupId, user.id, memberUserId, body);
  }

  @Delete('practice/study-groups/:groupId')
  @RequirePermissions('profile:read:own')
  async deleteStudyGroup(@CurrentUser() user: AuthenticatedUser, @Param('groupId', uuidParam()) groupId: string) {
    return this.studyGroups.delete(groupId, user.id);
  }

  /**
   * Finding somebody outside the class.
   *
   * Teachers by name; a learner from another class only by their exact phone or
   * email. See the service — a name search over the school's children is a
   * directory of minors with a search box on it.
   */
  @Get('practice/study-groups/invitee-search')
  @RequirePermissions('profile:read:own')
  async findInvitee(@Query('q') q?: string) {
    return this.studyGroups.findInvitee(q ?? '');
  }

  @Post('practice/study-groups/:groupId/invitations')
  @RequirePermissions('profile:read:own')
  async inviteToStudyGroup(
    @CurrentUser() user: AuthenticatedUser,
    @Param('groupId', uuidParam()) groupId: string,
    @Body(zodBody(inviteToStudyGroupSchema)) body: InviteToStudyGroupInput,
  ) {
    return this.studyGroups.invite(groupId, user.id, body.inviteeUserId);
  }

  /** What the owner sees: who was asked, and what they said. */
  @Get('practice/study-groups/:groupId/invitations')
  @RequirePermissions('profile:read:own')
  async studyGroupInvitations(
    @CurrentUser() user: AuthenticatedUser,
    @Param('groupId', uuidParam()) groupId: string,
  ) {
    return this.studyGroups.groupInvitations(groupId, user.id);
  }

  /** The invitee's own list — the badge on their Work page. */
  @Get('practice/invitations')
  @RequirePermissions('profile:read:own')
  async myStudyGroupInvitations(@CurrentUser() user: AuthenticatedUser) {
    return this.studyGroups.myInvitations(user.id);
  }

  /**
   * Group tasks.
   *
   * Under `practice/` with the groups they belong to rather than under `work/`,
   * even though the Work screen shows them. The route names where the thing
   * lives; the screen decides where it is displayed, and one of those changing
   * should not change the other.
   */
  @Post('practice/study-groups/:groupId/tasks')
  @RequirePermissions('profile:read:own')
  async createStudyGroupTask(
    @CurrentUser() user: AuthenticatedUser,
    @Param('groupId', uuidParam()) groupId: string,
    @Body(zodBody(createStudyGroupTaskSchema)) body: CreateStudyGroupTaskInput,
  ) {
    return this.studyGroups.createTask(groupId, user.id, body);
  }

  @Get('practice/study-groups/:groupId/tasks')
  @RequirePermissions('profile:read:own')
  async studyGroupTasks(
    @CurrentUser() user: AuthenticatedUser,
    @Param('groupId', uuidParam()) groupId: string,
  ) {
    const context = await this.learner.context(user);
    return this.studyGroups.tasks(groupId, user.id, context.language);
  }

  /** Every task across every group, for the Work screen. */
  @Get('practice/tasks')
  @RequirePermissions('profile:read:own')
  async allStudyGroupTasks(@CurrentUser() user: AuthenticatedUser) {
    const context = await this.learner.context(user);
    return this.studyGroups.allTasks(user.id, context.language);
  }

  @Post('practice/tasks/:taskId/done')
  @RequirePermissions('profile:read:own')
  async setStudyGroupTaskDone(
    @CurrentUser() user: AuthenticatedUser,
    @Param('taskId', uuidParam()) taskId: string,
    @Body(zodBody(setTaskDoneSchema)) body: SetTaskDoneInput,
  ) {
    return this.studyGroups.setTaskDone(taskId, user.id, body.done);
  }

  @Delete('practice/tasks/:taskId')
  @RequirePermissions('profile:read:own')
  async deleteStudyGroupTask(
    @CurrentUser() user: AuthenticatedUser,
    @Param('taskId', uuidParam()) taskId: string,
  ) {
    return this.studyGroups.deleteTask(taskId, user.id);
  }

  @Post('practice/invitations/:invitationId/respond')
  @RequirePermissions('profile:read:own')
  async respondToStudyGroupInvitation(
    @CurrentUser() user: AuthenticatedUser,
    @Param('invitationId', uuidParam()) invitationId: string,
    @Body(zodBody(respondToInvitationSchema)) body: RespondToInvitationInput,
  ) {
    return this.studyGroups.respondToInvitation(invitationId, user.id, body.accept);
  }

  /** §5.5 */
  @Get('progress')
  @RequirePermissions('profile:read:own')
  async progressFor(@CurrentUser() user: AuthenticatedUser) {
    const context = await this.learner.context(user);
    return this.progress.summary(context.id, context.level, context.language);
  }

  /** Published term report cards only; drafts are never exposed to learners. */
  @Get('report-cards')
  @RequirePermissions('profile:read:own')
  async reportCardsFor(@CurrentUser() user: AuthenticatedUser) {
    const context = await this.learner.context(user);
    return this.reports.list(context.id, context.language);
  }

  /* ---------------------------------------------------------------- *
   * Subjects, past lessons, messages, fees, ratings
   * ---------------------------------------------------------------- */

  /**
   * The Subjects tab, with the week's timetable attached.
   *
   * One response rather than two because they are read together: a learner taps
   * Subjects to find out when Chemistry is, and a second round trip at 300ms RTT
   * to answer the obvious follow-up is a round trip the connection cannot spare
   * (NFR-PER-003).
   */
  @Get('subjects')
  @RequirePermissions('profile:read:own')
  async subjectsFor(@CurrentUser() user: AuthenticatedUser) {
    const context = await this.learner.context(user);
    return this.subjects.list(context.id, context.language, user.id);
  }

  /**
   * My past lessons.
   *
   * Attendance is not in the filter. A learner booked into a session gets its
   * recording whether or not they made it — see the service for why that is the
   * correct reading of access control rather than a relaxation of it.
   */
  @Get('lessons')
  @RequirePermissions('profile:read:own')
  async lessonsFor(
    @CurrentUser() user: AuthenticatedUser,
    @Query('subjectId') subjectId?: string,
  ) {
    const context = await this.learner.context(user);
    return this.lessons.list(context.id, user.id, context.language, { subjectId });
  }

  /**
   * My lessons — the materials a teacher published, by subject.
   *
   * Named `materials` on the wire because `lessons` above is already the
   * recordings, and one word meaning two things is what put class videos at
   * `/student/lessons` in the first place.
   */
  @Get('materials')
  @RequirePermissions('profile:read:own')
  async materialSubjects(@CurrentUser() user: AuthenticatedUser) {
    const context = await this.learner.context(user);
    return this.materials.subjects(context.id, user.id, context.levelId, context.language);
  }

  @Get('materials/:subjectId')
  @RequirePermissions('profile:read:own')
  async materialsInSubject(
    @CurrentUser() user: AuthenticatedUser,
    @Param('subjectId', uuidParam()) subjectId: string,
  ) {
    const context = await this.learner.context(user);
    return this.materials.bySubject(
      context.id,
      user.id,
      context.levelId,
      subjectId,
      context.language,
    );
  }

  /** Opening one clears its badge. Idempotent; the first read is the one kept. */
  @Post('materials/:materialId/read')
  @RequirePermissions('profile:read:own')
  async markMaterialRead(
    @CurrentUser() user: AuthenticatedUser,
    @Param('materialId', uuidParam()) materialId: string,
  ) {
    const context = await this.learner.context(user);
    return this.materials.markRead(context.id, user.id, context.levelId, materialId);
  }

  /**
   * Who this learner may start a conversation with.
   *
   * Their assigned teachers, and support. No other learners — see the service
   * for why that is a modelling decision rather than a filter.
   */
  @Get('messages/contacts')
  @RequirePermissions('profile:read:own')
  async contactsFor(
    @CurrentUser() user: AuthenticatedUser,
    @Query('q') q?: string,
  ) {
    const context = await this.learner.context(user);
    return this.contacts.list(context.id, user.id, context.language, q);
  }

  /** Opens a thread, or returns the one that already exists. */
  @Post('messages/start')
  @RequirePermissions('profile:read:own')
  async startThread(
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: { teacherUserId?: string; subjectId?: string; support?: boolean },
  ) {
    const context = await this.learner.context(user);
    return this.contacts.start(context.id, user.id, body);
  }

  /** Attendance, split by subject and by recent lesson. */
  @Get('attendance')
  @RequirePermissions('profile:read:own')
  async attendanceFor(@CurrentUser() user: AuthenticatedUser) {
    const context = await this.learner.context(user);
    return this.attendance.summary(context.id, user.id, context.language);
  }

  @Get('messages')
  @RequirePermissions('profile:read:own')
  async threadsFor(@CurrentUser() user: AuthenticatedUser) {
    const context = await this.learner.context(user);
    return {
      threads: await this.messaging.threads(user.id, context.language),
      limits: COMPOSE_LIMITS,
    };
  }

  @Get('messages/:threadId')
  @RequirePermissions('profile:read:own')
  async threadFor(
    @CurrentUser() user: AuthenticatedUser,
    @Param('threadId') threadId: string,
  ) {
    const context = await this.learner.context(user);
    return this.messaging.thread(threadId, user.id, context.language);
  }

  /**
   * Send a message.
   *
   * Note the absence beside it: there is no `@Delete` and no `@Patch` on a
   * message anywhere in this controller. A participant cannot unsend, and the
   * route not existing is the enforcement.
   */
  @Post('messages/:threadId')
  @RequirePermissions('profile:read:own')
  async sendMessage(
    @CurrentUser() user: AuthenticatedUser,
    @Param('threadId') threadId: string,
    @Body() body: { body?: string; attachmentIds?: string[] },
  ) {
    return this.messaging.send(threadId, user.id, body.body ?? '', body.attachmentIds ?? []);
  }

  /**
   * Fee status — stages, not a bill.
   *
   * `showBilling` is the same flag that decides whether the frozen screen may
   * name an amount, so a minor's response carries stage states and no money at
   * all. §10's criterion 9 is about the payload, so the amount is absent here
   * rather than hidden downstream.
   */
  @Get('fees')
  @RequirePermissions('profile:read:own')
  async feesFor(@CurrentUser() user: AuthenticatedUser) {
    const context = await this.learner.context(user);
    const config = resolveLevelConfig(context.level);
    return this.fees.status(context.id, config.showBilling, user.id);
  }

  @Get('ratings')
  @RequirePermissions('profile:read:own')
  async myRatings(@CurrentUser() user: AuthenticatedUser) {
    const context = await this.learner.context(user);
    return this.ratings.mine(context.id, user.id, context.language);
  }

  /** FR-RAT-001. The teacher never learns who this came from — see the service. */
  @Post('ratings')
  @RequirePermissions('profile:read:own')
  async rate(
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: { teacherUserId: string; subjectId: string; stars: number; comment?: string; sessionId?: string },
  ) {
    const context = await this.learner.context(user);
    return this.ratings.submit(context.id, user.id, body);
  }

  /**
   * The learner's own way into a live lesson.
   *
   * Listen-only unless the teacher has granted them the floor — enforced in the
   * signed token, so a learner who edits the page cannot publish. Entitlement is
   * checked server-side: a learner joins a lesson they are booked into, and a
   * room id is not a secret worth relying on.
   */
  @Get('live/:sessionId/token')
  @RequirePermissions('profile:read:own')
  async joinLive(
    @CurrentUser() user: AuthenticatedUser,
    @Param('sessionId', uuidParam()) sessionId: string,
  ) {
    return this.live.learnerToken(user, sessionId);
  }

  /**
   * Request to Talk.
   *
   * Asking, not receiving: this records a pending request and the microphone
   * stays refused until the teacher decides.
   */
  @Post('live/:sessionId/request-floor')
  @RequirePermissions('profile:read:own')
  async requestFloor(
    @CurrentUser() user: AuthenticatedUser,
    @Param('sessionId', uuidParam()) sessionId: string,
    @Query('screen') screen?: string,
  ) {
    /* `?screen=1` asks for the screen rather than the microphone. */
    return this.live.requestFloor(user, sessionId, screen === '1');
  }

  /**
   * Handing work in.
   *
   * The learner id comes from the session, never the payload: there is no id
   * here to change in order to submit as somebody else.
   */
  @Post('work/:assignmentId/submit')
  @RequirePermissions('profile:read:own')
  async submitWork(
    @CurrentUser() user: AuthenticatedUser,
    @Param('assignmentId', uuidParam()) assignmentId: string,
    @Body(zodBody(submitWorkSchema)) body: SubmitWorkInput,
  ) {
    const context = await this.learner.context(user);
    return this.work.submit(context.id, assignmentId, body.bodyText);
  }

  // -------------------------------------------------------------------------
  // My Class Videos
  // -------------------------------------------------------------------------

  /**
   * The lessons this learner may watch back.
   *
   * Their class's timetabled lessons in the subjects they offer, the groups they
   * belong to, and any invited call they were on — decided in the service from
   * the session behind each recording. A classmate who does not take the subject
   * gets a shorter list, not a hidden row.
   */
  @Get('recordings')
  @RequirePermissions('profile:read:own')
  async myClassVideos(@CurrentUser() user: AuthenticatedUser) {
    return this.recordings.forUser(user);
  }

  /**
   * A signed, expiring link to one of them.
   *
   * The entitlement is re-checked here, so the direct link a classmate forwards
   * is a 404 rather than a way in.
   */
  @Get('recordings/:recordingId/url')
  @RequirePermissions('profile:read:own')
  async classVideoUrl(
    @CurrentUser() user: AuthenticatedUser,
    @Param('recordingId', uuidParam()) recordingId: string,
    @Query(new ZodValidationPipe(recordingUrlQuerySchema)) query: RecordingUrlQuery,
  ) {
    return this.recordings.playbackUrl(user, recordingId, query.audio);
  }
}


/**
 * Whole days to the target date, counted as calendar days in Africa/Douala.
 *
 * From dates rather than elapsed milliseconds: a learner looking at this at
 * 23:00 the night before must read one day, not zero, and flooring a duration
 * gives them zero. 2.4 fixes the calendar as Douala's, so a server running in
 * UTC does not shift the count by a day for anyone awake after 23:00 local.
 */
function daysUntil(targetIso: string, now: Date = new Date()): number {
  const localToday = new Intl.DateTimeFormat('en-CA', { timeZone: PLATFORM_TIMEZONE }).format(now);
  const today = Date.parse(`${localToday}T00:00:00Z`);
  const target = Date.parse(`${targetIso.slice(0, 10)}T00:00:00Z`);
  return Math.round((target - today) / 86_400_000);
}
