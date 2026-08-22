import { Injectable } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';
import { AuditService } from '../audit/audit.service';
import { AppError } from '../common/http-exception.filter';
import type { AuthenticatedUser } from '../rbac/decorators';

/**
 * Admin oversight of learner study groups.
 *
 * ## Why deletion is worth an admin screen
 *
 * A study group is a conversation between children, and the owner can delete it.
 * The rows survive — `deletedAt` is set and the thread participants are removed
 * — so what actually happens is that a conversation becomes invisible to
 * everyone who was in it, including anybody who might later need to look at it.
 *
 * That is the correct default: a learner should be able to close a group without
 * asking permission. But "a child deleted the conversation" is exactly the event
 * a safeguarding review needs to be able to find, and until now nothing could
 * show it. This is that surface.
 *
 * ## Restoring
 *
 * Puts the group back and its members back on the thread. Restricted to staff
 * who hold `safeguarding:read`, because reading a deleted group's messages is
 * reading children's messages — and it is audited both ways, since undoing
 * somebody's deletion is a thing they are owed a record of.
 */
@Injectable()
export class AdminStudyGroupsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /**
   * Groups, live or deleted.
   *
   * Deleted first when both are asked for: the reason to open this screen is
   * almost always something that disappeared.
   */
  async list(filter: 'all' | 'active' | 'deleted' = 'deleted') {
    const where =
      filter === 'active'
        ? { deletedAt: null }
        : filter === 'deleted'
          ? { deletedAt: { not: null } }
          : {};

    const groups = await this.prisma.studyGroup.findMany({
      where,
      orderBy: [{ deletedAt: 'desc' }, { updatedAt: 'desc' }],
      take: 200,
      select: {
        id: true,
        name: true,
        createdAt: true,
        deletedAt: true,
        locked: true,
        owner: { select: { id: true, fullName: true } },
        level: { select: { code: true, nameEn: true } },
        _count: { select: { members: true, tasks: true } },
        // How much conversation would be lost, or was. A group with two messages
        // and one with four hundred are not the same decision to review.
        thread: { select: { _count: { select: { messages: true } } } },
      },
    });

    return groups.map((group) => ({
      id: group.id,
      name: group.name,
      level: group.level.nameEn,
      owner: { id: group.owner.id, displayName: group.owner.fullName },
      members: group._count.members,
      tasks: group._count.tasks,
      messages: group.thread._count.messages,
      locked: group.locked,
      createdAt: group.createdAt.toISOString(),
      deletedAt: group.deletedAt?.toISOString() ?? null,
    }));
  }

  /**
   * Putting a deleted group back.
   *
   * Membership rows were never removed — only `leftAt` on people who actually
   * left, and the thread seats. So restoring means clearing `deletedAt` and
   * re-seating everyone still recorded as a member; a group restored without its
   * thread participants would be visible and unreadable, which looks like the
   * restore having half worked.
   */
  async restore(staff: AuthenticatedUser, groupId: string) {
    const group = await this.prisma.studyGroup.findFirst({
      where: { id: groupId, deletedAt: { not: null } },
      select: {
        id: true,
        name: true,
        threadId: true,
        deletedAt: true,
        members: { where: { leftAt: null }, select: { userId: true } },
      },
    });
    if (!group) throw AppError.notFound();

    await this.prisma.$transaction(async (tx) => {
      await tx.studyGroup.update({
        where: { id: groupId },
        data: { deletedAt: null, deletedBy: null },
      });
      for (const member of group.members) {
        await tx.threadParticipant.upsert({
          where: { threadId_userId: { threadId: group.threadId, userId: member.userId } },
          create: { threadId: group.threadId, userId: member.userId, mayPost: true },
          update: { mayPost: true },
        });
      }
    });

    await this.audit.record({
      action: 'group.restored',
      entity: 'study_group',
      entityId: groupId,
      actorId: staff.id,
      before: { deletedAt: group.deletedAt?.toISOString() ?? null },
      after: { name: group.name, membersReseated: group.members.length },
    });

    return { restored: true };
  }
}
