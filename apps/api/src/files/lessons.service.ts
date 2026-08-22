import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../common/prisma.service';
import { CloudinaryService } from './cloudinary.service';
import { MalwareScanService } from './malware-scan.service';
import { AuditService } from '../audit/audit.service';
import { AppError } from '../common/http-exception.filter';
import {
  checkDeclaredFile,
  kindFor,
  kindForMime,
  LESSON_KINDS,
  LESSON_MAX_BYTES,
} from './file-policy';
import type { AuthenticatedUser } from '../rbac/decorators';
import type { PublishLessonInput } from '@classconnect/shared';

/**
 * BUILD-PLAN Phase 2 — a teacher publishing material to a class.
 *
 * The same three steps as every other upload here (sign, send the bytes, confirm
 * against what storage actually received), for the same reason: nothing is
 * readable until the scan returns clean, and the confirm step is what checks
 * that rather than trusting what the client declared.
 *
 * The reader already exists. `learner-work.service.ts` serves materials scoped
 * to the learner's own level and cohorts and filtered to `scanStatus: 'clean'`,
 * which is exactly the brief's "only students under that particular class
 * receive the lessons" — a `where`, not a filter in the UI. So this builds the
 * teacher's half and the learner's library picks it up unchanged.
 *
 * ## Why no new model
 *
 * `Material` already carries an owner, a level, a subject, a storage key and a
 * scan status. A `Lesson` table would duplicate all six columns and split the
 * learner's library in two, so a lesson *is* a `Material` with
 * `visibilityScope: 'level'`.
 *
 * The one thing `Material` does not keep is the original file name — its `title`
 * is what the teacher typed for the learner to read. `kindForMime` covers the
 * later steps for that reason: by then the name has already done its work, which
 * was to agree with the declared MIME type at signing time.
 */
@Injectable()
export class LessonsService {
  private readonly logger = new Logger(LessonsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: CloudinaryService,
    private readonly scanner: MalwareScanService,
    private readonly audit: AuditService,
  ) {}

  /** Step 1 — refuse an impossible file before signing anything. */
  async signUpload(user: AuthenticatedUser, input: PublishLessonInput) {
    /*
     * A teacher may only publish into a class they were verified to teach.
     *
     * The same rule the timetable applies, and for the same reason: FR-TVR-005
     * approves someone for particular subjects and levels, and publishing
     * outside them would route around the verification entirely.
     */
    const teaches = await this.prisma.teacherSubject.findFirst({
      where: { teacherId: user.id, subjectId: input.subjectId, levelId: input.levelId },
    });
    if (!teaches) throw AppError.forbidden('errors.timetable.not_your_subject');

    const rejection = checkDeclaredFile(input, LESSON_KINDS, LESSON_MAX_BYTES);
    if (rejection) throw AppError.badRequest(rejection.messageKey, rejection.params);

    // Non-null: `checkDeclaredFile` returns a rejection when nothing matches.
    const kind = kindFor(input.fileName, input.mimeType, LESSON_KINDS)!;

    // FR-FIL-005: every file carries an owner, and the owner is in the path.
    const assetId = randomUUID();
    const folder = `classconnect/lessons/${user.id}`;
    const signed = this.storage.signUpload({
      folder,
      publicId: `${folder}/${assetId}`,
      resourceType: kind.resourceType,
    });

    const material = await this.prisma.material.create({
      data: {
        uploadedBy: user.id,
        subjectId: input.subjectId,
        levelId: input.levelId,
        title: input.title.slice(0, 300),
        topic: input.topic?.slice(0, 200) ?? null,
        storageKey: signed.publicId,
        mimeType: input.mimeType,
        sizeBytes: input.sizeBytes,
        /*
         * `level` — the whole class, which is what a lesson is.
         *
         * A cohort-scoped material reaches only the group booked into a
         * particular session, and the brief is explicit that a lesson goes to
         * everyone in that class.
         */
        visibilityScope: 'level',
        /*
         * FR-FIL-001: unreadable until the scan says otherwise.
         *
         * `awaiting_upload` rather than `pending`, so step 2 can tell a slot
         * nobody has uploaded to from one whose bytes are waiting on a verdict —
         * and refuse a second upload over an already-scanned file.
         */
        scanStatus: 'awaiting_upload',
      },
    });

    return { materialId: material.id, upload: signed };
  }

  /**
   * Step 2 — the bytes, through the API rather than straight to storage.
   *
   * See `cloudinary.service.ts`: a direct cross-origin POST from the browser
   * fails here with a bare `NetworkError` that tells nobody anything. The only
   * connection that has to work is server-to-Cloudinary.
   */
  async uploadBytes(user: AuthenticatedUser, materialId: string, bytes: Buffer) {
    const material = await this.prisma.material.findFirst({
      where: { id: materialId, uploadedBy: user.id },
      select: { id: true, mimeType: true, storageKey: true, scanStatus: true },
    });
    if (!material) throw AppError.notFound();

    // Only the slot this teacher just signed, and only once. A second upload to
    // a confirmed lesson would replace bytes that have already been scanned.
    if (material.scanStatus !== 'awaiting_upload') {
      this.logger.error(
        `[lesson] ${materialId}: expected scanStatus 'awaiting_upload', found '${material.scanStatus}'.`,
      );
      throw AppError.conflict('errors.file.already_uploaded');
    }

    if (bytes.length === 0) {
      this.logger.error(
        `[lesson] ${materialId}: request body was empty — the stream was consumed ` +
          'before the handler, or the client sent nothing.',
      );
      throw AppError.badRequest('errors.file.upload_not_found');
    }
    if (bytes.length > LESSON_MAX_BYTES) {
      throw AppError.badRequest('errors.file.too_large', {
        maxMb: Math.floor(LESSON_MAX_BYTES / (1024 * 1024)),
      });
    }

    const kind = kindForMime(material.mimeType, LESSON_KINDS);
    if (!kind) throw AppError.badRequest('errors.file.type_not_allowed');

    const folder = material.storageKey.slice(0, material.storageKey.lastIndexOf('/'));

    const stored = await this.storage.uploadBuffer({
      folder,
      publicId: material.storageKey,
      resourceType: kind.resourceType,
      bytes,
      fileName: material.storageKey.slice(material.storageKey.lastIndexOf('/') + 1),
      mimeType: material.mimeType,
    });
    if (!stored) {
      await this.quarantine(material.id, 'storage_refused');
      throw AppError.badRequest('errors.file.upload_rejected');
    }

    /*
     * Persist the public_id Cloudinary reports, not the one we sent. They are
     * normally identical, and every later read — the signed URL, the scan, the
     * delete — goes through `storageKey`, so trusting our own request over the
     * provider's answer is how an asset becomes unreachable while appearing to
     * have uploaded fine.
     */
    await this.prisma.material.update({
      where: { id: material.id },
      data: { scanStatus: 'pending', sizeBytes: stored.bytes, storageKey: stored.publicId },
    });

    return { ok: true as const };
  }

  /** Step 3 — check what storage really received, scan it, then publish. */
  /**
   * Releasing a lesson to the class.
   *
   * Refuses anything the scanner has not cleared. The learner queries filter on
   * `scanStatus` as well, so a quarantined file could not reach a child either
   * way — but publishing one and having it silently not appear would leave the
   * teacher believing the class had it.
   *
   * Idempotent, and keeps the first publication time: re-pressing the button is
   * not a second release, and "when did the class get this" should not move
   * because somebody clicked twice.
   */
  async publish(user: AuthenticatedUser, materialId: string) {
    const material = await this.prisma.material.findFirst({
      where: { id: materialId, uploadedBy: user.id },
      select: { id: true, scanStatus: true, publishedAt: true, title: true, levelId: true },
    });
    if (!material) throw AppError.notFound();

    if (material.scanStatus !== 'clean') {
      throw AppError.badRequest('errors.lesson.not_scanned');
    }
    if (material.publishedAt) return { published: true, publishedAt: material.publishedAt };

    const publishedAt = new Date();
    await this.prisma.material.update({
      where: { id: materialId },
      data: { publishedAt },
    });

    await this.audit.record({
      action: 'lesson.published',
      entity: 'material',
      entityId: materialId,
      actorId: user.id,
      after: { title: material.title, levelId: material.levelId },
    });

    return { published: true, publishedAt };
  }

  async confirm(user: AuthenticatedUser, materialId: string) {
    const material = await this.prisma.material.findFirst({
      where: { id: materialId, uploadedBy: user.id },
    });
    if (!material) throw AppError.notFound();

    const kind = kindForMime(material.mimeType, LESSON_KINDS);
    if (!kind) throw AppError.badRequest('errors.file.type_not_allowed');

    const asset = await this.storage.getAsset(material.storageKey, kind.resourceType);
    if (!asset) throw AppError.badRequest('errors.file.upload_not_found');

    // FR-FIL-003: anything not stored as `authenticated` has a permanent public
    // URL. Refuse it and remove it.
    if (asset.type !== 'authenticated') {
      await this.storage.destroy(material.storageKey, kind.resourceType);
      await this.quarantine(material.id, 'wrong_delivery_type');
      throw AppError.badRequest('errors.file.rejected');
    }

    // The real size decides, not the declared one.
    if (asset.bytes > LESSON_MAX_BYTES) {
      await this.storage.destroy(material.storageKey, kind.resourceType);
      await this.quarantine(material.id, 'too_large');
      throw AppError.badRequest('errors.file.too_large', {
        maxMb: Math.floor(LESSON_MAX_BYTES / (1024 * 1024)),
      });
    }

    // FR-FIL-001. Nothing below this line runs on an unscanned file.
    const verdict = await this.scanner.scan({
      publicId: material.storageKey,
      resourceType: asset.resourceType,
      bytes: asset.bytes,
    });

    if (verdict === 'infected') {
      await this.storage.destroy(material.storageKey, kind.resourceType);
      await this.quarantine(material.id, 'malware_detected');
      throw AppError.badRequest('errors.file.quarantined');
    }

    /*
     * `pending` is stored as `pending`, not quietly promoted.
     *
     * With no scanner contracted that is the honest verdict, and the learner
     * library filters on `scanStatus: 'clean'` — so the lesson is stored and not
     * served. `published` below says which of the two happened, because "your
     * lesson is uploaded but nobody can see it yet" is the one thing the teacher
     * must not have to guess at.
     */
    const updated = await this.prisma.material.update({
      where: { id: material.id },
      data: { scanStatus: verdict, sizeBytes: asset.bytes },
    });

    await this.audit.record({
      action: 'lesson.published',
      entity: 'material',
      entityId: material.id,
      actorId: user.id,
      after: {
        title: material.title,
        levelId: material.levelId,
        subjectId: material.subjectId,
        bytes: asset.bytes,
        scanStatus: verdict,
      },
    });

    return {
      materialId: updated.id,
      scanStatus: updated.scanStatus,
      published: updated.scanStatus === 'clean',
    };
  }

  /** The teacher's own lessons, newest first. */
  async ownLessons(teacherId: string) {
    const lessons = await this.prisma.material.findMany({
      where: { uploadedBy: teacherId },
      orderBy: { createdAt: 'desc' },
      take: 200,
      include: {
        subject: { select: { id: true, nameEn: true, nameFr: true } },
        level: { select: { id: true, nameEn: true, nameFr: true } },
      },
    });

    return {
      lessons: lessons.map((row) => ({
        id: row.id,
        title: row.title,
        topic: row.topic,
        mimeType: row.mimeType,
        sizeBytes: row.sizeBytes,
        scanStatus: row.scanStatus,
        /*
         * Published is now the teacher's decision, not the scanner's.
         *
         * This read `scanStatus === 'clean'`, which was true while confirming an
         * upload also released it. It is no longer: a clean file the teacher has
         * not published is a draft, and reporting it as published would tell
         * them the class had a worksheet nobody could see.
         */
        published: row.publishedAt !== null,
        publishedAt: row.publishedAt?.toISOString() ?? null,
        /** Clean and unpublished: the Publish button is live for exactly these. */
        publishable: row.scanStatus === 'clean' && row.publishedAt === null,
        createdAt: row.createdAt.toISOString(),
        subject: row.subject,
        level: row.level,
      })),
    };
  }

  /** Unpublishing: the teacher's own lesson, and the stored file with it. */
  async remove(user: AuthenticatedUser, materialId: string) {
    const material = await this.prisma.material.findFirst({
      where: { id: materialId, uploadedBy: user.id },
    });
    if (!material) throw AppError.notFound();

    /*
     * Audited before the delete, not after.
     *
     * `audit_log` is a no-delete table and this entry is the only thing that
     * outlives the file, so it has to be written while the row is still there to
     * copy from — a failure after the delete would leave no record at all.
     */
    await this.audit.record({
      action: 'lesson.removed',
      entity: 'material',
      entityId: material.id,
      actorId: user.id,
      before: {
        title: material.title,
        levelId: material.levelId,
        subjectId: material.subjectId,
        storageKey: material.storageKey,
      },
    });

    const kind = kindForMime(material.mimeType, LESSON_KINDS);
    if (kind) await this.storage.destroy(material.storageKey, kind.resourceType);
    await this.prisma.material.delete({ where: { id: material.id } });

    return { removed: true as const };
  }

  /** FR-FIL-003: a short-lived signed read URL, for reading or keeping offline. */
  async downloadUrl(user: AuthenticatedUser, materialId: string, isStaffReader: boolean) {
    const material = await this.prisma.material.findUnique({ where: { id: materialId } });
    if (!material) throw AppError.notFound();

    // FR-FIL-001: an unscanned or quarantined file is served to nobody, ever —
    // including the teacher who uploaded it.
    if (material.scanStatus !== 'clean') {
      throw AppError.forbidden('errors.file.not_available', { status: material.scanStatus });
    }

    /*
     * Who may read a lesson: its author, staff, or a learner in that level.
     *
     * The learner check is a query rather than a trusted claim — the caller
     * cannot assert which level they are in. Cohort- and learner-scoped
     * materials are deliberately not reachable here: this endpoint serves the
     * class-wide lessons of Phase 2, and widening it would let a level-mate open
     * a file addressed to one child.
     */
    if (material.uploadedBy !== user.id && !isStaffReader) {
      const inLevel = await this.prisma.learner.findFirst({
        where: { id: user.id, levelId: material.levelId },
        select: { id: true },
      });
      if (!inLevel || material.visibilityScope !== 'level') throw AppError.forbidden();
    }

    const kind = kindForMime(material.mimeType, LESSON_KINDS);
    if (!kind) throw AppError.badRequest('errors.file.type_not_allowed');

    const { url, expiresAt } = this.storage.signedReadUrl(material.storageKey, kind.resourceType, {
      // The brief wants a learner able to keep a lesson to read offline.
      download: true,
    });
    return { url, expiresAt, title: material.title, mimeType: material.mimeType };
  }

  private async quarantine(materialId: string, reason: string) {
    await this.prisma.material.update({
      where: { id: materialId },
      data: { scanStatus: 'quarantined' },
    });
    await this.audit.record({
      action: 'lesson.quarantined',
      entity: 'material',
      entityId: materialId,
      after: { reason },
    });
  }
}
