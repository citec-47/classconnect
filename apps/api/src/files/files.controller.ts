import { Body, Controller, Get, Param, Post, Req } from '@nestjs/common';
import { FilesService } from './files.service';
import { MessageAttachmentsService } from './message-attachments.service';
import { zodBody, uuidParam } from '../common/zod-validation.pipe';
import { CurrentUser, RequirePermissions, type AuthenticatedUser } from '../rbac/decorators';
import { signTeacherDocumentSchema, isStaff, type SignTeacherDocumentInput } from '@classconnect/shared';

/** SI-006 / FR-TVR-002 / FR-FIL-001..005. */
@Controller('files')
export class FilesController {
  constructor(
    private readonly files: FilesService,
    private readonly attachments: MessageAttachmentsService,
  ) {}

  /*
   * Message attachments — images, video, voice notes and documents.
   *
   * Same three steps as a teacher document, and step three is the one that
   * matters: nothing is readable until the scan returns clean (FR-FIL-001).
   * This is a channel between adults and children, so that ordering is not
   * negotiable.
   */

  @Post('message-attachments/sign')
  @RequirePermissions('profile:read:own')
  async signAttachment(
    @CurrentUser() user: AuthenticatedUser,
    @Body()
    body: { threadId: string; fileName: string; mimeType: string; sizeBytes: number },
  ) {
    return this.attachments.sign(user, body);
  }

  /**
   * Step 2 — the bytes.
   *
   * Raw body rather than multipart: multipart would mean adding multer and its
   * types for a single field, and the client has exactly one file to send. The
   * request body *is* the file, and its declared type came from step 1.
   *
   * Read as a stream with a hard ceiling, so an oversized body is refused while
   * it arrives rather than after it has all been buffered.
   */
  @Post('message-attachments/:id/upload')
  @RequirePermissions('profile:read:own')
  async uploadAttachment(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', uuidParam()) id: string,
    @Req() request: RawBodyRequest,
  ) {
    /*
     * Take the body however it arrives.
     *
     * Nest runs Express's body parsers, and whether one of them has already
     * consumed the stream depends on the Content-Type the browser sent. If a
     * parser got there first, `request.body` is a Buffer and the stream is
     * spent — reading it again yields nothing, which surfaces as a confusing
     * "we did not receive that file".
     */
    const preParsed = Buffer.isBuffer(request.body) ? request.body : null;
    const bytes = preParsed ?? (await readBody(request, 25 * 1024 * 1024));

    // eslint-disable-next-line no-console
    console.log(
      `[attachment] received ${bytes.length} bytes for ${id} ` +
        `(content-type: ${request.headers?.['content-type'] ?? 'none'}, ` +
        `pre-parsed: ${preParsed !== null})`,
    );

    return this.attachments.upload(user, id, bytes);
  }

  @Post('message-attachments/:id/confirm')
  @RequirePermissions('profile:read:own')
  async confirmAttachment(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', uuidParam()) id: string,
  ) {
    return this.attachments.confirm(user, id);
  }

  @Get('message-attachments/:id/download-url')
  @RequirePermissions('profile:read:own')
  async attachmentUrl(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', uuidParam()) id: string,
  ) {
    return this.attachments.downloadUrl(user, id);
  }

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

interface RawBodyRequest {
  body?: unknown;
  headers?: Record<string, string | undefined>;
  on: (event: string, handler: (chunk?: unknown) => void) => void;
}

/**
 * Collects a request body, refusing one that grows past the ceiling.
 *
 * Aborting mid-stream matters: buffering 200 MB to discover it is too large
 * spends the memory the check exists to protect.
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
