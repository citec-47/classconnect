import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../common/prisma.service';
import { AuditService } from '../audit/audit.service';
import { NotificationsService } from '../notifications/notifications.service';
import { CloudinaryService } from './cloudinary.service';
import { MalwareScanService } from './malware-scan.service';
import { AppError } from '../common/http-exception.filter';
import {
  TEACHER_DOCUMENT_KINDS,
  TEACHER_VIDEO_KINDS,
  TEACHER_VIDEO_MAX_BYTES,
  TEACHER_DOCUMENT_MAX_BYTES,
  checkDeclaredFile,
  kindFor,
} from './file-policy';
import type { AuthenticatedUser } from '../rbac/decorators';
import type { TeacherDocumentType } from '@classconnect/db';

/**
 * File handling for teacher credential documents — FR-TVR-002, FR-FIL-001..005.
 *
 * The upload is a three-step handshake, because the bytes go straight from the
 * client to storage (SI-006) and never traverse the API:
 *
 *   1. `signUpload`  — policy check, then a signature scoped to one asset path
 *   2. client uploads directly to Cloudinary
 *   3. `confirmUpload` — the server asks storage what it actually received,
 *                        re-checks policy against that, scans, and only then
 *                        records a usable row
 *
 * A client that skips step 3 leaves an orphan in storage and no database row,
 * which is the safe direction to fail.
 */
/**
 * Which policy governs a given document.
 *
 * The introduction is video and everything else is a page, and that difference
 * has to be applied at all three steps — sign, confirm, and read. Deciding it in
 * one place keeps them from drifting, which is how a file uploads successfully
 * and then cannot be opened.
 */
/**
 * A date, or nothing.
 *
 * `new Date('')` and `new Date('19/08/2026')` both give `Invalid Date`, which
 * Prisma rejects with a message no operator can read. An optional expiry that
 * cannot be parsed is better treated as absent than as a reason to refuse the
 * whole upload.
 */
function parseDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function policyFor(type: string) {
  // String comparison for the same reason as above: this must not depend on the
  // generated client having caught up with the schema.
  return String(type) === 'intro_video' ? TEACHER_VIDEO_KINDS : TEACHER_DOCUMENT_KINDS;
}

function maxBytesFor(type: string): number {
  return String(type) === 'intro_video' ? TEACHER_VIDEO_MAX_BYTES : TEACHER_DOCUMENT_MAX_BYTES;
}

@Injectable()
export class FilesService {
  private readonly logger = new Logger(FilesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: CloudinaryService,
    private readonly scanner: MalwareScanService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
  ) {}

  /**
   * Step 1 — FR-FIL-002: refuse a disallowed file before signing anything.
   *
   * The public_id is generated server-side and scoped to the owner, so a
   * signature cannot be used to write outside the caller's own folder or to
   * overwrite another teacher's document.
   */
  async signTeacherDocumentUpload(
    user: AuthenticatedUser,
    input: {
      type: TeacherDocumentType;
      fileName: string;
      mimeType: string;
      sizeBytes: number;
      expiresOn?: string;
    },
  ) {
    /*
     * A teacher document needs a teacher.
     *
     * `teacher_documents.teacher_id` is a foreign key to `teachers`, so a user
     * holding the teacher *role* without a teacher *row* fails on insert — and
     * a raw foreign-key violation surfaces as a 500 and "Something went wrong on
     * our side", which tells the applicant nothing and the operator less.
     *
     * Checked first, so the answer is a sentence rather than a stack trace.
     */
    const teacher = await this.prisma.teacher.findUnique({ where: { userId: user.id } });
    if (!teacher) {
      this.logger.error(
        `[upload] ${user.id} holds the teacher role but has no teacher record — cannot attach a document.`,
      );
      throw AppError.badRequest('errors.file.no_teacher_profile');
    }

    // FR-TVR-003: documents belong to an application in progress. An approved
    // teacher may still add documents (re-verification, FR-TVR-007).
    if (teacher.verificationStatus === 'rejected') {
      throw AppError.conflict('errors.teacher.application_closed');
    }

    /*
     * The introduction is video; every other document is a page.
     *
     * Same three-step flow, different policy — a 10 MB ceiling would refuse
     * three minutes of footage, and the document kinds do not admit video at
     * all. Choosing on `type` keeps one upload path rather than two.
     */
    /*
     * Compared as a string, deliberately.
     *
     * `TeacherDocumentType` only learns about `intro_video` once
     * `prisma generate` has run, so a strict comparison makes the whole API fail
     * to compile whenever the generated client lags the schema — one new enum
     * value taking down sign-in, the admin surface and everything else.
     *
     * The value is still validated where it matters: the database rejects an
     * unknown enum member on write.
     */
    const isIntro = (input.type as string) === 'intro_video';
    const kinds = isIntro ? TEACHER_VIDEO_KINDS : TEACHER_DOCUMENT_KINDS;
    const maxBytes = isIntro ? TEACHER_VIDEO_MAX_BYTES : TEACHER_DOCUMENT_MAX_BYTES;

    const rejection = checkDeclaredFile(input, kinds, maxBytes);
    if (rejection) throw AppError.badRequest(rejection.messageKey, rejection.params);

    const kind = kindFor(input.fileName, input.mimeType, kinds)!;

    // FR-FIL-005: every file carries an owner. The owner is in the path, so an
    // asset can always be traced back to who uploaded it.
    const assetId = randomUUID();
    const folder = `classconnect/teacher-documents/${user.id}`;

    const signed = this.storage.signUpload({
      folder,
      publicId: `${folder}/${assetId}`,
      resourceType: kind.resourceType,
    });

    // The row is created up front in `pending`, so an upload that is never
    // confirmed is visible as an incomplete record rather than vanishing.
    let document;
    try {
      document = await this.prisma.teacherDocument.create({
      data: {
        teacherId: user.id,
        type: input.type,
        fileName: input.fileName.slice(0, 300),
        storageKey: signed.publicId,
        mimeType: input.mimeType,
        sizeBytes: input.sizeBytes,
        scanStatus: 'awaiting_upload',
        // An unparseable date becomes null rather than `Invalid Date`, which
        // Prisma rejects with an error nobody can read.
        expiresOn: parseDate(input.expiresOn),
        },
      });
    } catch (caught) {
      /*
       * Say what actually failed.
       *
       * An unhandled Prisma error becomes a 500 and "Something went wrong on our
       * side" — accurate and useless. The applicant cannot act on it and neither
       * can whoever is running the platform, because the cause never reaches a
       * log they read. NFR-USA-004 asks errors to say what happened; that
       * obligation starts with the server knowing.
       */
      this.logger.error(
        `[upload] could not record document for ${user.id}: ${(caught as Error).message}`,
      );
      throw AppError.badRequest('errors.file.could_not_record');
    }

    return {
      documentId: document.id,
      upload: {
        url: signed.uploadUrl,
        fields: {
          api_key: signed.apiKey,
          timestamp: String(signed.timestamp),
          signature: signed.signature,
          upload_preset: signed.uploadPreset,
          folder: signed.folder,
          public_id: signed.publicId,
          type: signed.type,
        },
        resourceType: signed.resourceType,
      },
    };
  }

  /**
   * Step 3 — confirm what storage actually received.
   *
   * FR-FIL-002: the size and resource type are re-checked against the asset
   * Cloudinary reports, not against what the client claimed in step 1.
   * FR-FIL-001: the scan runs here, and the file is not downloadable until it
   * returns clean.
   */
  async confirmTeacherDocumentUpload(user: AuthenticatedUser, documentId: string) {
    const document = await this.prisma.teacherDocument.findFirst({
      where: { id: documentId, teacherId: user.id },
    });
    if (!document) throw AppError.notFound();

    /*
     * Same choice as at signing, and it has to be made again here.
     *
     * Checking the intro video against the document kinds would reject it at the
     * confirm step — after the upload had already succeeded, which is the most
     * confusing place to fail.
     */
    const kinds = policyFor(document.type);
    const kind = kindFor(document.fileName, document.mimeType, kinds);
    if (!kind) throw AppError.badRequest('errors.file.type_not_allowed');

    const asset = await this.storage.getAsset(document.storageKey, kind.resourceType);
    if (!asset) {
      throw AppError.badRequest('errors.file.upload_not_found');
    }

    // FR-FIL-003: an asset stored as anything but `authenticated` would have a
    // permanent public URL. Refuse it and remove it.
    if (asset.type !== 'authenticated') {
      await this.storage.destroy(document.storageKey, kind.resourceType);
      await this.quarantine(document.id, 'wrong_delivery_type');
      throw AppError.badRequest('errors.file.rejected');
    }

    // FR-TVR-002: the real size decides, not the declared one.
    const maxBytes = maxBytesFor(document.type);
    if (asset.bytes > maxBytes) {
      await this.storage.destroy(document.storageKey, kind.resourceType);
      await this.quarantine(document.id, 'too_large');
      throw AppError.badRequest('errors.file.too_large', {
        maxMb: Math.floor(maxBytes / (1024 * 1024)),
      });
    }

    // FR-FIL-001: scan before the file becomes available for download.
    const verdict = await this.scanner.scan({
      publicId: document.storageKey,
      resourceType: asset.resourceType,
      bytes: asset.bytes,
    });

    if (verdict === 'infected') {
      // "A file failing the scan shall be quarantined and the uploader notified."
      await this.storage.destroy(document.storageKey, kind.resourceType);
      await this.quarantine(document.id, 'malware_detected');
      await this.notifications.notifyUser(user.id, 'fileQuarantined', {
        fileName: document.fileName,
      });
      throw AppError.badRequest('errors.file.quarantined');
    }

    const updated = await this.prisma.teacherDocument.update({
      where: { id: document.id },
      data: { scanStatus: verdict, sizeBytes: asset.bytes },
    });

    await this.audit.record({
      action: 'teacher.document_uploaded',
      entity: 'teacher_document',
      entityId: document.id,
      actorId: user.id,
      after: {
        type: document.type,
        fileName: document.fileName,
        bytes: asset.bytes,
        scanStatus: verdict,
      },
    });

    return {
      id: updated.id,
      type: updated.type,
      fileName: updated.fileName,
      sizeBytes: updated.sizeBytes,
      scanStatus: updated.scanStatus,
      // FR-FIL-001: `pending` means no scanner has cleared it, so it is stored
      // but not servable. Say so rather than leaving the uploader guessing.
      downloadable: updated.scanStatus === 'clean',
      expiresOn: updated.expiresOn,
    };
  }

  /**
   * FR-FIL-003: issues a short-lived signed URL, and only for a file the caller
   * may read and that has passed its scan.
   *
   * FR-FIL-005 / FR-RBA-004: every access is written to the audit trail. For a
   * teacher document that is an identity document, so the trail matters.
   */
  async getDownloadUrl(user: AuthenticatedUser, documentId: string, isStaff: boolean) {
    const document = await this.prisma.teacherDocument.findUnique({
      where: { id: documentId },
    });
    if (!document) throw AppError.notFound();

    // FR-RBA-003: the owning teacher, or staff performing verification.
    if (document.teacherId !== user.id && !isStaff) throw AppError.forbidden();

    // FR-FIL-001: nothing that has not passed the scan is served, to anybody.
    if (document.scanStatus !== 'clean') {
      throw AppError.forbidden('errors.file.not_available', {
        status: document.scanStatus,
      });
    }

    const kind = kindFor(document.fileName, document.mimeType, policyFor(document.type));
    if (!kind) throw AppError.badRequest('errors.file.type_not_allowed');

    const { url, expiresAt } = this.storage.signedReadUrl(document.storageKey, kind.resourceType);

    await this.audit.record({
      action: 'staff.viewed_learner',
      entity: 'teacher_document',
      entityId: document.id,
      actorId: user.id,
      after: { fileName: document.fileName, viewedAsStaff: isStaff },
    });

    return { url, expiresAt, fileName: document.fileName, mimeType: document.mimeType };
  }

  /**
   * FR-TVR-004: a reviewer removes a document that does not belong to the
   * application — the wrong file, a duplicate, or something sent by mistake.
   *
   * ## What this deliberately is not
   *
   * It does not delete the *verification*. FR-TVR-010 / §4.4 keep a decision
   * and the checklist behind it for the life of the account, and the database
   * enforces that with a rule that silently swallows deletes on
   * `verification_checklist_items`. An application that should not proceed is
   * rejected or sent back for more information; it is never erased, because the
   * record of who decided what is the point of keeping it.
   *
   * What can go is a *file*, and only with the reason recorded. The stored
   * asset is removed as well as the row: leaving somebody's identity document
   * in storage after a reviewer has decided it should not have been sent is the
   * opposite of what deleting it was for (NFR-SEC-003).
   *
   * The audit entry is written *before* anything is destroyed, and `audit_log`
   * is itself a no-delete table — so the trail outlives the file it describes.
   */
  async removeTeacherDocument(user: AuthenticatedUser, documentId: string, reason: string) {
    const document = await this.prisma.teacherDocument.findUnique({
      where: { id: documentId },
    });
    if (!document) throw AppError.notFound();

    await this.audit.record({
      action: 'teacher.document_removed',
      entity: 'teacher_document',
      entityId: document.id,
      actorId: user.id,
      before: {
        teacherId: document.teacherId,
        type: document.type,
        fileName: document.fileName,
        scanStatus: document.scanStatus,
        storageKey: document.storageKey,
      },
      after: { reason },
    });

    /*
     * Storage first, the row second.
     *
     * If the asset delete fails the row stays, and the file is still reachable
     * through a surface that still knows about it — recoverable. Dropping the
     * row first and then failing would leave the file in storage with nothing
     * in the database pointing at it, which is the one outcome nobody can find
     * later to clean up.
     */
    /*
     * The resource type has to be right or Cloudinary destroys nothing.
     *
     * It is derived from the file the same way the read path derives it, so a
     * PDF stored under `image` is removed from `image`. An unrecognised file
     * still gets its row dropped — the alternative is refusing to remove a
     * document because we can no longer classify it, which leaves the reviewer
     * stuck with exactly the file they asked to be rid of.
     */
    const kind = kindFor(document.fileName, document.mimeType, policyFor(document.type));
    if (kind) {
      await this.storage.destroy(document.storageKey, kind.resourceType);
    } else {
      this.logger.warn(
        `Removing ${document.id} without destroying the asset: unrecognised ${document.mimeType}.`,
      );
    }

    await this.prisma.teacherDocument.delete({ where: { id: document.id } });

    // FR-NOT-002: the applicant is told, and why — otherwise a document simply
    // vanishes and they resubmit the same file.
    await this.notifications
      .notifyUser(document.teacherId, 'teacherDocumentRemoved', {
        fileName: document.fileName,
        reason,
      })
      .catch(() => {
        this.logger.error(`Could not tell ${document.teacherId} their document was removed.`);
      });

    return { removed: true, fileName: document.fileName };
  }

  /** FR-TVR-007: documents approaching expiry, for the re-verification prompt. */
  async expiringDocuments(withinDays: number) {
    const cutoff = new Date(Date.now() + withinDays * 86_400_000);
    return this.prisma.teacherDocument.findMany({
      where: { expiresOn: { not: null, lte: cutoff }, scanStatus: 'clean' },
      select: {
        id: true,
        teacherId: true,
        type: true,
        fileName: true,
        expiresOn: true,
      },
      orderBy: { expiresOn: 'asc' },
    });
  }

  private async quarantine(documentId: string, reason: string): Promise<void> {
    await this.prisma.teacherDocument.update({
      where: { id: documentId },
      data: { scanStatus: 'quarantined', verified: false },
    });
    this.logger.warn({ msg: 'File quarantined', documentId, reason });
    await this.audit.record({
      action: 'teacher.document_uploaded',
      entity: 'teacher_document',
      entityId: documentId,
      after: { scanStatus: 'quarantined', reason },
    });
  }

  /**
   * Receive the bytes and forward them to storage.
   *
   * The browser used to POST straight to Cloudinary. That is the cheaper
   * arrangement and it is what SI-006 describes, but in practice it fails
   * silently here: the row is created, the signature is issued, and the upload
   * never lands — leaving every document stuck at `awaiting_upload` with no
   * error anyone can act on.
   *
   * Message attachments already went this way for the same reason. Through the
   * API, the only connection that has to work is server-to-Cloudinary, and when
   * storage refuses, its own message reaches the log instead of disappearing
   * into a cross-origin POST.
   */
  async uploadDocument(user: AuthenticatedUser, documentId: string, bytes: Buffer) {
    const document = await this.prisma.teacherDocument.findFirst({
      where: { id: documentId, teacherId: user.id },
      select: { id: true, type: true, fileName: true, mimeType: true, storageKey: true, scanStatus: true },
    });
    if (!document) throw AppError.notFound();

    // Only the slot just signed, and only once: a second upload would replace
    // bytes that may already have been scanned.
    if (document.scanStatus !== 'awaiting_upload') {
      throw AppError.conflict('errors.file.already_uploaded');
    }

    const maxBytes = maxBytesFor(document.type);
    if (bytes.length === 0) throw AppError.badRequest('errors.file.upload_not_found');
    if (bytes.length > maxBytes) {
      throw AppError.badRequest('errors.file.too_large', {
        maxMb: Math.floor(maxBytes / (1024 * 1024)),
      });
    }

    const kind = kindFor(document.fileName, document.mimeType, policyFor(document.type));
    if (!kind) throw AppError.badRequest('errors.file.type_not_allowed');

    const folder = document.storageKey.slice(0, document.storageKey.lastIndexOf('/'));

    const stored = await this.storage.uploadBuffer({
      folder,
      publicId: document.storageKey,
      resourceType: kind.resourceType,
      bytes,
      fileName: document.fileName,
      mimeType: document.mimeType,
    });

    if (!stored) throw AppError.badRequest('errors.file.upload_rejected');

    await this.prisma.teacherDocument.update({
      where: { id: documentId },
      // Trust the id storage reports, not the one we asked for: every later
      // read — the signed URL, the scan, the delete — uses this value.
      data: { scanStatus: 'pending', sizeBytes: stored.bytes, storageKey: stored.publicId },
    });

    return { ok: true };
  }

}
