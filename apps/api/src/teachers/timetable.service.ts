import { Injectable } from '@nestjs/common';
import {
  findClashes,
  validateTimetableSlot,
  PERIODS_PER_SUBJECT_PER_WEEK,
  CONFIG_KEYS,
  type ProposeTimetableSlotInput,
  type DecideTimetableSlotInput,
} from '@classconnect/shared';
import { PlatformConfigService } from '../common/platform-config.service';
import { PrismaService } from '../common/prisma.service';
import { AuditService } from '../audit/audit.service';
import { NotificationsService } from '../notifications/notifications.service';
import { AppError } from '../common/http-exception.filter';
import type { AuthenticatedUser } from '../rbac/decorators';

/** What every read of a slot returns, so the three surfaces agree. */
const SLOT_SELECT = {
  id: true,
  dayOfWeek: true,
  startMinute: true,
  endMinute: true,
  state: true,
  decisionNote: true,
  confirmedAt: true,
  level: { select: { id: true, code: true, nameEn: true, nameFr: true } },
  subject: { select: { id: true, code: true, nameEn: true, nameFr: true } },
  cohort: { select: { id: true, name: true } },
  teacher: { select: { userId: true, user: { select: { fullName: true } } } },
} as const;

/**
 * BUILD-PLAN Phase 1 — the timetabled teaching week.
 *
 * A teacher proposes hours; staff confirm them. Confirmation is what makes a
 * slot count, so the permission lives on the decision and not on the proposal:
 * anyone may offer to teach at ten on Tuesday, and only the school decides that
 * it is now a class.
 */
@Injectable()
export class TimetableService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
    private readonly config: PlatformConfigService,
  ) {}

  /** The signed-in teacher's own week, proposed and confirmed alike. */
  async ownSlots(teacherId: string) {
    const slots = await this.prisma.timetableSlot.findMany({
      where: { teacherId, state: { not: 'rejected' } },
      orderBy: [{ dayOfWeek: 'asc' }, { startMinute: 'asc' }],
      select: SLOT_SELECT,
    });
    return { slots };
  }

  /**
   * One class's week — what a student in that level sees.
   *
   * Confirmed only. A proposal is a conversation between a teacher and the
   * school; putting it on a child's timetable would have them turn up to a
   * lesson nobody agreed to run.
   */
  async levelSlots(levelId: string) {
    const slots = await this.prisma.timetableSlot.findMany({
      where: { levelId, state: 'confirmed' },
      orderBy: [{ dayOfWeek: 'asc' }, { startMinute: 'asc' }],
      select: SLOT_SELECT,
    });
    return { slots };
  }

  /** Everything waiting on a decision, for the staff timetable screen. */
  async pendingSlots() {
    const slots = await this.prisma.timetableSlot.findMany({
      where: { state: 'proposed' },
      orderBy: [{ createdAt: 'asc' }],
      select: SLOT_SELECT,
    });
    return { slots };
  }

  /**
   * A teacher offers an hour they will teach.
   *
   * The clash check runs here as well as in the form. The form's copy is a
   * courtesy — it cannot see the slot another teacher proposed a second ago,
   * and it runs on a client that may be lying.
   */
  async propose(user: AuthenticatedUser, input: ProposeTimetableSlotInput) {
    const problem = validateTimetableSlot(input, input.session ?? 'day');
    if (problem) throw AppError.badRequest(problem);

    /*
     * The configured school week, checked here rather than in the schema.
     *
     * Zod cannot read `PlatformConfig`, so the DTO accepts 1–7 and this decides
     * whether Saturday is a teaching day today. That is what makes 24/5 → 24/6
     * a settings change instead of a deployment.
     */
    const weekDays = this.config.getNumber(CONFIG_KEYS.SCHOOL_WEEK_DAYS);
    if (input.dayOfWeek > weekDays) {
      throw AppError.badRequest('errors.timetable.outside_school_week', { days: weekDays });
    }

    /*
     * A teacher may only timetable a subject they were verified to teach.
     *
     * FR-TVR-005 approves someone for particular subjects and levels; letting
     * them timetable anything else would route around the verification the
     * whole application exists to perform.
     */
    const teaches = await this.prisma.teacherSubject.findFirst({
      where: { teacherId: user.id, subjectId: input.subjectId, levelId: input.levelId },
    });
    if (!teaches) throw AppError.forbidden('errors.timetable.not_your_subject');

    /*
     * The clash rule, against this teacher's own week.
     *
     * Deliberately not against the level's week: two teachers timetabled over
     * each other in one class is a scheduling decision for staff to see and
     * resolve, and refusing the proposal outright would leave the teacher
     * unable to say when they are free at all. One person in two places at once
     * is the impossibility, and that is what this refuses.
     */
    const mine = await this.prisma.timetableSlot.findMany({
      where: { teacherId: user.id, dayOfWeek: input.dayOfWeek, state: { not: 'rejected' } },
      select: { id: true, dayOfWeek: true, startMinute: true, endMinute: true },
    });
    const clashes = findClashes(input, mine);
    if (clashes.length > 0) {
      throw AppError.conflict('errors.timetable.clash', { count: clashes.length });
    }

    /*
     * The slot must still be free in this class.
     *
     * The clash check above answers "is this teacher already busy"; it says
     * nothing about the period itself. Claiming now takes effect immediately,
     * so two teachers who claim the same period seconds apart would both appear
     * on the class timetable with no staff step in between to notice.
     *
     * Read-then-write is not airtight against a simultaneous claim — the unique
     * index added alongside this is what actually decides — but it turns the
     * ordinary case into a clear message rather than a constraint error.
     */
    const taken = await this.prisma.timetableSlot.findFirst({
      where: {
        levelId: input.levelId,
        dayOfWeek: input.dayOfWeek,
        startMinute: input.startMinute,
        state: { in: ['proposed', 'confirmed', 'on_hold'] },
      },
      select: { id: true },
    });
    if (taken) throw AppError.conflict('errors.timetable.slot_taken');

    /*
     * FR: a subject is taught twice a week, and one teacher holds at most those
     * two periods of it.
     *
     * Counted across the whole week for this level and subject, not per day —
     * "twice a week" is a weekly allowance, and two periods on Monday is a
     * legitimate way to spend it.
     */
    const alreadyHeld = await this.prisma.timetableSlot.count({
      where: {
        levelId: input.levelId,
        subjectId: input.subjectId,
        state: { in: ['proposed', 'confirmed', 'on_hold'] },
      },
    });
    if (alreadyHeld >= PERIODS_PER_SUBJECT_PER_WEEK) {
      throw AppError.conflict('errors.timetable.subject_full', {
        max: PERIODS_PER_SUBJECT_PER_WEEK,
      });
    }

    const slot = await this.prisma.timetableSlot.create({
      data: {
        teacherId: user.id,
        levelId: input.levelId,
        subjectId: input.subjectId,
        cohortId: input.cohortId ?? null,
        dayOfWeek: input.dayOfWeek,
        startMinute: input.startMinute,
        endMinute: input.endMinute,
        session: input.session ?? 'day',
        /*
         * Claimed, not proposed.
         *
         * A teacher picking an empty period is the decision — it shows on every
         * timetable for that class at once, and it is earning-eligible from
         * then on. The admin's control is after the fact: they can change the
         * teacher on any slot, or put the period on hold.
         *
         * `proposed` remains in the enum for the slots recorded before this and
         * for the private grid, where the admin fills the period and a
         * teacher's own claim is not what creates it.
         */
        state: 'confirmed',
        confirmedBy: user.id,
        confirmedAt: new Date(),
      },
      select: SLOT_SELECT,
    });

    await this.audit.record({
      action: 'timetable.proposed',
      entity: 'timetable_slot',
      entityId: slot.id,
      actorId: user.id,
      after: {
        dayOfWeek: input.dayOfWeek,
        startMinute: input.startMinute,
        endMinute: input.endMinute,
      },
    });

    // Told, not waited for — see `TeachersService.submitApplication` for why a
    // notification never sits in front of the applicant's own answer.
    void this.notifications
      .notifyRoles(['admin_ops', 'super_admin', 'support_agent'], 'timetableSlotProposed', {
        teacher: user.id,
      })
      .catch(() => undefined);

    return slot;
  }

  /**
   * A teacher gives up a period they claimed.
   *
   * Claims now take effect immediately, so this is the only way back out — and
   * without it a mis-clicked period would be permanent. It also covers the
   * brief's "he can drop the session before joining, depending on the other
   * subject he wants to teach".
   *
   * A period an admin has put on hold is not theirs to withdraw: the hold is a
   * decision about the class, and releasing it belongs to whoever made it.
   */
  async withdraw(user: AuthenticatedUser, slotId: string) {
    const slot = await this.prisma.timetableSlot.findUnique({ where: { id: slotId } });
    if (!slot || slot.teacherId !== user.id) throw AppError.notFound();
    if (slot.state === 'on_hold') {
      throw AppError.conflict('errors.timetable.on_hold');
    }
    if (slot.state === 'rejected') {
      throw AppError.conflict('errors.timetable.already_decided');
    }

    await this.prisma.timetableSlot.delete({ where: { id: slotId } });
    await this.audit.record({
      action: 'timetable.withdrawn',
      entity: 'timetable_slot',
      entityId: slotId,
      actorId: user.id,
    });
    return { withdrawn: true };
  }

  /**
   * Staff confirm or refuse. This is the step that makes a slot real.
   *
   * The clash check runs again here, against the *level's* confirmed week as
   * well as the teacher's: by the time somebody gets to this queue another
   * proposal may have been confirmed into the same hour, and confirming both
   * would timetable two lessons on top of each other.
   */
  async decide(staff: AuthenticatedUser, slotId: string, input: DecideTimetableSlotInput) {
    const slot = await this.prisma.timetableSlot.findUnique({ where: { id: slotId } });
    if (!slot) throw AppError.notFound();

    /*
     * What staff may do depends on where the slot already is.
     *
     * A teacher's claim arrives `confirmed` rather than `proposed`, so the old
     * "must be proposed" guard would have made every live period untouchable —
     * including by the hold power the brief gives the admin explicitly.
     *
     *   proposed   → confirm, refuse, or hold   (private grid, and older rows)
     *   confirmed  → hold, or refuse outright
     *   on_hold    → confirm, which lifts the hold and puts the class back
     *   rejected   → nothing; the slot is finished
     */
    if (slot.state === 'rejected') {
      throw AppError.conflict('errors.timetable.already_decided');
    }
    if (slot.state === 'confirmed' && input.decision === 'confirmed') {
      throw AppError.conflict('errors.timetable.already_decided');
    }

    if (input.decision === 'confirmed') {
      const confirmed = await this.prisma.timetableSlot.findMany({
        where: {
          dayOfWeek: slot.dayOfWeek,
          state: 'confirmed',
          OR: [{ teacherId: slot.teacherId }, { levelId: slot.levelId }],
        },
        select: { id: true, dayOfWeek: true, startMinute: true, endMinute: true },
      });
      const clashes = findClashes(slot, confirmed, { ignoreId: slot.id });
      if (clashes.length > 0) {
        throw AppError.conflict('errors.timetable.clash', { count: clashes.length });
      }
    }

    const updated = await this.prisma.timetableSlot.update({
      where: { id: slotId },
      data: {
        state: input.decision,
        decisionNote: input.note ?? null,
        confirmedBy: staff.id,
        confirmedAt: new Date(),
      },
      select: SLOT_SELECT,
    });

    await this.audit.record({
      action: 'timetable.decided',
      entity: 'timetable_slot',
      entityId: slotId,
      actorId: staff.id,
      before: { state: slot.state },
      after: { state: input.decision, note: input.note ?? null },
    });

    void this.notifications
      .notifyUser(slot.teacherId, 'timetableSlotDecided', {
        decision: input.decision,
        note: input.note ?? '',
      })
      .catch(() => undefined);

    return updated;
  }
}
