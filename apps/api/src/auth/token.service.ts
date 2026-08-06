import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { randomBytes } from 'node:crypto';
import { PrismaService } from '../common/prisma.service';
import { PlatformConfigService } from '../common/platform-config.service';
import { PasswordService } from './password.service';
import { AuditService } from '../audit/audit.service';
import { CONFIG_KEYS, type Role } from '@classconnect/shared';
import { AppError } from '../common/http-exception.filter';

export interface AccessTokenClaims {
  sub: string;
  roles: Role[];
  lang: 'en' | 'fr';
  /** FR-RBA-005: present only for a staff "view as" session. */
  imp?: { t: string; g: string };
}

export interface IssuedTokens {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

/**
 * FR-AUT-006: a short-lived access token (<= 15 minutes) and a rotating refresh
 * token (<= 30 days). All refresh tokens for a user are invalidated on password
 * change, on suspension, and on "sign out of all devices".
 */
@Injectable()
export class TokenService {
  constructor(
    private readonly jwt: JwtService,
    private readonly env: ConfigService,
    private readonly config: PlatformConfigService,
    private readonly prisma: PrismaService,
    private readonly passwords: PasswordService,
    private readonly audit: AuditService,
  ) {}

  async issue(
    userId: string,
    roles: Role[],
    language: 'en' | 'fr',
    device?: { label?: string; ip?: string; userAgent?: string },
    impersonating?: { targetUserId: string; grantId: string },
  ): Promise<IssuedTokens> {
    const accessTtl = this.config.getNumber(CONFIG_KEYS.ACCESS_TOKEN_TTL_SECONDS);
    const refreshDays = this.config.getNumber(CONFIG_KEYS.REFRESH_TOKEN_TTL_DAYS);

    const claims: AccessTokenClaims = {
      sub: userId,
      roles,
      lang: language,
      ...(impersonating ? { imp: { t: impersonating.targetUserId, g: impersonating.grantId } } : {}),
    };

    const accessToken = await this.jwt.signAsync(claims, {
      secret: this.env.getOrThrow<string>('JWT_ACCESS_SECRET'),
      expiresIn: accessTtl,
    });

    // The refresh token is an opaque random value, not a JWT: it must be
    // revocable, and a stateless token cannot be revoked before it expires.
    const refreshToken = randomBytes(48).toString('base64url');
    const expiresAt = new Date(Date.now() + refreshDays * 86_400_000);

    await this.prisma.authSession.create({
      data: {
        userId,
        refreshTokenHash: this.passwords.digest(refreshToken),
        deviceLabel: device?.label ?? null,
        ipAddress: device?.ip ?? null,
        userAgent: device?.userAgent ?? null,
        expiresAt,
      },
    });

    return { accessToken, refreshToken, expiresIn: accessTtl };
  }

  /**
   * Rotates a refresh token. The presented token is revoked as the replacement
   * is issued, so a stolen token is usable at most once and the theft surfaces
   * as a failed refresh for the legitimate device.
   */
  async rotate(
    refreshToken: string,
    device?: { label?: string; ip?: string; userAgent?: string },
  ): Promise<IssuedTokens> {
    const hash = this.passwords.digest(refreshToken);

    const session = await this.prisma.authSession.findUnique({
      where: { refreshTokenHash: hash },
      include: {
        user: { include: { roles: true } },
      },
    });

    if (!session || session.revokedAt || session.expiresAt < new Date()) {
      throw AppError.unauthorised();
    }
    if (session.user.status === 'suspended') {
      throw AppError.forbidden('errors.account.suspended');
    }

    await this.prisma.authSession.update({
      where: { id: session.id },
      data: { revokedAt: new Date(), revokedReason: 'rotated' },
    });

    return this.issue(
      session.userId,
      session.user.roles.map((r) => r.role as Role),
      session.user.preferredLanguage,
      device,
    );
  }

  /** FR-AUT-010: an individual device is revocable from the session list. */
  async revokeSession(userId: string, sessionId: string): Promise<void> {
    const result = await this.prisma.authSession.updateMany({
      where: { id: sessionId, userId, revokedAt: null },
      data: { revokedAt: new Date(), revokedReason: 'user_revoked' },
    });
    if (result.count === 0) throw AppError.notFound();
  }

  /**
   * FR-AUT-006: invalidate every refresh token for a user. Called on password
   * change, on suspension, and on explicit "sign out of all devices".
   */
  async revokeAll(userId: string, reason: string): Promise<number> {
    const result = await this.prisma.authSession.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date(), revokedReason: reason },
    });
    await this.audit.record({
      action: 'user.sessions_revoked',
      entity: 'user',
      entityId: userId,
      after: { reason, count: result.count },
    });
    return result.count;
  }

  /** FR-AUT-010: device, approximate location and last activity, each revocable. */
  async listSessions(userId: string) {
    return this.prisma.authSession.findMany({
      where: { userId, revokedAt: null, expiresAt: { gt: new Date() } },
      select: {
        id: true,
        deviceLabel: true,
        approxLocation: true,
        ipAddress: true,
        lastActivityAt: true,
        createdAt: true,
      },
      orderBy: { lastActivityAt: 'desc' },
    });
  }

  async verifyAccessToken(token: string): Promise<AccessTokenClaims> {
    try {
      return await this.jwt.verifyAsync<AccessTokenClaims>(token, {
        secret: this.env.getOrThrow<string>('JWT_ACCESS_SECRET'),
      });
    } catch {
      throw AppError.unauthorised();
    }
  }
}
