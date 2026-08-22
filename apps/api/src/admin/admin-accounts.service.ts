import { Injectable } from '@nestjs/common';
import { randomInt } from 'node:crypto';
import { PrismaService } from '../common/prisma.service';
import { AuditService } from '../audit/audit.service';
import { NotificationsService } from '../notifications/notifications.service';
import { PasswordService } from '../auth/password.service';
import { FieldEncryptionService } from '../teachers/field-encryption.service';
import { AppError } from '../common/http-exception.filter';
import { MANDATORY_CHECKLIST_KEYS, VERIFICATION_CHECKLIST } from '../teachers/verification-checklist';
import { isMinor } from '@classconnect/shared';
import type { AuthenticatedUser } from '../rbac/decorators';
import type { AdminCreateStudentInput, AdminCreateTeacherInput } from '@classconnect/shared';

/**
 * A password for somebody to type once, off a text message, on a phone.
 *
 * `randomInt` rather than `Math.random`, because this is a credential: it is
 * the difference between unguessable and merely untidy.
 *
 * The alphabet omits the characters that are read wrong from a small screen —
 * O and 0, I and l and 1 — because every one of those becomes a failed sign-in
 * that reads as "the account does not work" and arrives as a support call. Two
 * pronounceable-ish chunks and four digits gives roughly 2^57 of entropy, which
 * is far beyond what a password that expires on first use needs, and is short
 * enough to copy without a mistake.
 *
 * The result is never stored. It is hashed for the account and sent to the
 * student, and this process forgets it when the request ends.
 */
function temporaryPassword(): string {
  const letters = 'abcdefghjkmnpqrstuvwxyz';
  const digits = '23456789';
  const pick = (from: string, count: number) =>
    Array.from({ length: count }, () => from[randomInt(from.length)]).join('');

  // Capitalised and punctuated so it satisfies a password policy that asks for
  // a mix, without asking a fourteen-year-old to invent one under pressure.
  return `${pick(letters, 4).replace(/^./, (c) => c.toUpperCase())}-${pick(letters, 4)}${pick(digits, 4)}`;
}

/**
 * Admin-created Student and Teacher accounts.
 *
 * Only an Admin brings these accounts into existence. There is no self-service
 * teacher application and no parent-created child, so this service is the sole
 * entry point — which is what makes "only the Admin decides who teaches and who
 * learns" true of the system rather than merely of the user interface.
 *
 * FR-RBA-004: every creation is audited, with the creating Admin recorded on
 * the row itself as well as in the trail.
 */
@Injectable()
export class AdminAccountsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
    private readonly passwords: PasswordService,
    private readonly encryption: FieldEncryptionService,
  ) {}

  /**
   * Creates a Student account: school type, class, and the subjects they will
   * learn.
   */
  async createStudent(admin: AuthenticatedUser, input: AdminCreateStudentInput) {
    const dob = new Date(input.dob);
    if (dob > new Date()) throw AppError.badRequest('errors.dob.future');

    // The level must exist and must belong to the school type the Admin chose.
    const level = await this.prisma.level.findFirst({
      where: { id: input.levelId, active: true },
      include: { subjects: { select: { subjectId: true } } },
    });
    if (!level) throw AppError.badRequest('errors.level.not_found');
    if (level.schoolType !== input.schoolType) {
      throw AppError.badRequest('errors.level.wrong_school_type');
    }

    // FR-PRO-002: a learner can only take subjects offered at their level.
    // Without this a Class 2 pupil could be enrolled in A-Level Further Maths.
    const offered = new Set(level.subjects.map((row) => row.subjectId));
    const notOffered = input.subjectIds.filter((id) => !offered.has(id));
    if (notOffered.length > 0) {
      throw AppError.badRequest('errors.subject.not_at_level', { count: notOffered.length });
    }

    // Optional guardian link, resolved before anything is written so a bad
    // phone number fails the whole request rather than orphaning a learner.
    let guardianId: string | null = null;
    if (input.guardianPhone) {
      const guardian = await this.prisma.user.findUnique({
        where: { phoneE164: input.guardianPhone },
        include: { roles: true },
      });
      if (!guardian) throw AppError.badRequest('errors.guardian.invitee_not_found');
      if (!guardian.roles.some((role) => role.role === 'parent')) {
        throw AppError.badRequest('errors.guardian.not_a_parent');
      }
      guardianId = guardian.id;
    }

    if (input.phone) {
      const taken = await this.prisma.user.findUnique({ where: { phoneE164: input.phone } });
      if (taken) throw AppError.conflict('errors.phone.taken');
    }
    if (input.email) {
      const taken = await this.prisma.user.findUnique({ where: { email: input.email } });
      if (taken) throw AppError.conflict('errors.email.taken');
    }

    /*
     * A sign-in is created whenever there is somewhere to send it.
     *
     * The rule used to be "phone and password together, or neither", which put
     * the child's password in the hands of whoever filled the form. Now the
     * password is generated unless one was given, and the account is marked
     * `mustChangePassword` — so the person who created it holds a credential
     * that stops working the first time the student uses it.
     *
     * `temporary` is kept in memory only for the length of this request, to be
     * sent to the student below. It is never returned to the caller and never
     * written anywhere but the Argon2 hash.
     */
    const wantsSignIn = Boolean(input.phone || input.email);
    const temporary = wantsSignIn && !input.password ? temporaryPassword() : null;
    const plaintext = input.password ?? temporary;
    const passwordHash = plaintext ? await this.passwords.hash(plaintext) : null;
    const minor = isMinor(dob);

    const learner = await this.prisma.$transaction(async (tx) => {
      // FR-FAM-003: the student's own sign-in, where the Admin set one.
      let accountId: string | null = null;
      if (wantsSignIn && passwordHash) {
        const account = await tx.user.create({
          data: {
            phoneE164: input.phone ?? null,
            email: input.email ?? null,
            passwordHash,
            fullName: input.fullName,
            preferredLanguage: input.preferredLanguage,
            status: 'active',
            /*
             * Only a password this office generated has to be replaced. Where
             * an admin deliberately set one — a child sitting beside them who
             * chose it themselves — there is no shared secret to retire.
             */
            mustChangePassword: temporary !== null,
            // FR-FAM-006: minor status is derived from the date of birth.
            roles: { create: { role: minor ? 'student' : 'adult_learner' } },
          },
        });
        accountId = account.id;
      }

      const created = await tx.learner.create({
        data: {
          userId: accountId,
          fullName: input.fullName,
          dob,
          levelId: level.id,
          preferredLanguage: input.preferredLanguage,
          preferredStudyDays: [],
          createdBy: admin.id,
          guardianName: input.guardianName ?? null,
          guardianContact: input.guardianContact ?? null,
          ...(guardianId
            ? {
                guardians: {
                  create: {
                    guardianId,
                    accessLevel: 'full',
                    isPrimary: true,
                    acceptedAt: new Date(),
                    invitedBy: admin.id,
                  },
                },
              }
            : {}),
        },
      });

      await tx.learnerSubject.createMany({
        data: input.subjectIds.map((subjectId) => ({ learnerId: created.id, subjectId })),
        skipDuplicates: true,
      });

      // FR-SAF-009 / NFR-PRV-003: a minor's data needs recorded guardian
      // consent. Where the Admin created the account without linking a
      // guardian, there is nobody to consent yet — so the consent is recorded
      // against the guardian when one exists, and its absence is visible.
      if (minor && guardianId) {
        await tx.consent.create({
          data: {
            userId: guardianId,
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
      actorId: admin.id,
      after: {
        fullName: learner.fullName,
        schoolType: input.schoolType,
        levelCode: level.code,
        subjects: input.subjectIds.length,
        guardianLinked: guardianId !== null,
        hasOwnSignIn: learner.userId !== null,
      },
    });

    if (guardianId) {
      await this.notifications.notifyUser(guardianId, 'studentAccountCreated', {
        studentName: learner.fullName,
      });
    }

    /*
     * The credentials go to the student, not to whoever created the account.
     *
     * Sent after the transaction commits: a notification for an account that
     * was then rolled back is worse than no notification, and there is nothing
     * to undo once an SMS has gone.
     *
     * A password in an SMS is a real exposure and is accepted deliberately.
     * §6.2's learners are on shared handsets with intermittent data and often no
     * email; a reset link they cannot open is not more secure, it is unusable.
     * What limits the exposure is that the password is single-use in practice —
     * `mustChangePassword` forces it to be replaced before the account can do
     * anything — so the message is worth reading once and worthless afterwards.
     */
    if (learner.userId && temporary) {
      await this.notifications.notifyUser(
        learner.userId,
        'studentCredentials',
        { name: learner.fullName, password: temporary },
        // FR-NOT-003: transactional. An account nobody was told about is an
        // account nobody can use, so this is not subject to preferences.
        { dedupeKey: `student-credentials:${learner.userId}` },
      );
    }

    return this.presentStudent(learner.id);
  }

  /**
   * Creates a Teacher account, with the verification checklist recorded in the
   * same action.
   *
   * FR-TVR-005: approval requires every mandatory item to be affirmatively
   * verified. An incomplete checklist still creates the account — it simply
   * leaves it `under_review`, and FR-TVR-003 keeps an unapproved teacher
   * unlistable, unassignable and unpaid.
   */
  async createTeacher(admin: AuthenticatedUser, input: AdminCreateTeacherInput) {
    const existing = await this.prisma.user.findUnique({ where: { phoneE164: input.phone } });
    if (existing) throw AppError.conflict('errors.phone.taken');

    if (input.email) {
      const emailTaken = await this.prisma.user.findUnique({ where: { email: input.email } });
      if (emailTaken) throw AppError.conflict('errors.email.taken');
    }

    // Every subject must sit at a level of the chosen school type, so a
    // "primary" teacher cannot be given Upper Sixth Further Maths.
    const levelIds = [...new Set(input.subjects.map((pair) => pair.levelId))];
    const levels = await this.prisma.level.findMany({
      where: { id: { in: levelIds } },
      include: { subjects: { select: { subjectId: true } } },
    });

    if (levels.length !== levelIds.length) throw AppError.badRequest('errors.level.not_found');

    const wrongType = levels.filter((level) => level.schoolType !== input.schoolType);
    if (wrongType.length > 0) {
      throw AppError.badRequest('errors.level.wrong_school_type');
    }

    const offeredByLevel = new Map(
      levels.map((level) => [level.id, new Set(level.subjects.map((s) => s.subjectId))]),
    );
    const invalidPair = input.subjects.find(
      (pair) => !offeredByLevel.get(pair.levelId)?.has(pair.subjectId),
    );
    if (invalidPair) throw AppError.badRequest('errors.subject.not_at_level', { count: 1 });

    // FR-TVR-005: judge approval against the submitted checklist.
    const verified = new Map(input.checklist.map((item) => [item.itemKey, item.verified]));
    const missing = MANDATORY_CHECKLIST_KEYS.filter((key) => verified.get(key) !== true);
    const approved = missing.length === 0;
    const now = new Date();

    const passwordHash = await this.passwords.hash(input.password);

    const teacherId = await this.prisma.$transaction(async (tx) => {
      const account = await tx.user.create({
        data: {
          phoneE164: input.phone,
          email: input.email ?? null,
          passwordHash,
          fullName: input.fullName,
          preferredLanguage: input.preferredLanguage,
          status: 'active',
          // The Admin verified the person in the room; the phone is trusted.
          phoneVerifiedAt: now,
          roles: { create: { role: 'teacher' } },
        },
      });

      await tx.teacher.create({
        data: {
          userId: account.id,
          schoolType: input.schoolType,
          createdBy: admin.id,
          bio: input.bio ?? null,
          yearsExperience: input.yearsExperience,
          highestQualification: input.highestQualification,
          institution: input.institution,
          qualificationYear: input.qualificationYear,
          languages: input.languages,
          // FR-PRO-005 / NFR-SEC-003.
          nationalIdEnc: this.encryption.encrypt(input.nationalId),
          payoutWalletEnc: this.encryption.encrypt(input.payoutWallet),
          payoutMethod: input.payoutMethod,
          // FR-ERN-010: a wallet is unverified until Finance confirms it, no
          // matter who created the account.
          walletVerified: false,
          kycComplete: approved,
          verificationStatus: approved ? 'approved' : 'under_review',
          submittedAt: now,
          verifiedBy: admin.id,
          verifiedAt: approved ? now : null,
        },
      });

      await tx.teacherSubject.createMany({
        data: input.subjects.map((pair) => ({
          teacherId: account.id,
          subjectId: pair.subjectId,
          levelId: pair.levelId,
        })),
        skipDuplicates: true,
      });

      // FR-TVR-004/010: every checklist item is stored with who verified it and
      // when, whether or not it was ticked.
      await tx.verificationChecklistItem.createMany({
        data: VERIFICATION_CHECKLIST.map((item) => {
          const submitted = input.checklist.find((entry) => entry.itemKey === item.key);
          return {
            teacherId: account.id,
            itemKey: item.key,
            verified: submitted?.verified ?? false,
            findings: submitted?.findings ?? null,
            verifiedBy: submitted ? admin.id : null,
            verifiedAt: submitted ? now : null,
          };
        }),
      });

      return account.id;
    });

    await this.audit.record({
      action: approved ? 'teacher.approved' : 'teacher.applied',
      entity: 'teacher',
      entityId: teacherId,
      actorId: admin.id,
      after: {
        createdByAdmin: true,
        schoolType: input.schoolType,
        subjects: input.subjects.length,
        qualification: input.highestQualification,
        checklist: input.checklist,
        status: approved ? 'approved' : 'under_review',
        outstandingChecklistItems: missing,
      },
    });

    await this.notifications.notifyUser(
      teacherId,
      approved ? 'teacherApproved' : 'teacherAccountCreated',
    );

    return {
      teacherId,
      status: approved ? 'approved' : 'under_review',
      /** FR-TVR-003: an unapproved teacher cannot be listed, assigned or paid. */
      assignable: approved,
      outstandingChecklistItems: missing,
    };
  }

  /** Every student, for the Admin's list view. */
  /**
   * The roster, filtered the way the four bands are actually thought about.
   *
   * `schoolType` covers Primary, Secondary and Sixth Form, which come from the
   * level. Private is not one of those — it is `EnrolmentType`, a separate fact
   * because a private Class One learner sits at the same level as the Primary
   * Class One class and is not part of it. The two filters are independent for
   * that reason: "Sixth Form" and "Private" can both be true of one learner.
   *
   * `sixth_form` was missing from the signature entirely, so the two Sixth Form
   * levels could be created and never listed.
   */
  async listStudents(
    schoolType?: 'primary' | 'secondary' | 'sixth_form',
    enrolment?: 'school' | 'private',
  ) {
    const learners = await this.prisma.learner.findMany({
      where: {
        archivedAt: null,
        ...(schoolType ? { level: { schoolType } } : {}),
        ...(enrolment ? { enrolmentType: enrolment } : {}),
      },
      include: {
        level: true,
        subjects: { include: { subject: true } },
        user: { select: { id: true, phoneE164: true } },
        guardians: { include: { guardian: { include: { user: { select: { fullName: true } } } } } },
      },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });

    return learners.map((learner) => ({
      id: learner.id,
      fullName: learner.fullName,
      dob: learner.dob.toISOString().slice(0, 10),
      isMinor: isMinor(learner.dob),
      schoolType: learner.level?.schoolType ?? null,
      level: learner.level
        ? { id: learner.level.id, nameEn: learner.level.nameEn, nameFr: learner.level.nameFr }
        : null,
      subjects: learner.subjects.map((row) => ({
        id: row.subject.id,
        nameEn: row.subject.nameEn,
        nameFr: row.subject.nameFr,
      })),
      /*
       * Whether this learner studies privately, which the level cannot say. A
       * private Class One learner sits at the Primary Class One level and is not
       * in that class, so the roster has to show the difference.
       */
      enrolmentType: learner.enrolmentType,
      hasOwnSignIn: learner.user !== null,
      /*
       * The account id, not the learner id — the delete endpoint acts on users.
       *
       * Null where the learner has no sign-in of their own, and the row is then
       * not selectable: there is no account to remove, and the learner record is
       * archived through a different route.
       */
      userId: learner.user?.id ?? null,
      guardians: learner.guardians.map((link) => link.guardian.user.fullName),
    }));
  }

  private async presentStudent(learnerId: string) {
    const learner = await this.prisma.learner.findUnique({
      where: { id: learnerId },
      include: {
        level: true,
        subjects: { include: { subject: true } },
        user: { select: { id: true } },
        guardians: { select: { guardianId: true } },
      },
    });
    if (!learner) throw AppError.notFound();

    return {
      id: learner.id,
      fullName: learner.fullName,
      dob: learner.dob.toISOString().slice(0, 10),
      isMinor: isMinor(learner.dob),
      schoolType: learner.level?.schoolType ?? null,
      level: learner.level
        ? { id: learner.level.id, nameEn: learner.level.nameEn, nameFr: learner.level.nameFr }
        : null,
      subjects: learner.subjects.map((row) => ({
        id: row.subject.id,
        nameEn: row.subject.nameEn,
        nameFr: row.subject.nameFr,
      })),
      hasOwnSignIn: learner.user !== null,
      guardianCount: learner.guardians.length,
    };
  }
}
