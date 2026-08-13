import { Body, Controller, Delete, Get, Param, Post } from '@nestjs/common';
import {
  proposeTimetableSlotSchema,
  decideTimetableSlotSchema,
  type ProposeTimetableSlotInput,
  type DecideTimetableSlotInput,
} from '@classconnect/shared';
import { TimetableService } from './timetable.service';
import { zodBody, uuidParam } from '../common/zod-validation.pipe';
import { CurrentUser, RequirePermissions, type AuthenticatedUser } from '../rbac/decorators';

/**
 * BUILD-PLAN Phase 1 — the teacher's half of the timetable.
 *
 * Scoped to `user.id` throughout: there is no parameter naming a teacher, so
 * one cannot read or edit another's week by changing an id.
 */
@Controller('teacher/timetable')
export class TeacherTimetableController {
  constructor(private readonly timetable: TimetableService) {}

  @Get()
  @RequirePermissions('teacher:classes:read:own')
  async mine(@CurrentUser() user: AuthenticatedUser) {
    return this.timetable.ownSlots(user.id);
  }

  /**
   * Proposing hours needs no special permission beyond being a teacher.
   *
   * The control is on confirmation (BUILD-PLAN Phase 1): offering to teach at
   * ten on Tuesday commits nobody, and requiring approval to *ask* would just
   * move the queue one step earlier.
   */
  @Post()
  @RequirePermissions('teacher:classes:read:own')
  async propose(
    @CurrentUser() user: AuthenticatedUser,
    @Body(zodBody(proposeTimetableSlotSchema)) body: ProposeTimetableSlotInput,
  ) {
    return this.timetable.propose(user, body);
  }

  @Delete(':slotId')
  @RequirePermissions('teacher:classes:read:own')
  async withdraw(
    @CurrentUser() user: AuthenticatedUser,
    @Param('slotId', uuidParam()) slotId: string,
  ) {
    return this.timetable.withdraw(user, slotId);
  }
}

/**
 * The staff half: the queue of proposals, and the decision on each.
 *
 * `teacher:verification:decide` is the permission, which admin_ops, super_admin
 * and support_agent hold — the same people who decide whether somebody may
 * teach at all decide when they teach.
 */
@Controller('admin/timetable')
export class AdminTimetableController {
  constructor(private readonly timetable: TimetableService) {}

  @Get('pending')
  @RequirePermissions('teacher:verification:decide')
  async pending() {
    return this.timetable.pendingSlots();
  }

  /** One class's confirmed week, for the per-level timetable screen. */
  @Get('level/:levelId')
  @RequirePermissions('teacher:verification:read')
  async forLevel(@Param('levelId', uuidParam()) levelId: string) {
    return this.timetable.levelSlots(levelId);
  }

  @Post(':slotId/decision')
  @RequirePermissions('teacher:verification:decide')
  async decide(
    @CurrentUser() staff: AuthenticatedUser,
    @Param('slotId', uuidParam()) slotId: string,
    @Body(zodBody(decideTimetableSlotSchema)) body: DecideTimetableSlotInput,
  ) {
    return this.timetable.decide(staff, slotId, body);
  }
}
