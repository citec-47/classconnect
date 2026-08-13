import { Body, Controller, Get, Param, Post, Query, NotFoundException } from '@nestjs/common';
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
import { LearnerMessagingService, COMPOSE_LIMITS } from './learner-messaging.service';
import { LearnerFeesService } from './learner-fees.service';
import { LearnerRatingsService } from './learner-ratings.service';
import { LearnerContactsService } from './learner-contacts.service';
import { LearnerAttendanceService } from './learner-attendance.service';
import { CurrentUser, RequirePermissions, type AuthenticatedUser } from '../rbac/decorators';
import { uuidParam } from '../common/zod-validation.pipe';
import {
  PLATFORM_TIMEZONE,
  resolveLevelConfig,
  type LearnerHomeDto,
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
    private readonly messaging: LearnerMessagingService,
    private readonly fees: LearnerFeesService,
    private readonly ratings: LearnerRatingsService,
    private readonly contacts: LearnerContactsService,
    private readonly attendance: LearnerAttendanceService,
    private readonly live: TeacherLiveService,
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

  /** §5.5 */
  @Get('progress')
  @RequirePermissions('profile:read:own')
  async progressFor(@CurrentUser() user: AuthenticatedUser) {
    const context = await this.learner.context(user);
    return this.progress.summary(context.id, context.level, context.language);
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
  ) {
    return this.live.requestFloor(user, sessionId);
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
