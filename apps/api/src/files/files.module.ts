import { Module } from '@nestjs/common';
import { FilesService } from './files.service';
import { FilesController } from './files.controller';
import { CloudinaryService } from './cloudinary.service';
import { MalwareScanService } from './malware-scan.service';
import { MessageAttachmentsService } from './message-attachments.service';
import { LessonsService } from './lessons.service';
import { LessonsController, TeacherLessonsController } from './lessons.controller';

@Module({
  controllers: [FilesController, TeacherLessonsController, LessonsController],
  providers: [
    FilesService,
    CloudinaryService,
    MalwareScanService,
    MessageAttachmentsService,
    LessonsService,
  ],
  exports: [
    FilesService,
    CloudinaryService,
    MalwareScanService,
    MessageAttachmentsService,
    LessonsService,
  ],
})
export class FilesModule {}
