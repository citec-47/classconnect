import { Module } from '@nestjs/common';
import { FilesService } from './files.service';
import { FilesController } from './files.controller';
import { CloudinaryService } from './cloudinary.service';
import { MalwareScanService } from './malware-scan.service';

@Module({
  controllers: [FilesController],
  providers: [FilesService, CloudinaryService, MalwareScanService],
  exports: [FilesService, CloudinaryService, MalwareScanService],
})
export class FilesModule {}
