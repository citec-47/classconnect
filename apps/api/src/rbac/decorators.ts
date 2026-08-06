import { SetMetadata, createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { Permission, Role } from '@classconnect/shared';

export const PUBLIC_KEY = 'cc:public';
export const PERMISSIONS_KEY = 'cc:permissions';
export const ROLES_KEY = 'cc:roles';

/**
 * Opts an endpoint out of authentication.
 *
 * FR-RBA-002: authorisation is enforced server-side on every endpoint. The
 * guard is therefore global and default-deny — an endpoint is only reachable
 * unauthenticated if it says so explicitly here, which makes the exceptions
 * greppable and reviewable.
 */
export const Public = (): MethodDecorator & ClassDecorator => SetMetadata(PUBLIC_KEY, true);

/** Requires every listed permission. */
export const RequirePermissions = (
  ...permissions: Permission[]
): MethodDecorator & ClassDecorator => SetMetadata(PERMISSIONS_KEY, permissions);

/** Requires at least one of the listed roles. Prefer permissions where possible. */
export const RequireRoles = (...roles: Role[]): MethodDecorator & ClassDecorator =>
  SetMetadata(ROLES_KEY, roles);

export interface AuthenticatedUser {
  id: string;
  roles: Role[];
  preferredLanguage: 'en' | 'fr';
  /** FR-RBA-005: set when the request is a staff "view as" session. */
  impersonating?: { targetUserId: string; grantId: string };
}

export const CurrentUser = createParamDecorator(
  (data: keyof AuthenticatedUser | undefined, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest<{ user?: AuthenticatedUser }>();
    const user = request.user;
    if (!user) return undefined;
    return data ? user[data] : user;
  },
);
