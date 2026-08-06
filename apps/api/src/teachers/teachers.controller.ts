import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { TeachersService } from './teachers.service';
import { zodBody, uuidParam } from '../common/zod-validation.pipe';
import { CurrentUser, RequirePermissions, type AuthenticatedUser } from '../rbac/decorators';
import {
  teacherApplicationSchema,
  verificationDecisionSchema,
  suspendTeacherSchema,
  type TeacherApplicationInput,
  type VerificationDecisionInput,
} from '@classconnect/shared';
import { VERIFICATION_CHECKLIST } from './verification-checklist';

/** FR-TVR-001..003: the applicant's own surface. */
@Controller('teachers')
export class TeachersController {
  constructor(private readonly teachers: TeachersService) {}

  /** The teacher's own record and its verification state. */
  @Get('me/application')
  @RequirePermissions('teacher:profile:write:own')
  async myApplication(@CurrentUser() user: AuthenticatedUser) {
    return this.teachers.getOwnApplication(user);
  }

  /**
   * FR-TVR-001: the teacher completes their application.
   *
   * Registration captures who they are and what they teach; this captures the
   * credentials an Admin will check. Accepted while the application is open —
   * `draft`, `submitted`, `more_info_required` — so FR-TVR-006's resubmission
   * path works without a separate endpoint.
   *
   * An account an Admin created is also editable here, which is what lets a
   * teacher correct their own details rather than queueing for staff time.
   */
  @Post('me/application')
  @RequirePermissions('teacher:apply')
  async apply(
    @CurrentUser() user: AuthenticatedUser,
    @Body(zodBody(teacherApplicationSchema)) body: TeacherApplicationInput,
  ) {
    return this.teachers.submitApplication(user, body);
  }
}

/** FR-TVR-004..010: the Admin verification surface. */
@Controller('admin/verification')
export class VerificationController {
  constructor(private readonly teachers: TeachersService) {}

  /** The checklist definition, so the queue UI and the API cannot drift. */
  @Get('checklist')
  @RequirePermissions('teacher:verification:read')
  checklist() {
    return VERIFICATION_CHECKLIST;
  }

  /** FR-TVR-004: the verification queue. */
  @Get('queue')
  @RequirePermissions('teacher:verification:read')
  async queue(@Query('status') status?: 'submitted' | 'under_review' | 'more_info_required') {
    return this.teachers.verificationQueue(status);
  }

  /**
   * FR-TVR-005/006: a decision for one applicant, carrying the checklist.
   * There is deliberately no bulk endpoint.
   */
  @Post(':teacherId/decision')
  @RequirePermissions('teacher:verification:decide')
  async decide(
    @CurrentUser() admin: AuthenticatedUser,
    @Param('teacherId', uuidParam()) teacherId: string,
    @Body(zodBody(verificationDecisionSchema)) body: VerificationDecisionInput,
  ) {
    return this.teachers.decide(admin, teacherId, body);
  }

  /** FR-TVR-009 */
  @Post(':teacherId/suspend')
  @RequirePermissions('teacher:suspend')
  async suspend(
    @CurrentUser() admin: AuthenticatedUser,
    @Param('teacherId', uuidParam()) teacherId: string,
    @Body(zodBody(suspendTeacherSchema)) body: { reason: string },
  ) {
    return this.teachers.suspend(admin, teacherId, body.reason);
  }
}
