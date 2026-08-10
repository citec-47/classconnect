import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../common/prisma.service';
import { AppError } from '../common/http-exception.filter';
import { CloudinaryService } from './cloudinary.service';
import { MalwareScanService } from './malware-scan.service';
import { AuditService } from '../audit/audit.service';
import {
  MESSAGE_ATTACHMENT_KINDS,
  MESSAGE_ATTACHMENT_MAX_BYTES,
  checkDeclaredFile,
  kindFor,
} from './file-policy';
import { isStaff } from '@classconnect/shared';
import type { AuthenticatedUser } from '../rbac/decorators';

/**
 * Files, images, video and voice notes in a message.
 *
 * The same three-step dance as teacher documents, and for the same reasons:
 * sign, upload direct to storage, then **confirm and scan before anything is
 * readable**. Step three is the one that matters. FR-FIL-001 requires a file to
 * be scanned before it becomes available for download, and this is a channel
 * between adults and children — a stubbed scan here would be the single worst
 * shortcut available anywhere in this codebase.
 *
 * A row is created at signing time in `pending`, so an upload that is abandoned
 * shows as an incomplete record rather than vanishing (FR-FIL-005: every file
 * carries an owner and an audit trail).
 *
 * Limits come from `COMPOSE_LIMITS` in the messaging service, and are re-checked
 * here against what storage actually received rather than what the client
 * claimed — a declared size is a suggestion.
 */

const MAX_ATTACHMENTS_PER_MESSAGE = 5;

@Injectable()
export class MessageAttachmentsService {
  private readonly logger = new Logger(MessageAttachmentsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: CloudinaryService,
    private readonly scanner: MalwareScanService,
    private readonly audit: AuditService,
  ) {}

  /** Step 1 — a signed slot, and a pending row to hang it on. */
  async sign(
    user: AuthenticatedUser,
    input: { threadId: string; fileName: string; mimeType: string; sizeBytes: number },
  ) {
    /*
     * FR-RBA-003: you may attach to a thread you are in.
     *
     * Staff are the one exception, and a narrow one: a support agent joins a
     * thread on their first reply, so at the moment they attach a file they are
     * not a participant yet. They are allowed on **support threads only** —
     * never a learner–teacher conversation, which stays reachable through the
     * safeguarding queue that records who read it and why.
     */
    const participant = await this.prisma.threadParticipant.findUnique({
      where: { threadId_userId: { threadId: input.threadId, userId: user.id } },
      select: { mayPost: true },
    });

    if (!participant) {
      const supportThread = await this.prisma.messageThread.findFirst({
        where: { id: input.threadId, kind: 'learner_support' },
        select: { id: true },
      });
      if (!supportThread || !isStaff(user.roles)) throw AppError.notFound();
    } else if (!participant.mayPost) {
      throw AppError.forbidden('errors.thread.read_only');
    }

    const rejection = checkDeclaredFile(input, MESSAGE_ATTACHMENT_KINDS, MESSAGE_ATTACHMENT_MAX_BYTES);
    if (rejection) throw AppError.badRequest(rejection.messageKey, rejection.params);

    const kind = kindFor(input.fileName, input.mimeType, MESSAGE_ATTACHMENT_KINDS)!;

    const assetId = randomUUID();
    const folder = `classconnect/messages/${input.threadId}/${user.id}`;

    const signed = this.storage.signUpload({
      folder,
      publicId: `${folder}/${assetId}`,
      resourceType: kind.resourceType,
    });

    /*
     * `messageId` is null until the message is sent.
     *
     * The alternative — create the message first, then attach — would leave a
     * visible empty bubble in a child's conversation while a 20 MB video
     * uploaded over 3G. Attaching to the message at send time means nothing
     * appears until there is something to appear.
     */
    const attachment = await this.prisma.messageAttachment.create({
      data: {
        id: assetId,
        messageId: null,
        fileName: input.fileName.slice(0, 300),
        storageKey: signed.publicId,
        mimeType: input.mimeType,
        sizeBytes: input.sizeBytes,
        scanStatus: 'awaiting_upload',
      },
    });

    return {
      attachmentId: attachment.id,
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
      maxAttachments: MAX_ATTACHMENTS_PER_MESSAGE,
    };
  }

  /**
   * Step 2 — receive the bytes and forward them to storage.
   *
   * The browser used to POST straight to Cloudinary. That is the arrangement
   * SI-006 describes and it is cheaper, but it failed in practice with a bare
   * `NetworkError`: Cloudinary was reachable from the machine, and the
   * cross-origin POST still would not complete. Nothing in that failure is
   * visible to us or explainable to a learner.
   *
   * So the bytes come here instead. The only connection that has to work is
   * server-to-Cloudinary — the same one `getAsset` and the scan already use — and
   * when Cloudinary refuses, its own message lands in the API log rather than
   * disappearing into the browser.
   */
  async upload(
    user: AuthenticatedUser,
    attachmentId: string,
    bytes: Buffer,
  ): Promise<{ ok: true }> {
    const attachment = await this.prisma.messageAttachment.findUnique({
      where: { id: attachmentId },
      select: { id: true, fileName: true, mimeType: true, storageKey: true, scanStatus: true },
    });
    if (!attachment) throw AppError.notFound();

    // Only the slot this user just signed, and only once. A second upload to a
    // confirmed attachment would replace bytes that have already been scanned.
    if (attachment.scanStatus !== 'awaiting_upload') {
      this.logger.error(
        `[attachment] ${attachmentId}: expected scanStatus 'awaiting_upload', found '${attachment.scanStatus}'.`,
      );
      throw AppError.conflict('errors.file.already_uploaded');
    }

    if (bytes.length === 0) {
      this.logger.error(
        `[attachment] ${attachmentId}: request body was empty — the stream was ` +
          'consumed before the handler, or the client sent nothing.',
      );
      throw AppError.badRequest('errors.file.upload_not_found');
    }
    if (bytes.length > MESSAGE_ATTACHMENT_MAX_BYTES) {
      throw AppError.badRequest('errors.file.too_large', {
        maxMb: Math.floor(MESSAGE_ATTACHMENT_MAX_BYTES / (1024 * 1024)),
      });
    }

    const kind = kindFor(attachment.fileName, attachment.mimeType, MESSAGE_ATTACHMENT_KINDS);
    if (!kind) {
      this.logger.error(
        `[attachment] ${attachmentId}: no policy kind matches ` +
          `"${attachment.fileName}" (${attachment.mimeType}).`,
      );
      throw AppError.badRequest('errors.file.type_not_allowed');
    }

    const folder = attachment.storageKey.slice(0, attachment.storageKey.lastIndexOf('/'));

    const stored = await this.storage.uploadBuffer({
      folder,
      publicId: attachment.storageKey,
      resourceType: kind.resourceType,
      bytes,
      fileName: attachment.fileName,
      mimeType: attachment.mimeType,
    });

    if (!stored) {
      await this.quarantine(attachmentId, 'storage_refused');
      throw AppError.badRequest('errors.file.upload_rejected');
    }

    /*
     * Persist the public_id Cloudinary reports, not the one we sent.
     *
     * They are normally identical, but Cloudinary reserves the right to adjust
     * a public_id, and every later read — the signed URL, the scan, the delete —
     * uses `storageKey`. Trusting our own request over the provider's answer is
     * how an asset becomes unreachable while appearing to have uploaded fine.
     */
    await this.prisma.messageAttachment.update({
      where: { id: attachmentId },
      data: {
        scanStatus: 'pending',
        sizeBytes: stored.bytes,
        storageKey: stored.publicId,
      },
    });

    void user;
    return { ok: true };
  }

  /** Step 3 — check what storage really received, then scan it. */
  async confirm(user: AuthenticatedUser, attachmentId: string) {
    const attachment = await this.prisma.messageAttachment.findUnique({
      where: { id: attachmentId },
    });
    if (!attachment) throw AppError.notFound();

    const kind = kindFor(attachment.fileName, attachment.mimeType, MESSAGE_ATTACHMENT_KINDS);
    if (!kind) throw AppError.badRequest('errors.file.type_not_allowed');

    const asset = await this.storage.getAsset(attachment.storageKey, kind.resourceType);
    if (!asset) throw AppError.badRequest('errors.file.upload_not_found');

    // FR-FIL-003: anything not stored as `authenticated` has a permanent public
    // URL. In a conversation with a child, that is unacceptable — refuse it and
    // delete it.
    if (asset.type !== 'authenticated') {
      await this.storage.destroy(attachment.storageKey, kind.resourceType);
      await this.quarantine(attachmentId, 'wrong_delivery_type');
      throw AppError.badRequest('errors.file.rejected');
    }

    // The real size decides, not the declared one.
    if (asset.bytes > MESSAGE_ATTACHMENT_MAX_BYTES) {
      await this.storage.destroy(attachment.storageKey, kind.resourceType);
      await this.quarantine(attachmentId, 'too_large');
      throw AppError.badRequest('errors.file.too_large', {
        maxMb: Math.floor(MESSAGE_ATTACHMENT_MAX_BYTES / (1024 * 1024)),
      });
    }

    // FR-FIL-001. Nothing below this line runs on an unscanned file.
    const verdict = await this.scanner.scan({
      publicId: attachment.storageKey,
      resourceType: asset.resourceType,
      bytes: asset.bytes,
    });

    if (verdict === 'infected') {
      await this.storage.destroy(attachment.storageKey, kind.resourceType);
      await this.quarantine(attachmentId, 'malware_detected');
      throw AppError.badRequest('errors.file.quarantined');
    }

    /*
     * `durationSec` is left as stored.
     *
     * Cloudinary reports a duration for video and audio, but `StoredAsset` does
     * not surface it, and inventing a value here would put a wrong number under
     * a voice note. Widening `StoredAsset` is the right fix when the player
     * needs it; guessing is not.
     */
    const updated = await this.prisma.messageAttachment.update({
      where: { id: attachmentId },
      data: {
        scanStatus: 'clean',
        sizeBytes: asset.bytes,
      },
      select: { id: true, fileName: true, mimeType: true, sizeBytes: true, durationSec: true },
    });

    await this.audit.record({
      action: 'message.attachment_uploaded',
      entity: 'message_attachment',
      entityId: attachmentId,
      actorId: user.id,
      after: { fileName: updated.fileName, mimeType: updated.mimeType },
    });

    return { ...updated, scanStatus: 'clean' as const };
  }

  /**
   * A short-lived signed URL, minted at read time.
   *
   * FR-FIL-003: no attachment is ever reachable by a permanent URL, so this is
   * the only way to see one, and it expires.
   */
  async downloadUrl(user: AuthenticatedUser, attachmentId: string) {
    const attachment = await this.prisma.messageAttachment.findUnique({
      where: { id: attachmentId },
      select: {
        id: true,
        fileName: true,
        mimeType: true,
        storageKey: true,
        scanStatus: true,
        message: { select: { threadId: true } },
      },
    });
    if (!attachment) throw AppError.notFound();

    // FR-FIL-001: an unscanned or quarantined file is served to nobody, ever —
    // including the person who uploaded it.
    if (attachment.scanStatus !== 'clean') {
      throw AppError.forbidden('errors.file.not_available', { status: attachment.scanStatus });
    }

    // An attachment is readable by the thread's participants, and by staff on a
    // support thread.
    const threadId = attachment.message?.threadId;
    if (!threadId) throw AppError.notFound();

    const participant = await this.prisma.threadParticipant.findUnique({
      where: { threadId_userId: { threadId, userId: user.id } },
      select: { userId: true },
    });

    if (!participant) {
      /*
       * The same narrow exception as attaching: a support agent joins a thread
       * on their **first reply**, so until they answer they can see a learner's
       * file in the list and get a 403 opening it — which is what happened here.
       *
       * Support threads only. Never a learner–teacher conversation: that stays
       * reachable through the safeguarding queue, which records who read it and
       * why (FR-RBA-004). Widening this to every thread would make the general
       * inbox a way to open children's files without a trace.
       */
      const supportThread = await this.prisma.messageThread.findFirst({
        where: { id: threadId, kind: 'learner_support' },
        select: { id: true },
      });
      if (!supportThread || !isStaff(user.roles)) throw AppError.forbidden();
    }

    const kind = kindFor(attachment.fileName, attachment.mimeType, MESSAGE_ATTACHMENT_KINDS);
    if (!kind) throw AppError.badRequest('errors.file.type_not_allowed');

    const { url, expiresAt } = this.storage.signedReadUrl(
      attachment.storageKey,
      kind.resourceType,
    );

    return { url, expiresAt, fileName: attachment.fileName, mimeType: attachment.mimeType };
  }

  private async quarantine(attachmentId: string, reason: string) {
    await this.prisma.messageAttachment.update({
      where: { id: attachmentId },
      data: { scanStatus: 'quarantined' },
    });
    await this.audit.record({
      action: 'message.attachment_quarantined',
      entity: 'message_attachment',
      entityId: attachmentId,
      after: { reason },
    });
  }
}
