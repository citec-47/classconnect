import { ForbiddenException, Injectable } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';
import type { MessageContactDto } from '@classconnect/shared';

/**
 * Who a learner may start a conversation with.
 *
 * This file is the answer to "let the student search for someone to message",
 * and the answer is narrower than the question. Three groups were asked for —
 * teachers, other students, admin. Two are here.
 *
 * **Other learners are not, and cannot be.** FR-SAF-008 removes
 * learner-to-learner messaging from v1.0 entirely, and FR-SAF-007 keeps a
 * minor's name off any surface another user can see. A search box that returns
 * children's names to another child breaches both in one control, and it is the
 * precise mechanism by which contact between minors gets initiated. There is no
 * `ThreadKind` that could carry such a thread either, so this is not a check
 * that could be relaxed later by deleting a condition — the concept does not
 * exist in the model.
 *
 * What *is* here does the useful part of the job: a learner no longer waits for
 * a teacher to write first. They can open a thread with a teacher who is
 * actually assigned to them, or with support, at any time.
 *
 * Note what "search" means here. It filters a list the learner is already
 * entitled to see — their own three or four teachers — rather than querying a
 * population. That distinction is the whole safety property.
 */
@Injectable()
export class LearnerContactsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(
    learnerId: string,
    userId: string,
    language: 'en' | 'fr',
    query?: string,
  ): Promise<MessageContactDto[]> {
    const assignments = await this.prisma.assignment.findMany({
      where: { learnerId, status: 'accepted', endedAt: null },
      select: {
        subjectId: true,
        teacher: {
          select: {
            userId: true,
            user: { select: { fullName: true, status: true } },
          },
        },
        subject: { select: { id: true, nameEn: true, nameFr: true } },
      },
    });

    const threads = await this.prisma.messageThread.findMany({
      where: { participants: { some: { userId } } },
      select: { id: true, kind: true, teacherUserId: true, subjectId: true },
    });

    const threadFor = (teacherUserId: string | null, subjectId: string | null) =>
      threads.find(
        (thread) =>
          thread.teacherUserId === teacherUserId &&
          (subjectId === null || thread.subjectId === subjectId),
      )?.id ?? null;

    const contacts: MessageContactDto[] = assignments
      // A suspended teacher is not reachable. FR-TVR-009 cancels their sessions;
      // leaving a live message channel open would defeat the point of it.
      .filter((assignment) => assignment.teacher.user.status !== 'suspended')
      .map((assignment) => ({
        id: assignment.teacher.userId,
        displayName: assignment.teacher.user.fullName,
        kind: 'teacher' as const,
        subject: {
          id: assignment.subject.id,
          name: language === 'fr' ? assignment.subject.nameFr : assignment.subject.nameEn,
        },
        threadId: threadFor(assignment.teacher.userId, assignment.subjectId),
      }));

    // FR-SUP-001: support is reachable without an assignment, because a learner
    // who can reach nobody is exactly who most needs to reach someone.
    contacts.push({
      id: 'support',
      displayName: language === 'fr' ? 'Aide ClassConnect' : 'ClassConnect help',
      kind: 'support',
      subject: null,
      threadId: threads.find((thread) => thread.kind === 'learner_support')?.id ?? null,
    });

    const needle = query?.trim().toLowerCase();
    if (!needle) return contacts;

    return contacts.filter(
      (contact) =>
        contact.displayName.toLowerCase().includes(needle) ||
        (contact.subject?.name.toLowerCase().includes(needle) ?? false),
    );
  }

  /**
   * Open a thread, or return the one that already exists.
   *
   * Idempotent on purpose: tapping a contact twice must not produce two
   * conversations with the same teacher about the same subject, because a split
   * history is a safeguarding record with a hole in it.
   */
  async start(
    learnerId: string,
    userId: string,
    target: { teacherUserId?: string; subjectId?: string; support?: boolean },
  ): Promise<{ threadId: string }> {
    if (target.support) {
      const existing = await this.prisma.messageThread.findFirst({
        where: { kind: 'learner_support', participants: { some: { userId } } },
        select: { id: true },
      });
      if (existing) return { threadId: existing.id };

      const created = await this.prisma.messageThread.create({
        data: {
          kind: 'learner_support',
          learnerId,
          participants: { create: [{ userId, mayPost: true }] },
        },
        select: { id: true },
      });
      return { threadId: created.id };
    }

    if (!target.teacherUserId || !target.subjectId) {
      throw new ForbiddenException({ messageKey: 'errors.thread.not_permitted' });
    }

    /*
     * The gate. A learner may open a thread with a teacher they are actually
     * assigned to, and with nobody else. Without this, a learner could message
     * any teacher on the platform by supplying an id, which is the same failure
     * as a searchable directory arriving through a different door.
     */
    const assignment = await this.prisma.assignment.findFirst({
      where: {
        learnerId,
        teacherId: target.teacherUserId,
        subjectId: target.subjectId,
        status: 'accepted',
        endedAt: null,
      },
      select: { id: true },
    });
    if (!assignment) {
      throw new ForbiddenException({ messageKey: 'errors.thread.not_permitted' });
    }

    const existing = await this.prisma.messageThread.findFirst({
      where: {
        kind: 'learner_teacher',
        learnerId,
        teacherUserId: target.teacherUserId,
        subjectId: target.subjectId,
      },
      select: { id: true },
    });
    if (existing) return { threadId: existing.id };

    const created = await this.prisma.messageThread.create({
      data: {
        kind: 'learner_teacher',
        learnerId,
        teacherUserId: target.teacherUserId,
        subjectId: target.subjectId,
        participants: {
          create: [
            { userId, mayPost: true },
            { userId: target.teacherUserId, mayPost: true },
          ],
        },
      },
      select: { id: true },
    });
    return { threadId: created.id };
  }
}
