import { Injectable } from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import type { ChatSessionStatus } from '@prisma/client';
import { PrismaService } from '../common/prisma.service';
import { AppError } from '../common/http-exception.filter';
import type { AuthenticatedUser } from '../rbac/decorators';

/**
 * Live chat with visitors — people who have no account and may never get one.
 *
 * ## How sessions stay separate
 *
 * Not by care taken at the call sites. Every visitor-facing method takes a
 * `visitorToken` and resolves the session *from* it, so there is no method here
 * that accepts a session id from a visitor at all. Two visitors cannot reach
 * each other's conversation because neither can name it: the only handle they
 * hold is a secret that resolves to exactly one row.
 *
 * That is what "no cross-session interference" has to mean to be worth
 * asserting. A design where the client sends a session id and the server checks
 * it is one forgotten check away from leaking a stranger's conversation; this
 * one has no check to forget.
 *
 * ## The token is a credential
 *
 * 32 random bytes, unique, stored on the session and never returned to staff.
 * The session `id` is a separate value, safe to show on a dashboard, and useless
 * for reading the chat. Had the id doubled as the key — as the brief sketched —
 * an id an admin reads over somebody's shoulder would open that conversation.
 *
 * ## What limits abuse
 *
 * An endpoint any stranger can post to needs a bound that does not depend on
 * them behaving. Sessions per IP per hour, and messages per session, are both
 * counted in the database rather than in memory: `ThrottlerModule` keeps its
 * counters per instance, and a limit that resets when a process restarts is not
 * a limit.
 */

/** Enough that a real conversation never hits it; small enough to bound a flood. */
const MAX_MESSAGES_PER_SESSION = 500;
/** One person opening the widget a few times is normal. Fifty is not a person. */
const MAX_SESSIONS_PER_IP_PER_HOUR = 10;
const MAX_BODY_LENGTH = 4_000;

@Injectable()
export class VisitorChatService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Resolves a visitor's secret to their session, or refuses.
   *
   * `notFound` rather than `forbidden` for a token that does not match: a
   * distinct "that session exists but is not yours" would confirm that a guessed
   * token was close to a real one.
   */
  private async sessionFor(visitorToken: string) {
    const session = await this.prisma.chatSession.findUnique({
      where: { visitorToken },
      select: { id: true, status: true },
    });
    if (!session) throw AppError.notFound();
    return session;
  }

  /**
   * Opening the widget.
   *
   * Creates a session even before the first message, because the queue wants to
   * show "somebody is here and has not been answered" — `waiting` is that state,
   * and a session that only appeared on first send would hide a visitor who
   * opened the chat and hesitated.
   */
  async createSession(input: {
    visitorName?: string;
    visitorEmail?: string;
    visitorIp?: string;
  }) {
    if (input.visitorIp) {
      const since = new Date(Date.now() - 3_600_000);
      const recent = await this.prisma.chatSession.count({
        where: { visitorIp: input.visitorIp, createdAt: { gte: since } },
      });
      if (recent >= MAX_SESSIONS_PER_IP_PER_HOUR) {
        throw AppError.tooManyRequests('errors.chat.too_many_sessions');
      }
    }

    const session = await this.prisma.chatSession.create({
      data: {
        visitorToken: randomBytes(32).toString('base64url'),
        visitorName: input.visitorName?.slice(0, 120) || null,
        visitorEmail: input.visitorEmail?.slice(0, 320) || null,
        visitorIp: input.visitorIp ?? null,
        status: 'waiting',
      },
      select: { id: true, visitorToken: true, status: true, createdAt: true },
    });

    /*
     * The token goes back exactly once, here, and the widget keeps it. It is
     * never included in any later response — a reply that echoed it would put a
     * credential into every poll.
     */
    return {
      sessionId: session.id,
      visitorToken: session.visitorToken,
      status: session.status,
      createdAt: session.createdAt.toISOString(),
    };
  }

  /** The visitor's own conversation, and nobody else's. */
  async visitorMessages(visitorToken: string) {
    const session = await this.sessionFor(visitorToken);

    const [messages] = await Promise.all([
      this.prisma.chatMessage.findMany({
        where: { sessionId: session.id },
        orderBy: { createdAt: 'asc' },
        take: MAX_MESSAGES_PER_SESSION,
      }),
      // Opening the conversation is what marks it read, so the widget's own
      // badge clears without a second call.
      this.prisma.chatSession.update({
        where: { id: session.id },
        data: { visitorReadAt: new Date() },
      }),
    ]);

    return {
      status: session.status,
      messages: messages.map((row) => this.toDto(row)),
    };
  }

  async visitorSend(visitorToken: string, body: string) {
    const session = await this.sessionFor(visitorToken);
    /*
     * A closed session is read-only rather than gone.
     *
     * The visitor keeps their history — losing the conversation the moment it is
     * resolved is how somebody ends up re-explaining the whole thing — but
     * cannot reopen it by typing. Starting again makes a new session, which is
     * what the queue needs to see anyway.
     */
    if (session.status === 'closed') throw AppError.conflict('errors.chat.closed');

    return this.append(session.id, 'visitor', null, body);
  }

  // -------------------------------------------------------------------------
  // The desk
  // -------------------------------------------------------------------------

  /**
   * The queue.
   *
   * Waiting first, then active, oldest activity first inside each — the person
   * who has been waiting longest is the person to answer, and sorting by newest
   * would bury them under every fresh arrival.
   */
  async queue(filter: 'open' | 'waiting' | 'active' | 'closed' = 'open') {
    /*
     * "Open" is the desk's working set — waiting and active together — because
     * a queue split by whether somebody has replied yet is two lists to watch
     * for one job.
     */
    const status: ChatSessionStatus[] =
      filter === 'open' ? ['waiting', 'active'] : [filter];

    const sessions = await this.prisma.chatSession.findMany({
      where: { status: { in: status } },
      orderBy: [{ status: 'asc' }, { lastMessageAt: 'asc' }],
      take: 200,
      include: {
        assignee: { select: { id: true, fullName: true } },
        messages: { orderBy: { createdAt: 'desc' }, take: 1 },
      },
    });

    /*
     * Unread counted per session in one query rather than one query per session.
     *
     * A desk with forty open chats would otherwise make forty round trips to a
     * database in another region before the list could render.
     */
    const unread = await this.prisma.chatMessage.groupBy({
      by: ['sessionId'],
      where: {
        sender: 'visitor',
        sessionId: { in: sessions.map((s) => s.id) },
        OR: sessions.map((s) => ({
          sessionId: s.id,
          ...(s.staffReadAt ? { createdAt: { gt: s.staffReadAt } } : {}),
        })),
      },
      _count: { _all: true },
    });
    const unreadBySession = new Map(unread.map((row) => [row.sessionId, row._count._all]));

    return sessions.map((session) => ({
      id: session.id,
      // Never the token. A dashboard is a screen other people can see.
      visitorName: session.visitorName,
      visitorEmail: session.visitorEmail,
      status: session.status,
      assignee: session.assignee
        ? { id: session.assignee.id, displayName: session.assignee.fullName }
        : null,
      lastMessageAt: session.lastMessageAt?.toISOString() ?? null,
      /** First line only: a preview is for choosing, not for reading. */
      preview: session.messages[0]?.body.slice(0, 140) ?? null,
      unread: unreadBySession.get(session.id) ?? 0,
      createdAt: session.createdAt.toISOString(),
    }));
  }

  /** One conversation, and marking it read in the same call. */
  async staffMessages(sessionId: string) {
    const session = await this.prisma.chatSession.findUnique({
      where: { id: sessionId },
      select: { id: true, status: true, visitorName: true, visitorEmail: true },
    });
    if (!session) throw AppError.notFound();

    const [messages] = await Promise.all([
      this.prisma.chatMessage.findMany({
        where: { sessionId },
        orderBy: { createdAt: 'asc' },
        take: MAX_MESSAGES_PER_SESSION,
      }),
      this.prisma.chatSession.update({
        where: { id: sessionId },
        data: { staffReadAt: new Date() },
      }),
    ]);

    return {
      id: session.id,
      visitorName: session.visitorName,
      visitorEmail: session.visitorEmail,
      status: session.status,
      messages: messages.map((row) => this.toDto(row)),
    };
  }

  /**
   * Replying.
   *
   * Answering takes the session: `waiting` becomes `active` and the replier is
   * recorded as the assignee if nobody was. Assignment is advisory and does not
   * lock anyone out — a desk where one person's absence blocks a queue is worse
   * than one where two people occasionally answer together.
   */
  async staffSend(user: AuthenticatedUser, sessionId: string, body: string) {
    const session = await this.prisma.chatSession.findUnique({
      where: { id: sessionId },
      select: { id: true, status: true, assignedTo: true },
    });
    if (!session) throw AppError.notFound();
    if (session.status === 'closed') throw AppError.conflict('errors.chat.closed');

    const message = await this.append(sessionId, 'staff', user.id, body);

    await this.prisma.chatSession.update({
      where: { id: sessionId },
      data: {
        status: 'active',
        assignedTo: session.assignedTo ?? user.id,
        // Staff have by definition read everything up to their own reply.
        staffReadAt: new Date(),
      },
    });

    return message;
  }

  async close(user: AuthenticatedUser, sessionId: string) {
    const session = await this.prisma.chatSession.findUnique({
      where: { id: sessionId },
      select: { id: true, status: true },
    });
    if (!session) throw AppError.notFound();
    if (session.status === 'closed') return { status: 'closed' as const };

    await this.prisma.chatSession.update({
      where: { id: sessionId },
      data: { status: 'closed', closedAt: new Date(), closedBy: user.id },
    });
    return { status: 'closed' as const };
  }

  // -------------------------------------------------------------------------

  /** The one place a message is written, so both sides cannot drift apart. */
  private async append(
    sessionId: string,
    sender: 'visitor' | 'staff',
    senderId: string | null,
    body: string,
  ) {
    const text = body.trim();
    if (!text) throw AppError.badRequest('errors.chat.empty');

    const count = await this.prisma.chatMessage.count({ where: { sessionId } });
    if (count >= MAX_MESSAGES_PER_SESSION) {
      throw AppError.tooManyRequests('errors.chat.too_long');
    }

    const now = new Date();
    const message = await this.prisma.chatMessage.create({
      data: { sessionId, sender, senderId, body: text.slice(0, MAX_BODY_LENGTH) },
    });

    // Denormalised for the queue's sort and preview.
    await this.prisma.chatSession.update({
      where: { id: sessionId },
      data: { lastMessageAt: now },
    });

    return this.toDto(message);
  }

  private toDto(row: {
    id: string;
    sender: 'visitor' | 'staff';
    body: string;
    fileName: string | null;
    storageKey: string | null;
    mimeType: string | null;
    sizeBytes: number | null;
    scanStatus: string | null;
    createdAt: Date;
  }) {
    return {
      id: row.id,
      sender: row.sender,
      body: row.body,
      /*
       * The attachment, described but never linked.
       *
       * FR-FIL-003: the download is a separate signed request that re-checks the
       * scan at that moment. `scanStatus` travels so the screen can say "still
       * being checked" — which, with no scanner configured, is the permanent and
       * correct answer rather than a dead link.
       */
      file: row.storageKey
        ? {
            name: row.fileName,
            mimeType: row.mimeType,
            sizeBytes: row.sizeBytes,
            scanStatus: row.scanStatus,
          }
        : null,
      createdAt: row.createdAt.toISOString(),
    };
  }
}
