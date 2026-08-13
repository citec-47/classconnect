import { Controller, Get, Param, Query } from '@nestjs/common';
import { z } from 'zod';
import { TeacherClassesService } from './teacher-classes.service';
import { TeacherEarningsService } from './teacher-earnings.service';
import { TeacherProgressService } from './teacher-progress.service';
import { uuidParam, ZodValidationPipe } from '../common/zod-validation.pipe';
import { CurrentUser, RequirePermissions, type AuthenticatedUser } from '../rbac/decorators';

/**
 * A cohort id and an assignment id are both UUIDs, so the id alone does not say
 * which table to look in. `kind` says, and it is validated rather than trusted:
 * anything else is a 400 before the service runs.
 */
const rosterQuerySchema = z.object({
  kind: z.enum(['cohort', 'private']),
});

type RosterQuery = z.infer<typeof rosterQuerySchema>;

/**
 * The signed-in teacher's own dashboard.
 *
 * Separate from `TeachersController`, which is the *application* surface — the
 * screens someone uses before they are approved. This is the surface they use
 * afterwards, and keeping the two apart means the verification endpoints stay
 * legible as a unit rather than becoming the top of a long file.
 *
 * Every route here is scoped to `user.id`, never to an id from the request.
 * A teacher cannot read another teacher's load by changing a parameter,
 * because there is no parameter that names the teacher.
 */
@Controller('teacher')
export class TeacherDashboardController {
  constructor(
    private readonly classes: TeacherClassesService,
    private readonly earnings: TeacherEarningsService,
    private readonly progress: TeacherProgressService,
  ) {}

  /**
   * The Classes screen: four bands, and every class behind them with its
   * headcount. One call, because the brief's screen shows the tiles and their
   * contents together and a per-band endpoint would fetch the same rows four
   * times over a link where a round trip costs about 235ms.
   */
  @Get('classes')
  @RequirePermissions('teacher:classes:read:own')
  async myClasses(@CurrentUser() user: AuthenticatedUser) {
    return this.classes.ownClasses(user.id);
  }

  /** The roster of one class, for the screen that opens a class tile. */
  @Get('classes/:classId/roster')
  @RequirePermissions('teacher:classes:read:own')
  async roster(
    @CurrentUser() user: AuthenticatedUser,
    @Param('classId', uuidParam()) classId: string,
    @Query(new ZodValidationPipe(rosterQuerySchema)) query: RosterQuery,
  ) {
    return this.classes.classRoster(user.id, query.kind, classId);
  }

  /**
   * FR-ERN-006: what this teacher has earned, by accrual period.
   *
   * Scoped to `user.id` like everything else on this controller — the route
   * takes no teacher parameter, so there is nothing to change in order to read
   * somebody else's pay.
   */
  @Get('earnings')
  @RequirePermissions('earnings:read:own')
  async myEarnings(@CurrentUser() user: AuthenticatedUser) {
    return this.earnings.ownEarnings(user.id);
  }

  /**
   * The overview's progress bar.
   *
   * `profile:read:own` rather than a teaching permission, because this is the one
   * screen an unapproved teacher may see — it is what explains why everything else
   * is closed (see `teacher-nav.ts`), and it must not 403 on the way to saying so.
   */
  @Get('progress')
  @RequirePermissions('profile:read:own')
  async myProgress(@CurrentUser() user: AuthenticatedUser) {
    return this.progress.ownProgress(user.id);
  }
}
