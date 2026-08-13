import { Body, Controller, Delete, Get, Param, Post, Req } from '@nestjs/common';
import { publishLessonSchema, isStaff, type PublishLessonInput } from '@classconnect/shared';
import { LessonsService } from './lessons.service';
import { LESSON_MAX_BYTES } from './file-policy';
import { zodBody, uuidParam } from '../common/zod-validation.pipe';
import { CurrentUser, RequirePermissions, type AuthenticatedUser } from '../rbac/decorators';

/**
 * BUILD-PLAN Phase 2 — the teacher's half of lessons.
 *
 * Scoped to `user.id` throughout: no parameter names a teacher, so one cannot
 * publish into, list or delete another's lessons by changing an id.
 */
@Controller('teacher/lessons')
export class TeacherLessonsController {
  constructor(private readonly lessons: LessonsService) {}

  @Get()
  @RequirePermissions('lesson:publish:own')
  async mine(@CurrentUser() user: AuthenticatedUser) {
    return this.lessons.ownLessons(user.id);
  }

  /** Step 1: policy check, then a signature scoped to one asset path. */
  @Post('sign')
  @RequirePermissions('lesson:publish:own')
  async sign(
    @CurrentUser() user: AuthenticatedUser,
    @Body(zodBody(publishLessonSchema)) body: PublishLessonInput,
  ) {
    return this.lessons.signUpload(user, body);
  }

  /**
   * Step 2 — the bytes.
   *
   * Raw body rather than multipart, as with every other upload here: the request
   * body *is* the file, and its declared type came from step 1.
   */
  @Post(':materialId/upload')
  @RequirePermissions('lesson:publish:own')
  async upload(
    @CurrentUser() user: AuthenticatedUser,
    @Param('materialId', uuidParam()) materialId: string,
    @Req() request: RawBodyRequest,
  ) {
    /*
     * Take the body however it arrives — see `files.controller.ts`. Whether one
     * of Express's parsers has already consumed the stream depends on the
     * Content-Type the browser sent, and reading a spent stream yields nothing.
     */
    const preParsed = Buffer.isBuffer(request.body) ? request.body : null;
    const bytes = preParsed ?? (await readBody(request, LESSON_MAX_BYTES));
    return this.lessons.uploadBytes(user, materialId, bytes);
  }

  /** Step 3: confirm against what storage received, scan, then publish. */
  @Post(':materialId/confirm')
  @RequirePermissions('lesson:publish:own')
  async confirm(
    @CurrentUser() user: AuthenticatedUser,
    @Param('materialId', uuidParam()) materialId: string,
  ) {
    return this.lessons.confirm(user, materialId);
  }

  @Delete(':materialId')
  @RequirePermissions('lesson:publish:own')
  async remove(
    @CurrentUser() user: AuthenticatedUser,
    @Param('materialId', uuidParam()) materialId: string,
  ) {
    return this.lessons.remove(user, materialId);
  }
}

/**
 * The reader's half, and the only endpoint a learner calls.
 *
 * Separate from `teacher/lessons` because the permission is different in kind:
 * `catalogue:read` is held by everyone who consumes instruction, and the service
 * then decides *this* lesson against *this* reader's level. The list itself comes
 * from `/learner/work`, which already scopes materials to the learner's own
 * class — so this adds opening one, not finding it.
 */
@Controller('lessons')
export class LessonsController {
  constructor(private readonly lessons: LessonsService) {}

  @Get(':materialId/download-url')
  @RequirePermissions('catalogue:read')
  async downloadUrl(
    @CurrentUser() user: AuthenticatedUser,
    @Param('materialId', uuidParam()) materialId: string,
  ) {
    return this.lessons.downloadUrl(user, materialId, isStaff(user.roles));
  }
}

interface RawBodyRequest {
  body?: unknown;
  headers?: Record<string, string | undefined>;
  on: (event: string, handler: (chunk?: unknown) => void) => void;
}

/**
 * Collects a request body, refusing one that grows past the ceiling.
 *
 * Aborting mid-stream matters more here than anywhere else in the codebase: a
 * lesson may be 100 MB, and buffering all of it to discover it is too large
 * spends exactly the memory the check exists to protect.
 */
function readBody(request: RawBodyRequest, maxBytes: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let total = 0;

    request.on('data', (chunk?: unknown) => {
      const buffer = chunk as Buffer;
      total += buffer.length;
      if (total > maxBytes) {
        reject(new Error('errors.file.too_large'));
        return;
      }
      chunks.push(buffer);
    });
    request.on('end', () => resolve(Buffer.concat(chunks)));
    request.on('error', (error?: unknown) => reject(error as Error));
  });
}
