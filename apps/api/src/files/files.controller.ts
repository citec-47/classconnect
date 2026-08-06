import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { FilesService } from './files.service';
import { zodBody, uuidParam } from '../common/zod-validation.pipe';
import { CurrentUser, RequirePermissions, type AuthenticatedUser } from '../rbac/decorators';
import { signTeacherDocumentSchema, isStaff, type SignTeacherDocumentInput } from '@classconnect/shared';

/** SI-006 / FR-TVR-002 / FR-FIL-001..005. */
@Controller('files')
export class FilesController {
  constructor(private readonly files: FilesService) {}

  /**
   * Step 1: policy check, then a signature scoped to one asset path.
   * The client uploads directly to the returned URL (SI-006).
   */
  @Post('teacher-documents/sign')
  @RequirePermissions('teacher:document:upload:own')
  async sign(
    @CurrentUser() user: AuthenticatedUser,
    @Body(zodBody(signTeacherDocumentSchema)) body: SignTeacherDocumentInput,
  ) {
    return this.files.signTeacherDocumentUpload(user, body);
  }

  /** Step 3: confirm against what storage actually received, then scan. */
  @Post('teacher-documents/:id/confirm')
  @RequirePermissions('teacher:document:upload:own')
  async confirm(@CurrentUser() user: AuthenticatedUser, @Param('id', uuidParam()) id: string) {
    return this.files.confirmTeacherDocumentUpload(user, id);
  }

  /**
   * FR-FIL-003: a short-lived signed read URL. There is no endpoint that
   * returns a permanent URL, because no such URL exists.
   */
  @Get('teacher-documents/:id/download-url')
  async downloadUrl(@CurrentUser() user: AuthenticatedUser, @Param('id', uuidParam()) id: string) {
    return this.files.getDownloadUrl(user, id, isStaff(user.roles));
  }
}
