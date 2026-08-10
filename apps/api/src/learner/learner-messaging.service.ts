import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';
import { redactContactDetails } from '@classconnect/shared';
import { MESSAGE_ATTACHMENT_KINDS } from '../files/file-policy';
import type {
  MessageComposeLimitsDto,
  MessageDto,
  MessageThreadDto,
  MessageThreadSummaryDto,
} from '@classconnect/shared';

/**
 * Learner ↔ teacher messaging.
 *
 * ## Why there is no delete method on this class
 *
 * The requirement is that neither party can delete a message once sent, and it
 * is the right requirement — for exactly the reason it feels uncomfortable. A
 * thread between an adult and a child is safeguarding evidence, and evidence a
 * participant can destroy is not evidence. The person most motivated to delete
 * a message is the person who should not be allowed to.
 *
 * So there is no `delete`, no `edit` and no `unsend` here, and the absence is
 * the mechanism. `Message.deletedAt` still exists in the schema, but it is
 * reachable only from the safeguarding module, because there is a narrow case
 * that must remain possible: a genuinely harmful image sent to a child has to
 * be removable by a designated officer, and that removal is a soft state change
 * with a full audit entry (FR-RBA-004), never a row disappearing.
 *
 * "Nobody can delete" and "a safeguarding officer can redact, and it is
 * recorded" are the same policy at two different levels of seriousness. A
 * platform serving minors needs both halves.
 *
 * ## What else holds by absence
 *
 * There is no method here that takes another learner's id, and no thread kind
 * that could hold two learners (see `shared/messaging.ts`). FR-SAF-008 is
 * satisfied because the concept was never modelled, not because a guard refuses
 * it.
 */

/** FR-FIL-002: an allow-list, by content type. No executables, no archives. */
/*
 * Derived from the file policy rather than restated, so the picker can never
 * offer a type the server will refuse — the two drifting apart is how a learner
 * ends up watching an upload fail at the last step.
 */
const ACCEPTED_MIME_TYPES = MESSAGE_ATTACHMENT_KINDS.map((kind) => kind.mime);

export const COMPOSE_LIMITS: MessageComposeLimitsDto = {
  maxAttachments: 5,
  // 25 MB, matching FR-HWK-003. A parent on a metered connection is uploading
  // this over 3G, and a larger ceiling is a promise the network cannot keep.
  maxBytesPerFile: 25 * 1024 * 1024,
  acceptedMimeTypes: ACCEPTED_MIME_TYPES,
};

@Injectable()
export class LearnerMessagingService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Subject names for a set of ids, localised.
   *
   * `MessageThread.subjectId` is a bare column — the schema declares no
   * relation — so the name cannot be joined and is fetched here instead. One
   * query for the whole page rather than one per thread, and nulls are dropped
   * before it runs so a list of support threads makes no query at all.
   */
  private async subjectNames(
    ids: (string | null)[],
    language: 'en' | 'fr',
  ): Promise<Map<string, string>> {
    const unique = [...new Set(ids.filter((id): id is string => Boolean(id)))];
    if (unique.length === 0) return new Map();

    const subjects = await this.prisma.subject.findMany({
      where: { id: { in: unique } },
      select: { id: true, nameEn: true, nameFr: true },
    });

    return new Map(
      subjects.map((subject) => [
        subject.id,
        language === 'fr' ? subject.nameFr : subject.nameEn,
      ]),
    );
  }

  async threads(userId: string, language: 'en' | 'fr'): Promise<MessageThreadSummaryDto[]> {
    const threads = await this.prisma.messageThread.findMany({
      where: { participants: { some: { userId } } },
      select: {
        id: true,
        kind: true,
        lastMessageAt: true,
        // `MessageThread` carries `subjectId` as a plain column, with no
        // relation declared, so the name is resolved in a second query below
        // rather than joined here.
        subjectId: true,
        participants: {
          select: {
            userId: true,
            lastReadAt: true,
            user: { select: { fullName: true } },
          },
        },
        messages: {
          where: { state: 'visible' },
          orderBy: { createdAt: 'desc' },
          take: 1,
          select: { body: true, senderUserId: true, createdAt: true },
        },
      },
      orderBy: { lastMessageAt: 'desc' },
    });

    const subjectNames = await this.subjectNames(
      threads.map((thread) => thread.subjectId),
      language,
    );

    /*
     * Unread is derived, never stored.
     *
     * Everything visible in the thread after this participant's `lastReadAt`,
     * excluding their own messages — you have read what you wrote. A stored
     * counter would drift the first time a write failed halfway and would then
     * need reconciling against the messages anyway.
     */
    const unreadCounts = await this.prisma.message.groupBy({
      by: ['threadId'],
      where: {
        threadId: { in: threads.map((thread) => thread.id) },
        state: 'visible',
        senderUserId: { not: userId },
        OR: threads.map((thread) => ({
          threadId: thread.id,
          createdAt: {
            gt:
              thread.participants.find((p) => p.userId === userId)?.lastReadAt ??
              new Date(0),
          },
        })),
      },
      _count: { _all: true },
    });
    const unreadByThread = new Map(
      unreadCounts.map((row) => [row.threadId, row._count?._all ?? 0]),
    );

    return threads.map((thread) => {
      const last = thread.messages[0] ?? null;
      const subjectName = thread.subjectId ? subjectNames.get(thread.subjectId) : undefined;
      const other = thread.participants.find((p) => p.userId !== userId);
      return {
        threadId: thread.id,
        counterpartName: other?.user.fullName ?? '',
        counterpartRole: thread.kind === 'learner_support' ? 'support' : 'teacher',
        subject:
          thread.subjectId && subjectName
            ? { id: thread.subjectId, name: subjectName }
            : null,
        lastMessageAt: thread.lastMessageAt?.toISOString() ?? null,
        lastMessagePreview: last ? truncate(last.body, 90) : null,
        unreadCount: unreadByThread.get(thread.id) ?? 0,
      };
    });
  }

  async thread(
    threadId: string,
    userId: string,
    language: 'en' | 'fr',
  ): Promise<MessageThreadDto> {
    const thread = await this.prisma.messageThread.findFirst({
      // Membership is part of the lookup rather than a check after it, so a
      // thread the learner is not in is indistinguishable from one that does
      // not exist (FR-RBA-003).
      where: { id: threadId, participants: { some: { userId } } },
      select: {
        id: true,
        kind: true,
        subjectId: true,
        participants: {
          select: {
            userId: true,
            mayPost: true,
            user: { select: { fullName: true, status: true } },
          },
        },
        messages: {
          // A redacted message is withheld from the conversation, not erased
          // from it. The row stays for the investigation that caused it.
          where: { state: 'visible' },
          orderBy: { createdAt: 'asc' },
          select: {
            id: true,
            senderUserId: true,
            body: true,
            bodyOriginal: true,
            createdAt: true,
            sender: { select: { fullName: true } },
            attachments: {
              select: {
                id: true,
                fileName: true,
                mimeType: true,
                sizeBytes: true,
                scanStatus: true,
                durationSec: true,
              },
            },
          },
        },
      },
    });

    if (!thread) throw new NotFoundException({ messageKey: 'errors.thread.not_found' });

    /*
     * Opening the thread is what marks it read.
     *
     * Deliberately after the messages are loaded, so the response the learner
     * receives still contains everything, and only the *next* list call shows
     * the count cleared. Marking first would race the read.
     */
    await this.prisma.threadParticipant.updateMany({
      where: { threadId, userId },
      data: { lastReadAt: new Date() },
    });

    const subjectName = thread.subjectId
      ? (await this.subjectNames([thread.subjectId], language)).get(thread.subjectId)
      : undefined;

    const me = thread.participants.find((p) => p.userId === userId);
    const other = thread.participants.find((p) => p.userId !== userId);

    const suspended = other?.user.status === 'suspended';
    const mayPost = Boolean(me?.mayPost) && !suspended;

    const messages: MessageDto[] = thread.messages.map((message) => ({
      id: message.id,
      mine: message.senderUserId === userId,
      senderName: message.sender.fullName,
      body: message.body,
      redacted: message.bodyOriginal !== null,
      sentAt: message.createdAt.toISOString(),
      attachments: message.attachments.map((attachment) => ({
        id: attachment.id,
        fileName: attachment.fileName,
        mimeType: attachment.mimeType,
        sizeBytes: attachment.sizeBytes,
        scanStatus: attachment.scanStatus as 'pending' | 'clean' | 'quarantined',
        /*
         * FR-FIL-003: never a permanent URL. The client asks
         * `/files/message-attachments/:id/download-url` when the learner
         * actually opens the file, which mints a short-lived signed URL and
         * re-checks the scan status at that moment.
         *
         * Minting one here for every attachment in the thread would hand out
         * live URLs for files nobody opened.
         */
        url: null,
        durationSec: attachment.durationSec,
      })),
    }));

    return {
      threadId: thread.id,
      counterpartName: other?.user.fullName ?? '',
      counterpartRole: thread.kind === 'learner_support' ? 'support' : 'teacher',
      subject:
        thread.subjectId && subjectName
          ? { id: thread.subjectId, name: subjectName }
          : null,
      mayPost,
      cannotPostReasonKey: mayPost
        ? null
        : suspended
          ? 'student.messages.teacherUnavailable'
          : 'student.messages.closed',
      messages,
    };
  }

  /**
   * Send a message.
   *
   * Append-only by construction: this is a `create`, and there is no sibling
   * method that updates one. FR-SAF-002 redaction happens here rather than at
   * read time, so what the recipient sees was never anything else — and the
   * original is retained alongside it as evidence when redaction fired.
   */
  async send(
    threadId: string,
    userId: string,
    body: string,
    attachmentIds: string[] = [],
  ): Promise<MessageDto> {
    const participant = await this.prisma.threadParticipant.findUnique({
      where: { threadId_userId: { threadId, userId } },
      select: {
        mayPost: true,
        thread: { select: { kind: true, teacherUserId: true, learnerId: true } },
      },
    });

    if (!participant) throw new NotFoundException({ messageKey: 'errors.thread.not_found' });
    if (!participant.mayPost) {
      throw new ForbiddenException({ messageKey: 'errors.thread.read_only' });
    }

    const trimmed = body.trim();
    if (!trimmed && attachmentIds.length === 0) {
      throw new BadRequestException({ messageKey: 'errors.message.empty' });
    }

    // FR-SAF-002: phone numbers, emails and messaging handles between a teacher
    // and a minor are redacted, and repeated attempts are flagged for review.
    const redaction = redactContactDetails(trimmed);
    const changed = redaction.redactions.length > 0;

    const message = await this.prisma.$transaction(async (tx) => {
      const created = await tx.message.create({
        data: {
          threadId,
          senderUserId: userId,
          body: redaction.text,
          bodyOriginal: changed ? trimmed : null,
          state: 'visible',
        },
        select: {
          id: true,
          body: true,
          bodyOriginal: true,
          createdAt: true,
          senderUserId: true,
          sender: { select: { fullName: true } },
        },
      });

      /*
       * Attach at send time. The rows already exist — signed, uploaded and
       * scanned — and are claimed here by the message that carries them.
       *
       * `messageId: null` in the filter is the security check: an attachment
       * already bound to another message cannot be re-pointed at this one, so a
       * learner cannot attach a file from somebody else's conversation by
       * supplying its id.
       */
      if (attachmentIds.length > 0) {
        await tx.messageAttachment.updateMany({
          where: { id: { in: attachmentIds }, messageId: null, scanStatus: 'clean' },
          data: { messageId: created.id },
        });
      }

      await tx.messageThread.update({
        where: { id: threadId },
        data: { lastMessageAt: created.createdAt },
      });

      /*
       * FR-SAF-002's second half: repeated attempts are flagged for Admin
       * review. The flag hangs off the teacher because that is the relationship
       * being supervised — a teacher pushing a learner towards WhatsApp is the
       * pattern the requirement exists to catch. The excerpt stored is the
       * *redacted* one; the unredacted original stays on the message, reachable
       * only by a safeguarding officer.
       */
      const { teacherUserId, learnerId } = participant.thread;
      if (changed && teacherUserId) {
        await tx.redactionFlag.create({
          data: {
            teacherId: teacherUserId,
            learnerId,
            kind: toDbRedactionKind(redaction.redactions[0]?.kind),
            excerptRedacted: created.body.slice(0, 500),
          },
        });
      }

      return created;
    });

    return {
      id: message.id,
      mine: true,
      senderName: message.sender.fullName,
      body: message.body,
      redacted: message.bodyOriginal !== null,
      sentAt: message.createdAt.toISOString(),
      attachments: [],
    };
  }
}

/**
 * The shared vocabulary calls it `handle`; the schema enum calls it
 * `social_handle`. One crossing point, so a rename on either side is one edit
 * rather than a hunt.
 */
function toDbRedactionKind(kind: 'phone' | 'email' | 'handle' | undefined) {
  if (kind === 'email') return 'email' as const;
  if (kind === 'handle') return 'social_handle' as const;
  return 'phone' as const;
}

function truncate(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, max - 1)}…`;
}
