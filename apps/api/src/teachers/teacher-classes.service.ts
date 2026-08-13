import { Injectable } from '@nestjs/common';
import {
  bandForSchoolType,
  privateBand,
  summariseBands,
  type SchoolType,
  type TeacherClassSummary,
  type TeacherClassesResponse,
} from '@classconnect/shared';
import { PrismaService } from '../common/prisma.service';
import { AppError } from '../common/http-exception.filter';

/**
 * "The teacher should see the different classes they teach … and the number of
 * students in each class."
 *
 * A teacher's load comes from two places in the schema and they are not
 * interchangeable:
 *
 *   - `cohorts` — a named group taught at one level in one subject. Its
 *     headcount is its current membership, so a learner who has left is not
 *     counted. That is what `leftAt: null` below is for.
 *   - `assignments` — one teacher to one learner. This is what "Private
 *     Classes" means in the brief: not a year group but a teaching mode, which
 *     is why it is derived here rather than stored as a fourth `SchoolType`.
 *
 * Only `active` assignments count. A `proposed` assignment is an offer the
 * teacher has not accepted (FR-SCH-002) and showing it as a class they teach
 * would overstate their load on the one screen they check it from.
 */
@Injectable()
export class TeacherClassesService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Every class this teacher holds, with the four band tiles rolled up.
   *
   * One query per source rather than one per class: a teacher with a dozen
   * cohorts would otherwise cost a dozen round trips to count members, and the
   * database is in another region.
   */
  async ownClasses(teacherUserId: string): Promise<TeacherClassesResponse> {
    // A user can hold the teacher role without a `teachers` row — an account
    // mid-creation, or one whose row was never written. Saying so is worth more
    // than the empty screen a bare `findMany` would produce.
    const teacher = await this.prisma.teacher.findUnique({
      where: { userId: teacherUserId },
      select: { userId: true },
    });
    if (!teacher) throw AppError.notFound('errors.teacher.noRecord');

    const [cohorts, assignments] = await Promise.all([
      this.prisma.cohort.findMany({
        where: { teacherId: teacherUserId, active: true },
        select: {
          id: true,
          name: true,
          level: { select: { code: true, nameEn: true, nameFr: true, schoolType: true } },
          subject: { select: { id: true, nameEn: true, nameFr: true } },
          _count: { select: { members: { where: { leftAt: null } } } },
        },
        orderBy: [{ level: { sortOrder: 'asc' } }, { name: 'asc' }],
      }),

      this.prisma.assignment.findMany({
        where: { teacherId: teacherUserId, status: 'accepted', endedAt: null },
        select: {
          id: true,
          learner: {
            select: {
              fullName: true,
              level: { select: { code: true, nameEn: true, nameFr: true } },
            },
          },
          subject: { select: { id: true, nameEn: true, nameFr: true } },
        },
        orderBy: { createdAt: 'asc' },
      }),
    ]);

    const classes: TeacherClassSummary[] = [
      ...cohorts.map((cohort) => ({
        id: cohort.id,
        kind: 'cohort' as const,
        name: cohort.name,
        band: bandForSchoolType(cohort.level.schoolType as SchoolType),
        levelCode: cohort.level.code,
        levelNameEn: cohort.level.nameEn,
        levelNameFr: cohort.level.nameFr,
        subjectId: cohort.subject.id,
        subjectNameEn: cohort.subject.nameEn,
        subjectNameFr: cohort.subject.nameFr,
        learnerCount: cohort._count.members,
      })),

      ...assignments.map((assignment) => ({
        id: assignment.id,
        kind: 'private' as const,
        name: assignment.learner.fullName,
        band: privateBand,
        // A private learner may have no level set yet; the level is optional on
        // `learners` and the name carries the identification either way.
        levelCode: assignment.learner.level?.code ?? null,
        levelNameEn: assignment.learner.level?.nameEn ?? null,
        levelNameFr: assignment.learner.level?.nameFr ?? null,
        subjectId: assignment.subject.id,
        subjectNameEn: assignment.subject.nameEn,
        subjectNameFr: assignment.subject.nameFr,
        learnerCount: 1,
      })),
    ];

    return { bands: summariseBands(classes), classes };
  }

  /**
   * The roster of one class the teacher holds.
   *
   * The ownership check is the point of this method. `classId` arrives from the
   * client, so it is treated as a claim: the `where` names the teacher as well
   * as the class, and a cohort belonging to someone else returns not-found
   * rather than a roster. FR-RBA-002 — the permission says a teacher may read
   * *their own* classes, and only a query scoped this way enforces the "own".
   */
  async classRoster(
    teacherUserId: string,
    kind: 'cohort' | 'private',
    classId: string,
  ): Promise<{ name: string; learners: { id: string; fullName: string }[] }> {
    if (kind === 'private') {
      const assignment = await this.prisma.assignment.findFirst({
        where: { id: classId, teacherId: teacherUserId, status: 'accepted', endedAt: null },
        select: { learner: { select: { id: true, fullName: true } } },
      });
      if (!assignment) throw AppError.notFound('errors.class.notFound');

      return { name: assignment.learner.fullName, learners: [assignment.learner] };
    }

    const cohort = await this.prisma.cohort.findFirst({
      where: { id: classId, teacherId: teacherUserId, active: true },
      select: {
        name: true,
        members: {
          where: { leftAt: null },
          select: { learner: { select: { id: true, fullName: true } } },
          orderBy: { learner: { fullName: 'asc' } },
        },
      },
    });
    if (!cohort) throw AppError.notFound('errors.class.notFound');

    return {
      name: cohort.name,
      learners: cohort.members.map((member) => member.learner),
    };
  }
}
