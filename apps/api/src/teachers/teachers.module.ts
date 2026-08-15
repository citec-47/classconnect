import { Module, forwardRef } from '@nestjs/common';
import { RecordingsModule } from './recordings.module';
import { TeachersService } from './teachers.service';
import { TeachersController, VerificationController } from './teachers.controller';
import { TeacherDashboardController } from './teacher-dashboard.controller';
import { TeacherClassesService } from './teacher-classes.service';
import { TeacherEarningsService } from './teacher-earnings.service';
import { TimetableService } from './timetable.service';
import { TeacherTimetableController, AdminTimetableController } from './timetable.controller';
import { FieldEncryptionService } from './field-encryption.service';
import { TeacherGroupsService } from './teacher-groups.service';
import { TeacherExamsService } from './teacher-exams.service';
import { TeacherReportsService } from './teacher-reports.service';
import { TeacherLiveService } from './teacher-live.service';
import { LiveKitService } from './livekit.service';
import { LiveSweeperService } from './live-sweeper.service';
import { LiveKitProxyController } from './livekit-proxy.controller';
import { TeacherMessagingService } from './teacher-messaging.service';
import { TeacherProgressService } from './teacher-progress.service';
import {
  TeacherSurfaceController,
  AdminReportsController,
} from './teacher-surface.controller';
import { LearnerModule } from '../learner/learner.module';

@Module({
  /*
   * `LearnerModule` for its messaging service, which the teacher's inbox reuses
   * rather than reimplementing — see `teacher-messaging.service.ts` for why that
   * matters more than it looks.
   */
  // See LearnerModule: the cycle is declared on both sides or not at all.
  imports: [forwardRef(() => LearnerModule), RecordingsModule],
  controllers: [
    LiveKitProxyController,
    TeachersController,
    VerificationController,
    TeacherDashboardController,
    TeacherTimetableController,
    AdminTimetableController,
    TeacherSurfaceController,
    AdminReportsController,
  ],
  providers: [
    TeachersService,
    FieldEncryptionService,
    TeacherClassesService,
    TeacherEarningsService,
    TimetableService,
    TeacherGroupsService,
    TeacherExamsService,
    TeacherReportsService,
    TeacherLiveService,
    LiveKitService,
    LiveSweeperService,
    TeacherMessagingService,
    TeacherProgressService,
  ],
  exports: [
    TeachersService,
    FieldEncryptionService,
    TeacherClassesService,
    TeacherEarningsService,
    // Exported for the learner's exam submit path, which calls `autoMark` so the
    // comparison against `QuestionOption.isCorrect` lives in exactly one place.
    TeacherExamsService,
    // Exported for the learner's join and raise-hand routes. Who may enter a
    // lesson and who may speak is one rule, held in one service.
    TeacherLiveService,
  ],
})
export class TeachersModule {}
