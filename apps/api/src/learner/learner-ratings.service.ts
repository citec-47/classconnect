import { BadRequestException, ForbiddenException, Injectable } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';
import {
  RATING_EDIT_WINDOW_HOURS,
  type MyRatingDto,
  type RatingSubmissionDto,
} from '@classconnect/shared';

/**
 * Ratings — and the anonymity that is the whole point of them.
 *
 * "The teacher will never know where the rating is coming from" is easy to
 * state and easy to break, because anonymity is not a property of a single
 * field. It is a property of everything the teacher can see at once. A teacher
 * with four learners who is shown "a new 2-star arrived on Tuesday" knows
 * exactly who was in Tuesday's lesson.
 *
 * So the protection is layered, and only the first layer is "don't send the
 * rater id":
 *
 *  1. **No rater identity** in anything teacher-facing. Necessary, insufficient.
 *  2. **No per-rating rows.** A teacher sees an aggregate, never a list. There
 *     is no endpoint that returns individual ratings to a teacher.
 *  3. **No timestamps.** A dated rating in a small class is a named rating.
 *  4. **A count threshold** (FR-RAT-002, default 5). Below it the teacher sees
 *     nothing at all — not a provisional average, nothing — because with two
 *     ratings the arithmetic is trivial to invert.
 *  5. **Comments are moderated before the teacher sees them** (FR-RAT-003),
 *     because a free-text comment deanonymises its author more reliably than
 *     any metadata.
 *
 * Layers 2–5 live on the teacher surface, not here. What this file guarantees
 * is that nothing it writes makes them impossible to honour later.
 */
@Injectable()
export class LearnerRatingsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Rate the teacher assigned to a subject.
   *
   * The brief asks for rating *by subject* rather than by lesson: a learner
   * forms a view of how Chemistry is going, not of how Tuesday went. But the
   * schema anchors a `Review` to a session, which is right — an unanchored
   * rating is a rating nobody can audit or moderate in context.
   *
   * Both hold by resolving the subject to the learner's most recent completed
   * session on it. The learner rates a subject; the record lands on a lesson.
   */
  async submit(
    learnerId: string,
    userId: string,
    input: RatingSubmissionDto,
  ): Promise<{ ok: true }> {
    if (!Number.isInteger(input.stars) || input.stars < 1 || input.stars > 5) {
      throw new BadRequestException({ messageKey: 'errors.rating.stars_range' });
    }

    const assignment = await this.prisma.assignment.findFirst({
      where: {
        learnerId,
        subjectId: input.subjectId,
        teacherId: input.teacherUserId,
        status: 'accepted',
        endedAt: null,
      },
      select: { id: true },
    });

    // FR-RBA-003: you may rate the teacher you were actually assigned. Without
    // this a learner could rate any teacher on the platform by guessing an id.
    if (!assignment) {
      throw new ForbiddenException({ messageKey: 'errors.rating.not_your_teacher' });
    }

    const session = input.sessionId
      ? await this.prisma.session.findFirst({
          where: {
            id: input.sessionId,
            subjectId: input.subjectId,
            teacherId: input.teacherUserId,
            OR: [{ learnerId }, { cohort: { members: { some: { learnerId } } } }],
          },
          select: { id: true },
        })
      : await this.prisma.session.findFirst({
          where: {
            subjectId: input.subjectId,
            teacherId: input.teacherUserId,
            status: { in: ['completed', 'no_show_learner'] },
            OR: [{ learnerId }, { cohort: { members: { some: { learnerId } } } }],
          },
          orderBy: { startsAtUtc: 'desc' },
          select: { id: true },
        });

    // FR-RAT-001 rates a completed session. Nothing has happened yet to rate.
    if (!session) {
      throw new BadRequestException({ messageKey: 'errors.rating.no_completed_session' });
    }

    await this.prisma.review.upsert({
      where: { sessionId_raterId: { sessionId: session.id, raterId: userId } },
      create: {
        sessionId: session.id,
        raterId: userId,
        teacherId: input.teacherUserId,
        stars: input.stars,
        comment: input.comment?.trim() || null,
        // FR-RAT-003: a comment reaches nobody until it has been screened for
        // abuse and for personal data. Stars alone need no moderation, but the
        // row carries one status, so the stricter of the two governs.
        moderationStatus: input.comment?.trim() ? 'pending' : 'approved',
      },
      update: {
        stars: input.stars,
        comment: input.comment?.trim() || null,
        moderationStatus: input.comment?.trim() ? 'pending' : 'approved',
      },
    });

    return { ok: true };
  }

  /**
   * The learner's own ratings.
   *
   * They may see what they said and change their mind briefly. Note this is the
   * *only* endpoint in the system that returns an individual rating row, and it
   * returns it to its author. There is no teacher-facing equivalent, which is
   * layer 2 above holding by absence.
   */
  async mine(learnerId: string, userId: string, language: 'en' | 'fr'): Promise<MyRatingDto[]> {
    void learnerId;
    const reviews = await this.prisma.review.findMany({
      where: { raterId: userId },
      select: {
        stars: true,
        comment: true,
        createdAt: true,
        teacher: {
          select: { userId: true, user: { select: { fullName: true } } },
        },
        session: {
          select: {
            subject: { select: { id: true, nameEn: true, nameFr: true } },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    const cutoff = Date.now() - RATING_EDIT_WINDOW_HOURS * 60 * 60_000;

    return reviews.map((review) => ({
      subject: {
        id: review.session.subject.id,
        name: language === 'fr' ? review.session.subject.nameFr : review.session.subject.nameEn,
      },
      teacher: {
        id: review.teacher.userId,
        displayName: review.teacher.user.fullName,
      },
      stars: review.stars,
      comment: review.comment,
      ratedAt: review.createdAt.toISOString(),
      editable: review.createdAt.getTime() > cutoff,
    }));
  }
}
