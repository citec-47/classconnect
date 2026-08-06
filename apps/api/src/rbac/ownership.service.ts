import { Injectable } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';
import { AuditService } from '../audit/audit.service';
import { AppError } from '../common/http-exception.filter';
import { isStaff, type Role } from '@classconnect/shared';
import type { AuthenticatedUser } from './decorators';

/**
 * FR-RBA-003: record-level ownership. A user may read or modify a record only
 * where an explicit relationship exists — own record, own child, assigned
 * learner, assigned session, or an administrative grant.
 *
 * The permission guard answers "may this role attempt this verb at all". This
 * service answers "may this user touch this row", and every endpoint that names
 * a record id must call it. Splitting the two keeps the role table small and
 * stops ownership logic from drifting into controllers.
 */
export type AccessMode = 'read' | 'write';

@Injectable()
export class OwnershipService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /**
   * Resolves a learner the caller is entitled to act on, or throws.
   *
   * FR-RBA-004: staff access to a learner's personal data is audited here, at
   * the single point every such read passes through.
   */
  async assertLearnerAccess(
    user: AuthenticatedUser,
    learnerId: string,
    mode: AccessMode = 'read',
  ): Promise<{ id: string; fullName: string; dob: Date; guardianIds: string[] }> {
    const learner = await this.prisma.learner.findFirst({
      where: { id: learnerId, archivedAt: null },
      select: {
        id: true,
        fullName: true,
        dob: true,
        userId: true,
        guardians: { select: { guardianId: true, accessLevel: true } },
        assignments: {
          where: { status: 'accepted' },
          select: { teacherId: true },
        },
      },
    });

    if (!learner) throw AppError.notFound();

    const guardianIds = learner.guardians.map((g) => g.guardianId);

    // The learner themselves, where they hold their own sign-in (FR-FAM-003).
    if (learner.userId && learner.userId === user.id) {
      return { id: learner.id, fullName: learner.fullName, dob: learner.dob, guardianIds };
    }

    // A linked Guardian. FR-FAM-004: view-only guardians may read, not write.
    const link = learner.guardians.find((g) => g.guardianId === user.id);
    if (link) {
      if (mode === 'write' && link.accessLevel !== 'full') throw AppError.forbidden();
      return { id: learner.id, fullName: learner.fullName, dob: learner.dob, guardianIds };
    }

    // An assigned teacher may read the learners they teach, never write them.
    if (mode === 'read' && learner.assignments.some((a) => a.teacherId === user.id)) {
      return { id: learner.id, fullName: learner.fullName, dob: learner.dob, guardianIds };
    }

    // An administrative grant. Recorded because it is access to a minor's data.
    if (isStaff(user.roles)) {
      await this.audit.recordLearnerAccess(user.id, learner.id);
      return { id: learner.id, fullName: learner.fullName, dob: learner.dob, guardianIds };
    }

    throw AppError.forbidden('errors.learner.not_yours');
  }

  /** Own teacher record, or staff with a verification/administrative grant. */
  async assertTeacherAccess(
    user: AuthenticatedUser,
    teacherId: string,
    mode: AccessMode = 'read',
  ): Promise<void> {
    if (teacherId === user.id) return;
    if (isStaff(user.roles)) {
      if (mode === 'write' && !this.canAdministerTeachers(user.roles)) throw AppError.forbidden();
      return;
    }
    throw AppError.forbidden();
  }

  private canAdministerTeachers(roles: Role[]): boolean {
    return roles.includes('admin_ops') || roles.includes('super_admin');
  }

  /** Every learner the caller may act on, used to scope list endpoints. */
  async learnerIdsFor(user: AuthenticatedUser): Promise<string[]> {
    const [asGuardian, asSelf, asTeacher] = await Promise.all([
      this.prisma.guardianLearner.findMany({
        where: { guardianId: user.id },
        select: { learnerId: true },
      }),
      this.prisma.learner.findMany({ where: { userId: user.id }, select: { id: true } }),
      this.prisma.assignment.findMany({
        where: { teacherId: user.id, status: 'accepted' },
        select: { learnerId: true },
      }),
    ]);

    return [
      ...new Set([
        ...asGuardian.map((row) => row.learnerId),
        ...asSelf.map((row) => row.id),
        ...asTeacher.map((row) => row.learnerId),
      ]),
    ];
  }
}
