import { Injectable } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';
import { AppError } from '../common/http-exception.filter';
import { LearnerMessagesGateway } from './learner-messages.gateway';
import type { CreateStudyGroupInput } from '@classconnect/shared';

/** Learner-owned groups used from the Practice surface. */
@Injectable()
export class LearnerStudyGroupsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly messagesGateway: LearnerMessagesGateway,
  ) {}

  async list(userId: string) {
    const groups = await this.prisma.studyGroup.findMany({
      where: { deletedAt: null, members: { some: { userId, leftAt: null } } },
      orderBy: { updatedAt: 'desc' },
      select: {
        id: true, name: true, threadId: true, ownerUserId: true, maxMembers: true, locked: true,
        members: { where: { leftAt: null }, select: { userId: true, isAdmin: true, allowImages: true, allowVideos: true, allowVoice: true, allowDocuments: true, user: { select: { fullName: true } } } },
        thread: { select: { participants: { select: { userId: true, mayPost: true } } } },
      },
    });
    return { groups: groups.map((group) => ({
      id: group.id, name: group.name, threadId: group.threadId, locked: group.locked,
      ownerUserId: group.ownerUserId, maxMembers: group.maxMembers,
      canManage: group.members.some((member) => member.userId === userId && member.isAdmin),
      members: group.members.map((member) => ({
        userId: member.userId, fullName: member.user.fullName, isAdmin: member.isAdmin,
        mayPost: group.thread.participants.find((participant) => participant.userId === member.userId)?.mayPost ?? false,
        allowImages: member.allowImages, allowVideos: member.allowVideos,
        allowVoice: member.allowVoice, allowDocuments: member.allowDocuments,
      })),
    })) };
  }

  async candidates(levelId: string, userId: string) {
    if (!levelId) return { classmates: [] };
    const learners = await this.prisma.learner.findMany({
      where: { levelId, approvalState: 'approved', archivedAt: null, userId: { not: userId } },
      orderBy: { fullName: 'asc' },
      select: { userId: true, fullName: true },
    });
    return { classmates: learners.map((learner) => ({ userId: learner.userId, fullName: learner.fullName })) };
  }

  async create(levelId: string | null, ownerUserId: string, input: CreateStudyGroupInput) {
    if (!levelId) throw AppError.badRequest('errors.group.learner_not_at_level');
    const memberIds = [...new Set(input.memberUserIds)].filter((id) => id !== ownerUserId);
    const classmates = await this.prisma.learner.findMany({
      where: { levelId, approvalState: 'approved', archivedAt: null, userId: { in: memberIds } },
      select: { userId: true },
    });
    if (classmates.length !== memberIds.length) {
      throw AppError.badRequest('errors.group.learner_not_at_level');
    }
    const group = await this.prisma.$transaction(async (tx) => {
      const thread = await tx.messageThread.create({ data: { kind: 'study_group', learnerId: null } });
      await tx.threadParticipant.createMany({
        data: [ownerUserId, ...memberIds].map((userId) => ({ threadId: thread.id, userId })),
      });
      return tx.studyGroup.create({
        data: {
          name: input.name, levelId, ownerUserId, threadId: thread.id, maxMembers: 10,
          members: { create: [{ userId: ownerUserId, isAdmin: true }, ...memberIds.map((userId) => ({ userId }))] },
        },
        select: { id: true, threadId: true, name: true },
      });
    });
    return { groupId: group.id, threadId: group.threadId, name: group.name };
  }

  async leave(groupId: string, userId: string) {
    const membership = await this.prisma.studyGroupMember.findUnique({ where: { groupId_userId: { groupId, userId } }, select: { group: { select: { ownerUserId: true, deletedAt: true, threadId: true } } } });
    if (!membership || membership.group.deletedAt) throw AppError.notFound();
    if (membership.group.ownerUserId === userId) throw AppError.badRequest('errors.group.owner_cannot_leave');
    await this.prisma.$transaction([
      this.prisma.studyGroupMember.update({ where: { groupId_userId: { groupId, userId } }, data: { leftAt: new Date() } }),
      // A departed learner must no longer be able to open or post in the linked
      // thread. Group membership is the authority, not a stale thread seat.
      this.prisma.threadParticipant.deleteMany({ where: { thread: { studyGroup: { id: groupId } }, userId } }),
    ]);
    this.messagesGateway.publishThreadUpdate(membership.group.threadId);
    return { left: true };
  }

  async addMembers(groupId: string, actorUserId: string, memberUserIds: string[]) {
    const group = await this.adminGroup(groupId, actorUserId);
    const requestedIds = [...new Set(memberUserIds)].filter((id) => id !== actorUserId);
    const activeMembers = await this.prisma.studyGroupMember.findMany({ where: { groupId, leftAt: null }, select: { userId: true } });
    const activeIds = new Set(activeMembers.map((member) => member.userId));
    const ids = requestedIds.filter((id) => !activeIds.has(id));
    const active = activeMembers.length;
    if (ids.length === 0) return this.list(actorUserId);
    if (active + ids.length > group.maxMembers) throw AppError.badRequest('errors.group.full');

    const classmates = await this.prisma.learner.findMany({
      where: { levelId: group.levelId, approvalState: 'approved', archivedAt: null, userId: { in: ids } },
      select: { userId: true },
    });
    if (classmates.length !== ids.length) throw AppError.badRequest('errors.group.learner_not_at_level');

    await this.prisma.$transaction(async (tx) => {
      for (const userId of ids) {
        await tx.studyGroupMember.upsert({
          where: { groupId_userId: { groupId, userId } },
          create: { groupId, userId },
          update: { leftAt: null },
        });
        await tx.threadParticipant.upsert({
          where: { threadId_userId: { threadId: group.threadId, userId } },
          create: { threadId: group.threadId, userId, mayPost: true },
          update: { mayPost: true },
        });
      }
    });
    this.messagesGateway.publishThreadUpdate(group.threadId);
    return this.list(actorUserId);
  }

  /**
   * Finding somebody outside the class to invite.
   *
   * **Teachers are searchable by name; learners are not.** A learner browsing
   * the school's children by typing letters into a box is a directory of minors
   * with a search field on it, and no amount of rate limiting makes that a good
   * idea. Teachers are staff, listed professionally, and already browsable
   * through `teacher:browse`.
   *
   * A learner from another class is reachable only by their **exact** phone or
   * email — you can invite somebody you already know, and you cannot discover
   * anybody you do not. That is the same rule `guardianPhone` uses to link a
   * parent, for the same reason.
   *
   * Classmates keep their own list (`candidates`) and need none of this.
   */
  async findInvitee(query: string) {
    const term = query.trim();
    if (term.length < 3) return [];

    /*
     * An exact identifier looks like one. Anything else is a name, and a name
     * only ever matches staff.
     */
    const looksLikeContact = term.includes('@') || /^\+?\d[\d\s]{6,}$/.test(term);

    if (looksLikeContact) {
      const normalised = term.replace(/\s+/g, '');
      const user = await this.prisma.user.findFirst({
        where: {
          deletedAt: null,
          status: 'active',
          OR: [{ email: term.toLowerCase() }, { phoneE164: normalised }],
        },
        select: { id: true, fullName: true, roles: { select: { role: true } } },
      });
      if (!user) return [];
      return [
        {
          id: user.id,
          displayName: user.fullName,
          kind: user.roles.some((r) => r.role === 'teacher') ? 'teacher' : 'learner',
        },
      ];
    }

    const teachers = await this.prisma.user.findMany({
      where: {
        deletedAt: null,
        status: 'active',
        roles: { some: { role: 'teacher' } },
        fullName: { contains: term, mode: 'insensitive' },
        // Only somebody the school has actually approved to teach. An applicant
        // still under review is not yet a person to put in a group of children.
        teacherProfile: { verificationStatus: 'approved' },
      },
      select: { id: true, fullName: true },
      take: 10,
      orderBy: { fullName: 'asc' },
    });

    return teachers.map((teacher) => ({
      id: teacher.id,
      displayName: teacher.fullName,
      kind: 'teacher' as const,
    }));
  }

  /**
   * Asking somebody to join.
   *
   * Only the owner or a group admin, and only for somebody who is not already
   * in. The row is upserted rather than appended so a second ask replaces the
   * first — see the model for why a history of asks makes membership ambiguous.
   */
  async invite(groupId: string, actorUserId: string, inviteeUserId: string) {
    const group = await this.adminGroup(groupId, actorUserId);
    if (inviteeUserId === actorUserId) throw AppError.badRequest('errors.group.self_invite');

    const invitee = await this.prisma.user.findFirst({
      where: { id: inviteeUserId, deletedAt: null, status: 'active' },
      select: { id: true },
    });
    if (!invitee) throw AppError.notFound();

    const already = await this.prisma.studyGroupMember.findFirst({
      where: { groupId, userId: inviteeUserId, leftAt: null },
      select: { userId: true },
    });
    if (already) throw AppError.conflict('errors.group.already_member');

    /*
     * The ceiling counts people who have said yes, not people who have been
     * asked. Ten outstanding invitations should not lock a group of three.
     */
    const active = await this.prisma.studyGroupMember.count({
      where: { groupId, leftAt: null },
    });
    if (active >= group.maxMembers) throw AppError.badRequest('errors.group.full');

    await this.prisma.studyGroupInvitation.upsert({
      where: { groupId_inviteeUserId: { groupId, inviteeUserId } },
      create: { groupId, inviterUserId: actorUserId, inviteeUserId },
      update: { status: 'pending', inviterUserId: actorUserId, respondedAt: null },
    });

    return { invited: true };
  }

  /** What this person has been asked to join, for the badge and the tab. */
  async myInvitations(userId: string) {
    const invitations = await this.prisma.studyGroupInvitation.findMany({
      where: { inviteeUserId: userId, status: 'pending', group: { deletedAt: null } },
      orderBy: { createdAt: 'desc' },
      include: {
        group: { select: { id: true, name: true } },
        inviter: { select: { fullName: true, roles: { select: { role: true } } } },
      },
    });

    return invitations.map((invitation) => ({
      id: invitation.id,
      group: { id: invitation.group.id, name: invitation.group.name },
      inviter: {
        displayName: invitation.inviter.fullName,
        // Said plainly: being asked by a teacher is a different thing from being
        // asked by a classmate, and the answer may differ.
        kind: invitation.inviter.roles.some((r) => r.role === 'teacher') ? 'teacher' : 'learner',
      },
      createdAt: invitation.createdAt.toISOString(),
    }));
  }

  /**
   * Answering. Accepting joins the group and the conversation in one write.
   *
   * The membership and the thread participation have to move together — a
   * member who is not on the thread is in a group they cannot read, which looks
   * exactly like the group being broken.
   */
  async respondToInvitation(invitationId: string, userId: string, accept: boolean) {
    const invitation = await this.prisma.studyGroupInvitation.findFirst({
      where: { id: invitationId, inviteeUserId: userId, status: 'pending' },
      include: { group: { select: { id: true, threadId: true, maxMembers: true, deletedAt: true } } },
    });
    if (!invitation || invitation.group.deletedAt) throw AppError.notFound();

    if (!accept) {
      await this.prisma.studyGroupInvitation.update({
        where: { id: invitationId },
        data: { status: 'declined', respondedAt: new Date() },
      });
      return { joined: false };
    }

    // Re-checked at the moment of joining: the group may have filled while this
    // invitation sat unanswered.
    const active = await this.prisma.studyGroupMember.count({
      where: { groupId: invitation.groupId, leftAt: null },
    });
    if (active >= invitation.group.maxMembers) throw AppError.badRequest('errors.group.full');

    await this.prisma.$transaction(async (tx) => {
      await tx.studyGroupMember.upsert({
        where: { groupId_userId: { groupId: invitation.groupId, userId } },
        create: { groupId: invitation.groupId, userId },
        update: { leftAt: null },
      });
      await tx.threadParticipant.upsert({
        where: { threadId_userId: { threadId: invitation.group.threadId, userId } },
        create: { threadId: invitation.group.threadId, userId, mayPost: true },
        update: { mayPost: true },
      });
      await tx.studyGroupInvitation.update({
        where: { id: invitationId },
        data: { status: 'accepted', respondedAt: new Date() },
      });
    });

    this.messagesGateway.publishThreadUpdate(invitation.group.threadId);
    return { joined: true };
  }

  /** What the owner sees: who was asked, and what they said. */
  async groupInvitations(groupId: string, actorUserId: string) {
    await this.adminGroup(groupId, actorUserId);
    const invitations = await this.prisma.studyGroupInvitation.findMany({
      where: { groupId },
      orderBy: { createdAt: 'desc' },
      include: { invitee: { select: { fullName: true } } },
    });

    return invitations.map((invitation) => ({
      id: invitation.id,
      displayName: invitation.invitee.fullName,
      status: invitation.status,
      respondedAt: invitation.respondedAt?.toISOString() ?? null,
    }));
  }

  async removeMember(groupId: string, actorUserId: string, memberUserId: string) {
    const group = await this.adminGroup(groupId, actorUserId);
    if (memberUserId === group.ownerUserId) throw AppError.badRequest('errors.group.owner_cannot_leave');
    const member = await this.prisma.studyGroupMember.findFirst({ where: { groupId, userId: memberUserId, leftAt: null } });
    if (!member) throw AppError.notFound();
    await this.prisma.$transaction([
      this.prisma.studyGroupMember.update({ where: { groupId_userId: { groupId, userId: memberUserId } }, data: { leftAt: new Date() } }),
      this.prisma.threadParticipant.deleteMany({ where: { threadId: group.threadId, userId: memberUserId } }),
    ]);
    this.messagesGateway.publishThreadUpdate(group.threadId);
    return { removed: true };
  }

  async setLocked(groupId: string, actorUserId: string, locked: boolean) {
    await this.adminGroup(groupId, actorUserId);
    await this.prisma.studyGroup.update({ where: { id: groupId }, data: { locked } });
    const group = await this.prisma.studyGroup.findUniqueOrThrow({ where: { id: groupId }, select: { threadId: true } });
    this.messagesGateway.publishThreadUpdate(group.threadId);
    return { locked };
  }

  async setMemberPermission(groupId: string, actorUserId: string, memberUserId: string, input: { mayPost?: boolean; allowImages?: boolean; allowVideos?: boolean; allowVoice?: boolean; allowDocuments?: boolean }) {
    const group = await this.adminGroup(groupId, actorUserId);
    const member = await this.prisma.studyGroupMember.findFirst({ where: { groupId, userId: memberUserId, leftAt: null } });
    if (!member) throw AppError.notFound();
    if (input.mayPost !== undefined) {
      await this.prisma.threadParticipant.update({ where: { threadId_userId: { threadId: group.threadId, userId: memberUserId } }, data: { mayPost: input.mayPost } });
    }
    const { mayPost: _mayPost, ...media } = input;
    if (Object.keys(media).length) {
      await this.prisma.studyGroupMember.update({ where: { groupId_userId: { groupId, userId: memberUserId } }, data: media });
    }
    this.messagesGateway.publishThreadUpdate(group.threadId);
    return { ...input };
  }

  async delete(groupId: string, actorUserId: string) {
    const group = await this.prisma.studyGroup.findFirst({
      where: { id: groupId, ownerUserId: actorUserId, deletedAt: null },
      select: { threadId: true },
    });
    if (!group) throw AppError.notFound();
    await this.prisma.$transaction([
      this.prisma.studyGroup.update({ where: { id: groupId }, data: { deletedAt: new Date(), deletedBy: actorUserId } }),
      this.prisma.threadParticipant.deleteMany({ where: { threadId: group.threadId } }),
    ]);
    this.messagesGateway.publishThreadUpdate(group.threadId);
    return { deleted: true };
  }

  private async adminGroup(groupId: string, userId: string) {
    const group = await this.prisma.studyGroup.findFirst({
      where: { id: groupId, deletedAt: null, members: { some: { userId, leftAt: null, isAdmin: true } } },
      select: { id: true, levelId: true, threadId: true, ownerUserId: true, maxMembers: true },
    });
    if (!group) throw AppError.notFound();
    return group;
  }
}
