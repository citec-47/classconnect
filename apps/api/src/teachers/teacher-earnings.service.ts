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
        /*
         * The rate this period was priced at, if an admin priced it.
         *
         * Read per session rather than once for the teacher, because the rate
         * lives on the slot: the same teacher can be paid one figure for Form 5
         * Further Maths and another for Form 1 general science, and a single
         * rate for the month could not express that.
         */
        timetableSlot: { select: { hourlyRateXaf: true } },
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
        /*
         * The rate that applies to *this* lesson.
         *
         * Falls back to the platform figure when the period was never priced
         * individually, which is every period until an admin sets one — so
         * nothing changes for a school that never uses the feature.
         */
        rate: session.timetableSlot?.hourlyRateXaf ?? hourlyRateXaf,
      }))
      .filter((row) => row.minutes >= minMinutes);

    const minutesSince = (from: Date) =>
      qualifying.filter((row) => row.at >= from).reduce((total, row) => total + row.minutes, 0);

    /*
     * Money is summed per lesson, not derived from a total of minutes.
     *
     * With one rate for everything the two were the same arithmetic, so the
     * screen multiplied total minutes by a single figure. They are no longer
     * the same: forty minutes at 3 000 and forty at 1 500 is 3 000 francs, and
     * eighty minutes at either rate is not. Each lesson is valued at its own
     * rate and the values are added.
     */
    const valueSince = (from: Date) =>
      qualifying
        .filter((row) => row.at >= from)
        .reduce((total, row) => total + Math.floor((row.rate * row.minutes) / 60), 0);

    /*
     * The division is last inside `valueSince`, so a 45-minute lesson at 2 000
     * an hour is 1 500 exactly rather than 1 499.99… floored. CON-02 applies to
     * calculated money as much as to stored money.
     *
     * Rounding is per lesson rather than per period, which is the correct place
     * for it: each lesson is a separate amount a teacher is owed, and summing
     * exact francs is right where flooring a total of fractions would quietly
     * shave a franc off some months and not others.
     */
    const dayMinutes = minutesSince(startOfDay);
    const weekMinutes = minutesSince(startOfWeek);
    const monthMinutes = minutesSince(startOfMonth);

    /*
     * The rates actually in play, so the screen can stop claiming one figure.
     *
     * `hourlyRateXaf` used to be *the* rate and is now the default; where a
     * teacher's periods are priced individually, reporting the default alone
     * would explain none of the money above it. Distinct values, so a teacher
     * paid the same everywhere still sees one number.
     */
    const ratesInUse = [...new Set(qualifying.map((row) => row.rate))].sort((a, b) => a - b);

    return {
      hourlyRateXaf,
      /** Empty when nothing qualified yet; one entry when every period pays alike. */
      ratesInUse,
      minSessionMinutes: minMinutes,
      /*
       * Named `indicative` rather than `earnings` throughout.
       *
       * A teacher reading a figure called "earnings" reasonably expects it to be
       * what they will be paid, and this is not that until Finance runs the period.
       */
      indicative: {
        today: { minutes: dayMinutes, xaf: String(valueSince(startOfDay)) },
        thisWeek: { minutes: weekMinutes, xaf: String(valueSince(startOfWeek)) },
        thisMonth: { minutes: monthMinutes, xaf: String(valueSince(startOfMonth)) },
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
