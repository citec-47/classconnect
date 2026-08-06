import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { TeachersService } from './teachers.service';
import { zodBody, uuidParam } from '../common/zod-validation.pipe';
import { CurrentUser, RequirePermissions, type AuthenticatedUser } from '../rbac/decorators';
import {
  verificationDecisionSchema,
  suspendTeacherSchema,
  type VerificationDecisionInput,
} from '@classconnect/shared';
import { VERIFICATION_CHECKLIST } from './verification-checklist';

/** FR-TVR-001..003: the applicant's own surface. */
@Controller('teachers')
export class TeachersController {
  constructor(private readonly teachers: TeachersService) {}

  /**
   * The teacher's read-only view of their own record and its verification
   * state.
   *
   * There is no POST counterpart: the self-service application is withdrawn.
   * A Teacher account exists only because an Admin created it, so the only
   * thing a teacher does here is see their status and supply documents for
   * re-verification (FR-TVR-007).
   */
  @Get('me/application')
  @RequirePermissions('teacher:profile:write:own')
  async myApplication(@CurrentUser() user: AuthenticatedUser) {
    return this.teachers.getOwnApplication(user);
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
