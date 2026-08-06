import { Module } from '@nestjs/common';
import { TeachersService } from './teachers.service';
import { TeachersController, VerificationController } from './teachers.controller';
import { FieldEncryptionService } from './field-encryption.service';

@Module({
  controllers: [TeachersController, VerificationController],
  providers: [TeachersService, FieldEncryptionService],
  exports: [TeachersService, FieldEncryptionService],
})
export class TeachersModule {}
