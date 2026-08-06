import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { hasPermission, type Permission, type Role } from '@classconnect/shared';
import { AppError } from '../common/http-exception.filter';
import { PERMISSIONS_KEY, PUBLIC_KEY, ROLES_KEY, type AuthenticatedUser } from './decorators';

/**
 * FR-RBA-002: every API endpoint enforces authorisation server-side.
 *
 * Registered globally and default-deny: an endpoint with no `@RequirePermissions`
 * and no `@Public` still requires an authenticated user. Forgetting to decorate
 * therefore fails closed.
 *
 * FR-RBA-005: a staff "view as" session is read-only. Any non-GET request made
 * while impersonating is refused here, so no individual endpoint has to remember.
 */
@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const targets = [context.getHandler(), context.getClass()];

    if (this.reflector.getAllAndOverride<boolean>(PUBLIC_KEY, targets)) return true;

    const request = context.switchToHttp().getRequest<{
      user?: AuthenticatedUser;
      method: string;
    }>();
    const user = request.user;

    if (!user) throw AppError.unauthorised();

    // FR-RBA-005: impersonation is read-only and visibly flagged.
    if (user.impersonating && request.method !== 'GET' && request.method !== 'HEAD') {
      throw AppError.forbidden('errors.impersonation.read_only');
    }

    const requiredRoles = this.reflector.getAllAndOverride<Role[]>(ROLES_KEY, targets);
    if (requiredRoles?.length && !requiredRoles.some((role) => user.roles.includes(role))) {
      throw AppError.forbidden();
    }

    const required = this.reflector.getAllAndOverride<Permission[]>(PERMISSIONS_KEY, targets);
    if (required?.length) {
      for (const permission of required) {
        if (!hasPermission(user.roles, permission)) throw AppError.forbidden();
      }
    }

    return true;
  }
}
