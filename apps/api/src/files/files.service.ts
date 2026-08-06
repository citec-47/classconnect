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
    const teacher = await this.prisma.teacher.findUnique({ where: { userId: user.id } });
    if (!teacher) throw AppError.notFound();

    // FR-TVR-003: documents belong to an application in progress. An approved
    // teacher may still add documents (re-verification, FR-TVR-007).
    if (teacher.verificationStatus === 'rejected') {
      throw AppError.conflict('errors.teacher.application_closed');
    }

    const rejection = checkDeclaredFile(input, TEACHER_DOCUMENT_KINDS, TEACHER_DOCUMENT_MAX_BYTES);
    if (rejection) throw AppError.badRequest(rejection.messageKey, rejection.params);

    const kind = kindFor(input.fileName, input.mimeType, TEACHER_DOCUMENT_KINDS)!;

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
    const document = await this.prisma.teacherDocument.create({
      data: {
        teacherId: user.id,
        type: input.type,
        fileName: input.fileName.slice(0, 300),
        storageKey: signed.publicId,
        mimeType: input.mimeType,
        sizeBytes: input.sizeBytes,
        scanStatus: 'awaiting_upload',
        expiresOn: input.expiresOn ? new Date(input.expiresOn) : null,
      },
    });

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

    const kind = kindFor(document.fileName, document.mimeType, TEACHER_DOCUMENT_KINDS);
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
    if (asset.bytes > TEACHER_DOCUMENT_MAX_BYTES) {
      await this.storage.destroy(document.storageKey, kind.resourceType);
      await this.quarantine(document.id, 'too_large');
      throw AppError.badRequest('errors.file.too_large', {
        maxMb: Math.floor(TEACHER_DOCUMENT_MAX_BYTES / (1024 * 1024)),
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

    const kind = kindFor(document.fileName, document.mimeType, TEACHER_DOCUMENT_KINDS);
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
}
