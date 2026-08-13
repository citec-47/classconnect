import { Injectable } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';
import { PlatformConfigService } from '../common/platform-config.service';
import { CONFIG_KEYS, confirmedWeeklyMinutes } from '@classconnect/shared';

/**
 * The teacher's progress bar.
 *
 * ## What "progress" is made to mean, and why
 *
 * The brief says only "his progress bar should always be showing", which is a
 * shape without a measure. A bar needs a numerator and a denominator, and the
 * choice of what they are is the whole design — an arbitrary one would be a
 * decorative widget that quietly implies a judgement nobody defined.
 *
 * So it is built from the one thing the platform already knows and the teacher
 * already agreed to: **the confirmed timetable.** The denominator is the hours
 * they were timetabled for this week; the numerator is the hours actually taught
 * against those slots. That makes the bar answer a question a teacher genuinely
 * has — "am I on top of my week?" — from figures they can check.
 *
 * Two things it deliberately is *not*:
 *
 *   · **Not a performance score.** Nothing here ranks a teacher against another,
 *     and there is no endpoint that would let it. Attendance and ratings are
 *     reported elsewhere, to the people the SRS names.
 *   · **Not a proportion of anything unverified.** Taught minutes come from
 *     `SessionParticipant.attendedMinutes`, which the media server writes.
 *     Until an SFU is connected this reads zero — the bar is honest about having
 *     nothing to show rather than filling itself from the wall clock.
 */
@Injectable()
export class TeacherProgressService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: PlatformConfigService,
  ) {}

  async ownProgress(teacherId: string) {
    const now = new Date();
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    // Monday-first, matching `TimetableSlot.dayOfWeek` and a Cameroonian week.
    const startOfWeek = new Date(startOfDay.getTime() - ((now.getDay() + 6) % 7) * 86_400_000);

    const [slots, sessionsThisWeek, application, groups, lessons, exams, ungraded] =
      await Promise.all([
        this.prisma.timetableSlot.findMany({
          where: { teacherId },
          select: { dayOfWeek: true, startMinute: true, endMinute: true, state: true },
        }),
        this.prisma.session.findMany({
          where: {
            teacherId,
            startsAtUtc: { gte: startOfWeek },
            status: { in: ['completed', 'in_progress'] },
          },
          select: {
            id: true,
            timetableSlotId: true,
            participants: { where: { userId: teacherId }, select: { attendedMinutes: true } },
          },
        }),
        this.prisma.teacher.findUnique({
          where: { userId: teacherId },
          select: { verificationStatus: true, ratingAvg: true, ratingCount: true },
        }),
        this.prisma.cohort.count({ where: { teacherId, active: true } }),
        this.prisma.material.count({ where: { uploadedBy: teacherId, scanStatus: 'clean' } }),
        this.prisma.assessment.count({ where: { createdBy: teacherId, publishedAt: { not: null } } }),
        /*
         * FR-HWK-008: work handed in and not yet marked.
         *
         * The one number on this screen that is a call to action rather than a
         * summary, which is why it is here and not on a report.
         */
        this.prisma.submission.count({
          where: { assignment: { teacherId }, grade: null },
        }),
      ]);

    const timetabledMinutes = confirmedWeeklyMinutes(
      slots.map((slot) => ({
        dayOfWeek: slot.dayOfWeek,
        startMinute: slot.startMinute,
        endMinute: slot.endMinute,
        state: slot.state as 'proposed' | 'confirmed' | 'rejected',
      })),
    );

    const taughtMinutes = sessionsThisWeek
      // Only sessions claimed against a slot count towards the timetable, because
      // the denominator is the timetable. An extra lesson taught outside it is
      // real work and it is reported separately below.
      .filter((session) => session.timetableSlotId !== null)
      .reduce((total, session) => total + (session.participants[0]?.attendedMinutes ?? 0), 0);

    const extraMinutes = sessionsThisWeek
      .filter((session) => session.timetableSlotId === null)
      .reduce((total, session) => total + (session.participants[0]?.attendedMinutes ?? 0), 0);

    return {
      week: {
        timetabledMinutes,
        taughtMinutes,
        extraMinutes,
        /*
         * Capped at 100. A teacher who covered a colleague's hour inside their own
         * slot would otherwise show 140% complete, which reads as a data error
         * rather than as good news.
         */
        percent:
          timetabledMinutes === 0
            ? null
            : Math.min(100, Math.round((taughtMinutes / timetabledMinutes) * 100)),
        confirmedSlots: slots.filter((slot) => slot.state === 'confirmed').length,
        proposedSlots: slots.filter((slot) => slot.state === 'proposed').length,
      },
      /** What they have built, which is the other half of "progress". */
      built: {
        groups,
        lessons,
        exams,
      },
      /** FR-HWK-008 again: the queue, said plainly. */
      awaitingMarking: ungraded,
      rating: {
        average: application?.ratingAvg === null || application?.ratingAvg === undefined
          ? null
          : Number(application.ratingAvg),
        count: application?.ratingCount ?? 0,
        // FR-RAT-002: an average from two ratings is noise, and publishing it as a
        // score would let one bad afternoon define a teacher.
        minBeforePublic: this.config.getNumber(CONFIG_KEYS.MIN_RATINGS_BEFORE_PUBLIC),
      },
      verificationStatus: application?.verificationStatus ?? null,
    };
  }
}
