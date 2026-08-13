import { Injectable } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';
import { PlatformConfigService } from '../common/platform-config.service';
import { CONFIG_KEYS } from '@classconnect/shared';

/**
 * A teacher's own earnings.
 *
 * Deliberately separate from `EarningsModule`, which is Finance's surface: that
 * one calculates, approves and pays. This only reads, only ever for `teacherId`
 * = the signed-in user, and returns no other teacher's figures under any
 * argument — there is no parameter here that names a teacher.
 *
 * FR-ERN-006: every figure traces to the sessions that produced it. The stored
 * `basisJson` holds that trace; it is not returned here because the screen
 * summarises periods rather than auditing them, and it can carry learner
 * identifiers that belong on Finance's surface rather than the teacher's.
 */
@Injectable()
export class TeacherEarningsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: PlatformConfigService,
  ) {}

  async ownEarnings(teacherId: string) {
    const rows = await this.prisma.earning.findMany({
      where: { teacherId },
      orderBy: { period: 'desc' },
      select: {
        id: true,
        period: true,
        attendedMinutes: true,
        oneToOneMinutes: true,
        groupMinutes: true,
        amountXaf: true,
        deductionsXaf: true,
        netPayableXaf: true,
        payoutId: true,
        createdAt: true,
      },
    });

    /*
     * BigInt, stringified.
     *
     * XAF amounts are stored as BigInt because money must not go near a float,
     * and `JSON.stringify` throws outright on a BigInt rather than rounding it.
     * The client formats from the string.
     */
    const periods = rows.map((row) => ({
      id: row.id,
      period: row.period,
      attendedMinutes: row.attendedMinutes,
      oneToOneMinutes: row.oneToOneMinutes,
      groupMinutes: row.groupMinutes,
      amountXaf: row.amountXaf.toString(),
      deductionsXaf: row.deductionsXaf.toString(),
      netPayableXaf: row.netPayableXaf.toString(),
      /*
       * FR-ERN-010: "paid" here means a payout carries it, not that the money
       * has landed. The teacher is told which of the two this is, because the
       * difference is the whole of their question.
       */
      paidOut: row.payoutId !== null,
      createdAt: row.createdAt,
    }));

    const sum = (pick: (r: (typeof periods)[number]) => string) =>
      periods.reduce((total, row) => total + BigInt(pick(row)), 0n).toString();

    return {
      periods,
      totals: {
        grossXaf: sum((r) => r.amountXaf),
        deductionsXaf: sum((r) => r.deductionsXaf),
        netPayableXaf: sum((r) => r.netPayableXaf),
        awaitingPayoutXaf: periods
          .filter((r) => !r.paidOut)
          .reduce((total, r) => total + BigInt(r.netPayableXaf), 0n)
          .toString(),
        attendedMinutes: periods.reduce((total, r) => total + r.attendedMinutes, 0),
      },
      accrual: await this.accrual(teacherId),
    };
  }

  /**
   * The brief's daily, weekly and monthly figures.
   *
   * ## Why this is not read from `Earning`
   *
   * `Earning` is periodic and it is Finance's: `calculatePeriod` distributes a
   * revenue pool across teachers by verified attended minutes, and asserts that
   * `sum(teacher shares) + unallocated == pool` before writing anything. There is
   * no daily row to read, and manufacturing one would break that identity.
   *
   * So this is an **accrual view**: the teaching this teacher has actually done,
   * valued at the admin's configured hourly rate. It is what the brief asks to put
   * in front of a teacher — "after 30 minutes of classes the earning will display"
   * — and it is labelled as indicative on the screen, because the paid figure is
   * the one in `periods` above.
   *
   * Two rules from the brief are applied here and nowhere else:
   *
   *   · a lesson under `EARNING_MIN_SESSION_MINUTES` accrues nothing;
   *   · only lessons taught inside a **confirmed timetable slot** accrue at all,
   *     which is "his earning will only start counting during his exact number of
   *     time to resume work".
   */
  async accrual(teacherId: string) {
    const hourlyRateXaf = this.config.getNumber(CONFIG_KEYS.TEACHER_HOURLY_RATE_XAF);
    const minMinutes = this.config.getNumber(CONFIG_KEYS.EARNING_MIN_SESSION_MINUTES);

    const now = new Date();
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    // The week starts on Monday, which is how a Cameroonian timetable is drawn up.
    const dayOffset = (now.getDay() + 6) % 7;
    const startOfWeek = new Date(startOfDay.getTime() - dayOffset * 86_400_000);
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    const sessions = await this.prisma.session.findMany({
      where: {
        teacherId,
        status: 'completed',
        startsAtUtc: { gte: startOfMonth },
        // The confirmed-slot rule, expressed as a `where` rather than a filter
        // afterwards: a lesson with no slot is not a candidate at all.
        timetableSlotId: { not: null },
      },
      select: {
        id: true,
        startsAtUtc: true,
        endedAt: true,
        durationMin: true,
        participants: { select: { userId: true, attendedMinutes: true } },
      },
    });

    /*
     * The teacher's own attended minutes, from the media server's events.
     *
     * Not the wall clock between start and end. `classes.ts` establishes that
     * attendance is observed rather than self-reported, and a room left open over
     * lunch is not four hours of teaching. Until an SFU is connected these are
     * zero, and a zero here is honest — see `teacher-live.service.ts`.
     */
    const qualifying = sessions
      .map((session) => ({
        at: session.startsAtUtc,
        minutes: session.participants.find((p) => p.userId === teacherId)?.attendedMinutes ?? 0,
      }))
      .filter((row) => row.minutes >= minMinutes);

    const minutesSince = (from: Date) =>
      qualifying.filter((row) => row.at >= from).reduce((total, row) => total + row.minutes, 0);

    /*
     * Minutes to money, in integer arithmetic.
     *
     * `rate * minutes / 60` with the division last, so a 45-minute lesson at 2 000
     * an hour is 1 500 exactly rather than 1 499.99… floored. CON-02 applies to
     * calculated money as much as to stored money.
     */
    const value = (minutes: number) => Math.floor((hourlyRateXaf * minutes) / 60);

    const dayMinutes = minutesSince(startOfDay);
    const weekMinutes = minutesSince(startOfWeek);
    const monthMinutes = minutesSince(startOfMonth);

    return {
      hourlyRateXaf,
      minSessionMinutes: minMinutes,
      /*
       * Named `indicative` rather than `earnings` throughout.
       *
       * A teacher reading a figure called "earnings" reasonably expects it to be
       * what they will be paid, and this is not that until Finance runs the period.
       */
      indicative: {
        today: { minutes: dayMinutes, xaf: String(value(dayMinutes)) },
        thisWeek: { minutes: weekMinutes, xaf: String(value(weekMinutes)) },
        thisMonth: { minutes: monthMinutes, xaf: String(value(monthMinutes)) },
      },
      qualifyingSessions: qualifying.length,
      /*
       * How many lessons were taught inside a slot but fell short of the floor.
       * Shown so a teacher whose figure is lower than they expected can see why,
       * rather than concluding the platform lost their hours.
       */
      belowFloorSessions: sessions.length - qualifying.length,
    };
  }
}
