import { Injectable } from '@nestjs/common';
import type { SchoolType } from '@prisma/client';
import { ageInYears, isMinor } from '@classconnect/shared';
import { PrismaService } from '../common/prisma.service';
import { AppError } from '../common/http-exception.filter';
import { AuditService } from '../audit/audit.service';
import { CacheService } from '../common/cache.service';

/**
 * The row shape the hand-written roster query returns.
 *
 * Declared rather than inferred, because `$queryRawUnsafe` cannot type itself.
 * Anything added to the SELECT belongs here too, and `roster-shape.spec.ts`
 * checks the mapping still produces what the screens read.
 */
interface TeacherRosterRow {
  teacherId: string;
  fullName: string;
  phone: string | null;
  email: string | null;
  accountStatus: string;
  schoolType: SchoolType | null;
  verificationStatus: string;
  suspendedAt: Date | null;
  yearsExperience: number;
  highestQualification: string | null;
  frozen: boolean;
  subjects: {
    subjectId: string;
    code: string;
    nameEn: string;
    nameFr: string;
    level: { id: string; nameEn: string; nameFr: string; schoolType: SchoolType };
  }[];
  minutesAll: number;
  sessionsAll: number;
  minutesMonth: number;
}

/** The row shape of the hand-written student roster query. */
interface StudentRosterRow {
  learnerId: string;
  fullName: string;
  dob: Date;
  userId: string | null;
  approvalState: string;
  status: string;
  levelId: string | null;
  levelNameEn: string;
  levelNameFr: string;
  schoolType: SchoolType | null;
  subjects: { nameEn: string; nameFr: string }[];
  guardianName: string | null;
  guardianPhone: string | null;
  plan: string | null;
  freezeKind: 'manual' | 'automatic' | null;
}

/**
 * The roster: everyone on the platform, grouped by teaching band.
 *
 * Distinct from the approval queues, which are work waiting to be done. This is
 * the standing picture — who teaches what, at which band, and for how many
 * hours — and it is what an Admin looks at when deciding who to put in front of
 * a learner.
 *
 * Three bands, per `SchoolType`: primary, secondary, and Lower & Upper Sixth.
 * A learner's band is derived from their level rather than stored, so it can
 * never disagree with the class they are actually in. A teacher's is stored,
 * because it is a hiring decision an Admin makes, not a fact about a row.
 */
@Injectable()
export class RosterService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly cache: CacheService,
  ) {}

  /** `YYYY-MM` bounds for "this month", in UTC. */
  private monthStart(): Date {
    const now = new Date();
    return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  }

  // -------------------------------------------------------------------------
  // Teachers
  // -------------------------------------------------------------------------

  /**
   * The teacher roster, optionally filtered to one band.
   *
   * `schoolType: null` asks for the teachers who have no band at all — the ones
   * who cannot be assigned a learner until somebody classifies them, which is
   * exactly why they need to be findable.
   */
  async teachers(filter: { schoolType?: SchoolType | 'unclassified'; query?: string }) {
    /**
     * One query, deliberately hand-written.
     *
     * The equivalent Prisma call — `findMany` with nested includes for the user,
     * the subject/level pairs and the live freezes, plus two `groupBy`s for
     * attendance — issued **eight** separate statements, because a nested
     * `include` fans out one query per relation. Against a database in another
     * region that is eight round trips at 235ms each before any work happens,
     * and it measured at 3362ms for 55 teachers.
     *
     * Folded into a single statement with lateral joins it measures 1038ms: the
     * same rows, one trip. That is the whole justification — this is not
     * micro-optimisation, it is removing seven network round trips from the
     * screen an operator opens most.
     *
     * The cost is that the shape below is maintained by hand rather than by the
     * client, so the mapping is written out explicitly and
     * `roster-shape.spec.ts` asserts it still matches what the screen expects.
     */
    const conditions: string[] = [];
    const params: unknown[] = [this.monthStart()];

    if (filter.schoolType === 'unclassified') {
      conditions.push('t.school_type IS NULL');
    } else if (filter.schoolType) {
      params.push(filter.schoolType);
      conditions.push(`t.school_type = $${params.length}::"SchoolType"`);
    }
    if (filter.query) {
      // Parameterised, not interpolated: this value comes from a query string.
      params.push(`%${filter.query}%`);
      conditions.push(`u.full_name ILIKE $${params.length}`);
    }
    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const rows = await this.prisma.$queryRawUnsafe<TeacherRosterRow[]>(
      `
      SELECT
        t.user_id                AS "teacherId",
        u.full_name              AS "fullName",
        u.phone_e164             AS "phone",
        u.email                  AS "email",
        u.status::text           AS "accountStatus",
        t.school_type::text      AS "schoolType",
        t.verification_status::text AS "verificationStatus",
        t.suspended_at           AS "suspendedAt",
        t.years_experience       AS "yearsExperience",
        t.highest_qualification  AS "highestQualification",
        EXISTS (
          SELECT 1 FROM account_freezes f
           WHERE f.teacher_user_id = t.user_id AND f.lifted_at IS NULL
        )                        AS "frozen",
        COALESCE(s.subjects, '[]'::json) AS "subjects",
        COALESCE(a.minutes_all, 0)::int   AS "minutesAll",
        COALESCE(a.sessions_all, 0)::int  AS "sessionsAll",
        COALESCE(m.minutes_month, 0)::int AS "minutesMonth"
      FROM teachers t
      JOIN users u ON u.id = t.user_id
      LEFT JOIN LATERAL (
        SELECT json_agg(json_build_object(
                 'subjectId', sub.id,
                 'code',      sub.code,
                 'nameEn',    sub.name_en,
                 'nameFr',    sub.name_fr,
                 'level', json_build_object(
                   'id',         l.id,
                   'nameEn',     l.name_en,
                   'nameFr',     l.name_fr,
                   'schoolType', l.school_type
                 )
               ) ORDER BY sub.sort_order) AS subjects
          FROM teacher_subjects ts
          JOIN subjects sub ON sub.id = ts.subject_id
          JOIN levels   l   ON l.id   = ts.level_id
         WHERE ts.teacher_id = t.user_id
      ) s ON TRUE
      LEFT JOIN LATERAL (
        SELECT SUM(sp.attended_minutes) AS minutes_all, COUNT(*) AS sessions_all
          FROM session_participants sp
         WHERE sp.user_id = t.user_id
      ) a ON TRUE
      LEFT JOIN LATERAL (
        SELECT SUM(sp.attended_minutes) AS minutes_month
          FROM session_participants sp
          JOIN sessions se ON se.id = sp.session_id
         WHERE sp.user_id = t.user_id AND se.starts_at_utc >= $1
      ) m ON TRUE
      ${where}
      ORDER BY t.school_type, u.full_name
      `,
      ...params,
    );

    return rows.map((row) => ({
      teacherId: row.teacherId,
      fullName: row.fullName,
      phone: row.phone,
      email: row.email,
      // The band. Null is a real, actionable state, not missing data.
      schoolType: row.schoolType,
      verificationStatus: row.verificationStatus,
      suspended: Boolean(row.suspendedAt) || row.frozen,
      accountStatus: row.accountStatus,
      yearsExperience: row.yearsExperience,
      highestQualification: row.highestQualification,
      subjects: row.subjects,
      subjectCount: row.subjects.length,
      /**
       * Subjects recorded at a level outside the teacher's own band.
       *
       * Normal after a reclassification, and worth surfacing rather than hiding:
       * it is the difference between "this teacher covers two bands" and "the
       * band on this record is wrong".
       */
      outOfBandSubjects: row.schoolType
        ? row.subjects.filter((pair) => pair.level.schoolType !== row.schoolType).length
        : 0,
      hoursAllTime: this.hours(row.minutesAll),
      hoursThisMonth: this.hours(row.minutesMonth),
      sessionsAllTime: row.sessionsAll,
    }));
  }

  /** One decimal place is enough for a roster; the minutes are the record. */
  private hours(minutes: number): number {
    return Math.round((minutes / 60) * 10) / 10;
  }

  /**
   * One teacher in full: every subject they teach, and the hours behind each.
   *
   * FR-LIV-014 / SI-005: the minutes come from the media server's join and leave
   * events recorded on `session_participants`, never from a teacher's own
   * account of what they taught.
   */
  async teacherDetail(teacherId: string) {
    const teacher = await this.prisma.teacher.findUnique({
      where: { userId: teacherId },
      include: {
        user: { select: { id: true, fullName: true, phoneE164: true, email: true, status: true } },
        subjects: {
          include: {
            subject: { select: { id: true, code: true, nameEn: true, nameFr: true } },
            level: { select: { id: true, nameEn: true, nameFr: true, schoolType: true } },
          },
        },
        freezes: { where: { liftedAt: null } },
      },
    });
    if (!teacher) throw AppError.notFound();

    const monthStart = this.monthStart();

    // Every countable session this teacher delivered, with the subject and the
    // attendance recorded against them.
    const sessions = await this.prisma.session.findMany({
      where: {
        teacherId,
        status: { in: ['completed', 'no_show_learner', 'in_progress'] },
      },
      include: {
        subject: { select: { id: true, code: true, nameEn: true, nameFr: true } },
        participants: { where: { userId: teacherId } },
        learner: { select: { id: true, fullName: true } },
        cohort: { select: { id: true, name: true, members: { select: { learnerId: true } } } },
      },
      orderBy: { startsAtUtc: 'desc' },
    });

    const perSubject = new Map<
      string,
      { subject: { id: string; code: string; nameEn: string; nameFr: string }; minutes: number; sessions: number }
    >();
    const learners = new Set<string>();
    let minutesAll = 0;
    let minutesMonth = 0;
    let oneToOne = 0;
    let group = 0;

    for (const session of sessions) {
      const minutes = session.participants[0]?.attendedMinutes ?? 0;
      minutesAll += minutes;
      if (session.startsAtUtc >= monthStart) minutesMonth += minutes;
      if (session.type === 'one_to_one') oneToOne += minutes;
      else group += minutes;

      const entry = perSubject.get(session.subjectId) ?? {
        subject: session.subject,
        minutes: 0,
        sessions: 0,
      };
      entry.minutes += minutes;
      entry.sessions += 1;
      perSubject.set(session.subjectId, entry);

      if (session.learnerId) learners.add(session.learnerId);
      for (const member of session.cohort?.members ?? []) learners.add(member.learnerId);
    }

    return {
      teacherId: teacher.userId,
      fullName: teacher.user.fullName,
      phone: teacher.user.phoneE164,
      email: teacher.user.email,
      schoolType: teacher.schoolType,
      verificationStatus: teacher.verificationStatus,
      suspended: Boolean(teacher.suspendedAt) || teacher.freezes.length > 0,
      suspendedReason: teacher.suspendedReason,
      yearsExperience: teacher.yearsExperience,
      highestQualification: teacher.highestQualification,
      institution: teacher.institution,
      languages: teacher.languages,
      ratingAvg: teacher.ratingAvg ? Number(teacher.ratingAvg) : null,
      ratingCount: teacher.ratingCount,

      /** What they are contracted to teach — the catalogue side. */
      subjects: teacher.subjects.map((pair) => ({
        subjectId: pair.subject.id,
        code: pair.subject.code,
        nameEn: pair.subject.nameEn,
        nameFr: pair.subject.nameFr,
        level: {
          id: pair.level.id,
          nameEn: pair.level.nameEn,
          nameFr: pair.level.nameFr,
          schoolType: pair.level.schoolType,
        },
        inBand: !teacher.schoolType || pair.level.schoolType === teacher.schoolType,
      })),

      /** What they have actually taught — the attendance side. */
      hours: {
        allTime: this.hours(minutesAll),
        thisMonth: this.hours(minutesMonth),
        oneToOne: this.hours(oneToOne),
        group: this.hours(group),
        minutesAllTime: minutesAll,
      },
      sessionsDelivered: sessions.length,
      learnersTaught: learners.size,
      perSubject: [...perSubject.values()]
        .map((entry) => ({
          ...entry.subject,
          hours: this.hours(entry.minutes),
          sessions: entry.sessions,
        }))
        .sort((a, b) => b.hours - a.hours),
    };
  }

  /**
   * Classifies a teacher into a band.
   *
   * FR-SCH-002 hangs assignment off this: a learner can only be assigned to a
   * teacher whose band matches their level, so this is the decision that governs
   * who ends up in front of whom. FR-AI-005 therefore applies — it names the
   * deciding Admin and is audited.
   *
   * Subjects already on the record are deliberately left alone. A teacher who
   * genuinely covers Form 5 and Lower Sixth should keep both; the mismatch is
   * reported so an Admin can see it rather than silently corrected.
   */
  async classify(input: { teacherId: string; schoolType: SchoolType; actorId: string }) {
    const teacher = await this.prisma.teacher.findUnique({
      where: { userId: input.teacherId },
      include: {
        user: { select: { fullName: true } },
        subjects: { include: { level: { select: { schoolType: true } } } },
      },
    });
    if (!teacher) throw AppError.notFound();

    const before = teacher.schoolType;
    if (before === input.schoolType) {
      return { teacherId: input.teacherId, schoolType: input.schoolType, changed: false, outOfBandSubjects: 0 };
    }

    const outOfBand = teacher.subjects.filter(
      (pair) => pair.level.schoolType !== input.schoolType,
    ).length;

    await this.prisma.teacher.update({
      where: { userId: input.teacherId },
      data: { schoolType: input.schoolType },
    });

    this.cache.invalidate(CacheService.KEYS.bandCounts);

    await this.audit.record({
      action: 'teacher.classified',
      entity: 'teacher',
      entityId: input.teacherId,
      actorId: input.actorId,
      before: { schoolType: before },
      after: { schoolType: input.schoolType, outOfBandSubjects: outOfBand },
    });

    return {
      teacherId: input.teacherId,
      fullName: teacher.user.fullName,
      schoolType: input.schoolType,
      changed: true,
      outOfBandSubjects: outOfBand,
    };
  }

  // -------------------------------------------------------------------------
  // Students
  // -------------------------------------------------------------------------

  /**
   * The student roster, grouped by the band their level belongs to.
   *
   * Derived, not stored: a learner moved from Form 5 to Lower Sixth changes band
   * by changing class, and there is no second field to forget to update.
   */
  async students(filter: { schoolType?: SchoolType | 'unclassified'; query?: string }, actorId: string) {
    /**
     * One query, for the same reason as the teacher roster above.
     *
     * The Prisma equivalent fanned out to **ten** statements — level, subjects,
     * subject names, user, freezes, guardians, guardian users, subscriptions,
     * plans — which against a database in another region is ten round trips
     * before any work happens. It measured at 2894ms; this measures a fraction
     * of that, returning identical rows.
     */
    const conditions: string[] = [];
    const params: unknown[] = [];

    if (filter.schoolType === 'unclassified') {
      conditions.push('lr.level_id IS NULL');
    } else if (filter.schoolType) {
      params.push(filter.schoolType);
      conditions.push(`lv.school_type = $${params.length}::"SchoolType"`);
    }
    if (filter.query) {
      params.push(`%${filter.query}%`);
      conditions.push(`lr.full_name ILIKE $${params.length}`);
    }
    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const learners = await this.prisma.$queryRawUnsafe<StudentRosterRow[]>(
      `
      SELECT
        lr.id                    AS "learnerId",
        lr.full_name             AS "fullName",
        lr.dob                   AS "dob",
        lr.user_id               AS "userId",
        lr.approval_state::text  AS "approvalState",
        lr.status::text          AS "status",
        lv.id                    AS "levelId",
        lv.name_en               AS "levelNameEn",
        lv.name_fr               AS "levelNameFr",
        lv.school_type::text     AS "schoolType",
        COALESCE(sj.subjects, '[]'::json) AS "subjects",
        g.full_name              AS "guardianName",
        g.phone_e164             AS "guardianPhone",
        sb.plan_code             AS "plan",
        fz.kind::text            AS "freezeKind"
      FROM learners lr
      LEFT JOIN levels lv ON lv.id = lr.level_id
      LEFT JOIN LATERAL (
        SELECT json_agg(json_build_object('nameEn', s.name_en, 'nameFr', s.name_fr)
                        ORDER BY s.sort_order) AS subjects
          FROM learner_subjects ls
          JOIN subjects s ON s.id = ls.subject_id
         WHERE ls.learner_id = lr.id
      ) sj ON TRUE
      LEFT JOIN LATERAL (
        SELECT u.full_name, u.phone_e164
          FROM guardian_learners gl
          JOIN users u ON u.id = gl.guardian_id
         WHERE gl.learner_id = lr.id
         ORDER BY gl.is_primary DESC, gl.created_at ASC
         LIMIT 1
      ) g ON TRUE
      LEFT JOIN LATERAL (
        SELECT p.code AS plan_code
          FROM subscriptions su
          JOIN plans p ON p.id = su.plan_id
         WHERE su.learner_id = lr.id
         ORDER BY su.created_at DESC
         LIMIT 1
      ) sb ON TRUE
      LEFT JOIN LATERAL (
        -- A manual freeze outranks an automatic one (§5.5), so it is the one
        -- reported when both are live.
        SELECT f.kind
          FROM account_freezes f
         WHERE f.learner_id = lr.id AND f.lifted_at IS NULL
         ORDER BY (f.kind = 'manual') DESC
         LIMIT 1
      ) fz ON TRUE
      ${where}
      ORDER BY lr.full_name
      LIMIT 500
      `,
      ...params,
    );

    // FR-RBA-004: staff reading learners' personal data is itself auditable.
    // One entry for the read, naming how many records it covered — an entry per
    // learner would bury the trail that matters under a roster page view.
    await this.audit.record({
      action: 'staff.viewed_learner',
      entity: 'learner_roster',
      entityId: filter.schoolType ?? 'all',
      actorId,
      after: { count: learners.length, band: filter.schoolType ?? 'all', query: filter.query ?? null },
    });

    const now = new Date();

    return learners.map((learner) => ({
      learnerId: learner.learnerId,
      fullName: learner.fullName,
      // Derived from the level, so it cannot disagree with the class.
      schoolType: learner.schoolType,
      level: learner.levelId
        ? { id: learner.levelId, nameEn: learner.levelNameEn, nameFr: learner.levelNameFr }
        : null,
      subjects: learner.subjects,
      dob: learner.dob.toISOString().slice(0, 10),
      // FR-FAM-006: derived from the date of birth, never a stored flag.
      ageYears: ageInYears(learner.dob, now),
      isMinor: isMinor(learner.dob, now),
      approvalState: learner.approvalState,
      status: learner.status,
      hasOwnSignIn: Boolean(learner.userId),
      guardian: learner.guardianName
        ? { fullName: learner.guardianName, phone: learner.guardianPhone }
        : null,
      plan: learner.plan,
      frozen: learner.freezeKind !== null,
      freezeKind: learner.freezeKind,
    }));
  }

  /** Counts per band, for the roster's filter chips and the overview. */
  async bandCounts() {
    // Read by both roster screens on every load, and by the band filter chips.
    // Three aggregate queries for numbers that move a few times a day.
    return this.cache.get(CacheService.KEYS.bandCounts, CacheService.TTL.bandCounts, () =>
      this.computeBandCounts(),
    );
  }

  private async computeBandCounts() {
    const [teachers, learners, unclassifiedTeachers] = await Promise.all([
      this.prisma.teacher.groupBy({ by: ['schoolType'], _count: true }),
      this.prisma.learner.findMany({
        select: { level: { select: { schoolType: true } } },
      }),
      this.prisma.teacher.count({ where: { schoolType: null } }),
    ]);

    const learnerCounts = new Map<string, number>();
    for (const learner of learners) {
      const band = learner.level?.schoolType ?? 'unclassified';
      learnerCounts.set(band, (learnerCounts.get(band) ?? 0) + 1);
    }

    return {
      teachers: Object.fromEntries(
        teachers.map((row) => [row.schoolType ?? 'unclassified', row._count]),
      ),
      learners: Object.fromEntries(learnerCounts),
      teachersUnclassified: unclassifiedTeachers,
    };
  }
}
