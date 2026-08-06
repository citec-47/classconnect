import { Injectable } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';
import { PlatformConfigService } from '../common/platform-config.service';
import { CONFIG_KEYS } from '@classconnect/shared';

/**
 * Catalogue and public teacher directory — FR-PRO-001..006.
 */
@Injectable()
export class CatalogueService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: PlatformConfigService,
  ) {}

  /**
   * FR-PRO-001: the education-level taxonomy, with its subjects.
   *
   * `schoolType` groups the levels the way an Admin chooses them: primary
   * school (Class 1–6) or secondary school (Form 1–5, Lower Sixth, Upper Sixth,
   * and the GCE tracks). Optionally filtered, so the account-creation form can
   * ask for one group at a time.
   */
  async levels(schoolType?: 'primary' | 'secondary') {
    const levels = await this.prisma.level.findMany({
      where: { active: true, ...(schoolType ? { schoolType } : {}) },
      orderBy: { sortOrder: 'asc' },
      include: {
        subjects: {
          include: { subject: true },
        },
      },
    });

    return levels.map((level) => ({
      id: level.id,
      code: level.code,
      nameEn: level.nameEn,
      nameFr: level.nameFr,
      schoolType: level.schoolType,
      category: level.category,
      subjects: level.subjects
        .filter((ls) => ls.subject.active)
        .map((ls) => ({
          id: ls.subject.id,
          code: ls.subject.code,
          nameEn: ls.subject.nameEn,
          nameFr: ls.subject.nameFr,
          isScience: ls.subject.isScience,
        }))
        .sort((a, b) => a.code.localeCompare(b.code)),
    }));
  }

  /** FR-PRO-002: the subject catalogue. */
  async subjects() {
    return this.prisma.subject.findMany({
      where: { active: true },
      orderBy: { sortOrder: 'asc' },
      select: { id: true, code: true, nameEn: true, nameFr: true, isScience: true },
    });
  }

  /**
   * FR-PRO-006: browse and filter teachers by subject, level, language,
   * availability window and rating.
   *
   * FR-PRO-004/005 govern the shape of the result: the public profile shows
   * display name, photo, subjects and levels, experience, verification badge,
   * languages, rating, review count, lessons delivered and a short biography —
   * and never contact details, identity documents, address or payout details.
   */
  async browseTeachers(filter: {
    subjectId?: string;
    levelId?: string;
    language?: 'en' | 'fr';
    minRating?: number;
    availableWeekday?: number;
    page: number;
    pageSize: number;
  }) {
    const minRatings = this.config.getNumber(CONFIG_KEYS.MIN_RATINGS_BEFORE_PUBLIC);

    const where = {
      // FR-TVR-003: only approved teachers may be listed.
      verificationStatus: 'approved' as const,
      suspendedAt: null,
      ...(filter.language ? { languages: { has: filter.language } } : {}),
      ...(filter.subjectId || filter.levelId
        ? {
            subjects: {
              some: {
                ...(filter.subjectId ? { subjectId: filter.subjectId } : {}),
                ...(filter.levelId ? { levelId: filter.levelId } : {}),
              },
            },
          }
        : {}),
      ...(filter.availableWeekday !== undefined
        ? { availabilityRules: { some: { weekday: filter.availableWeekday } } }
        : {}),
      ...(filter.minRating !== undefined
        ? { ratingAvg: { gte: filter.minRating }, ratingCount: { gte: minRatings } }
        : {}),
    };

    const [total, teachers] = await Promise.all([
      this.prisma.teacher.count({ where }),
      this.prisma.teacher.findMany({
        where,
        skip: (filter.page - 1) * filter.pageSize,
        take: filter.pageSize,
        orderBy: [{ ratingAvg: 'desc' }, { lessonsDelivered: 'desc' }],
        select: {
          userId: true,
          bio: true,
          yearsExperience: true,
          photoKey: true,
          languages: true,
          ratingAvg: true,
          ratingCount: true,
          lessonsDelivered: true,
          verifiedAt: true,
          user: { select: { fullName: true } },
          subjects: {
            select: {
              subject: { select: { id: true, code: true, nameEn: true, nameFr: true } },
              level: { select: { id: true, code: true, nameEn: true, nameFr: true } },
            },
          },
          // FR-PRO-006: availability window is a filter and a display hint.
          availabilityRules: { select: { weekday: true, startTime: true, endTime: true } },
        },
      }),
    ]);

    return {
      total,
      page: filter.page,
      pageSize: filter.pageSize,
      items: teachers.map((teacher) => ({
        id: teacher.userId,
        // FR-PRO-004: a display name, not the legal identity record.
        displayName: teacher.user.fullName,
        photoKey: teacher.photoKey,
        bio: teacher.bio,
        yearsExperience: teacher.yearsExperience,
        languages: teacher.languages,
        // FR-PRO-004: the verification badge.
        verified: teacher.verifiedAt !== null,
        // FR-RAT-002: withhold the average until there are enough ratings, so a
        // single review cannot present as a settled reputation.
        rating:
          teacher.ratingCount >= minRatings && teacher.ratingAvg !== null
            ? Number(teacher.ratingAvg)
            : null,
        ratingCount: teacher.ratingCount,
        ratingWithheldBelow: minRatings,
        lessonsDelivered: teacher.lessonsDelivered,
        subjects: teacher.subjects.map((ts) => ({
          subject: ts.subject,
          level: ts.level,
        })),
        availability: teacher.availabilityRules,
      })),
    };
  }
}
