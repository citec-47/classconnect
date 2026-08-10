import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';
import { redactContactDetails } from '@classconnect/shared';

/**
 * The staff side of messaging.
 *
 * Students could already write to ClassConnect help; until now nobody could
 * read it. This closes that loop.
 *
 * Two things are deliberately narrower than an admin might expect.
 *
 * **Staff see support threads, not teacher threads.** A conversation between a
 * learner and their teacher is supervised, not surveilled: FR-SAF-003 gives the
 * *guardian* full sight of it, and FR-RBA-004 requires every staff read of a
 * learner's personal data to be logged and justified. Opening every thread to
 * anyone on the operations team by default would make that logging meaningless.
 * Safeguarding staff reach teacher threads through the safeguarding queue,
 * which records who looked and why.
 *
 * **Redaction runs on staff messages too.** It is tempting to exempt staff —
 * they are the people a learner is supposed to trust — but an exemption is
 * exactly what an account compromise or a rogue account would use. The rule is
 * about the channel, not about who is typing.
 */
@Injectable()
export class AdminMessagingService {
  constructor(private readonly prisma: PrismaService) {}

  /** Support threads, newest activity first, with an unanswered flag. */
  async inbox(query?: string) {
    const threads = await this.prisma.messageThread.findMany({
      where: { kind: 'learner_support' },
      select: {
        id: true,
        lastMessageAt: true,
        createdAt: true,
        learner: {
          select: {
            id: true,
            fullName: true,
            level: { select: { nameEn: true, nameFr: true } },
          },
        },
        messages: {
          where: { state: 'visible' },
          orderBy: { createdAt: 'desc' },
          take: 1,
          select: { body: true, senderUserId: true, createdAt: true },
        },
        participants: { select: { userId: true } },
      },
      orderBy: { lastMessageAt: 'desc' },
      take: 200,
    });

    const staffIds = new Set(
      (
        await this.prisma.userRole.findMany({
          where: { role: { in: ['support_agent', 'admin_ops', 'super_admin'] } },
          select: { userId: true },
        })
      ).map((row) => row.userId),
    );

    const needle = query?.trim().toLowerCase();

    return threads
      .map((thread) => {
        const last = thread.messages[0] ?? null;
        return {
          threadId: thread.id,
          learnerId: thread.learner?.id ?? null,
          learnerName: thread.learner?.fullName ?? null,
          levelEn: thread.learner?.level?.nameEn ?? null,
          levelFr: thread.learner?.level?.nameFr ?? null,
          lastMessageAt: (thread.lastMessageAt ?? thread.createdAt).toISOString(),
          preview: last ? last.body.slice(0, 120) : null,
          // The only sort that matters to an agent: has anyone replied yet.
          awaitingStaff: last ? !staffIds.has(last.senderUserId) : false,
        };
      })
      .filter(
        (row) =>
          !needle ||
          (row.learnerName?.toLowerCase().includes(needle) ?? false) ||
          (row.preview?.toLowerCase().includes(needle) ?? false),
      );
  }

  async thread(threadId: string, language: 'en' | 'fr') {
    void language;
    const thread = await this.prisma.messageThread.findFirst({
      where: { id: threadId, kind: 'learner_support' },
      select: {
        id: true,
        learner: { select: { id: true, fullName: true } },
        messages: {
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

    return {
      threadId: thread.id,
      learnerName: thread.learner?.fullName ?? null,
      messages: thread.messages.map((message) => ({
        id: message.id,
        senderName: message.sender.fullName,
        senderUserId: message.senderUserId,
        body: message.body,
        redacted: message.bodyOriginal !== null,
        sentAt: message.createdAt.toISOString(),
        attachments: message.attachments.map((attachment) => ({
          id: attachment.id,
          fileName: attachment.fileName,
          mimeType: attachment.mimeType,
          sizeBytes: attachment.sizeBytes,
          scanStatus: attachment.scanStatus,
          durationSec: attachment.durationSec,
        })),
      })),
    };
  }

  /**
   * Reply as ClassConnect.
   *
   * The agent joins the thread on first reply rather than being pre-seeded into
   * every support conversation, so `thread_participants` stays an accurate
   * record of who actually handled it.
   */
  async reply(threadId: string, staffUserId: string, body: string, attachmentIds: string[] = []) {
    const thread = await this.prisma.messageThread.findFirst({
      where: { id: threadId, kind: 'learner_support' },
      select: { id: true, safeguardingHold: true },
    });
    if (!thread) throw new NotFoundException({ messageKey: 'errors.thread.not_found' });

    const trimmed = body.trim();
    // A reply may be a file alone — a marked-up PDF often is.
    if (!trimmed && attachmentIds.length === 0) {
      throw new ForbiddenException({ messageKey: 'errors.message.empty' });
    }

    // FR-SAF-002 applies to staff as well. An exemption is what a compromised
    // account would use, and the rule is about the channel, not the typist.
    const redaction = redactContactDetails(trimmed);

    const created = await this.prisma.$transaction(async (tx) => {
      await tx.threadParticipant.upsert({
        where: { threadId_userId: { threadId, userId: staffUserId } },
        create: { threadId, userId: staffUserId, mayPost: true },
        update: {},
      });

      const message = await tx.message.create({
        data: {
          threadId,
          senderUserId: staffUserId,
          body: redaction.text,
          bodyOriginal: redaction.redactions.length > 0 ? trimmed : null,
          state: 'visible',
        },
        select: { id: true, body: true, createdAt: true },
      });

      /*
       * `messageId: null` in the filter is the security check: an attachment
       * already bound to another message cannot be re-pointed at this one.
       */
      if (attachmentIds.length > 0) {
        await tx.messageAttachment.updateMany({
          where: { id: { in: attachmentIds }, messageId: null, scanStatus: 'clean' },
          data: { messageId: message.id },
        });
      }

      await tx.messageThread.update({
        where: { id: threadId },
        data: { lastMessageAt: message.createdAt },
      });

      return message;
    });

    return {
      id: created.id,
      body: created.body,
      sentAt: created.createdAt.toISOString(),
    };
  }
}
