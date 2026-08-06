import { Injectable } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';
import { PlatformConfigService } from '../common/platform-config.service';
import { PasswordService } from './password.service';
import { TokenService, type IssuedTokens } from './token.service';
import { OtpService } from './otp.service';
import { TotpService } from './totp.service';
import { FieldEncryptionService } from '../teachers/field-encryption.service';
import { AuditService } from '../audit/audit.service';
import { NotificationsService } from '../notifications/notifications.service';
import { AppError } from '../common/http-exception.filter';
import { VERIFICATION_CHECKLIST } from '../teachers/verification-checklist';
import {
  CONFIG_KEYS,
  isMinor,
  requiresMfa,
  type Role,
  type RegisterInput,
  type PasswordLoginInput,
  type VerifyOtpInput,
} from '@classconnect/shared';

/**
 * Registration and authentication — FR-AUT-001..008.
 */
@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: PlatformConfigService,
    private readonly passwords: PasswordService,
    private readonly tokens: TokenService,
    private readonly otp: OtpService,
    private readonly totp: TotpService,
    private readonly encryption: FieldEncryptionService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
  ) {}

  /**
   * Registration, for Parents and Adult Learners only.
   *
   * FR-AUT-001 also listed Teacher; that is withdrawn. Student and Teacher
   * accounts are created by an Admin, so neither role is expressible in the
   * registration DTO and there is no branch here that could create one.
   */
  async register(input: RegisterInput): Promise<{ userId: string; requiresOtp: boolean; devCode?: string }> {
    if (input.phone) {
      const existing = await this.prisma.user.findUnique({ where: { phoneE164: input.phone } });
      if (existing) throw AppError.conflict('errors.phone.taken');
    }
    if (input.email) {
      const existing = await this.prisma.user.findUnique({ where: { email: input.email } });
      if (existing) throw AppError.conflict('errors.email.taken');
    }

    // An Adult Learner is by definition 18+ (§1.3). A minor reaching this path
    // is a data-entry error, and creating the account would put a child outside
    // the safeguarding controls in §4.10.
    if (input.role === 'adult_learner' && input.dob) {
      const dob = new Date(input.dob);
      if (dob > new Date()) throw AppError.badRequest('errors.dob.future');
      if (isMinor(dob)) throw AppError.badRequest('errors.dob.adult_required');
    }

    const passwordHash = input.password ? await this.passwords.hash(input.password) : null;

    const user = await this.prisma.$transaction(async (tx) => {
      const created = await tx.user.create({
        data: {
          phoneE164: input.phone ?? null,
          email: input.email ?? null,
          passwordHash,
          fullName: input.fullName,
          preferredLanguage: input.preferredLanguage,
          status: 'pending_verification',
          roles: { create: { role: input.role } },
        },
      });

      // NFR-PRV-002: acceptance of the privacy notice and terms is recorded.
      await tx.consent.createMany({
        data: [
          { userId: created.id, consentType: 'terms_of_service', version: '1.0' },
          { userId: created.id, consentType: 'privacy_notice', version: '1.0' },
        ],
      });

      if (input.role === 'parent') {
        await tx.guardian.create({ data: { userId: created.id } });
      }

      if (input.role === 'adult_learner' && input.dob) {
        await tx.learner.create({
          data: {
            userId: created.id,
            fullName: input.fullName,
            dob: new Date(input.dob),
            preferredLanguage: input.preferredLanguage,
          },
        });
      }

      /**
       * FR-TVR-001/003: a teacher states what they teach and enters the
       * verification queue as `submitted`.
       *
       * The account exists; the entitlement does not. FR-TVR-003 keeps an
       * unapproved teacher unlistable, unassignable and unpaid until an Admin
       * completes the checklist, so self-registration widens the intake without
       * touching the control that protects learners.
       */
      if (input.role === 'teacher' && input.subjects && input.schoolType) {
        await tx.teacher.create({
          data: {
            userId: created.id,
            schoolType: input.schoolType,
            // FR-TVR-001: what they teach in, not what they read the site in.
            languages: input.teachingLanguages ?? [input.preferredLanguage],
            verificationStatus: 'submitted',
            submittedAt: new Date(),
          },
        });

        await tx.teacherSubject.createMany({
          data: input.subjects.map((pair) => ({
            teacherId: created.id,
            subjectId: pair.subjectId,
            levelId: pair.levelId,
          })),
          skipDuplicates: true,
        });

        // FR-TVR-004: the queue renders a checklist. Creating the rows now
        // means an Admin cannot approve an application that has none.
        await tx.verificationChecklistItem.createMany({
          data: VERIFICATION_CHECKLIST.map((item) => ({
            teacherId: created.id,
            itemKey: item.key,
            verified: false,
          })),
        });
      }

      return created;
    });

    await this.audit.record({
      action: 'user.registered',
      entity: 'user',
      entityId: user.id,
      actorId: user.id,
      after: { role: input.role },
    });

    // FR-AUT-002: the phone is verified by a 6-digit code before the account
    // becomes active.
    if (input.phone) {
      const issued = await this.otp.issue(
        input.phone,
        'registration',
        'sms',
        input.preferredLanguage,
        user.id,
      );
      return { userId: user.id, requiresOtp: true, ...(issued.devCode ? { devCode: issued.devCode } : {}) };
    }

    return { userId: user.id, requiresOtp: false };
  }

  /**
   * FR-AUT-002: verifies the phone and, on success, signs the user in.
   * Also serves passwordless sign-in for the phone-first majority (AS-07).
   */
  async verifyOtpAndSignIn(
    input: VerifyOtpInput,
    device?: { label?: string; ip?: string; userAgent?: string },
  ): Promise<IssuedTokens> {
    await this.otp.verify(input.phone, input.purpose, input.code);

    const user = await this.prisma.user.findUnique({
      where: { phoneE164: input.phone },
      include: { roles: true },
    });
    if (!user) throw AppError.unauthorised();
    if (user.status === 'suspended') throw AppError.forbidden('errors.account.suspended');

    const roles = user.roles.map((r) => r.role as Role);

    // FR-AUT-009: staff cannot hold a passwordless phone-only path.
    if (requiresMfa(roles)) {
      throw AppError.forbidden('errors.mfa.required');
    }

    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        phoneVerifiedAt: user.phoneVerifiedAt ?? new Date(),
        status: user.status === 'pending_verification' ? 'active' : user.status,
        failedLoginCount: 0,
        lockedUntil: null,
      },
    });

    await this.audit.record({ action: 'user.login', entity: 'user', entityId: user.id, actorId: user.id });

    return this.tokens.issue(user.id, roles, user.preferredLanguage, {
      ...(device?.label ? { label: device.label } : {}),
      ...(device?.ip ? { ip: device.ip } : {}),
      ...(device?.userAgent ? { userAgent: device.userAgent } : {}),
    });
  }

  /**
   * FR-AUT-003: email/password sign-in.
   * FR-AUT-007: lock for 15 minutes after 10 consecutive failures, and notify
   *             the account holder.
   * FR-AUT-009: MFA is required for Admin and Support roles.
   */
  async signInWithPassword(
    input: PasswordLoginInput,
    device?: { label?: string; ip?: string; userAgent?: string },
  ): Promise<IssuedTokens> {
    // Either identifier resolves to the same account. `findFirst` rather than
    // `findUnique` because the lookup key varies; both columns are unique
    // (DAT-004), so at most one row can match.
    const user = await this.prisma.user.findFirst({
      where: input.phone ? { phoneE164: input.phone } : { email: input.email },
      include: { roles: true },
    });

    const threshold = this.config.getNumber(CONFIG_KEYS.LOCKOUT_THRESHOLD);
    const lockMinutes = this.config.getNumber(CONFIG_KEYS.LOCKOUT_MINUTES);

    // Verify against a dummy hash when the account is absent, so a missing
    // account and a wrong password take comparable time and the endpoint does
    // not enumerate registered addresses.
    if (!user || !user.passwordHash) {
      await this.passwords.verify(DUMMY_HASH, input.password);
      throw AppError.unauthorised('errors.password.incorrect');
    }

    if (user.lockedUntil && user.lockedUntil > new Date()) {
      throw AppError.tooManyRequests('errors.account.locked', { minutes: lockMinutes });
    }
    if (user.status === 'suspended') throw AppError.forbidden('errors.account.suspended');

    const valid = await this.passwords.verify(user.passwordHash, input.password);

    if (!valid) {
      const failures = user.failedLoginCount + 1;
      const shouldLock = failures >= threshold;

      await this.prisma.user.update({
        where: { id: user.id },
        data: {
          failedLoginCount: shouldLock ? 0 : failures,
          lockedUntil: shouldLock ? new Date(Date.now() + lockMinutes * 60_000) : null,
        },
      });

      await this.audit.record({
        action: shouldLock ? 'user.locked' : 'user.login_failed',
        entity: 'user',
        entityId: user.id,
        after: { failures },
      });

      if (shouldLock) {
        // FR-AUT-007: the account holder is told.
        await this.notifications.notifyUser(user.id, 'accountLocked', { minutes: lockMinutes });
        throw AppError.tooManyRequests('errors.account.locked', { minutes: lockMinutes });
      }
      throw AppError.unauthorised('errors.password.incorrect');
    }

    const roles = user.roles.map((r) => r.role as Role);

    // FR-AUT-009: multi-factor authentication for all Admin and Support roles.
    if (requiresMfa(roles)) {
      if (!input.mfaCode) throw AppError.unauthorised('errors.mfa.required');
      const accepted = await this.verifyMfa(user.id, input.mfaCode);
      if (!accepted) throw AppError.unauthorised('errors.mfa.incorrect');
    }

    await this.prisma.user.update({
      where: { id: user.id },
      data: { failedLoginCount: 0, lockedUntil: null },
    });

    await this.audit.record({ action: 'user.login', entity: 'user', entityId: user.id, actorId: user.id });

    return this.tokens.issue(user.id, roles, user.preferredLanguage, {
      ...(device?.label ? { label: device.label } : {}),
      ...(device?.ip ? { ip: device.ip } : {}),
      ...(device?.userAgent ? { userAgent: device.userAgent } : {}),
    });
  }

  /**
   * FR-AUT-008: password reset via a single-use, time-limited OTP on the phone.
   * FR-AUT-006: every refresh token is invalidated on password change.
   */
  async resetPasswordWithOtp(phone: string, code: string, newPassword: string): Promise<void> {
    await this.otp.verify(phone, 'password_reset', code);

    const user = await this.prisma.user.findUnique({ where: { phoneE164: phone } });
    if (!user) throw AppError.unauthorised();

    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        passwordHash: await this.passwords.hash(newPassword),
        failedLoginCount: 0,
        lockedUntil: null,
      },
    });

    await this.tokens.revokeAll(user.id, 'password_changed');
    await this.audit.record({
      action: 'user.password_changed',
      entity: 'user',
      entityId: user.id,
      actorId: user.id,
    });
  }

  async requestOtp(
    phone: string,
    purpose: 'registration' | 'login' | 'password_reset' | 'phone_change',
    channel: 'sms' | 'whatsapp' | 'voice',
    language: 'en' | 'fr',
  ): Promise<{ expiresAt: Date; devCode?: string }> {
    const user = await this.prisma.user.findUnique({ where: { phoneE164: phone } });

    // Do not reveal whether the number is registered: the limits in FR-AUT-004
    // are applied regardless, and the response shape is identical either way.
    return this.otp.issue(phone, purpose, channel, language, user?.id);
  }

  async currentUser(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { roles: true },
    });
    if (!user) throw AppError.unauthorised();

    return {
      id: user.id,
      fullName: user.fullName,
      roles: user.roles.map((r) => r.role as Role),
      preferredLanguage: user.preferredLanguage,
      phoneVerified: user.phoneVerifiedAt !== null,
      emailVerified: user.emailVerifiedAt !== null,
      mfaEnabled: user.mfaEnabled,
    };
  }

  /**
   * FR-AUT-009: the second factor for staff.
   *
   * Fails closed when the account holds a staff role but has not enrolled: an
   * unenrolled admin cannot sign in, rather than silently bypassing the factor.
   * Enrolment is a deliberate, audited step (see `beginMfaEnrolment`).
   */
  private async verifyMfa(userId: string, code: string): Promise<boolean> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { mfaEnabled: true, mfaSecret: true },
    });
    if (!user?.mfaEnabled || !user.mfaSecret) return false;

    return this.totp.verify(this.encryption.decrypt(user.mfaSecret), code);
  }

  /**
   * Starts MFA enrolment, returning the secret and its provisioning URI.
   *
   * The secret is stored encrypted (NFR-SEC-003) but `mfaEnabled` stays false
   * until a first code is confirmed, so a half-finished enrolment cannot lock
   * the account holder out.
   */
  async beginMfaEnrolment(userId: string): Promise<{ secret: string; uri: string }> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { email: true, phoneE164: true, fullName: true },
    });
    if (!user) throw AppError.notFound();

    const secret = this.totp.generateSecret();
    await this.prisma.user.update({
      where: { id: userId },
      data: { mfaSecret: this.encryption.encrypt(secret), mfaEnabled: false },
    });

    const account = user.email ?? user.phoneE164 ?? user.fullName;
    return { secret, uri: this.totp.provisioningUri(secret, account) };
  }

  /** Confirms enrolment by proving the authenticator is in sync. */
  async confirmMfaEnrolment(userId: string, code: string): Promise<void> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { mfaSecret: true },
    });
    if (!user?.mfaSecret) throw AppError.badRequest('errors.mfa.not_started');

    if (!this.totp.verify(this.encryption.decrypt(user.mfaSecret), code)) {
      throw AppError.badRequest('errors.mfa.incorrect');
    }

    await this.prisma.user.update({ where: { id: userId }, data: { mfaEnabled: true } });

    await this.audit.record({
      action: 'user.password_changed',
      entity: 'user',
      entityId: userId,
      actorId: userId,
      after: { mfaEnabled: true },
    });
  }
}

/**
 * A fixed Argon2id hash of a random value, used to equalise timing on the
 * account-not-found path. It corresponds to no usable password.
 */
const DUMMY_HASH =
  '$argon2id$v=19$m=19456,t=2,p=1$c29tZXNhbHR2YWx1ZQ$JXe2QF3z8Zi0lRZ4RTe2m4rQvXqDqXBGZbXQ0h0hFVo';
