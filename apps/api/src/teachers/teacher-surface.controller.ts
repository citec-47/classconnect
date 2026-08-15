import { Body, Controller, Delete, Get, Param, Post, Query } from '@nestjs/common';
import { z } from 'zod';
import {
  createGroupSchema,
  groupMembersSchema,
  createExerciseSchema,
  awardGroupScoreSchema,
  unlockExerciseSchema,
  createExamSchema,
  markAttemptSchema,
  submitTermMarksSchema,
  generateReportCardsSchema,
  goLiveSchema,
  decidePublishRequestSchema,
  inviteToSpeakSchema,
  sendTeacherMessageSchema,
  isStaff,
  REPORT_TERMS,
  type CreateGroupInput,
  type GroupMembersInput,
  type CreateExerciseInput,
  type AwardGroupScoreInput,
  type UnlockExerciseInput,
  type CreateExamInput,
  type MarkAttemptInput,
  type SubmitTermMarksInput,
  type GenerateReportCardsInput,
  type GoLiveInput,
  type DecidePublishRequestInput,
  type InviteToSpeakInput,
  type SendTeacherMessageInput,
} from '@classconnect/shared';
import { TeacherGroupsService } from './teacher-groups.service';
import { TeacherExamsService } from './teacher-exams.service';
import { TeacherReportsService } from './teacher-reports.service';
import { TeacherLiveService } from './teacher-live.service';
import { TeacherMessagingService } from './teacher-messaging.service';
import { RecordingsService } from './recordings.service';
import { zodBody, uuidParam, ZodValidationPipe } from '../common/zod-validation.pipe';
import { CurrentUser, RequirePermissions, type AuthenticatedUser } from '../rbac/decorators';

/*
 * Query shapes, declared before the controllers that reference them.
 *
 * Validated rather than trusted: `term` reaching a `where` unchecked would let a
 * caller select across every term at once, and the academic-year format is what
 * keeps two spellings of the same year from becoming two sets of report cards.
 */
const readinessQuerySchema = z.object({
  levelId: z.string().uuid(),
  term: z.enum(REPORT_TERMS),
  academicYear: z.string().regex(/^\d{4}-\d{4}$/, 'errors.report.bad_year'),
});
type ReadinessQuery = z.infer<typeof readinessQuerySchema>;

const termQuerySchema = readinessQuerySchema.extend({
  subjectId: z.string().uuid(),
});
type TermQuery = z.infer<typeof termQuerySchema>;

/**
 * The teaching surface behind the teacher dashboard: groups, exams, report
 * sheets, live and messaging.
 *
 * Separate from `TeacherDashboardController`, which holds the two reads that were
 * there before it (classes and earnings), for the same reason that one is separate
 * from `TeachersController`: the verification endpoints stay legible as a unit
 * rather than becoming the top of a very long file.
 *
 * The rule that holds across every route here: **no parameter names a teacher.**
 * Ownership comes from `user.id`, and each service re-derives what the teacher may
 * touch from the database — which subjects they were verified for, which groups
 * they run, which exams they wrote. A teacher cannot reach a colleague's class by
 * changing an id, because there is no id to change.
 */
@Controller('teacher')
export class TeacherSurfaceController {
  constructor(
    private readonly groups: TeacherGroupsService,
    private readonly exams: TeacherExamsService,
    private readonly reports: TeacherReportsService,
    private readonly live: TeacherLiveService,
    private readonly messaging: TeacherMessagingService,
    private readonly recordings: RecordingsService,
  ) {}

  // -------------------------------------------------------------------------
  // Groups and exercises — BUILD-PLAN Phase 3
  // -------------------------------------------------------------------------

  @Get('groups')
  @RequirePermissions('group:manage:own')
  async myGroups(@CurrentUser() user: AuthenticatedUser) {
    return this.groups.ownGroups(user.id);
  }

  @Post('groups')
  @RequirePermissions('group:manage:own')
  async createGroup(
    @CurrentUser() user: AuthenticatedUser,
    @Body(zodBody(createGroupSchema)) body: CreateGroupInput,
  ) {
    return this.groups.createGroup(user, body);
  }

  /** The learners at this group's level, for the membership picker. */
  @Get('groups/:groupId/candidates')
  @RequirePermissions('group:manage:own')
  async groupCandidates(
    @CurrentUser() user: AuthenticatedUser,
    @Param('groupId', uuidParam()) groupId: string,
  ) {
    return this.groups.candidates(user.id, groupId);
  }

  @Post('groups/:groupId/members')
  @RequirePermissions('group:manage:own')
  async setMembers(
    @CurrentUser() user: AuthenticatedUser,
    @Param('groupId', uuidParam()) groupId: string,
    @Body(zodBody(groupMembersSchema)) body: GroupMembersInput,
  ) {
    return this.groups.setMembers(user, groupId, body);
  }

  @Post('exercises')
  @RequirePermissions('group:manage:own')
  async createExercise(
    @CurrentUser() user: AuthenticatedUser,
    @Body(zodBody(createExerciseSchema)) body: CreateExerciseInput,
  ) {
    return this.groups.createExercise(user, body);
  }

  @Get('exercises/:exerciseId/submissions')
  @RequirePermissions('group:manage:own')
  async exerciseSubmissions(
    @CurrentUser() user: AuthenticatedUser,
    @Param('exerciseId', uuidParam()) exerciseId: string,
  ) {
    return this.groups.exerciseSubmissions(user.id, exerciseId);
  }

  /**
   * Reopening a locked exercise.
   *
   * The brief allows "the teacher or the main admin". `group:manage:own` is the
   * teacher's half; the service additionally accepts staff, and checks ownership
   * for everyone else — so a teacher can reopen their own and not a colleague's.
   */
  @Post('exercises/:exerciseId/unlock')
  @RequirePermissions('group:manage:own')
  async unlockExercise(
    @CurrentUser() user: AuthenticatedUser,
    @Param('exerciseId', uuidParam()) exerciseId: string,
    @Body(zodBody(unlockExerciseSchema)) body: UnlockExerciseInput,
  ) {
    return this.groups.unlockExercise(user, exerciseId, body.reason, isStaff(user.roles));
  }

  @Post('exercises/:exerciseId/group-score')
  @RequirePermissions('group:manage:own')
  async awardGroupScore(
    @CurrentUser() user: AuthenticatedUser,
    @Param('exerciseId', uuidParam()) exerciseId: string,
    @Body(zodBody(awardGroupScoreSchema)) body: AwardGroupScoreInput,
  ) {
    return this.groups.awardGroupScore(user, exerciseId, body);
  }

  // -------------------------------------------------------------------------
  // Exams — BUILD-PLAN Phase 4
  // -------------------------------------------------------------------------

  @Get('exams')
  @RequirePermissions('exam:manage:own')
  async myExams(@CurrentUser() user: AuthenticatedUser) {
    return this.exams.ownExams(user.id);
  }

  @Post('exams')
  @RequirePermissions('exam:manage:own')
  async createExam(
    @CurrentUser() user: AuthenticatedUser,
    @Body(zodBody(createExamSchema)) body: CreateExamInput,
  ) {
    return this.exams.createExam(user, body);
  }

  /**
   * The paper with its answer key.
   *
   * The only endpoint on the platform that returns `QuestionOption.isCorrect`, and
   * the lookup behind it carries `createdBy = user.id` (FR-ASM-009).
   */
  @Get('exams/:examId')
  @RequirePermissions('exam:manage:own')
  async examDetail(
    @CurrentUser() user: AuthenticatedUser,
    @Param('examId', uuidParam()) examId: string,
  ) {
    return this.exams.examForTeacher(user.id, examId);
  }

  @Post('exams/:examId/publish')
  @RequirePermissions('exam:manage:own')
  async publishExam(
    @CurrentUser() user: AuthenticatedUser,
    @Param('examId', uuidParam()) examId: string,
  ) {
    return this.exams.publish(user, examId);
  }

  @Get('exams/:examId/attempts')
  @RequirePermissions('exam:manage:own')
  async examAttempts(
    @CurrentUser() user: AuthenticatedUser,
    @Param('examId', uuidParam()) examId: string,
  ) {
    return this.exams.attemptsFor(user.id, examId);
  }

  @Post('exams/:examId/release')
  @RequirePermissions('exam:manage:own')
  async releaseResults(
    @CurrentUser() user: AuthenticatedUser,
    @Param('examId', uuidParam()) examId: string,
  ) {
    return this.exams.releaseResults(user, examId);
  }

  @Get('attempts/:attemptId')
  @RequirePermissions('exam:manage:own')
  async attemptForMarking(
    @CurrentUser() user: AuthenticatedUser,
    @Param('attemptId', uuidParam()) attemptId: string,
  ) {
    return this.exams.attemptForMarking(user.id, attemptId);
  }

  @Post('attempts/:attemptId/marks')
  @RequirePermissions('exam:manage:own')
  async markAttempt(
    @CurrentUser() user: AuthenticatedUser,
    @Param('attemptId', uuidParam()) attemptId: string,
    @Body(zodBody(markAttemptSchema)) body: MarkAttemptInput,
  ) {
    return this.exams.markAttempt(user, attemptId, body);
  }

  // -------------------------------------------------------------------------
  // Report sheets — BUILD-PLAN Phase 6
  // -------------------------------------------------------------------------

  /** The class grid for one subject and term, with anything already entered. */
  @Get('reports/marks')
  @RequirePermissions('report:submit:own')
  async classMarks(
    @CurrentUser() user: AuthenticatedUser,
    @Query(new ZodValidationPipe(termQuerySchema)) query: TermQuery,
  ) {
    return this.reports.classMarks(user.id, query);
  }

  @Post('reports/marks')
  @RequirePermissions('report:submit:own')
  async submitMarks(
    @CurrentUser() user: AuthenticatedUser,
    @Body(zodBody(submitTermMarksSchema)) body: SubmitTermMarksInput,
  ) {
    return this.reports.submitMarks(user, body);
  }

  /**
   * Which subjects at a level have marks in, and which do not.
   *
   * On the teacher's controller as well as the admin's, because a teacher deciding
   * whether to chase a colleague is the person who most wants to know — and it
   * carries no marks, only counts.
   */
  @Get('reports/readiness')
  @RequirePermissions('report:submit:own')
  async readiness(
    @CurrentUser() user: AuthenticatedUser,
    @Query(new ZodValidationPipe(readinessQuerySchema)) query: ReadinessQuery,
  ) {
    void user;
    return this.reports.readiness(query.levelId, query.term, query.academicYear);
  }

  // -------------------------------------------------------------------------
  // Live — BUILD-PLAN Phase 5a
  // -------------------------------------------------------------------------

  @Get('live')
  @RequirePermissions('live:host')
  async liveBoard(@CurrentUser() user: AuthenticatedUser) {
    return this.live.board(user.id);
  }

  @Post('live')
  @RequirePermissions('live:host')
  async goLive(
    @CurrentUser() user: AuthenticatedUser,
    @Body(zodBody(goLiveSchema)) body: GoLiveInput,
  ) {
    return this.live.goLive(user, body);
  }

  /**
   * A fresh join token for the host.
   *
   * Separate from `goLive` because a teacher whose browser reloads mid-lesson
   * needs to rejoin a room that already exists, and the token from the original
   * call has expired by then. Minting a new one is the whole of rejoining.
   */
  @Get('live/:sessionId/token')
  @RequirePermissions('live:host')
  async hostToken(
    @CurrentUser() user: AuthenticatedUser,
    @Param('sessionId', uuidParam()) sessionId: string,
  ) {
    return this.live.hostToken(user, sessionId);
  }

  /**
   * Where the host stands inside the period, while teaching.
   *
   * Server-computed: the countdown, the minutes earned and whether the period
   * is complete all come from the server's clock and its record of when the
   * room opened, never from the browser.
   */
  @Get('live/:sessionId/countdown')
  @RequirePermissions('live:host')
  async countdown(
    @CurrentUser() user: AuthenticatedUser,
    @Param('sessionId', uuidParam()) sessionId: string,
  ) {
    return this.live.countdown(user, sessionId);
  }

  /** Typing a name into Invite. Students and teachers both. */
  @Get('live/:sessionId/invitees')
  @RequirePermissions('live:host')
  async searchInvitees(
    @CurrentUser() user: AuthenticatedUser,
    @Param('sessionId', uuidParam()) sessionId: string,
    @Query('q') q = '',
  ) {
    return this.live.searchInvitees(sessionId, user, q);
  }

  /**
   * Letting somebody into an invite-only call.
   *
   * The invitation is what the join token is checked against, so this is the
   * only way into such a call — holding the link is not enough.
   */
  @Post('live/:sessionId/invite-user/:userId')
  @RequirePermissions('live:host')
  async inviteToCall(
    @CurrentUser() user: AuthenticatedUser,
    @Param('sessionId', uuidParam()) sessionId: string,
    @Param('userId', uuidParam()) userId: string,
  ) {
    return this.live.inviteToCall(user, sessionId, userId);
  }

  /** Withdrawing an invitation. The next token request is refused. */
  @Delete('live/:sessionId/invite-user/:userId')
  @RequirePermissions('live:host')
  async revokeInvite(
    @CurrentUser() user: AuthenticatedUser,
    @Param('sessionId', uuidParam()) sessionId: string,
    @Param('userId', uuidParam()) userId: string,
  ) {
    return this.live.revokeInvite(user, sessionId, userId);
  }

  @Get('live/:sessionId')
  @RequirePermissions('live:host')
  async roomState(
    @CurrentUser() user: AuthenticatedUser,
    @Param('sessionId', uuidParam()) sessionId: string,
  ) {
    return this.live.roomState(user, sessionId);
  }

  @Post('live/:sessionId/end')
  @RequirePermissions('live:host')
  async endLive(
    @CurrentUser() user: AuthenticatedUser,
    @Param('sessionId', uuidParam()) sessionId: string,
  ) {
    return this.live.endLive(user, sessionId);
  }

  /** The host deciding a raised hand — FR-LIV-005. */
  @Post('live/:sessionId/floor/:requestId')
  @RequirePermissions('live:host')
  async decideFloor(
    @CurrentUser() user: AuthenticatedUser,
    @Param('sessionId', uuidParam()) sessionId: string,
    @Param('requestId', uuidParam()) requestId: string,
    @Body(zodBody(decidePublishRequestSchema)) body: DecidePublishRequestInput,
  ) {
    return this.live.decideFloor(user, sessionId, requestId, body);
  }

  /** The host picking a learner who did not raise a hand. */
  @Post('live/:sessionId/invite')
  @RequirePermissions('live:host')
  async inviteToSpeak(
    @CurrentUser() user: AuthenticatedUser,
    @Param('sessionId', uuidParam()) sessionId: string,
    @Body(zodBody(inviteToSpeakSchema)) body: InviteToSpeakInput,
  ) {
    return this.live.inviteToSpeak(user, sessionId, body.learnerUserId, body.screenShare);
  }

  /** My live classes: watching back what they taught, by day. */
  @Get('recordings')
  @RequirePermissions('recording:read:own')
  async myRecordings(@CurrentUser() user: AuthenticatedUser) {
    return this.live.ownRecordings(user.id);
  }

  /**
   * A signed, expiring link to one recording.
   *
   * Separate from the list because the link is the sensitive part: it is minted
   * per request, lives for hours rather than for ever, and is checked again
   * here — a recording id travelling in a URL is not evidence of entitlement.
   */
  @Get('recordings/:recordingId/url')
  @RequirePermissions('recording:read:own')
  async recordingUrl(
    @CurrentUser() user: AuthenticatedUser,
    @Param('recordingId', uuidParam()) recordingId: string,
  ) {
    return this.recordings.playbackUrl(user, recordingId);
  }

  // -------------------------------------------------------------------------
  // Messaging
  // -------------------------------------------------------------------------

  @Get('messages')
  @RequirePermissions('profile:read:own')
  async myThreads(@CurrentUser() user: AuthenticatedUser) {
    return { threads: await this.messaging.threads(user.id, user.preferredLanguage) };
  }

  /** The brief's "with the admin as default" — idempotent, see the service. */
  @Post('messages/support')
  @RequirePermissions('profile:read:own')
  async openSupportThread(@CurrentUser() user: AuthenticatedUser) {
    return this.messaging.openSupportThread(user.id);
  }

  @Get('messages/:threadId')
  @RequirePermissions('profile:read:own')
  async thread(
    @CurrentUser() user: AuthenticatedUser,
    @Param('threadId', uuidParam()) threadId: string,
  ) {
    return this.messaging.thread(threadId, user.id, user.preferredLanguage);
  }

  @Post('messages/:threadId')
  @RequirePermissions('profile:read:own')
  async send(
    @CurrentUser() user: AuthenticatedUser,
    @Param('threadId', uuidParam()) threadId: string,
    @Body(zodBody(sendTeacherMessageSchema)) body: SendTeacherMessageInput,
  ) {
    return this.messaging.send(threadId, user.id, body.body, body.attachmentIds);
  }
}

/**
 * Staff's half of report cards: the generation the brief describes as one click.
 *
 * On its own controller because the permission is different in kind.
 * `report:submit:own` is a teacher writing their subject's marks;
 * `report:generate` computes an average and a class position from every teacher's
 * marks, and no single teacher should hold it.
 */
@Controller('admin/reports')
export class AdminReportsController {
  constructor(private readonly reports: TeacherReportsService) {}

  @Get('readiness')
  @RequirePermissions('report:generate')
  async readiness(@Query(new ZodValidationPipe(readinessQuerySchema)) query: ReadinessQuery) {
    return this.reports.readiness(query.levelId, query.term, query.academicYear);
  }

  @Post('generate')
  @RequirePermissions('report:generate')
  async generate(
    @CurrentUser() user: AuthenticatedUser,
    @Body(zodBody(generateReportCardsSchema)) body: GenerateReportCardsInput,
  ) {
    return this.reports.generate(user, body);
  }

  @Get('cards')
  @RequirePermissions('report:generate')
  async cards(@Query(new ZodValidationPipe(readinessQuerySchema)) query: ReadinessQuery) {
    return this.reports.cardsForLevel(query.levelId, query.term, query.academicYear);
  }
}
