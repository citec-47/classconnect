import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';
import { LearnerMessagingService } from '../learner/learner-messaging.service';
import type { Language, TeacherThreadSummaryDto, TeacherCounterpartRole } from '@classconnect/shared';

/**
 * The teacher's inbox.
 *
 * ## What is reused, and why sending is not rewritten
 *
 * `LearnerMessagingService.thread` and `.send` are keyed on the caller being a
 * `ThreadParticipant` and on nothing else — no role check, no learner id. A
 * teacher is a participant in their own threads, so both work unchanged, and
 * reusing them keeps one copy of the things that must not be got twice:
 * FR-SAF-002 redaction, the append-only write, the attachment claim that refuses
 * a file already bound to another message, and the `RedactionFlag` that fires
 * when a teacher tries to move a child onto WhatsApp.
 *
 * That flag is the sharpest reason not to write a second `send`. It hangs off
 * `thread.teacherUserId` — so when the sender *is* the teacher, the supervision
 * the requirement exists for is exactly what happens. A parallel teacher-side
 * send would have been the obvious place for it to be quietly missing.
 *
 * What is new here is the listing, because the labels differ: on the learner's
 * screen the counterpart is a teacher or support; on this one it is a learner, a
 * guardian, or ClassConnect.
 */
@Injectable()
export class TeacherMessagingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly messaging: LearnerMessagingService,
  ) {}

  async threads(teacherUserId: string, language: Language): Promise<TeacherThreadSummaryDto[]> {
    const threads = await this.prisma.messageThread.findMany({
      where: { participants: { some: { userId: teacherUserId } } },
      select: {
        id: true,
        kind: true,
        subjectId: true,
        lastMessageAt: true,
        learner: { select: { fullName: true } },
        participants: {
          select: { userId: true, lastReadAt: true, user: { select: { fullName: true } } },
        },
        messages: {
          where: { state: 'visible' },
          orderBy: { createdAt: 'desc' },
          take: 1,
          select: { body: true, createdAt: true },
        },
      },
      orderBy: { lastMessageAt: 'desc' },
      take: 200,
    });

    if (threads.length === 0) return [];

    const subjectNames = await this.subjectNames(
      threads.map((thread) => thread.subjectId),
      language,
    );

    /*
     * Unread derived, never stored — the same rule as the learner's inbox. A
     * stored counter drifts the first time a write fails halfway, and then has to
     * be reconciled against the messages anyway.
     */
    const unread = await this.prisma.message.groupBy({
      by: ['threadId'],
      where: {
        threadId: { in: threads.map((thread) => thread.id) },
        state: 'visible',
        senderUserId: { not: teacherUserId },
        OR: threads.map((thread) => ({
          threadId: thread.id,
          createdAt: {
            gt:
              thread.participants.find((p) => p.userId === teacherUserId)?.lastReadAt ??
              new Date(0),
          },
        })),
      },
      _count: { _all: true },
    });
    const unreadByThread = new Map(unread.map((row) => [row.threadId, row._count?._all ?? 0]));

    return threads.map((thread) => {
      const last = thread.messages[0] ?? null;
      const other = thread.participants.find((p) => p.userId !== teacherUserId);
      const role = counterpartRole(thread.kind);
      const subjectName = thread.subjectId ? subjectNames.get(thread.subjectId) : undefined;

      return {
        threadId: thread.id,
        /*
         * A support thread is named for the platform, not for whoever happens to
         * have replied. An agent joins on their first reply, so before that there
         * is no name to show — and after it, the teacher is talking to
         * ClassConnect rather than to a particular colleague.
         */
        counterpartName:
          role === 'admin'
            ? 'ClassConnect'
            : (other?.user.fullName ?? thread.learner?.fullName ?? ''),
        counterpartRole: role,
        subject:
          thread.subjectId && subjectName ? { id: thread.subjectId, name: subjectName } : null,
        lastMessageAt: thread.lastMessageAt?.toISOString() ?? null,
        lastMessagePreview: last ? truncate(last.body, 90) : null,
        unreadCount: unreadByThread.get(thread.id) ?? 0,
      };
    });
  }

  /** One conversation. Participant-scoped by the shared service. */
  async thread(threadId: string, teacherUserId: string, language: Language) {
    const thread = await this.messaging.thread(threadId, teacherUserId, language);
    const kind = await this.prisma.messageThread.findUnique({
      where: { id: threadId },
      select: { kind: true },
    });

    return {
      ...thread,
      // The shared DTO labels every non-support thread 'teacher', which is right
      // on the learner's screen and wrong on this one.
      counterpartRole: counterpartRole(kind?.kind ?? 'learner_teacher'),
    };
  }

  /** Reuses the learner service's send — see the class comment. */
  async send(threadId: string, teacherUserId: string, body: string, attachmentIds: string[]) {
    return this.messaging.send(threadId, teacherUserId, body, attachmentIds);
  }

  /**
   * The brief's "with the admin as default": one thread to ClassConnect, opened
   * on demand and reused for ever afterwards.
   *
   * Idempotent by design. A teacher who taps Message ClassConnect twice gets the
   * same conversation, not a second one — the alternative is an inbox of empty
   * threads and an agent who cannot tell which one carries the history.
   */
  async openSupportThread(teacherUserId: string) {
    const existing = await this.prisma.messageThread.findFirst({
      where: {
        kind: 'teacher_support',
        teacherUserId,
      },
      select: { id: true },
    });
    if (existing) return { threadId: existing.id, created: false };

    const teacher = await this.prisma.teacher.findUnique({
      where: { userId: teacherUserId },
      select: { userId: true },
    });
    if (!teacher) throw new NotFoundException({ messageKey: 'errors.not_found' });

    /*
     * `learnerId` stays null, and that is the point of the separate thread kind.
     *
     * A `learner_support` thread is about a child and reaches the safeguarding
     * surfaces that follow from that. A teacher asking about a payout is not a
     * safeguarding matter, and putting it in the same queue would dilute one that
     * exists to be small.
     */
    const thread = await this.prisma.messageThread.create({
      data: {
        kind: 'teacher_support',
        teacherUserId,
        participants: { create: { userId: teacherUserId, mayPost: true } },
      },
      select: { id: true },
    });

    return { threadId: thread.id, created: true };
  }

  /**
   * `MessageThread.subjectId` is a bare column with no relation declared, so the
   * name cannot be joined. One query for the page rather than one per thread, and
   * nulls dropped first so an inbox of support threads makes no query at all.
   */
  private async subjectNames(
    ids: (string | null)[],
    language: Language,
  ): Promise<Map<string, string>> {
    const unique = [...new Set(ids.filter((id): id is string => Boolean(id)))];
    if (unique.length === 0) return new Map();

    const subjects = await this.prisma.subject.findMany({
      where: { id: { in: unique } },
      select: { id: true, nameEn: true, nameFr: true },
    });
    return new Map(
      subjects.map((s) => [s.id, language === 'fr' ? s.nameFr : s.nameEn]),
    );
  }
}

function counterpartRole(kind: string): TeacherCounterpartRole {
  if (kind === 'teacher_support' || kind === 'learner_support') return 'admin';
  if (kind === 'guardian_teacher') return 'guardian';
  return 'learner';
}

function truncate(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, max - 1)}…`;
}
