import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Req } from '@nestjs/common';
import type { Request } from 'express';
import { AuthService } from './auth.service';
import { TokenService } from './token.service';
import { zodBody, uuidParam } from '../common/zod-validation.pipe';
import { CurrentUser, Public, type AuthenticatedUser } from '../rbac/decorators';
import {
  registerSchema,
  requestOtpSchema,
  verifyOtpSchema,
  passwordLoginSchema,
  refreshSchema,
  passwordChangeSchema,
  passwordResetConfirmSchema,
  updatePreferredLanguageSchema,
  languageFromHeader,
  type RegisterInput,
  type RequestOtpInput,
  type VerifyOtpInput,
  type PasswordLoginInput,
  type PasswordChangeInput,
  type UpdatePreferredLanguageInput,
} from '@classconnect/shared';
import { AppError } from '../common/http-exception.filter';

/** COM-002: REST over JSON, versioned by URL path prefix (`/api/v1/...`). */
@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly tokens: TokenService,
  ) {}

  /** Registration, for Parents and Adult Learners only (see registerRoleSchema). */
  @Public()
  @Post('register')
  async register(@Body(zodBody(registerSchema)) body: RegisterInput) {
    return this.auth.register(body);
  }

  /** FR-AUT-002/004/005: issue a one-time code, with fallback channels. */
  @Public()
  @Post('otp/request')
  @HttpCode(200)
  async requestOtp(
    @Body(zodBody(requestOtpSchema)) body: RequestOtpInput,
    @Req() req: Request,
  ) {
    const language = languageFromHeader(req.header('accept-language'));
    return this.auth.requestOtp(body.phone, body.purpose, body.channel, language);
  }

  /** FR-AUT-002: verify the code and sign in. */
  @Public()
  @Post('otp/verify')
  @HttpCode(200)
  async verifyOtp(@Body(zodBody(verifyOtpSchema)) body: VerifyOtpInput, @Req() req: Request) {
    return this.auth.verifyOtpAndSignIn(body, this.device(req, body.deviceLabel));
  }

  /** FR-AUT-003/007/009: email and password, with lockout and staff MFA. */
  @Public()
  @Post('login')
  @HttpCode(200)
  async login(@Body(zodBody(passwordLoginSchema)) body: PasswordLoginInput, @Req() req: Request) {
    return this.auth.signInWithPassword(body, this.device(req, body.deviceLabel));
  }

  /** FR-AUT-006: rotating refresh token. */
  @Public()
  @Post('refresh')
  @HttpCode(200)
  async refresh(
    @Body(zodBody(refreshSchema)) body: { refreshToken: string },
    @Req() req: Request,
  ) {
    return this.tokens.rotate(body.refreshToken, this.device(req));
  }

  /** FR-AUT-008: reset by one-time code on the registered phone. */
  @Public()
  @Post('password/reset')
  @HttpCode(204)
  async resetPassword(
    @Body(zodBody(passwordResetConfirmSchema))
    body: { phone?: string; code?: string; newPassword: string },
  ): Promise<void> {
    if (!body.phone || !body.code) {
      throw AppError.badRequest('errors.identifier.required');
    }
    await this.auth.resetPasswordWithOtp(body.phone, body.code, body.newPassword);
  }

  /**
   * Replacing a password you already know — the first-login change.
   *
   * Distinct from `password/reset`, which is for somebody locked out and proves
   * identity with a one-time code on their phone. This one is for somebody
   * signed in, and proves identity with the password they are replacing: an
   * account left open on a shared handset must not be a way to take it over.
   *
   * Clearing `mustChangePassword` is a consequence of the change rather than a
   * separate call, so there is no way to satisfy the check without satisfying
   * the requirement.
   */
  @Post('password/change')
  @HttpCode(204)
  async changePassword(
    @CurrentUser() user: AuthenticatedUser,
    @Body(zodBody(passwordChangeSchema)) body: PasswordChangeInput,
  ): Promise<void> {
    await this.auth.changePassword(user.id, body.currentPassword, body.newPassword);
  }

  @Get('me')
  async me(@CurrentUser() user: AuthenticatedUser) {
    return this.auth.currentUser(user.id);
  }

  /** NFR-LOC-003: the language switcher persists the choice to the profile. */
  @Patch('me/language')
  @HttpCode(204)
  async setLanguage(
    @CurrentUser() user: AuthenticatedUser,
    @Body(zodBody(updatePreferredLanguageSchema)) body: UpdatePreferredLanguageInput,
  ): Promise<void> {
    await this.auth.setPreferredLanguage(user.id, body.preferredLanguage);
  }

  /** FR-AUT-009: enrol the second factor required of Admin and Support roles. */
  @Post('mfa/enrol')
  @HttpCode(200)
  async beginMfaEnrolment(@CurrentUser() user: AuthenticatedUser) {
    return this.auth.beginMfaEnrolment(user.id);
  }

  @Post('mfa/confirm')
  @HttpCode(204)
  async confirmMfaEnrolment(
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: { code?: string },
  ): Promise<void> {
    if (!body.code) throw AppError.badRequest('errors.mfa.required');
    await this.auth.confirmMfaEnrolment(user.id, body.code);
  }

  /** FR-AUT-010: active sessions with device, location and last activity. */
  @Get('sessions')
  async sessions(@CurrentUser() user: AuthenticatedUser) {
    return this.tokens.listSessions(user.id);
  }

  /** FR-AUT-010: each session individually revocable. */
  @Delete('sessions/:id')
  @HttpCode(204)
  async revokeSession(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', uuidParam()) id: string,
  ): Promise<void> {
    await this.tokens.revokeSession(user.id, id);
  }

  /** FR-AUT-006: "sign out of all devices". */
  @Post('sessions/revoke-all')
  @HttpCode(204)
  async revokeAll(@CurrentUser() user: AuthenticatedUser): Promise<void> {
    await this.tokens.revokeAll(user.id, 'user_signed_out_all');
  }

  private device(req: Request, label?: string) {
    return {
      ...(label ? { label } : {}),
      ...(req.ip ? { ip: req.ip } : {}),
      ...(req.header('user-agent') ? { userAgent: req.header('user-agent')!.slice(0, 500) } : {}),
    };
  }
}
