import { Injectable } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';
import { AuditService } from '../audit/audit.service';

/**
 * Lessons in progress (§4.10 oversight).
 *
 * An Admin can see every lesson happening right now: who is teaching, what
 * subject, whether it is a private one-to-one or a group class, and who has
 * actually joined.
 *
 * ## Why this is not just another list
 *
 * A one-to-one lesson between an adult and a child is the most sensitive thing
 * this platform does, and this endpoint watches it. The SRS already establishes
 * the principle rather than leaving it to be invented here:
 *
 *   FR-SAF-004 — minors' one-to-one sessions are recorded by default, and
 *                everyone in them is told, at booking and again on joining.
 *   FR-SAF-007 — a learner's details are visible to linked guardians, assigned
 *                teachers and authorised staff. This is the "authorised staff"
 *                branch, and `live:watch` is what authorises it.
 *   FR-RBA-004 — every staff access to a learner's personal data is audited.
 *
 * So: the read is permissioned, and every use of it writes an audit entry
 * naming the watcher and the lessons they saw. Oversight that leaves no trace
 * is indistinguishable from surveillance, and the trail is what makes the
 * difference reviewable.
 *
 * The one thing this deliberately does NOT do is let anyone into the room. It
 * returns metadata — names, subject, counts, timings. Joining a lesson would be
 * a different capability with a different consent story, and it is not this one.
 */
@Injectable()
export class LiveService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /**
   * Everything in progress, plus what is about to start.
   *
   * `startingSoonMinutes` exists because "what is happening" on an operations
   * screen means the next few minutes as well as this one — an admin watching
   * for a lesson that should have begun needs to see it before it is late.
   */
  async current(options: { actorId: string; startingSoonMinutes?: number; audit?: boolean } = { actorId: '' }) {
    const soon = options.startingSoonMinutes ?? 15;
    const now = new Date();
    const horizon = new Date(now.getTime() + soon * 60_000);

    const sessions = await this.prisma.session.findMany({
      where: {
        OR: [
          { status: 'in_progress' },
          { status: 'scheduled', startsAtUtc: { gte: now, lte: horizon } },
        ],
      },
      include: {
        teacher: {
          include: { user: { select: { id: true, fullName: true } } },
        },
        subject: { select: { id: true, code: true, nameEn: true, nameFr: true } },
        learner: {
          select: {
            id: true,
            fullName: true,
            dob: true,
            userId: true,
            level: { select: { nameEn: true, nameFr: true, schoolType: true } },
          },
        },
        cohort: {
          select: {
            id: true,
            name: true,
            level: { select: { nameEn: true, nameFr: true, schoolType: true } },
            members: {
              where: { leftAt: null },
              select: { learner: { select: { id: true, fullName: true, userId: true } } },
            },
          },
        },
        participants: true,
      },
      orderBy: { startsAtUtc: 'asc' },
    });

    const rows = sessions.map((session) => {
      const joinedUserIds = new Set(
        session.participants.filter((p) => p.firstJoinAt && !p.lastLeaveAt).map((p) => p.userId),
      );
      const everJoined = new Set(session.participants.filter((p) => p.firstJoinAt).map((p) => p.userId));

      /**
       * Who is expected, and who is actually in the room.
       *
       * A one-to-one lesson expects one learner; a group class expects its
       * cohort. Both are reported the same shape so the screen does not have to
       * branch, and `present` comes from the media server's join/leave events
       * rather than from the roster (FR-LIV-014).
       */
      const expected =
        session.type === 'one_to_one' && session.learner
          ? [{ learnerId: session.learner.id, fullName: session.learner.fullName, userId: session.learner.userId }]
          : (session.cohort?.members ?? []).map((m) => ({
              learnerId: m.learner.id,
              fullName: m.learner.fullName,
              userId: m.learner.userId,
            }));

      const attendees = expected.map((learner) => ({
        learnerId: learner.learnerId,
        fullName: learner.fullName,
        present: learner.userId ? joinedUserIds.has(learner.userId) : false,
        joined: learner.userId ? everJoined.has(learner.userId) : false,
      }));

      const teacherSeat = session.participants.find((p) => p.userId === session.teacherId);
      const startedAt = teacherSeat?.firstJoinAt ?? session.startsAtUtc;
      const expectedEnd = new Date(session.startsAtUtc.getTime() + session.durationMin * 60_000);
      const elapsedMinutes = Math.max(0, Math.round((now.getTime() - startedAt.getTime()) / 60_000));

      const level = session.learner?.level ?? session.cohort?.level ?? null;

      return {
        sessionId: session.id,
        status: session.status,
        live: session.status === 'in_progress',
        startsAtUtc: session.startsAtUtc,
        startedAt: teacherSeat?.firstJoinAt ?? null,
        durationMin: session.durationMin,
        elapsedMinutes,
        // A lesson still running past its scheduled end is worth seeing: it is
        // usually benign and occasionally is not.
        overrunMinutes: Math.max(0, Math.round((now.getTime() - expectedEnd.getTime()) / 60_000)),
        minutesUntilStart:
          session.status === 'scheduled'
            ? Math.max(0, Math.round((session.startsAtUtc.getTime() - now.getTime()) / 60_000))
            : null,

        /** §4.x: "if it is a private class, the admin should see that it is." */
        type: session.type,
        isPrivate: session.type === 'one_to_one',

        teacher: {
          id: session.teacher.user.id,
          fullName: session.teacher.user.fullName,
          schoolType: session.teacher.schoolType,
          // Present so an admin scanning the list can see at a glance whether a
          // suspended teacher is somehow in a room.
          suspended: Boolean(session.teacher.suspendedAt),
        },
        // The actual subject, not a code.
        subject: session.subject,
        level: level ? { nameEn: level.nameEn, nameFr: level.nameFr, schoolType: level.schoolType } : null,
        cohort: session.cohort ? { id: session.cohort.id, name: session.cohort.name } : null,

        attendees,
        expectedCount: attendees.length,
        presentCount: attendees.filter((a) => a.present).length,
        teacherPresent: session.teacherId ? joinedUserIds.has(session.teacherId) : false,

        // FR-SAF-004: whether this lesson is being recorded, which for a minor's
        // one-to-one it should be.
        recordingEnabled: session.recordingEnabled,
      };
    });

    /**
     * FR-RBA-004: the read is the thing being audited, not just an action taken
     * afterwards. Written once per view with the sessions it covered, so a later
     * question — who was watching that lesson? — has an answer.
     *
     * Skipped for the badge count, which returns a number and no personal data.
     */
    if (options.audit !== false && options.actorId) {
      await this.audit.record({
        action: 'live.viewed',
        entity: 'live_sessions',
        entityId: null,
        actorId: options.actorId,
        after: {
          liveCount: rows.filter((r) => r.live).length,
          sessionIds: rows.filter((r) => r.live).map((r) => r.sessionId),
          privateCount: rows.filter((r) => r.live && r.isPrivate).length,
        },
      });
    }

    return {
      now,
      live: rows.filter((r) => r.live),
      startingSoon: rows.filter((r) => !r.live),
      counts: {
        live: rows.filter((r) => r.live).length,
        private: rows.filter((r) => r.live && r.isPrivate).length,
        group: rows.filter((r) => r.live && !r.isPrivate).length,
        learnersInLesson: rows
          .filter((r) => r.live)
          .reduce((sum, r) => sum + r.presentCount, 0),
      },
    };
  }

  /** §3: the badge. A count of rooms, with nobody's name in it. */
  async liveCount(): Promise<number> {
    return this.prisma.session.count({ where: { status: 'in_progress' } });
  }

  /**
   * The ids of everything live, cheaply.
   *
   * The notifier polls this to spot lessons it has not announced yet, so it must
   * stay a single indexed query — `sessions.status` is indexed for exactly this.
   */
  async liveSessionIds(): Promise<string[]> {
    const rows = await this.prisma.session.findMany({
      where: { status: 'in_progress' },
      select: { id: true },
    });
    return rows.map((r) => r.id);
  }

  /**
   * The one-line summary an admin is notified with when a lesson starts.
   *
   * Deliberately carries the teacher's name and the subject — the brief asks for
   * both — and says whether it is private, but no learner names. A notification
   * is glanceable and may sit on a screen in a shared office; the names are one
   * click away on a screen whose opening is audited.
   */
  async announcement(sessionId: string) {
    const session = await this.prisma.session.findUnique({
      where: { id: sessionId },
      include: {
        teacher: { include: { user: { select: { fullName: true } } } },
        subject: { select: { nameEn: true, nameFr: true } },
      },
    });
    if (!session) return null;

    return {
      sessionId: session.id,
      teacherName: session.teacher.user.fullName,
      subject: { nameEn: session.subject.nameEn, nameFr: session.subject.nameFr },
      isPrivate: session.type === 'one_to_one',
      startedAt: new Date().toISOString(),
      recordingEnabled: session.recordingEnabled,
    };
  }
}
