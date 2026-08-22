import { Injectable } from '@nestjs/common';
import {
  findClashes,
  validateTimetableSlot,
  PERIODS_PER_SUBJECT_PER_WEEK,
  DAYS_PER_SUBJECT_PER_TEACHER,
  periodsFor,
  minutesToClock,
  CONFIG_KEYS,
  type ProposeTimetableSlotInput,
  type DecideTimetableSlotInput,
  type EditTimetableSlotInput,
  type AdminEditTimetableSlotInput,
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
  /*
   * The pending time change travels with every slot.
   *
   * The teacher's own week needs it to mark a slot as waiting, and leaving it
   * out would mean a teacher edits an hour, sees nothing change, and edits
   * again - which is exactly how a screen teaches somebody that it is broken.
   */
  proposedStartMinute: true,
  proposedEndMinute: true,
  proposedAt: true,
  /*
   * What the period pays, so the teacher can see it on their own week.
   *
   * A rate an admin sets and the teacher cannot see is a number they find out
   * about on a payslip. Null means the platform default applies, which the
   * screen resolves and labels as such rather than showing a blank.
   */
  hourlyRateXaf: true,
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
    /*
     * The platform rate travels with the week so an unpriced period can say
     * what it actually pays.
     *
     * `hourlyRateXaf` is null on most slots, meaning "whatever the platform
     * pays" — and a teacher shown a blank there learns nothing. Sending the
     * default lets the screen print a figure for every period, and mark which
     * ones were set individually.
     */
    return {
      slots,
      defaultHourlyRateXaf: this.config.getNumber(CONFIG_KEYS.TEACHER_HOURLY_RATE_XAF),
    };
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

  /**
   * Every class's week, in one read — the admin's whole-school view.
   *
   * The brief asks for one screen covering primary, secondary, Lower and Upper
   * Sixth and private classes, each class shown the same way, Monday to
   * Saturday, with the subject and the teacher in every slot.
   *
   * One query for the slots rather than one per class: a school of thirty
   * classes would otherwise be thirty round trips to a database in another
   * region, and the screen is the one place somebody looks to see everything at
   * once.
   *
   * Levels with no slots are still returned. "Form 2 has no timetable yet" is
   * the single most useful thing this screen can tell an admin, and omitting
   * the empty ones would hide exactly that.
   */
  async wholeSchool() {
    const [levels, slots] = await Promise.all([
      this.prisma.level.findMany({
        where: { active: true },
        orderBy: [{ schoolType: 'asc' }, { sortOrder: 'asc' }],
        select: { id: true, code: true, nameEn: true, nameFr: true, schoolType: true },
      }),
      this.prisma.timetableSlot.findMany({
        /*
         * Confirmed and on-hold, never rejected or merely proposed.
         *
         * A held period still occupies the class's week — it reads as a Free
         * Period to everyone in it — so leaving it out would show an empty slot
         * that nobody can claim.
         */
        where: { state: { in: ['confirmed', 'on_hold'] } },
        orderBy: [{ dayOfWeek: 'asc' }, { startMinute: 'asc' }],
        select: {
          id: true,
          levelId: true,
          dayOfWeek: true,
          startMinute: true,
          endMinute: true,
          session: true,
          state: true,
          // So the edit dialog opens showing what the period already pays.
          hourlyRateXaf: true,
          subject: { select: { id: true, nameEn: true, nameFr: true } },
          teacher: { select: { userId: true, user: { select: { fullName: true } } } },
        },
      }),
    ]);

    const byLevel = new Map<string, typeof slots>();
    for (const slot of slots) {
      const list = byLevel.get(slot.levelId) ?? [];
      list.push(slot);
      byLevel.set(slot.levelId, list);
    }

    /*
     * Monday to Saturday, as the brief asks — regardless of the configured
     * school week. A 24/5 platform shows an empty Saturday column rather than
     * a table whose shape changes with a setting, which is what makes every
     * class "shown the same way".
     */
    const days = [1, 2, 3, 4, 5, 6];

    const categories: Record<string, unknown[]> = {};
    for (const level of levels) {
      const mine = byLevel.get(level.id) ?? [];
      (categories[level.schoolType] ??= []).push({
        id: level.id,
        code: level.code,
        nameEn: level.nameEn,
        nameFr: level.nameFr,
        slotCount: mine.length,
        days: days.map((day) => ({
          dayOfWeek: day,
          slots: mine
            .filter((slot) => slot.dayOfWeek === day)
            .map((slot) => ({
              id: slot.id,
              dayOfWeek: slot.dayOfWeek,
              startMinute: slot.startMinute,
              endMinute: slot.endMinute,
              clock: `${minutesToClock(slot.startMinute)}–${minutesToClock(slot.endMinute)}`,
              session: slot.session,
              /** An on-hold period reads as a Free Period to the class. */
              onHold: slot.state === 'on_hold',
              /*
               * What this period pays, so the edit dialog opens with the current
               * figure rather than an empty box — which would otherwise clear a
               * rate the moment somebody adjusted the hour and pressed Save.
               */
              hourlyRateXaf: slot.hourlyRateXaf,
              subject: slot.subject,
              teacher: {
                id: slot.teacher.userId,
                fullName: slot.teacher.user.fullName,
              },
            })),
        })),
      });
    }

    return { days, categories };
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
     * Two periods of this subject, across at most two days — per teacher.
     *
     * Counted for *this* teacher rather than for the class: an earlier version
     * counted every period of a subject in a class whoever held it, which
     * stopped a second teacher taking the same subject with a different set.
     *
     * A teacher with two subjects in one class gets two periods of each, and
     * the second subject starts from a fresh allowance — which is exactly the
     * "he can still set another period in that same class, under a different
     * subject" case.
     *
     * `periodAllowance` on the assignment is the admin's special permission,
     * granted for one teacher, subject and class at a time.
     */
    const allowance = teaches.periodAllowance ?? PERIODS_PER_SUBJECT_PER_WEEK;

    const held = await this.prisma.timetableSlot.findMany({
      where: {
        teacherId: user.id,
        levelId: input.levelId,
        subjectId: input.subjectId,
        state: { in: ['proposed', 'confirmed', 'on_hold'] },
      },
      select: { dayOfWeek: true },
    });

    if (held.length >= allowance) {
      throw AppError.conflict('errors.timetable.subject_full', { max: allowance });
    }

    /*
     * The separate half of the rule: those periods may not be spread across
     * more than two days. Adding a period on a day already used is always fine
     * — it is opening a *third* day that the rule refuses.
     */
    const daysUsed = new Set(held.map((slot) => slot.dayOfWeek));
    if (
      !daysUsed.has(input.dayOfWeek) &&
      daysUsed.size >= DAYS_PER_SUBJECT_PER_TEACHER &&
      teaches.periodAllowance === null
    ) {
      throw AppError.conflict('errors.timetable.subject_days_full', {
        max: DAYS_PER_SUBJECT_PER_TEACHER,
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
   * One class's day, period by period, with what is free and what is not.
   *
   * The brief asks the teacher to be shown "the remaining periods available for
   * that class for that day" while he is choosing. A bare count would not help:
   * he needs to know *which* periods, and a period already holding his own
   * lesson reads very differently from one holding somebody else's.
   *
   * The grid comes from `periodsFor`, so the break is already absent — there is
   * no period at 12:00 to mark unavailable, because there is no period there.
   */
  async dayGrid(
    user: AuthenticatedUser,
    levelId: string,
    dayOfWeek: number,
    session: 'day' | 'evening',
  ) {
    const [slots, mySubjects] = await Promise.all([
      this.prisma.timetableSlot.findMany({
        where: {
          levelId,
          dayOfWeek,
          session,
          state: { in: ['proposed', 'confirmed', 'on_hold'] },
        },
        select: {
          id: true,
          startMinute: true,
          endMinute: true,
          state: true,
          teacherId: true,
          subject: { select: { id: true, nameEn: true, nameFr: true } },
          teacher: { select: { user: { select: { fullName: true } } } },
        },
      }),
      /*
       * Exactly the subjects an admin assigned this teacher for this class.
       *
       * "Only the subjects the admin selected for him will pop up" — so the
       * choices come from the assignment rather than from the whole catalogue,
       * and a teacher cannot claim a period in a subject nobody gave him.
       */
      this.prisma.teacherSubject.findMany({
        where: { teacherId: user.id, levelId },
        select: {
          periodAllowance: true,
          subject: { select: { id: true, nameEn: true, nameFr: true } },
        },
      }),
    ]);

    /*
     * Where this teacher already is, that day, across every class.
     *
     * The grid above answers "is this period free in this class"; it cannot see
     * that the teacher is teaching Upper Sixth at the same hour. Without this a
     * period shows as free, the teacher claims it, and the clash rule refuses —
     * which is the request being told "choose any of these" and then "not that
     * one". The screen should never offer a period the rule will reject.
     */
    const elsewhere = await this.prisma.timetableSlot.findMany({
      where: {
        teacherId: user.id,
        dayOfWeek,
        state: { not: 'rejected' },
        levelId: { not: levelId },
      },
      select: {
        startMinute: true,
        endMinute: true,
        level: { select: { nameEn: true, nameFr: true } },
        subject: { select: { nameEn: true, nameFr: true } },
      },
    });

    const taken = new Map(slots.map((slot) => [slot.startMinute, slot]));

    const periods = periodsFor(session).map((period) => {
      const slot = taken.get(period.startMinute);

      // Half-open, matching `intervalsOverlap`: back-to-back periods do not
      // collide, which is how any real timetable is built.
      const busy = elsewhere.find(
        (other) => other.startMinute < period.endMinute && period.startMinute < other.endMinute,
      );

      return {
        index: period.index,
        startMinute: period.startMinute,
        endMinute: period.endMinute,
        /*
         * A period on hold is not free. The class sees a Free Period and may
         * use the room, but nobody may timetable a lesson into it — that is the
         * difference between suspended and empty.
         */
        available: !slot && !busy,
        slot: slot
          ? {
              id: slot.id,
              state: slot.state,
              mine: slot.teacherId === user.id,
              subject: slot.subject,
              teacherName: slot.teacher.user.fullName,
            }
          : null,
        /** Free in this class, but the teacher is teaching elsewhere then. */
        busyElsewhere: busy ? { level: busy.level, subject: busy.subject } : null,
      };
    });

    /*
     * How much of each subject's allowance is left, so the screen can grey a
     * subject out before it is chosen rather than refusing it afterwards.
     */
    const held = await this.prisma.timetableSlot.groupBy({
      by: ['subjectId'],
      where: {
        teacherId: user.id,
        levelId,
        state: { in: ['proposed', 'confirmed', 'on_hold'] },
      },
      _count: { _all: true },
    });
    const usedBySubject = new Map(held.map((row) => [row.subjectId, row._count._all]));

    return {
      dayOfWeek,
      session,
      periods,
      remaining: periods.filter((period) => period.available).length,
      subjects: mySubjects.map((row) => {
        const allowance = row.periodAllowance ?? PERIODS_PER_SUBJECT_PER_WEEK;
        const used = usedBySubject.get(row.subject.id) ?? 0;
        return {
          ...row.subject,
          periodsUsed: used,
          periodsAllowed: allowance,
          exhausted: used >= allowance,
        };
      }),
    };
  }

  /**
   * Moving a slot the teacher already holds to a different day or hour.
   *
   * The brief's "he should be able to edit it rather than delete and start
   * again". Every rule that governs claiming governs this too — the teaching
   * day, the configured school week, the teacher's own clash check, the class
   * period being free, and the two-days-per-subject limit. An edit that skipped
   * them would be a second, unpoliced way to obtain a slot, which is how the
   * hidden-button-is-not-a-rule problem comes back in a different shape.
   *
   * The slot excludes *itself* from both the clash check and the taken check.
   * Without that, moving a period from 09:00 to 09:45 would clash with the very
   * slot being moved and refuse every edit.
   */
  /**
   * Every slot with a time change waiting on an admin.
   *
   * Separate from , which is slots awaiting first confirmation.
   * confirmation. A slot awaiting confirmation and a confirmed slot waiting to be moved
   * are different decisions with different consequences: the first has told
   * nobody anything, the second has a class already turning up at an hour.
   */
  async pendingEdits() {
    const slots = await this.prisma.timetableSlot.findMany({
      where: { proposedStartMinute: { not: null } },
      orderBy: { proposedAt: 'asc' },
      select: {
        ...SLOT_SELECT,
        proposedStartMinute: true,
        proposedEndMinute: true,
        proposedAt: true,
      },
    });
    return { edits: slots };
  }

  /**
   * Approving or refusing a time change.
   *
   * Approval copies the proposal onto the live times and clears it; refusal
   * clears it alone, leaving the class meeting where it always did. Either way
   * the slot ends with nothing pending, so a decision cannot be applied twice.
   *
   * The clash rule is checked again here, not only when the change was asked
   * for. Time passes between the two, and another teacher may have taken the
   * hour in between — approving blindly is how two classes end up in one slot,
   * which is the thing this platform enforces in the database rather than the
   * interface.
   */
  async decideEdit(staff: AuthenticatedUser, slotId: string, approve: boolean) {
    const slot = await this.prisma.timetableSlot.findUnique({
      where: { id: slotId },
      select: {
        id: true, teacherId: true, levelId: true, subjectId: true, dayOfWeek: true,
        proposedStartMinute: true, proposedEndMinute: true,
      },
    });
    if (!slot) throw AppError.notFound();
    if (slot.proposedStartMinute === null || slot.proposedEndMinute === null) {
      throw AppError.badRequest('errors.timetable.no_pending_edit');
    }

    if (approve) {
      const taken = await this.prisma.timetableSlot.findFirst({
        where: {
          levelId: slot.levelId,
          dayOfWeek: slot.dayOfWeek,
          state: { in: ['proposed', 'confirmed'] },
          id: { not: slotId },
          startMinute: { lt: slot.proposedEndMinute },
          endMinute: { gt: slot.proposedStartMinute },
        },
        select: { id: true, teacher: { select: { user: { select: { fullName: true } } } } },
      });
      if (taken) {
        throw AppError.conflict('errors.timetable.slot_taken_by', {
          teacher: taken.teacher.user.fullName,
          subject: '',
        });
      }
    }

    const updated = await this.prisma.timetableSlot.update({
      where: { id: slotId },
      data: approve
        ? {
            startMinute: slot.proposedStartMinute,
            endMinute: slot.proposedEndMinute,
            proposedStartMinute: null, proposedEndMinute: null,
            proposedAt: null, proposedBy: null,
          }
        : { proposedStartMinute: null, proposedEndMinute: null, proposedAt: null, proposedBy: null },
      select: SLOT_SELECT,
    });

    await this.audit.record({
      action: 'timetable.edited',
      entity: 'timetable_slot',
      entityId: slotId,
      actorId: staff.id,
      before: { startMinute: slot.proposedStartMinute, pending: true },
      after: { approved: approve },
    });

    return updated;
  }

  async editSlot(user: AuthenticatedUser, slotId: string, input: EditTimetableSlotInput) {
    const slot = await this.prisma.timetableSlot.findUnique({
      where: { id: slotId },
      select: {
        id: true,
        teacherId: true,
        levelId: true,
        subjectId: true,
        state: true,
        dayOfWeek: true,
      },
    });
    if (!slot || slot.teacherId !== user.id) throw AppError.notFound();

    /*
     * A suspended period is not the teacher's to move — the hold is a decision
     * about the class, and shifting the slot out from under it would leave the
     * admin holding a period nobody is timetabled into.
     */
    if (slot.state === 'on_hold') throw AppError.conflict('errors.timetable.on_hold');
    if (slot.state === 'rejected') throw AppError.conflict('errors.timetable.already_decided');

    const session = input.session ?? 'day';
    const problem = validateTimetableSlot(input, session);
    if (problem) throw AppError.badRequest(problem);

    const weekDays = this.config.getNumber(CONFIG_KEYS.SCHOOL_WEEK_DAYS);
    if (input.dayOfWeek > weekDays) {
      throw AppError.badRequest('errors.timetable.outside_school_week', { days: weekDays });
    }

    // The teacher's own week, minus this slot.
    const mine = await this.prisma.timetableSlot.findMany({
      where: {
        teacherId: user.id,
        dayOfWeek: input.dayOfWeek,
        state: { not: 'rejected' },
        id: { not: slotId },
      },
      select: { id: true, dayOfWeek: true, startMinute: true, endMinute: true },
    });
    const clashes = findClashes(input, mine);
    if (clashes.length > 0) {
      throw AppError.conflict('errors.timetable.clash', { count: clashes.length });
    }

    /*
     * The destination period, in this class, held by anyone.
     *
     * The same rule as claiming, and the reason the brief asks for it twice:
     * two teachers in one period is the failure, and an edit is just another
     * way to arrive there. The unique index is the backstop; this is the
     * message that explains it.
     */
    const taken = await this.prisma.timetableSlot.findFirst({
      where: {
        levelId: slot.levelId,
        dayOfWeek: input.dayOfWeek,
        startMinute: input.startMinute,
        state: { in: ['proposed', 'confirmed', 'on_hold'] },
        id: { not: slotId },
      },
      select: { teacher: { select: { user: { select: { fullName: true } } } }, subject: true },
    });
    if (taken) {
      throw AppError.conflict('errors.timetable.slot_taken_by', {
        teacher: taken.teacher.user.fullName,
        subject: taken.subject.nameEn,
      });
    }

    /*
     * Moving to a new day may open a third day for this subject, which the
     * weekly rule refuses. Days already used by *other* slots of the same
     * subject are what count — this one is moving, so it is excluded.
     */
    const others = await this.prisma.timetableSlot.findMany({
      where: {
        teacherId: user.id,
        levelId: slot.levelId,
        subjectId: slot.subjectId,
        state: { in: ['proposed', 'confirmed', 'on_hold'] },
        id: { not: slotId },
      },
      select: { dayOfWeek: true },
    });
    const daysUsed = new Set(others.map((row) => row.dayOfWeek));
    if (!daysUsed.has(input.dayOfWeek) && daysUsed.size >= DAYS_PER_SUBJECT_PER_TEACHER) {
      throw AppError.conflict('errors.timetable.subject_days_full', {
        max: DAYS_PER_SUBJECT_PER_TEACHER,
      });
    }

    /*
     * Proposed, not applied.
     *
     * A confirmed period is an hour a class has been told to attend, so a
     * teacher moving it cannot move it for them: the change waits for an admin.
     * The live `startMinute` and `endMinute` are untouched, which means every
     * reader of a timetable — the learner's week, the join window, the earnings
     * pass — keeps seeing the hour the students were given, and none of them
     * needs to know an edit is pending.
     *
     * The clash and allowance checks above still ran, and ran against the
     * *proposed* time. Catching a clash now is the point: an admin should be
     * approving a move that works, not discovering on approval that it collides.
     *
     * A slot the teacher has only proposed — never confirmed, so no class has
     * been told anything — is moved outright. Waiting for approval to change an
     * hour nobody has been promised would be ceremony rather than protection.
     */
    const needsApproval = slot.state === 'confirmed';

    const updated = await this.prisma.timetableSlot.update({
      where: { id: slotId },
      data: needsApproval
        ? {
            proposedStartMinute: input.startMinute,
            proposedEndMinute: input.endMinute,
            proposedAt: new Date(),
            proposedBy: user.id,
          }
        : {
            dayOfWeek: input.dayOfWeek,
            startMinute: input.startMinute,
            endMinute: input.endMinute,
            session,
          },
      select: SLOT_SELECT,
    });

    await this.audit.record({
      action: 'timetable.edited',
      entity: 'timetable_slot',
      entityId: slotId,
      actorId: user.id,
      before: { dayOfWeek: slot.dayOfWeek },
      after: {
        dayOfWeek: input.dayOfWeek,
        startMinute: input.startMinute,
        endMinute: input.endMinute,
      },
    });

    return updated;
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
   * The approved pairings for the class that owns a slot.
   *
   * Returning pairs, rather than every teacher and every course separately,
   * keeps the admin form from offering an invalid combination and lets the
   * server keep the same verification rule as a teacher's own timetable.
   */
  async adminEditOptions(slotId: string) {
    const slot = await this.prisma.timetableSlot.findUnique({
      where: { id: slotId },
      select: { levelId: true },
    });
    if (!slot) throw AppError.notFound();

    const assignments = await this.prisma.teacherSubject.findMany({
      where: { levelId: slot.levelId },
      orderBy: [{ subject: { nameEn: 'asc' } }, { teacher: { user: { fullName: 'asc' } } }],
      select: {
        teacherId: true,
        subjectId: true,
        teacher: { select: { user: { select: { fullName: true } } } },
        subject: { select: { nameEn: true, nameFr: true } },
      },
    });
    return {
      assignments: assignments.map((assignment) => ({
        teacherId: assignment.teacherId,
        teacherName: assignment.teacher.user.fullName,
        subjectId: assignment.subjectId,
        subject: assignment.subject,
      })),
    };
  }

  /**
   * Staff correction of a published period.
   *
   * This is intentionally not implemented by calling the teacher edit method:
   * staff may replace the subject and teacher, while the teacher endpoint must
   * remain restricted to moving their own hour.  Both the replacement
   * teacher's calendar and the class calendar are checked before the one
   * update, which keeps every timetable reader in sync with the same slot id.
   */
  async adminEdit(staff: AuthenticatedUser, slotId: string, input: AdminEditTimetableSlotInput) {
    const slot = await this.prisma.timetableSlot.findUnique({
      where: { id: slotId },
      select: {
        id: true,
        teacherId: true,
        subjectId: true,
        levelId: true,
        dayOfWeek: true,
        startMinute: true,
        endMinute: true,
        session: true,
        state: true,
      },
    });
    if (!slot) throw AppError.notFound();
    if (slot.state === 'rejected') throw AppError.conflict('errors.timetable.already_decided');

    // Private arrangements are deliberately exempt from the school-day grid.
    if (slot.session !== 'private') {
      const problem = validateTimetableSlot(input, slot.session);
      if (problem) throw AppError.badRequest(problem);
      const weekDays = this.config.getNumber(CONFIG_KEYS.SCHOOL_WEEK_DAYS);
      if (input.dayOfWeek > weekDays) {
        throw AppError.badRequest('errors.timetable.outside_school_week', { days: weekDays });
      }
    }

    const assignment = await this.prisma.teacherSubject.findFirst({
      where: { teacherId: input.teacherId, subjectId: input.subjectId, levelId: slot.levelId },
      select: { periodAllowance: true },
    });
    if (!assignment) throw AppError.badRequest('errors.timetable.not_your_subject');

    const teacherSlots = await this.prisma.timetableSlot.findMany({
      where: {
        teacherId: input.teacherId,
        dayOfWeek: input.dayOfWeek,
        state: { not: 'rejected' },
        id: { not: slotId },
      },
      select: { id: true, dayOfWeek: true, startMinute: true, endMinute: true },
    });
    const teacherClashes = findClashes(input, teacherSlots);
    if (teacherClashes.length > 0) {
      throw AppError.conflict('errors.timetable.clash', { count: teacherClashes.length });
    }

    const levelSlots = await this.prisma.timetableSlot.findMany({
      where: {
        levelId: slot.levelId,
        dayOfWeek: input.dayOfWeek,
        state: { in: ['proposed', 'confirmed', 'on_hold'] },
        id: { not: slotId },
      },
      select: { id: true, dayOfWeek: true, startMinute: true, endMinute: true },
    });
    const levelClashes = findClashes(input, levelSlots);
    if (levelClashes.length > 0) {
      throw AppError.conflict('errors.timetable.clash', { count: levelClashes.length });
    }

    const sameSubject = await this.prisma.timetableSlot.findMany({
      where: {
        teacherId: input.teacherId,
        levelId: slot.levelId,
        subjectId: input.subjectId,
        state: { in: ['proposed', 'confirmed', 'on_hold'] },
        id: { not: slotId },
      },
      select: { dayOfWeek: true },
    });
    const allowance = assignment.periodAllowance ?? PERIODS_PER_SUBJECT_PER_WEEK;
    if (sameSubject.length >= allowance) {
      throw AppError.conflict('errors.timetable.subject_full', { max: allowance });
    }
    const daysUsed = new Set(sameSubject.map((row) => row.dayOfWeek));
    if (
      assignment.periodAllowance === null &&
      !daysUsed.has(input.dayOfWeek) &&
      daysUsed.size >= DAYS_PER_SUBJECT_PER_TEACHER
    ) {
      throw AppError.conflict('errors.timetable.subject_days_full', {
        max: DAYS_PER_SUBJECT_PER_TEACHER,
      });
    }

    const updated = await this.prisma.timetableSlot.update({
      where: { id: slotId },
      data: {
        teacherId: input.teacherId,
        subjectId: input.subjectId,
        dayOfWeek: input.dayOfWeek,
        startMinute: input.startMinute,
        endMinute: input.endMinute,
        // A staff edit is authoritative; it supersedes a pending teacher move.
        proposedStartMinute: null,
        proposedEndMinute: null,
        proposedAt: null,
        proposedBy: null,
        /*
         * Present only when the caller sent one, so an edit that changes the
         * hour does not silently clear a rate somebody set separately. `null`
         * is a real value here and returns the period to the platform default.
         */
        ...(input.hourlyRateXaf !== undefined ? { hourlyRateXaf: input.hourlyRateXaf } : {}),
      },
      select: SLOT_SELECT,
    });

    await this.audit.record({
      action: 'timetable.admin_edited',
      entity: 'timetable_slot',
      entityId: slotId,
      actorId: staff.id,
      before: slot,
      after: input,
    });
    return updated;
  }

  /**
   * Staff confirm or refuse. This is the step that makes a slot real.
   *
   * The clash check runs again here, against the *level's* confirmed week as
   * well as the teacher's: by the time somebody gets to this queue another
   * proposal may have been confirmed into the same hour, and confirming both
   * would timetable two lessons on top of each other.
   */
  /**
   * Changing what a period pays, without re-deciding the period.
   *
   * Kept apart from `decide` on purpose. A rate correction is not an approval,
   * and routing it through the decision would write `timetable.decided` into
   * the audit trail, re-stamp `confirmedBy`/`confirmedAt`, and send the teacher
   * a notification saying their period had been decided again — three
   * falsehoods to record one number.
   *
   * Applies to a period in any state except rejected. Setting the rate on a
   * proposal is useful: an admin reviewing a batch can price them before
   * confirming, and a slot that is never confirmed never earns anyway.
   */
  async setRate(staff: AuthenticatedUser, slotId: string, hourlyRateXaf: number | null) {
    const slot = await this.prisma.timetableSlot.findUnique({
      where: { id: slotId },
      select: { id: true, state: true, teacherId: true, hourlyRateXaf: true },
    });
    if (!slot) throw AppError.notFound();
    if (slot.state === 'rejected') throw AppError.conflict('errors.timetable.already_decided');

    const updated = await this.prisma.timetableSlot.update({
      where: { id: slotId },
      data: { hourlyRateXaf },
      select: SLOT_SELECT,
    });

    await this.audit.record({
      action: 'timetable.rate_set',
      entity: 'timetable_slot',
      entityId: slotId,
      actorId: staff.id,
      before: { hourlyRateXaf: slot.hourlyRateXaf },
      after: { hourlyRateXaf },
    });

    return updated;
  }

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
        /*
         * Omitted and `null` mean different things, so the key is only present
         * when the caller sent one. Spreading `{ hourlyRateXaf: undefined }`
         * would be a no-op in Prisma and therefore harmless, but writing it
         * conditionally is what makes "leave it alone" and "clear it" legible
         * here rather than a fact about Prisma's semantics.
         */
        ...(input.hourlyRateXaf !== undefined ? { hourlyRateXaf: input.hourlyRateXaf } : {}),
      },
      select: SLOT_SELECT,
    });

    await this.audit.record({
      action: 'timetable.decided',
      entity: 'timetable_slot',
      entityId: slotId,
      actorId: staff.id,
      before: { state: slot.state, hourlyRateXaf: slot.hourlyRateXaf },
      after: {
        state: input.decision,
        note: input.note ?? null,
        // Money is audited on both sides. "Who set this teacher's rate, and to
        // what" is a question that gets asked after a payout, not before.
        hourlyRateXaf: input.hourlyRateXaf === undefined ? slot.hourlyRateXaf : input.hourlyRateXaf,
      },
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
