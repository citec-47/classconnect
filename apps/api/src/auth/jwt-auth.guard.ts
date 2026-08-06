import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { TokenService } from './token.service';
import { PUBLIC_KEY, type AuthenticatedUser } from '../rbac/decorators';
import { requestContext } from '../common/correlation.middleware';

/**
 * Populates `request.user` from the bearer token.
 *
 * Runs before PermissionsGuard. It does not itself decide access — it only
 * establishes identity — so that FR-RBA-002's authorisation check has exactly
 * one home.
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly tokens: TokenService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request & { user?: AuthenticatedUser }>();

    const header = request.header('authorization');
    const token = header?.startsWith('Bearer ') ? header.slice(7) : undefined;

    if (token) {
      // An invalid token on a public route is ignored rather than fatal, so a
      // stale token in a browser does not block the sign-in page.
      try {
        const claims = await this.tokens.verifyAccessToken(token);
        request.user = {
          id: claims.sub,
          roles: claims.roles,
          preferredLanguage: claims.lang,
          ...(claims.imp ? { impersonating: { targetUserId: claims.imp.t, grantId: claims.imp.g } } : {}),
        };

        // NFR-MNT-005: the user id joins the correlation context so every log
        // line and audit entry for this request carries it.
        const ctx = requestContext.getStore();
        if (ctx) ctx.userId = claims.sub;
      } catch (error) {
        const isPublic = this.reflector.getAllAndOverride<boolean>(PUBLIC_KEY, [
          context.getHandler(),
          context.getClass(),
        ]);
        if (!isPublic) throw error;
      }
    }

    return true;
  }
}
