import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { AdminAccountsService } from './admin-accounts.service';
import { zodBody } from '../common/zod-validation.pipe';
import { CurrentUser, RequirePermissions, type AuthenticatedUser } from '../rbac/decorators';
import {
  adminCreateStudentSchema,
  adminCreateTeacherSchema,
  type AdminCreateStudentInput,
  type AdminCreateTeacherInput,
} from '@classconnect/shared';

/**
 * Account creation, Admin only.
 *
 * These are the sole endpoints that create a Student or Teacher account. The
 * permissions `student:create` and `teacher:create` are held by `admin_ops` and
 * `super_admin` and by nothing else, so the guarantee is enforced by the
 * authorisation layer rather than by the absence of a button.
 */
@Controller('admin/accounts')
export class AdminAccountsController {
  constructor(private readonly accounts: AdminAccountsService) {}

  /** Admin picks school type, class, then the subjects the student will learn. */
  @Post('students')
  @RequirePermissions('student:create')
  async createStudent(
    @CurrentUser() admin: AuthenticatedUser,
    @Body(zodBody(adminCreateStudentSchema)) body: AdminCreateStudentInput,
  ) {
    return this.accounts.createStudent(admin, body);
  }

  @Get('students')
  @RequirePermissions('student:create')
  async listStudents(@Query('schoolType') schoolType?: 'primary' | 'secondary') {
    return this.accounts.listStudents(schoolType);
  }

  /**
   * Admin picks school type and the subjects the teacher will teach, and
   * records the verification checklist in the same action (FR-TVR-005).
   */
  @Post('teachers')
  @RequirePermissions('teacher:create')
  async createTeacher(
    @CurrentUser() admin: AuthenticatedUser,
    @Body(zodBody(adminCreateTeacherSchema)) body: AdminCreateTeacherInput,
  ) {
    return this.accounts.createTeacher(admin, body);
  }
}
