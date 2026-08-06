import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';
import { PlatformConfigService } from '../common/platform-config.service';
import { PasswordService } from './password.service';
import { NotificationsService } from '../notifications/notifications.service';
import { AppError } from '../common/http-exception.filter';
import { CONFIG_KEYS, maskPhone } from '@classconnect/shared';
import type { OtpChannel, OtpPurpose } from '@classconnect/db';

/**
 * One-time codes.
 *
 * FR-AUT-002: a 6-digit code delivered by SMS verifies the primary identifier.
 * FR-AUT-004: a code expires after 5 minutes, is invalidated on use, permits at
 *             most 5 verification attempts, and issuance is rate-limited to
 *             3 codes per number per 15 minutes and 10 per day.
 * FR-AUT-005: WhatsApp or voice delivery is offered where SMS fails.
 *
 * Every one of those numbers is a configuration value (CON-07), defaulted to
 * the figure in the SRS.
 */
@Injectable()
export class OtpService {
  private readonly logger = new Logger(OtpService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: PlatformConfigService,
    private readonly passwords: PasswordService,
    private readonly notifications: NotificationsService,
  ) {}

  /**
   * Issues a code, or refuses under the FR-AUT-004 limits.
   *
   * Returns the code only when the caller is the development helper; in every
   * other path the code leaves the system solely through the delivery channel.
   */
  async issue(
    destination: string,
    purpose: OtpPurpose,
    channel: OtpChannel,
    language: 'en' | 'fr',
    userId?: string,
  ): Promise<{ expiresAt: Date; devCode?: string }> {
    await this.assertWithinIssuanceLimits(destination);

    const ttlSeconds = this.config.getNumber(CONFIG_KEYS.OTP_TTL_SECONDS);
    const maxAttempts = this.config.getNumber(CONFIG_KEYS.OTP_MAX_ATTEMPTS);

    const code = this.passwords.generateOtp();
    const expiresAt = new Date(Date.now() + ttlSeconds * 1000);

    // FR-AUT-004: a new code invalidates any outstanding one for the same
    // destination and purpose, so only the most recent code is live.
    await this.prisma.otpCode.updateMany({
      where: { destination, purpose, consumedAt: null },
      data: { consumedAt: new Date() },
    });

    await this.prisma.otpCode.create({
      data: {
        userId: userId ?? null,
        destination,
        // NFR-SEC-009: the code is stored hashed and never logged.
        codeHash: await this.passwords.hash(code),
        purpose,
        channel,
        maxAttempts,
        expiresAt,
      },
    });

    await this.notifications.sendOtp(destination, channel, code, language, {
      minutes: Math.round(ttlSeconds / 60),
    });

    this.logger.log({ msg: 'OTP issued', destination: maskPhone(destination), purpose, channel });

    return { expiresAt, ...(this.devExposeOtp() ? { devCode: code } : {}) };
  }

  /**
   * Verifies a code, consuming it on success.
   *
   * FR-AUT-004: at most `maxAttempts` verification attempts per code. The
   * attempt counter is incremented before the comparison, so a crash between
   * the two cannot yield a free attempt.
   */
  async verify(destination: string, purpose: OtpPurpose, code: string): Promise<{ userId: string | null }> {
    const record = await this.prisma.otpCode.findFirst({
      where: { destination, purpose, consumedAt: null },
      orderBy: { createdAt: 'desc' },
    });

    if (!record) throw AppError.badRequest('errors.otp.expired');

    if (record.expiresAt < new Date()) {
      throw AppError.badRequest('errors.otp.expired');
    }

    if (record.attempts >= record.maxAttempts) {
      throw AppError.tooManyRequests('errors.otp.too_many');
    }

    const updated = await this.prisma.otpCode.update({
      where: { id: record.id },
      data: { attempts: { increment: 1 } },
    });

    const matches = await this.passwords.verify(record.codeHash, code);
    if (!matches) {
      const remaining = Math.max(0, updated.maxAttempts - updated.attempts);
      if (remaining === 0) throw AppError.tooManyRequests('errors.otp.too_many');
      throw AppError.badRequest('errors.otp.incorrect', { remaining });
    }

    // FR-AUT-004: invalidated on use.
    await this.prisma.otpCode.update({
      where: { id: record.id },
      data: { consumedAt: new Date() },
    });

    return { userId: record.userId };
  }

  /** FR-AUT-004: 3 codes per number per 15 minutes, and 10 per day. */
  private async assertWithinIssuanceLimits(destination: string): Promise<void> {
    const windowMinutes = this.config.getNumber(CONFIG_KEYS.OTP_WINDOW_MINUTES);
    const maxPerWindow = this.config.getNumber(CONFIG_KEYS.OTP_MAX_PER_WINDOW);
    const maxPerDay = this.config.getNumber(CONFIG_KEYS.OTP_MAX_PER_DAY);

    const now = Date.now();
    const windowStart = new Date(now - windowMinutes * 60_000);
    const dayStart = new Date(now - 86_400_000);

    const [inWindow, inDay] = await Promise.all([
      this.prisma.otpCode.count({ where: { destination, createdAt: { gte: windowStart } } }),
      this.prisma.otpCode.count({ where: { destination, createdAt: { gte: dayStart } } }),
    ]);

    if (inDay >= maxPerDay) {
      throw AppError.tooManyRequests('errors.otp.daily_limit');
    }
    if (inWindow >= maxPerWindow) {
      throw AppError.tooManyRequests('errors.otp.rate_limited', { minutes: windowMinutes });
    }
  }

  /**
   * Development helper. Refused in production at boot (see main.ts) so it cannot
   * be switched on against real users.
   */
  private devExposeOtp(): boolean {
    return process.env.DEV_EXPOSE_OTP === 'true' && process.env.NODE_ENV !== 'production';
  }
}
