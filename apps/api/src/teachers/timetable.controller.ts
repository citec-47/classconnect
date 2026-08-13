import { Body, Controller, Delete, Get, Param, Post, Query } from '@nestjs/common';
import { z } from 'zod';
import {
  proposeTimetableSlotSchema,
  decideTimetableSlotSchema,
  type ProposeTimetableSlotInput,
  type DecideTimetableSlotInput,
} from '@classconnect/shared';
import { TimetableService } from './timetable.service';
import { zodBody, uuidParam, ZodValidationPipe } from '../common/zod-validation.pipe';

/** Which day, and which of the two claimable grids. */
const gridQuerySchema = z.object({
  dayOfWeek: z.coerce.number().int().min(1).max(7),
  session: z.enum(['day', 'evening']).default('day'),
});
type GridQuery = z.infer<typeof gridQuerySchema>;
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

  /**
   * The grid for one class on one day, with each period marked free or taken.
   *
   * "The system must show him the remaining periods available for that class
   * for that day" — so this answers with the whole day rather than a count, and
   * says *why* a period is unavailable. A teacher who can see that period 3 is
   * Chemistry and period 4 is his own does not have to guess at a number.
   *
   * Declared **before** `:slotId` and on the teacher controller, not the admin
   * one. Both matter: a literal segment registered after a parameter route is
   * shadowed by it, and this is the teacher's own screen — putting it under
   * `admin/timetable` made the path a teacher never calls, which is exactly how
   * it 404'd the first time.
   */
  @Get('grid/:levelId')
  @RequirePermissions('teacher:classes:read:own')
  async grid(
    @CurrentUser() user: AuthenticatedUser,
    @Param('levelId', uuidParam()) levelId: string,
    @Query(new ZodValidationPipe(gridQuerySchema)) query: GridQuery,
  ) {
    return this.timetable.dayGrid(user, levelId, query.dayOfWeek, query.session);
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
