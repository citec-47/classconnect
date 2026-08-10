import { Module } from '@nestjs/common';
import { LearnerController } from './learner.controller';
import { LearnerService } from './learner.service';
import { LearnerScheduleService } from './learner-schedule.service';
import { LearnerWorkService } from './learner-work.service';
import { LearnerPracticeService } from './learner-practice.service';
import { LearnerProgressService } from './learner-progress.service';
import { LearnerSubjectsService } from './learner-subjects.service';
import { LearnerLessonsService } from './learner-lessons.service';
import { LearnerMessagingService } from './learner-messaging.service';
import { LearnerFeesService } from './learner-fees.service';
import { LearnerRatingsService } from './learner-ratings.service';
import { LearnerContactsService } from './learner-contacts.service';
import { LearnerAttendanceService } from './learner-attendance.service';

/**
 * §5 — the learner's own surface.
 *
 * One service per screen rather than one per table: §5.2's timetable spans
 * sessions, cohorts and recordings, and §5.3's Work spans assignments,
 * submissions, grades and materials. Splitting by screen keeps each file
 * answerable to a section of the brief, which is what the next person reading it
 * will have in hand.
 *
 * Prisma and platform configuration come from the global CoreModule.
 */
@Module({
  controllers: [LearnerController],
  providers: [
    LearnerService,
    LearnerScheduleService,
    LearnerWorkService,
    LearnerPracticeService,
    LearnerProgressService,
    LearnerSubjectsService,
    LearnerLessonsService,
    LearnerMessagingService,
    LearnerFeesService,
    LearnerRatingsService,
    LearnerContactsService,
    LearnerAttendanceService,
  ],
  exports: [LearnerService],
})
export class LearnerModule {}
