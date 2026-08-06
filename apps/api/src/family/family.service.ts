import { Injectable } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';
import { OwnershipService } from '../rbac/ownership.service';
import { AuditService } from '../audit/audit.service';
import { PasswordService } from '../auth/password.service';
import { TokenService } from '../auth/token.service';
import { AppError } from '../common/http-exception.filter';
import { isMinor, daysUntil18, type CreateLearnerInput } from '@classconnect/shared';
import type { AuthenticatedUser } from '../rbac/decorators';

/**
 * Parent–child relationship — FR-FAM-001..006.
 */
@Injectable()
export class FamilyService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ownership: OwnershipService,
    private readonly audit: AuditService,
    private readonly passwords: PasswordService,
    private readonly tokens: TokenService,
  ) {}

  /**
   * FR-FAM-001: a Parent account supports one or more linked Student profiles,
   * each with its own name, date of birth, level, subjects, timetable, progress
   * and subscription.
   */
  async createLearner(user: AuthenticatedUser, input: CreateLearnerInput) {
    const dob = new Date(input.dob);
    if (dob > new Date()) throw AppError.badRequest('errors.dob.future');

    // The guardian row is created at registration for the parent role; an admin
    // creating a learner on a parent's behalf needs it to exist too.
    await this.prisma.guardian.upsert({
      where: { userId: user.id },
      create: { userId: user.id },
      update: {},
    });

    const learner = await this.prisma.$transaction(async (tx) => {
      const created = await tx.learner.create({
        data: {
          fullName: input.fullName,
          dob,
          levelId: input.levelId ?? null,
          preferredLanguage: input.preferredLanguage,
          preferredStudyDays: input.preferredStudyDays,
          preferredStartTime: input.preferredStartTime ?? null,
          preferredEndTime: input.preferredEndTime ?? null,
          targetExamSession: input.targetExamSession ?? null,
          guardians: {
            create: { guardianId: user.id, accessLevel: 'full', isPrimary: true, acceptedAt: new Date() },
          },
        },
      });

      if (input.subjectIds.length > 0) {
        await tx.learnerSubject.createMany({
          data: input.subjectIds.map((subjectId) => ({ learnerId: created.id, subjectId })),
          skipDuplicates: true,
        });
      }

      // FR-SAF-009 / NFR-PRV-003: guardian consent for a minor's data is
      // recorded with a timestamp at the point the profile is created.
      if (isMinor(dob)) {
        await tx.consent.create({
          data: {
            userId: user.id,
            learnerId: created.id,
            consentType: 'guardian_consent_minor',
            version: '1.0',
          },
        });
      }

      return created;
    });

    await this.audit.record({
      action: 'learner.created',
      entity: 'learner',
      entityId: learner.id,
      actorId: user.id,
      after: { fullName: learner.fullName, levelId: learner.levelId },
    });

    return this.presentLearner(learner.id);
  }

  /** FR-FAM-002: the child selector lists every learner the caller may see. */
  async listLearners(user: AuthenticatedUser) {
    const ids = await this.ownership.learnerIdsFor(user);
    if (ids.length === 0) return [];

    const learners = await this.prisma.learner.findMany({
      where: { id: { in: ids }, archivedAt: null },
      include: {
        level: true,
        subjects: { include: { subject: true } },
        user: { select: { id: true, phoneE164: true } },
        guardians: { select: { guardianId: true, accessLevel: true } },
      },
      orderBy: { createdAt: 'asc' },
    });

    return learners.map((learner) => this.toSummary(learner));
  }

  async getLearner(user: AuthenticatedUser, learnerId: string) {
    await this.ownership.assertLearnerAccess(user, learnerId, 'read');
    return this.presentLearner(learnerId);
  }

  async updateLearner(
    user: AuthenticatedUser,
    learnerId: string,
    input: Partial<CreateLearnerInput>,
  ) {
    await this.ownership.assertLearnerAccess(user, learnerId, 'write');

    const before = await this.prisma.learner.findUnique({ where: { id: learnerId } });

    await this.prisma.$transaction(async (tx) => {
      await tx.learner.update({
        where: { id: learnerId },
        data: {
          ...(input.fullName !== undefined ? { fullName: input.fullName } : {}),
          ...(input.dob !== undefined ? { dob: new Date(input.dob) } : {}),
          ...(input.levelId !== undefined ? { levelId: input.levelId } : {}),
          ...(input.preferredLanguage !== undefined
            ? { preferredLanguage: input.preferredLanguage }
            : {}),
          ...(input.preferredStudyDays !== undefined
            ? { preferredStudyDays: input.preferredStudyDays }
            : {}),
          ...(input.preferredStartTime !== undefined
            ? { preferredStartTime: input.preferredStartTime }
            : {}),
          ...(input.preferredEndTime !== undefined
            ? { preferredEndTime: input.preferredEndTime }
            : {}),
          ...(input.targetExamSession !== undefined
            ? { targetExamSession: input.targetExamSession }
            : {}),
        },
      });

      if (input.subjectIds) {
        await tx.learnerSubject.deleteMany({ where: { learnerId } });
        if (input.subjectIds.length > 0) {
          await tx.learnerSubject.createMany({
            data: input.subjectIds.map((subjectId) => ({ learnerId, subjectId })),
            skipDuplicates: true,
          });
        }
      }
    });

    await this.audit.record({
      action: 'learner.updated',
      entity: 'learner',
      entityId: learnerId,
      actorId: user.id,
      before,
      after: input,
    });

    return this.presentLearner(learnerId);
  }

  /**
   * FR-FAM-005: a Student profile cannot be deleted while an active
   * subscription, an outstanding balance or an unresolved dispute exists. It is
   * archivable instead.
   */
  async archiveLearner(user: AuthenticatedUser, learnerId: string): Promise<void> {
    await this.ownership.assertLearnerAccess(user, learnerId, 'write');

    const [activeSubscriptions, unsettledPayments, disputes] = await Promise.all([
      this.prisma.subscription.count({
        where: { learnerId, status: { in: ['active', 'grace', 'pending_payment'] } },
      }),
      this.prisma.payment.count({
        where: {
          subscription: { learnerId },
          status: { in: ['initiated', 'pending', 'pending_reconciliation'] },
        },
      }),
      this.prisma.session.count({ where: { learnerId, status: 'disputed' } }),
    ]);

    if (activeSubscriptions > 0 || unsettledPayments > 0 || disputes > 0) {
      throw AppError.conflict('errors.learner.archive_blocked');
    }

    await this.prisma.learner.update({
      where: { id: learnerId },
      data: { archivedAt: new Date(), status: 'archived' },
    });

    await this.audit.record({
      action: 'learner.archived',
      entity: 'learner',
      entityId: learnerId,
      actorId: user.id,
    });
  }

  /**
   * FR-FAM-003: a Parent may grant a Student their own sign-in credentials, and
   * may revoke them at any time.
   */
  async grantCredentials(
    user: AuthenticatedUser,
    learnerId: string,
    input: { phone?: string; email?: string; password: string },
  ): Promise<{ userId: string }> {
    await this.ownership.assertLearnerAccess(user, learnerId, 'write');

    const learner = await this.prisma.learner.findUnique({ where: { id: learnerId } });
    if (!learner) throw AppError.notFound();
    if (learner.userId) throw AppError.conflict('errors.learner.credentials_exist');

    if (input.phone) {
      const taken = await this.prisma.user.findUnique({ where: { phoneE164: input.phone } });
      if (taken) throw AppError.conflict('errors.phone.taken');
    }
    if (input.email) {
      const taken = await this.prisma.user.findUnique({ where: { email: input.email } });
      if (taken) throw AppError.conflict('errors.email.taken');
    }

    const passwordHash = await this.passwords.hash(input.password);

    const created = await this.prisma.$transaction(async (tx) => {
      const account = await tx.user.create({
        data: {
          phoneE164: input.phone ?? null,
          email: input.email ?? null,
          passwordHash,
          fullName: learner.fullName,
          preferredLanguage: learner.preferredLanguage,
          status: 'active',
          // FR-FAM-006: minor status is derived, and decides the role.
          roles: { create: { role: isMinor(learner.dob) ? 'student' : 'adult_learner' } },
        },
      });

      await tx.learner.update({ where: { id: learnerId }, data: { userId: account.id } });
      return account;
    });

    await this.audit.record({
      action: 'learner.credentials_granted',
      entity: 'learner',
      entityId: learnerId,
      actorId: user.id,
      after: { userId: created.id },
    });

    return { userId: created.id };
  }

  /** FR-FAM-003: revocation ends the child's access immediately. */
  async revokeCredentials(user: AuthenticatedUser, learnerId: string): Promise<void> {
    await this.ownership.assertLearnerAccess(user, learnerId, 'write');

    const learner = await this.prisma.learner.findUnique({ where: { id: learnerId } });
    if (!learner?.userId) throw AppError.notFound();

    const accountId = learner.userId;

    await this.prisma.$transaction(async (tx) => {
      await tx.learner.update({ where: { id: learnerId }, data: { userId: null } });
      await tx.user.update({
        where: { id: accountId },
        data: { status: 'archived', deletedAt: new Date() },
      });
    });

    // FR-AUT-006: revoking credentials must end live sessions, not merely stop
    // future sign-ins.
    await this.tokens.revokeAll(accountId, 'learner_credentials_revoked');

    await this.audit.record({
      action: 'learner.credentials_revoked',
      entity: 'learner',
      entityId: learnerId,
      actorId: user.id,
      before: { userId: accountId },
    });
  }

  /**
   * FR-FAM-004: a second Guardian may be invited with full or view-only rights.
   */
  async inviteGuardian(
    user: AuthenticatedUser,
    learnerId: string,
    input: { phone?: string; email?: string; accessLevel: 'full' | 'view_only' },
  ) {
    await this.ownership.assertLearnerAccess(user, learnerId, 'write');

    if (!input.phone && !input.email) throw AppError.badRequest('errors.identifier.required');

    const invitee = await this.prisma.user.findFirst({
      where: {
        OR: [
          ...(input.phone ? [{ phoneE164: input.phone }] : []),
          ...(input.email ? [{ email: input.email }] : []),
        ],
      },
    });

    // The invitee must already hold an account. Creating a shell account from an
    // invitation would let anyone provision accounts against arbitrary numbers.
    if (!invitee) throw AppError.notFound('errors.guardian.invitee_not_found');

    await this.prisma.guardian.upsert({
      where: { userId: invitee.id },
      create: { userId: invitee.id },
      update: {},
    });

    const link = await this.prisma.guardianLearner.upsert({
      where: { guardianId_learnerId: { guardianId: invitee.id, learnerId } },
      create: {
        guardianId: invitee.id,
        learnerId,
        accessLevel: input.accessLevel,
        invitedBy: user.id,
      },
      update: { accessLevel: input.accessLevel },
    });

    await this.audit.record({
      action: 'guardian.invited',
      entity: 'learner',
      entityId: learnerId,
      actorId: user.id,
      after: { guardianId: invitee.id, accessLevel: input.accessLevel },
    });

    return { id: link.id, guardianId: invitee.id, accessLevel: link.accessLevel };
  }

  private async presentLearner(learnerId: string) {
    const learner = await this.prisma.learner.findUnique({
      where: { id: learnerId },
      include: {
        level: true,
        subjects: { include: { subject: true } },
        user: { select: { id: true, phoneE164: true } },
        guardians: { select: { guardianId: true, accessLevel: true } },
      },
    });
    if (!learner) throw AppError.notFound();
    return this.toSummary(learner);
  }

  private toSummary(learner: {
    id: string;
    fullName: string;
    dob: Date;
    preferredLanguage: string;
    level: { id: string; code: string; nameEn: string; nameFr: string } | null;
    subjects: { subject: { id: string; code: string; nameEn: string; nameFr: string } }[];
    user: { id: string } | null;
    guardians: { guardianId: string; accessLevel: string }[];
  }) {
    return {
      id: learner.id,
      fullName: learner.fullName,
      dob: learner.dob.toISOString().slice(0, 10),
      // FR-FAM-006: derived, never stored, so it cannot go stale.
      isMinor: isMinor(learner.dob),
      daysUntil18: daysUntil18(learner.dob),
      preferredLanguage: learner.preferredLanguage,
      level: learner.level
        ? {
            id: learner.level.id,
            code: learner.level.code,
            nameEn: learner.level.nameEn,
            nameFr: learner.level.nameFr,
          }
        : null,
      subjects: learner.subjects.map((s) => ({
        id: s.subject.id,
        code: s.subject.code,
        nameEn: s.subject.nameEn,
        nameFr: s.subject.nameFr,
      })),
      hasOwnSignIn: learner.user !== null,
      guardians: learner.guardians,
    };
  }
}
