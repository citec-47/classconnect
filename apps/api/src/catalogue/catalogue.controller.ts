import { Controller, Get, Query } from '@nestjs/common';
import { CatalogueService } from './catalogue.service';
import { Public, RequirePermissions } from '../rbac/decorators';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { browseTeachersSchema } from '@classconnect/shared';

@Controller('catalogue')
export class CatalogueController {
  constructor(private readonly catalogue: CatalogueService) {}

  /**
   * FR-PRO-001/002. Public: a prospective parent must be able to see what is
   * taught before creating an account.
   */
  @Public()
  @Get('levels')
  async levels(@Query('schoolType') schoolType?: 'primary' | 'secondary') {
    // The value is narrowed rather than trusted: an unknown string returns the
    // full list instead of silently matching nothing.
    const filter = schoolType === 'primary' || schoolType === 'secondary' ? schoolType : undefined;
    return this.catalogue.levels(filter);
  }

  @Public()
  @Get('subjects')
  async subjects() {
    return this.catalogue.subjects();
  }

  /** FR-PRO-006: browse and filter teachers. */
  @Get('teachers')
  @RequirePermissions('teacher:browse')
  async teachers(
    @Query(new ZodValidationPipe(browseTeachersSchema))
    query: {
      subjectId?: string;
      levelId?: string;
      language?: 'en' | 'fr';
      minRating?: number;
      availableWeekday?: number;
      page: number;
      pageSize: number;
    },
  ) {
    return this.catalogue.browseTeachers(query);
  }
}
