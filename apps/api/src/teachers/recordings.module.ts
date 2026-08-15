import { Module } from '@nestjs/common';
import { RecordingStorageService } from '../files/recording-storage.service';
import { RecordingsService } from './recordings.service';

/**
 * Recordings, shared by the three surfaces that show them.
 *
 * A module of its own because a teacher, a learner and an administrator all
 * reach the same entitlement rules from different controllers. The alternative —
 * having the learner and admin modules import the teacher module — would build a
 * cycle out of what is really one shared question: who may watch this.
 */
@Module({
  /* Prisma comes from the global CoreModule; nothing else is needed here. */
  providers: [RecordingsService, RecordingStorageService],
  exports: [RecordingsService, RecordingStorageService],
})
export class RecordingsModule {}
