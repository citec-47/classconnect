import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import {
  ACADEMIC_CATEGORIES,
  generateReportCardsSchema,
  type AcademicCategory,
  type GenerateReportCardsInput,
} from '@classconnect/shared';
import { zodBody, uuidParam } from '../common/zod-validation.pipe';
import { CurrentUser, RequirePermissions, type AuthenticatedUser } from '../rbac/decorators';
import { AcademicResultsService } from './academic-results.service';

/**
 * Academic Results — category, then class, then subject.
 *
 * Gated on `reports:read` for browsing and on report generation for compiling:
 * marks are a child's academic record, and the same permission that opens the
 * reports dashboard is the one that should open these.
 *
 * Nothing here reaches a learner. Publication is a separate act on the compile
 * endpoint, which is what the brief means by "nothing reaches a student dashboard
 * until the admin presses the button".
 */
@Controller('admin/academic-results')
export class AcademicResultsController {
  constructor(private readonly results: AcademicResultsService) {}

  /** The four categories, so the screen does not hard-code them a second time. */
  @Get('categories')
  @RequirePermissions('reports:read')
  categories() {
    return { categories: ACADEMIC_CATEGORIES };
  }

  @Get(':category/classes')
  @RequirePermissions('reports:read')
  async classes(@Param('category') category: string) {
    return this.results.classes(this.asCategory(category));
  }

  @Get(':category/classes/:levelId/subjects')
  @RequirePermissions('reports:read')
  async subjects(
    @Param('category') category: string,
    @Param('levelId', uuidParam()) levelId: string,
  ) {
    return this.results.subjects(this.asCategory(category), levelId);
  }

  /**
   * The students of one class who offer one subject, with their marks.
   *
   * Term and academic year are required rather than defaulted: a mark belongs to
   * a term, and guessing which one would show last term's marks under this term's
   * heading with nothing on screen to say so.
   */
  @Get(':category/classes/:levelId/subjects/:subjectId/students')
  @RequirePermissions('reports:read')
  async students(
    @Param('category') category: string,
    @Param('levelId', uuidParam()) levelId: string,
    @Param('subjectId', uuidParam()) subjectId: string,
    @Query('term') term: string,
    @Query('academicYear') academicYear: string,
  ) {
    return this.results.students(this.asCategory(category), levelId, subjectId, term, academicYear);
  }

  /**
   * Compile the class: one sheet per learner, ranked.
   *
   * `publish: false` generates for checking; `true` is what puts a sheet on a
   * learner's dashboard. Repeatable either way — a corrected mark and a second
   * compile replace the sheet rather than adding one.
   */
  @Post('compile')
  @RequirePermissions('reports:read')
  async compile(
    @CurrentUser() user: AuthenticatedUser,
    @Body(zodBody(generateReportCardsSchema)) body: GenerateReportCardsInput,
  ) {
    return this.results.compile(user, body);
  }

  /**
   * A category from the URL, refused if it is not one of the four.
   *
   * The cast is checked rather than assumed: an unknown category would otherwise
   * silently match nothing and render an empty class list, which reads as "no
   * learners" rather than "no such category".
   */
  private asCategory(value: string): AcademicCategory {
    if ((ACADEMIC_CATEGORIES as readonly string[]).includes(value)) {
      return value as AcademicCategory;
    }
    throw new Error(`Unknown category: ${value}`);
  }
}
