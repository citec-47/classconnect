import { Injectable } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';
import { AppError } from '../common/http-exception.filter';
import { RecordingStorageService } from '../files/recording-storage.service';
import { hasPermission } from '@classconnect/shared';
import type { AuthenticatedUser } from '../rbac/decorators';

/** Which guest list a recording inherits, derived from the lesson it came from. */
export type RecordingScope = 'class' | 'group' | 'one-to-one' | 'invite';

/**
 * Who may watch a lesson back, decided on the server every time.
 *
 * ## One file, many audiences
 *
 * A recording is stored once, against its session, and reached from wherever it
 * needs to appear. Copying it per class would multiply a room full of children
 * across the bucket and leave the copies to be forgotten separately — the thing
 * a deletion request must never run into.
 *
 * ## The scope is derived, not stored
 *
 * A lesson already carries what decides its audience, so a fourth column saying
 * the same thing could only ever disagree with it:
 *
 * - a timetable slot and a cohort → a class lesson
 * - a cohort and no slot          → a teacher's group
 * - a named learner              → a one-to-one
 * - neither                      → an invited call
 *
 * ## Attendance is not entitlement
 *
 * A class lesson is visible to the students of that class who offer the
 * subject, whether or not they came. Missing the lesson is the reason to want
 * the recording, and gating on attendance would deny it to exactly the child
 * who was ill that morning.
 */
@Injectable()
export class RecordingsService {


  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: RecordingStorageService,
  ) {}

  /**
   * Every recording this user is entitled to, newest first.
   *
   * The entitlement is expressed as a database filter rather than fetched and
   * sieved in memory: a list that is filtered after the fact is one refactor
   * away from being returned unfiltered, and the rows are children's lessons.
   */
  async forUser(user: AuthenticatedUser) {
    const isAdmin = this.isAdmin(user);

    const where = isAdmin ? {} : { session: await this.visibilityFilter(user) };

    const recordings = await this.prisma.recording.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: 200,
      select: {
        id: true,
        durationSec: true,
        sizeBytes: true,
        createdAt: true,
        availableUntil: true,
        session: {
          select: {
            id: true,
            startsAtUtc: true,
            type: true,
            timetableSlotId: true,
            teacherId: true,
            subject: { select: { id: true, nameEn: true, nameFr: true } },
            cohort: { select: { id: true, name: true } },
            learner: { select: { id: true, fullName: true } },
          },
        },
      },
    });

    return {
      recordings: recordings.map((r: (typeof recordings)[number]) => ({
        id: r.id,
        sessionId: r.session.id,
        scope: this.scopeOf(r.session),
        subject: r.session.subject,
        cohort: r.session.cohort,
        startedAt: r.session.startsAtUtc.toISOString(),
        durationSec: r.durationSec,
        sizeBytes: r.sizeBytes === null ? null : Number(r.sizeBytes),
        availableUntil: r.availableUntil.toISOString(),
      })),
    };
  }

  /**
   * A signed, expiring link — after the same check the list ran.
   *
   * Re-checked here rather than trusting that the id came from a list this user
   * was shown. A recording id in someone's hands is not permission, and the
   * direct link is precisely how a child in the wrong class would arrive.
   */
  async playbackUrl(user: AuthenticatedUser, recordingId: string) {
    const where = this.isAdmin(user)
      ? { id: recordingId }
      : { id: recordingId, session: await this.visibilityFilter(user) };

    const recording = await this.prisma.recording.findFirst({
      where,
      select: { id: true, storageKey: true, availableUntil: true },
    });

    /*
     * Not found, not forbidden.
     *
     * A 403 would confirm the recording exists to somebody with no business
     * knowing it does. 404 tells them exactly as much as they are entitled to.
     */
    if (!recording) throw AppError.notFound();

    const url = this.storage.signedUrl(recording.storageKey);
    if (!url) {
      /*
       * Said plainly rather than handing back a link that plays nothing. A
       * broken player sends a teacher to their own network and their own
       * browser; this names the real state of affairs.
       */
      throw AppError.serviceUnavailable('errors.recording.storage_unavailable');
    }

    return { url, expiresInSeconds: RecordingStorageService.TTL_SECONDS };
  }

  /**
   * Removes a recording, file first.
   *
   * Admin-only, enforced by the caller's permission and again here. The object
   * goes before the row: the other order leaves a file nobody has a record of,
   * which is a recording of children that no longer appears in any list and
   * therefore never gets deleted.
   */
  async remove(user: AuthenticatedUser, recordingId: string) {
    if (!this.isAdmin(user)) throw AppError.forbidden('errors.forbidden');

    const recording = await this.prisma.recording.findFirst({
      where: { id: recordingId },
      select: { id: true, storageKey: true, legalHold: true },
    });
    if (!recording) throw AppError.notFound();

    /* §5.5: a safeguarding or dispute hold outranks an admin's delete. */
    if (recording.legalHold) throw AppError.forbidden('errors.recording.legal_hold');

    const gone = await this.storage.remove(recording.storageKey);
    if (!gone) throw AppError.serviceUnavailable('errors.recording.delete_failed');

    await this.prisma.recording.delete({ where: { id: recordingId } });
    return { deleted: true };
  }

  /**
   * The session-level filter expressing every rule at once.
   *
   * Built as one `OR` so that a caller cannot accidentally apply half of it,
   * and so the database does the excluding.
   */
  private async visibilityFilter(user: AuthenticatedUser) {
    const learnerId = await this.learnerIdFor(user.id);

    const clauses: Record<string, unknown>[] = [
      /* The teacher who taught it, in every category. */
      { teacherId: user.id },
      /* Invited calls: exactly the people invited, and only while invited. */
      { invites: { some: { userId: user.id, revokedAt: null } } },
    ];

    if (learnerId) {
      clauses.push(
        /* A one-to-one belongs to the learner it was taught to. */
        { learnerId },
        /*
         * A class lesson: in the class *and* offering the subject.
         *
         * Both halves matter. Membership alone would show a maths lesson to a
         * classmate who does not take maths, which the brief rules out
         * explicitly and which is also simply wrong.
         */
        {
          timetableSlotId: { not: null },
          cohort: { members: { some: { learnerId } } },
          subject: { learnerSubjects: { some: { learnerId } } },
        },
        /*
         * A group session: membership is the whole test.
         *
         * A group is a set of people a teacher assembled, not a subject
         * enrolment, so asking whether they "offer" it would exclude the
         * members it was made for.
         */
        {
          timetableSlotId: null,
          cohort: { members: { some: { learnerId } } },
        },
      );
    }

    return { OR: clauses };
  }

  private scopeOf(session: {
    timetableSlotId: string | null;
    cohort: { id: string } | null;
    learner: { id: string } | null;
  }): RecordingScope {
    if (session.learner) return 'one-to-one';
    if (!session.cohort) return 'invite';
    return session.timetableSlotId ? 'class' : 'group';
  }

  /** Most learners are registered by an administrator and have no login at all. */
  private async learnerIdFor(userId: string): Promise<string | null> {
    const learner = await this.prisma.learner.findFirst({
      where: { userId },
      select: { id: true },
    });
    return learner?.id ?? null;
  }

  /**
   * "Admin" here means the permission, not a role name.
   *
   * There is no `admin` role on this platform — there are `super_admin`,
   * `admin_ops` and `admin_finance` — and listing them by hand is how a fourth
   * one gets added later and silently sees nothing. `recording:delete` is held
   * by the administrator alone, so asking for it answers both questions this
   * class needs: who may see every recording, and who may remove one.
   */
  private isAdmin(user: AuthenticatedUser): boolean {
    return hasPermission(user.roles, 'recording:delete');
  }
}
