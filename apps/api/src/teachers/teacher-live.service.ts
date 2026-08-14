import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../common/prisma.service';
import { PlatformConfigService } from '../common/platform-config.service';
import { AuditService } from '../audit/audit.service';
import { LiveKitService } from './livekit.service';
import { NotificationsService } from '../notifications/notifications.service';
import { AppError } from '../common/http-exception.filter';
import {
  CONFIG_KEYS,
  minutesToClock,
  earnedMinutes,
  TIMETABLE_PERIOD_MINUTES,
  type GoLiveInput,
  type DecidePublishRequestInput,
} from '@classconnect/shared';
import type { AuthenticatedUser } from '../rbac/decorators';

/**
 * BUILD-PLAN Phase 5a — going live, and who may speak.
 *
 * ## What this is, and what it is not
 *
 * This is the **control plane**: which lesson is live, who is in it, who has the
 * floor, whether it is being recorded, and which timetable slot it counts
 * against. Every one of those is a database fact, and every screen in the brief —
 * the teacher's Go Live, the learner's "your teacher is live", the admin's All
 * Current Live — is a read of them.
 *
 * It is **not** the media transport. Carrying audio and video for a Cameroonian
 * class needs an SFU (LiveKit, Janus or a hosted equivalent); a WebRTC mesh will
 * not do it, and BUILD-PLAN Phase 5 records that the choice should be made before
 * any of it is written. So `roomId` is minted here and handed to whichever server
 * is chosen: joining the room, publishing tracks and the join/leave events that
 * populate `SessionParticipant` are that server's half of the contract.
 *
 * The consequence, stated plainly because it must not be discovered later:
 * **`attendedMinutes` stays 0 until a media server reports it.** `classes.ts`
 * already establishes that attendance comes from the media server's events and
 * never from self-report, so nothing here writes a minute it did not observe —
 * which means the 30-minute earnings floor and the 40-minute rating rule are
 * wired and correct, and will read zero until the SFU is connected. Filling them
 * in from the wall clock would be inventing attendance, and it would be invisible
 * once it reached a payslip.
 */
@Injectable()
export class TeacherLiveService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: PlatformConfigService,
    private readonly audit: AuditService,
    private readonly livekit: LiveKitService,
    private readonly notifications: NotificationsService,
  ) {}

  /**
   * The teacher's live screen: what is live now, and what they could start.
   *
   * "What they could start" is the confirmed timetable slots for today, which is
   * the brief's "from the teacher's timetable they can go live from there once it
   * is time for studies".
   */
  async board(teacherId: string) {
    const now = new Date();
    // 1 = Monday … 5 = Friday, matching `TimetableSlot.dayOfWeek`. JavaScript's
    // Sunday-is-0 is converted once, here.
    const isoDay = now.getDay() === 0 ? 7 : now.getDay();

    const [live, slots, cohorts] = await Promise.all([
      this.prisma.session.findMany({
        where: { teacherId, status: 'in_progress' },
        select: {
          id: true,
          roomId: true,
          startsAtUtc: true,
          durationMin: true,
          type: true,
          recordingEnabled: true,
          timetableSlotId: true,
          subject: { select: { id: true, nameEn: true, nameFr: true } },
          cohort: { select: { id: true, name: true } },
          learner: { select: { id: true, fullName: true } },
          participants: { select: { userId: true, firstJoinAt: true, lastLeaveAt: true, attendedMinutes: true } },
          publishRequests: {
            where: { state: 'pending' },
            select: { id: true, learnerUserId: true, requestedAt: true },
          },
        },
      }),
      this.prisma.timetableSlot.findMany({
        where: { teacherId, state: 'confirmed', dayOfWeek: isoDay },
        orderBy: { startMinute: 'asc' },
        select: {
          id: true,
          startMinute: true,
          endMinute: true,
          subject: { select: { id: true, nameEn: true, nameFr: true } },
          level: { select: { id: true, nameEn: true, nameFr: true } },
          cohort: { select: { id: true, name: true } },
        },
      }),
      this.prisma.cohort.findMany({
        where: { teacherId, active: true },
        select: {
          id: true,
          name: true,
          subject: { select: { id: true, nameEn: true, nameFr: true } },
          level: { select: { id: true, nameEn: true, nameFr: true } },
          _count: { select: { members: true } },
        },
      }),
    ]);

    const minSessionMinutes = this.config.getNumber(CONFIG_KEYS.EARNING_MIN_SESSION_MINUTES);
    const nowMinute = now.getHours() * 60 + now.getMinutes();

    return {
      now: now.toISOString(),
      minSessionMinutes,
      hourlyRateXaf: this.config.getNumber(CONFIG_KEYS.TEACHER_HOURLY_RATE_XAF),
      live: live.map((session) => {
        const teacherSeat = session.participants.find((p) => p.userId === teacherId);
        const startedAt = teacherSeat?.firstJoinAt ?? session.startsAtUtc;
        const elapsedMinutes = Math.max(
          0,
          Math.floor((now.getTime() - startedAt.getTime()) / 60_000),
        );
        return {
          sessionId: session.id,
          roomId: session.roomId,
          subject: session.subject,
          cohort: session.cohort,
          learner: session.learner,
          type: session.type,
          startedAt: startedAt.toISOString(),
          elapsedMinutes,
          recordingEnabled: session.recordingEnabled,
          /*
           * Whether this lesson has passed the earnings floor.
           *
           * Reported off the wall clock as guidance for the teacher watching the
           * screen. What actually accrues is `attendedMinutes`, which comes from
           * the media server — see the class comment. The two are named
           * differently here so nobody reads one as the other.
           */
          countsTowardEarnings: elapsedMinutes >= minSessionMinutes,
          insideTimetableSlot: session.timetableSlotId !== null,
          presentCount: session.participants.filter((p) => p.firstJoinAt && !p.lastLeaveAt).length,
          attendedMinutesRecorded: session.participants.reduce(
            (sum, p) => sum + p.attendedMinutes,
            0,
          ),
          pendingHands: session.publishRequests.length,
        };
      }),
      /** Today's confirmed slots, and whether each is startable right now. */
      todaySlots: slots.map((slot) => ({
        id: slot.id,
        subject: slot.subject,
        level: slot.level,
        cohort: slot.cohort,
        startMinute: slot.startMinute,
        endMinute: slot.endMinute,
        clock: `${minutesToClock(slot.startMinute)}–${minutesToClock(slot.endMinute)}`,
        /*
         * A fifteen-minute run-up, so a teacher can open the room before the
         * children arrive rather than exactly as they do.
         */
        startableNow: nowMinute >= slot.startMinute - 15 && nowMinute < slot.endMinute,
        minutesUntilStart: Math.max(0, slot.startMinute - nowMinute),
      })),
      groups: cohorts.map((cohort) => ({
        id: cohort.id,
        name: cohort.name,
        subject: cohort.subject,
        level: cohort.level,
        learnerCount: cohort._count.members,
      })),
    };
  }

  /**
   * Going live.
   *
   * The teacher becomes a `SessionParticipant` immediately, which is what makes
   * them the host and what the elapsed clock is measured from. Recording is on for
   * a one-to-one by default (FR-SAF-004) rather than being asked about — a minor's
   * private lesson is recorded, and the disclosure is in the joining copy.
   */
  async goLive(user: AuthenticatedUser, input: GoLiveInput) {
    const already = await this.prisma.session.findFirst({
      where: { teacherId: user.id, status: 'in_progress' },
      select: { id: true },
    });
    // Two live rooms for one teacher means one of them has nobody teaching in it.
    if (already) throw AppError.conflict('errors.live.already_live', { sessionId: already.id });

    if (input.cohortId) {
      const cohort = await this.prisma.cohort.findFirst({
        where: { id: input.cohortId, teacherId: user.id },
        select: { id: true, subjectId: true },
      });
      if (!cohort) throw AppError.notFound();
      if (cohort.subjectId !== input.subjectId) {
        throw AppError.badRequest('errors.live.subject_mismatch');
      }
    } else if (input.learnerId) {
      /*
       * A private lesson needs an actual teaching relationship, not just a
       * learner id. `Assignment` is what records one, and without this check a
       * teacher could open a one-to-one room naming any child on the platform.
       */
      const assignment = await this.prisma.assignment.findFirst({
        where: { teacherId: user.id, learnerId: input.learnerId, subjectId: input.subjectId },
        select: { id: true },
      });
      if (!assignment) throw AppError.forbidden('errors.live.not_your_learner');
    }

    if (input.timetableSlotId) {
      const slot = await this.prisma.timetableSlot.findFirst({
        where: { id: input.timetableSlotId, teacherId: user.id, state: 'confirmed' },
        select: { id: true },
      });
      // A slot that is not this teacher's, or not confirmed, cannot be claimed —
      // that is the difference between teaching an hour and being paid for it.
      if (!slot) throw AppError.badRequest('errors.live.slot_not_confirmed');
    }

    const startsAtUtc = new Date();
    const isOneToOne = Boolean(input.learnerId);

    /*
     * A room id that is unique and carries nothing.
     *
     * Deliberately not derived from the subject, the cohort or the learner: this
     * string reaches a third-party media server and appears in its logs, and
     * `cc-form3-maths-amina` would put a child's class and name in them.
     */
    const roomId = `cc-${randomUUID()}`;

    const session = await this.prisma.$transaction(async (tx) => {
      const created = await tx.session.create({
        data: {
          teacherId: user.id,
          subjectId: input.subjectId,
          cohortId: input.cohortId ?? null,
          learnerId: input.learnerId ?? null,
          startsAtUtc,
          durationMin: input.durationMin,
          type: isOneToOne ? 'one_to_one' : 'group',
          status: 'in_progress',
          /*
           * The room the media server will be asked for. Minted above so the id in
           * our audit trail and the id on the SFU are the same string — reconciling
           * two of them after an incident is not a thing anyone should have to do.
           */
          roomId,
          // FR-SAF-004: a one-to-one with a minor is recorded by default.
          recordingEnabled: isOneToOne,
          timetableSlotId: input.timetableSlotId ?? null,
          /*
           * Only a timetabled lesson earns.
           *
           * The default Go Live call is for invited conversations, not
           * teaching, and must never produce an earning record — so the flag is
           * set from whether a slot was claimed, once, here. Re-deriving it at
           * payment time from the current timetable would unpay a lesson whose
           * slot was later withdrawn.
           */
          earnsFromTimetable: Boolean(input.timetableSlotId),
          /*
           * The rate in force right now, frozen onto the lesson.
           *
           * Read from configuration at this moment and never again: raising the
           * rate next month must not reprice this lesson, which is the whole
           * point of storing it rather than looking it up when paying.
           */
          periodRateXaf: input.timetableSlotId
            ? this.config.getNumber(CONFIG_KEYS.TIMETABLE_PERIOD_RATE_XAF)
            : null,
        },
        select: { id: true, roomId: true, startsAtUtc: true },
      });

      // The host takes their seat. `firstJoinAt` is the clock the lesson is
      // measured from, and it is set by the media server for everyone else.
      await tx.sessionParticipant.create({
        data: { sessionId: created.id, userId: user.id, firstJoinAt: startsAtUtc },
      });

      return created;
    });

    await this.audit.record({
      action: 'live.started',
      entity: 'session',
      entityId: session.id,
      actorId: user.id,
      after: {
        subjectId: input.subjectId,
        cohortId: input.cohortId ?? null,
        oneToOne: isOneToOne,
        timetableSlotId: input.timetableSlotId ?? null,
        recording: isOneToOne,
      },
    });

    /*
     * FR-LIV: every lesson is recorded, automatically.
     *
     * Started here rather than by the teacher, because a lesson nobody
     * remembered to record is exactly the one somebody will later need. It
     * returns null when LiveKit is unreachable, and the class goes ahead
     * regardless — a failed recording must not cancel a lesson.
     */
    const egressId = session.roomId ? await this.livekit.startRecording(session.roomId) : null;
    if (egressId) {
      await this.prisma.session.update({
        where: { id: session.id },
        data: { recordingEnabled: true, egressId },
      });
    }

    /*
     * The host's own token, handed back with the room.
     *
     * The teacher publishes from the moment they arrive; that is what being the
     * host means. A learner's token is minted separately and cannot publish
     * until the floor is granted.
     */
    const join = this.livekit.configured
      ? await this.livekit.issueToken({
          roomId: session.roomId!,
          identity: user.id,
          /*
           * Looked up rather than taken from the token.
           *
           * `AuthenticatedUser` carries the id, roles and language — not the
           * name, which is personal data with no reason to sit in a JWT. The
           * room needs something to label the tile with, so it is read here.
           */
          displayName: await this.displayName(user.id),
          canPublish: true,
        })
      : null;

    return {
      sessionId: session.id,
      roomId: session.roomId,
      startedAt: session.startsAtUtc.toISOString(),
      recordingEnabled: Boolean(egressId) || isOneToOne,
      mediaServerConfigured: this.livekit.configured,
      /** Null when LiveKit is not configured; the screen says so rather than
       *  showing a black rectangle and letting the teacher blame their camera. */
      join,
    };
  }

  /**
   * A fresh host token for a lesson already in progress.
   *
   * Tokens last ten minutes and a lesson lasts longer, so a teacher whose
   * browser reloads needs a new one to get back into the room. Scoped to their
   * own in-progress session, so this cannot mint a host seat in somebody else's
   * classroom.
   */
  async hostToken(user: AuthenticatedUser, sessionId: string) {
    const session = await this.prisma.session.findFirst({
      where: { id: sessionId, teacherId: user.id, status: 'in_progress' },
      select: { roomId: true },
    });
    if (!session?.roomId) throw AppError.notFound();

    return this.livekit.issueToken({
      roomId: session.roomId,
      identity: user.id,
      displayName: await this.displayName(user.id),
      canPublish: true,
    });
  }

  /**
   * Where the teacher stands inside the period, while teaching.
   *
   * The brief asks for a countdown on screen. Everything here is computed from
   * the server's clock and the server's record of when the room opened —
   * `classes.ts` establishes that attendance is observed, not self-reported,
   * and a countdown the browser calculates for itself is a number a teacher
   * could change.
   *
   * An invite-only call has no period and earns nothing, so it returns nulls
   * rather than a countdown to a deadline that does not exist.
   */
  async countdown(user: AuthenticatedUser, sessionId: string) {
    const session = await this.prisma.session.findFirst({
      where: { id: sessionId, teacherId: user.id, status: 'in_progress' },
      select: {
        id: true,
        startsAtUtc: true,
        periodRateXaf: true,
        earnsFromTimetable: true,
        timetableSlot: { select: { startMinute: true, endMinute: true } },
        participants: { where: { userId: user.id }, select: { firstJoinAt: true } },
      },
    });
    if (!session) throw AppError.notFound();

    if (!session.earnsFromTimetable || !session.timetableSlot) {
      return {
        earns: false,
        minutesEarned: 0,
        minutesRemaining: null,
        completed: false,
        periodEndsAt: null,
        rateXaf: null,
        valueXaf: '0',
      };
    }

    /*
     * The period's real wall-clock bounds for today.
     *
     * `startMinute` is minutes from midnight, so it is anchored to the calendar
     * day the lesson began rather than to "now" — a lesson running across
     * midnight would otherwise count against tomorrow's period.
     */
    const dayStart = new Date(session.startsAtUtc);
    dayStart.setHours(0, 0, 0, 0);
    const periodStartMs = dayStart.getTime() + session.timetableSlot.startMinute * 60_000;
    const periodEndMs = dayStart.getTime() + session.timetableSlot.endMinute * 60_000;

    const connectedAtMs = (
      session.participants[0]?.firstJoinAt ?? session.startsAtUtc
    ).getTime();
    const nowMs = Date.now();

    const minimumMinutes = this.config.getNumber(CONFIG_KEYS.EARNING_MIN_SESSION_MINUTES);
    const minutesEarned = earnedMinutes({
      connectedAtMs,
      disconnectedAtMs: nowMs,
      periodStartMs,
      periodEndMs,
      minimumMinutes,
    });

    const rate = session.periodRateXaf ?? 0;
    /*
     * Paid pro rata within the period, in integer arithmetic with the division
     * last: 31 of 45 minutes at 1000 is 688, not 689 and not a float.
     */
    const valueXaf = Math.floor((rate * minutesEarned) / TIMETABLE_PERIOD_MINUTES);

    return {
      earns: true,
      minutesEarned,
      /** Counts down to the period's end, not to the teacher leaving. */
      minutesRemaining: Math.max(0, Math.ceil((periodEndMs - nowMs) / 60_000)),
      /** FR: a period is completed once the teacher has been live 30 minutes. */
      completed: minutesEarned >= minimumMinutes,
      minimumMinutes,
      periodEndsAt: new Date(periodEndMs).toISOString(),
      rateXaf: rate,
      valueXaf: String(valueXaf),
    };
  }

  /** The name shown on a participant's tile in the room. */
  private async displayName(userId: string): Promise<string> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { fullName: true },
    });
    return user?.fullName ?? 'Teacher';
  }

  /**
   * Ending the lesson.
   *
   * Closes every open participant seat as well as the session: a seat with no
   * `lastLeaveAt` reads as "still in the room" on the admin's live board for ever
   * otherwise.
   */
  async endLive(user: AuthenticatedUser, sessionId: string) {
    const session = await this.prisma.session.findFirst({
      where: { id: sessionId, teacherId: user.id, status: 'in_progress' },
      select: { id: true, startsAtUtc: true, timetableSlotId: true, participants: { select: { userId: true, firstJoinAt: true } } },
    });
    if (!session) throw AppError.notFound();

    const endedAt = new Date();
    const minutes = Math.max(0, Math.floor((endedAt.getTime() - session.startsAtUtc.getTime()) / 60_000));

    await this.prisma.$transaction(async (tx) => {
      await tx.session.update({
        where: { id: sessionId },
        data: { status: 'completed', endedAt },
      });
      await tx.sessionParticipant.updateMany({
        where: { sessionId, lastLeaveAt: null },
        data: { lastLeaveAt: endedAt },
      });
    });

    await this.audit.record({
      action: 'live.ended',
      entity: 'session',
      entityId: sessionId,
      actorId: user.id,
      after: {
        wallClockMinutes: minutes,
        countedAgainstSlot: session.timetableSlotId !== null,
      },
    });

    const minSessionMinutes = this.config.getNumber(CONFIG_KEYS.EARNING_MIN_SESSION_MINUTES);
    return {
      sessionId,
      endedAt: endedAt.toISOString(),
      wallClockMinutes: minutes,
      /*
       * Whether the lesson was long enough and inside a confirmed slot — the two
       * conditions the brief attaches to earning. Reported as an expectation, and
       * the actual accrual is Finance's period calculation reading verified
       * attended minutes.
       */
      eligibleForEarnings: minutes >= minSessionMinutes && session.timetableSlotId !== null,
      minSessionMinutes,
    };
  }

  /** Who is in the room, and who is asking to speak. */
  async roomState(user: AuthenticatedUser, sessionId: string) {
    const session = await this.prisma.session.findFirst({
      where: { id: sessionId, teacherId: user.id },
      select: {
        id: true,
        status: true,
        roomId: true,
        startsAtUtc: true,
        cohortId: true,
        recordingEnabled: true,
        subject: { select: { id: true, nameEn: true, nameFr: true } },
        participants: {
          select: {
            userId: true,
            firstJoinAt: true,
            lastLeaveAt: true,
            attendedMinutes: true,
            user: { select: { fullName: true } },
          },
        },
        publishRequests: {
          orderBy: { requestedAt: 'asc' },
          select: {
            id: true,
            learnerUserId: true,
            state: true,
            screenShare: true,
            requestedAt: true,
            decidedAt: true,
            learner: { select: { fullName: true } },
          },
        },
      },
    });
    if (!session) throw AppError.notFound();

    const expected = session.cohortId
      ? await this.prisma.cohortMember.findMany({
          where: { cohortId: session.cohortId, leftAt: null },
          select: { learner: { select: { id: true, fullName: true, userId: true } } },
        })
      : [];

    const present = new Set(
      session.participants.filter((p) => p.firstJoinAt && !p.lastLeaveAt).map((p) => p.userId),
    );

    return {
      sessionId: session.id,
      status: session.status,
      roomId: session.roomId,
      subject: session.subject,
      recordingEnabled: session.recordingEnabled,
      startedAt: session.startsAtUtc.toISOString(),
      /** The register, with who is actually in the room against it. */
      roster: expected.map((member) => ({
        learnerId: member.learner.id,
        userId: member.learner.userId,
        fullName: member.learner.fullName,
        present: member.learner.userId ? present.has(member.learner.userId) : false,
      })),
      /** FR-LIV-*: the hands up, and who currently holds the floor. */
      floor: session.publishRequests.map((request) => ({
        requestId: request.id,
        learnerUserId: request.learnerUserId,
        fullName: request.learner.fullName,
        state: request.state,
        screenShare: request.screenShare,
        requestedAt: request.requestedAt.toISOString(),
        decidedAt: request.decidedAt?.toISOString() ?? null,
      })),
      speakers: session.publishRequests
        .filter((request) => request.state === 'approved')
        .map((request) => request.learnerUserId),
    };
  }

  /**
   * The host deciding a raised hand.
   *
   * `MediaPublishRequest` is the model, and it is the whole of the brief's "the
   * students will only be able to say something when the teacher has selected
   * them": nobody publishes audio without a `granted` row, and the media server is
   * handed this state rather than deciding for itself.
   */
  async decideFloor(
    user: AuthenticatedUser,
    sessionId: string,
    requestId: string,
    input: DecidePublishRequestInput,
  ) {
    const request = await this.prisma.mediaPublishRequest.findFirst({
      where: { id: requestId, sessionId, session: { teacherId: user.id } },
      select: { id: true, state: true, learnerUserId: true },
    });
    if (!request) throw AppError.notFound();

    const now = new Date();
    const updated = await this.prisma.mediaPublishRequest.update({
      where: { id: requestId },
      data:
        input.decision === 'revoked'
          ? { state: 'revoked', revokedAt: now, revokedBy: user.id }
          : {
              state: input.decision === 'approved' ? 'approved' : 'dismissed',
              decidedAt: now,
              decidedBy: user.id,
              screenShare: input.decision === 'approved' ? input.screenShare : false,
            },
      select: { id: true, state: true, screenShare: true, learnerUserId: true },
    });

    /*
     * Audited both ways.
     *
     * Granting the floor is the moment a child became audible to a class, and
     * revoking it is the moment a teacher cut them off. Both are things a
     * safeguarding review asks about afterwards.
     */
    await this.audit.record({
      action: input.decision === 'approved' ? 'live.floor_granted' : 'live.floor_revoked',
      entity: 'media_publish_request',
      entityId: requestId,
      actorId: user.id,
      after: {
        sessionId,
        learnerUserId: updated.learnerUserId,
        state: updated.state,
        screenShare: updated.screenShare,
      },
    });

    /*
     * Tell the media server, or the decision is only a database row.
     *
     * `MediaPublishRequest` is the platform's record of who may speak; the
     * signed token is what LiveKit actually enforces. Without this line a
     * teacher could grant the floor, the row would say `approved`, and the
     * learner's microphone would stay refused — the grant would exist
     * everywhere except where it matters.
     *
     * Updated in place rather than by re-issuing a token, so the learner is not
     * disconnected and reconnected in order to answer a question.
     */
    const room = await this.prisma.session.findUnique({
      where: { id: sessionId },
      select: { roomId: true },
    });
    if (room?.roomId) {
      await this.livekit.setCanPublish(
        room.roomId,
        updated.learnerUserId,
        updated.state === 'approved',
      );
    }

    return { requestId: updated.id, state: updated.state, screenShare: updated.screenShare };
  }

  /**
   * Searching for somebody to invite, by name.
   *
   * The brief's "he clicks Invite and types the name". Students and teachers
   * both, because a teacher may want a colleague on the call.
   *
   * Deliberately requires two characters and returns a short list: this is a
   * directory of every child on the platform, and an empty query that returns
   * all of them is a data export dressed as a search box.
   */
  async searchInvitees(sessionId: string, user: AuthenticatedUser, query: string) {
    const session = await this.prisma.session.findFirst({
      where: { id: sessionId, teacherId: user.id, status: 'in_progress' },
      select: { id: true },
    });
    if (!session) throw AppError.notFound();

    const term = query.trim();
    if (term.length < 2) return { people: [] };

    const people = await this.prisma.user.findMany({
      where: {
        fullName: { contains: term, mode: 'insensitive' },
        status: 'active',
        id: { not: user.id },
        roles: { some: { role: { in: ['student', 'adult_learner', 'teacher'] } } },
      },
      select: { id: true, fullName: true, roles: { select: { role: true } } },
      orderBy: { fullName: 'asc' },
      take: 20,
    });

    const invited = await this.prisma.sessionInvite.findMany({
      where: { sessionId, revokedAt: null },
      select: { userId: true },
    });
    const already = new Set(invited.map((row) => row.userId));

    return {
      people: people.map((person) => ({
        id: person.id,
        fullName: person.fullName,
        roles: person.roles.map((r) => r.role),
        invited: already.has(person.id),
      })),
    };
  }

  /**
   * Inviting somebody into an invite-only call.
   *
   * Upserted rather than inserted, and a revoked invitation is revived rather
   * than duplicated: inviting the same person twice is one invitation, and the
   * unique index says so.
   */
  async inviteToCall(user: AuthenticatedUser, sessionId: string, userId: string) {
    const session = await this.prisma.session.findFirst({
      where: { id: sessionId, teacherId: user.id, status: 'in_progress' },
      select: { id: true },
    });
    if (!session) throw AppError.notFound();

    await this.prisma.sessionInvite.upsert({
      where: { sessionId_userId: { sessionId, userId } },
      create: { sessionId, userId, invitedBy: user.id },
      update: { revokedAt: null, invitedBy: user.id, invitedAt: new Date() },
    });

    /*
     * Audited, because this is the moment somebody who was not booked into
     * anything became able to enter a room with a teacher in it.
     */
    await this.audit.record({
      action: 'live.invited',
      entity: 'session',
      entityId: sessionId,
      actorId: user.id,
      after: { invitedUserId: userId },
    });

    // FR-NOT: the invitation arrives as a message they can act on.
    await this.notifications
      .notifyUser(userId, 'liveInvitation', { sessionId })
      .catch(() => undefined);

    return { invited: true };
  }

  /** Withdrawing an invitation. The row stays; only the permission goes. */
  async revokeInvite(user: AuthenticatedUser, sessionId: string, userId: string) {
    const session = await this.prisma.session.findFirst({
      where: { id: sessionId, teacherId: user.id },
      select: { id: true, roomId: true },
    });
    if (!session) throw AppError.notFound();

    await this.prisma.sessionInvite.updateMany({
      where: { sessionId, userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });

    await this.audit.record({
      action: 'live.invite_revoked',
      entity: 'session',
      entityId: sessionId,
      actorId: user.id,
      after: { revokedUserId: userId },
    });

    return { revoked: true };
  }

  /**
   * A learner's own token for a lesson they are entitled to attend.
   *
   * Listen-only by default. `canPublish` follows the `MediaPublishRequest`
   * state, so a learner who already holds the floor and reloads their browser
   * comes back able to speak — and everyone else comes back unable to, which is
   * the rule the whole flow exists to keep.
   *
   * Entitlement is checked here rather than trusted from the client: a learner
   * may join a lesson they are booked into, and nothing else. A room id is not
   * a secret worth relying on.
   */
  async learnerToken(user: AuthenticatedUser, sessionId: string) {
    /*
     * Two different rooms, two different guest lists.
     *
     * A timetabled lesson admits the class booked into it. An invite-only call
     * has no class, so it admits exactly the people on `session_invites` — and
     * the brief is explicit that possession of the link is not admission.
     *
     * Fetched first without any entitlement filter so the two cases can be told
     * apart; nothing is issued until one of them passes below.
     */
    const session = await this.prisma.session.findFirst({
      where: { id: sessionId, status: 'in_progress' },
      select: { id: true, roomId: true, earnsFromTimetable: true, timetableSlotId: true },
    });
    if (!session?.roomId) throw AppError.notFound();

    const isInviteOnly = session.timetableSlotId === null;

    if (isInviteOnly) {
      /*
       * The whole of "invite only", enforced where it cannot be bypassed.
       *
       * No token is minted without a live invitation, so a link forwarded to a
       * classmate gets them a 404 rather than a seat. A withdrawn invitation
       * has `revokedAt` set and fails the same check.
       */
      const invite = await this.prisma.sessionInvite.findFirst({
        where: { sessionId, userId: user.id, revokedAt: null },
        select: { id: true },
      });
      if (!invite) throw AppError.forbidden('errors.live.not_invited');
    } else {
      /*
       * Booked in, one way or the other: a one-to-one names the learner, and
       * a group lesson reaches them through the cohort they belong to.
       */
      const booked = await this.prisma.session.findFirst({
        where: {
          id: sessionId,
          OR: [
            { learnerId: user.id },
            { cohort: { members: { some: { learnerId: user.id } } } },
            { participants: { some: { userId: user.id } } },
          ],
        },
        select: { id: true },
      });
      if (!booked) throw AppError.notFound();
    }

    const granted = await this.prisma.mediaPublishRequest.findFirst({
      where: { sessionId, learnerUserId: user.id, state: 'approved' },
      select: { id: true },
    });

    const token = await this.livekit.issueToken({
      roomId: session.roomId,
      identity: user.id,
      displayName: await this.displayName(user.id),
      canPublish: Boolean(granted),
    });

    /*
     * The seat is opened here, not by the client saying it arrived.
     *
     * `firstJoinAt` is what attendance and the 40-minute rating rule are
     * measured from, and a client-reported arrival is a number a learner could
     * choose for themselves.
     */
    await this.prisma.sessionParticipant.upsert({
      where: { sessionId_userId: { sessionId, userId: user.id } },
      create: { sessionId, userId: user.id, firstJoinAt: new Date() },
      update: {},
    });

    return { ...token, canPublish: Boolean(granted) };
  }

  /**
   * A learner raising their hand.
   *
   * The brief's "students can click Request to Talk when they want to say
   * something". It creates a pending request and nothing more — asking is not
   * being granted, and the microphone stays refused until the teacher decides.
   *
   * Repeating the request returns the existing one rather than filling the
   * host's list with duplicates from a learner tapping twice on a slow link.
   */
  async requestFloor(user: AuthenticatedUser, sessionId: string) {
    const session = await this.prisma.session.findFirst({
      where: {
        id: sessionId,
        status: 'in_progress',
        OR: [
          { learnerId: user.id },
          { cohort: { members: { some: { learnerId: user.id } } } },
          { participants: { some: { userId: user.id } } },
        ],
      },
      select: { id: true },
    });
    if (!session) throw AppError.notFound();

    const existing = await this.prisma.mediaPublishRequest.findFirst({
      where: { sessionId, learnerUserId: user.id, state: { in: ['pending', 'approved'] } },
      select: { id: true, state: true },
    });
    if (existing) return { requestId: existing.id, state: existing.state };

    const request = await this.prisma.mediaPublishRequest.create({
      data: { sessionId, learnerUserId: user.id, state: 'pending', requestedAt: new Date() },
      select: { id: true, state: true },
    });

    return { requestId: request.id, state: request.state };
  }

  /**
   * Inviting a learner to speak who did not ask.
   *
   * The brief's "the teacher can select any random students to join him and say
   * something". Modelled as a request that arrives already granted, so there is
   * one state machine rather than two — and the audit trail does not have to
   * distinguish a hand that was raised from one that was volunteered on the
   * child's behalf.
   */
  async inviteToSpeak(
    user: AuthenticatedUser,
    sessionId: string,
    learnerUserId: string,
    screenShare: boolean,
  ) {
    const session = await this.prisma.session.findFirst({
      where: { id: sessionId, teacherId: user.id, status: 'in_progress' },
      select: { id: true },
    });
    if (!session) throw AppError.notFound();

    const now = new Date();
    const existing = await this.prisma.mediaPublishRequest.findFirst({
      where: { sessionId, learnerUserId, state: { in: ['pending', 'approved'] } },
      select: { id: true },
    });

    const request = existing
      ? await this.prisma.mediaPublishRequest.update({
          where: { id: existing.id },
          data: { state: 'approved', decidedAt: now, decidedBy: user.id, screenShare },
          select: { id: true, state: true },
        })
      : await this.prisma.mediaPublishRequest.create({
          data: {
            sessionId,
            learnerUserId,
            state: 'approved',
            screenShare,
            decidedAt: now,
            decidedBy: user.id,
          },
          select: { id: true, state: true },
        });

    await this.audit.record({
      action: 'live.floor_granted',
      entity: 'media_publish_request',
      entityId: request.id,
      actorId: user.id,
      after: { sessionId, learnerUserId, invited: true, screenShare },
    });

    // Same gap as `decideFloor`: without this the row says approved and the
    // learner's microphone stays refused by the media server.
    const room = await this.prisma.session.findUnique({
      where: { id: sessionId },
      select: { roomId: true },
    });
    if (room?.roomId) {
      await this.livekit.setCanPublish(room.roomId, learnerUserId, true);
    }

    return { requestId: request.id, state: request.state };
  }

  /**
   * My live classes — the teacher watching back what they taught.
   *
   * Grouped by day, which is the brief's "based on the days he has taught". A
   * recording with no `Recording` row is a lesson that was not recorded, and it is
   * still listed: "no video for Tuesday" and "Tuesday never happened" are
   * different pieces of news.
   */
  async ownRecordings(teacherId: string) {
    const sessions = await this.prisma.session.findMany({
      where: { teacherId, status: { in: ['completed', 'in_progress'] } },
      orderBy: { startsAtUtc: 'desc' },
      take: 200,
      select: {
        id: true,
        startsAtUtc: true,
        endedAt: true,
        durationMin: true,
        type: true,
        recordingEnabled: true,
        subject: { select: { id: true, nameEn: true, nameFr: true } },
        cohort: { select: { id: true, name: true } },
        learner: { select: { id: true, fullName: true } },
        participants: { select: { attendedMinutes: true } },
        recordings: {
          orderBy: { createdAt: 'desc' },
          select: {
            id: true,
            durationSec: true,
            sizeBytes: true,
            availableUntil: true,
            audioKey: true,
            createdAt: true,
          },
        },
      },
    });

    return {
      lessons: sessions.map((session) => {
        const recording = session.recordings[0] ?? null;
        return {
          sessionId: session.id,
          taughtOn: session.startsAtUtc.toISOString(),
          subject: session.subject,
          cohort: session.cohort,
          learner: session.learner,
          type: session.type,
          durationMin: session.durationMin,
          attendedMinutes: session.participants.reduce((sum, p) => sum + p.attendedMinutes, 0),
          recordingEnabled: session.recordingEnabled,
          recording: recording
            ? {
                id: recording.id,
                durationSec: recording.durationSec,
                // NFR-BAN-002: the size before the tap. BigInt is stringified —
                // `JSON.stringify` throws on one rather than rounding it.
                sizeBytes: recording.sizeBytes === null ? null : recording.sizeBytes.toString(),
                availableUntil: recording.availableUntil.toISOString(),
                audioAvailable: recording.audioKey !== null,
              }
            : null,
          /*
           * Why there is no video, when there is none. Four different reasons and
           * the teacher is told which — "not recorded" and "still processing" are
           * not the same news (NFR-USA-004).
           */
          recordingState: recording
            ? 'ready'
            : session.recordingEnabled
              ? session.endedAt
                ? 'processing'
                : 'in_progress'
              : 'not_recorded',
        };
      }),
    };
  }
}
