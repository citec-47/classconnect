import { Module, forwardRef } from '@nestjs/common';
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
/*
 * The live rules are shared with the teacher surface rather than reimplemented.
 * Who may join a lesson and who may speak is one safeguarding decision, and a
 * second copy of it would be free to drift from the first.
 */
import { TeachersModule } from '../teachers/teachers.module';

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
  /*
   * `forwardRef` because the two modules genuinely need each other.
   *
   * Teachers already imported Learner (the teacher's messaging reuses the
   * learner thread rules); Learner now needs Teachers for the live join and
   * raise-hand routes. Nest resolves a cycle only when both sides declare it —
   * without this the container fails at boot with an empty exception that names
   * neither module.
   *
   * The alternative is a third module holding the live rules, which would move
   * one shared service into a file of its own and leave the same cycle between
   * messaging and threads.
   */
  imports: [forwardRef(() => TeachersModule)],
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
  /*
   * `LearnerMessagingService` is exported for the teacher surface.
   *
   * Its `thread` and `send` are keyed on the caller being a `ThreadParticipant`
   * and on nothing else, so a teacher reads and writes their own conversations
   * through the same code — which keeps one copy of FR-SAF-002 redaction, the
   * append-only write, and the `RedactionFlag` that fires when a teacher tries to
   * move a child onto WhatsApp. See `teacher-messaging.service.ts`.
   */
  exports: [LearnerService, LearnerMessagingService],
})
export class LearnerModule {}
