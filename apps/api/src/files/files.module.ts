import { Module } from '@nestjs/common';
import { FilesService } from './files.service';
import { FilesController } from './files.controller';
import { CloudinaryService } from './cloudinary.service';
import { MalwareScanService } from './malware-scan.service';
import { MessageAttachmentsService } from './message-attachments.service';

@Module({
  controllers: [FilesController],
  providers: [FilesService, CloudinaryService, MalwareScanService, MessageAttachmentsService],
  exports: [FilesService, CloudinaryService, MalwareScanService, MessageAttachmentsService],
})
export class FilesModule {}
