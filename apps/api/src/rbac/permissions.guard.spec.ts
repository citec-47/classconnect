import { Reflector } from '@nestjs/core';
import { ExecutionContext } from '@nestjs/common';
import { PermissionsGuard } from './permissions.guard';
import { PUBLIC_KEY, PERMISSIONS_KEY, ROLES_KEY, type AuthenticatedUser } from './decorators';

/**
 * FR-RBA-002: every API endpoint enforces authorisation server-side.
 * FR-RBA-005: a staff "view as" session is read-only and visibly flagged.
 */
function contextFor(
  user: AuthenticatedUser | undefined,
  method = 'GET',
): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => ({ user, method }) }),
    getHandler: () => function handler() {},
    getClass: () => class Controller {},
  } as unknown as ExecutionContext;
}

function guardWith(metadata: Record<string, unknown>): PermissionsGuard {
  const reflector = {
    getAllAndOverride: (key: string) => metadata[key],
  } as unknown as Reflector;
  return new PermissionsGuard(reflector);
}

const parent: AuthenticatedUser = { id: 'u1', roles: ['parent'], preferredLanguage: 'en' };
const adminOps: AuthenticatedUser = { id: 'u2', roles: ['admin_ops'], preferredLanguage: 'en' };
const superAdmin: AuthenticatedUser = { id: 'u3', roles: ['super_admin'], preferredLanguage: 'en' };

describe('PermissionsGuard — FR-RBA-002', () => {
  it('allows an explicitly public endpoint without a user', () => {
    const guard = guardWith({ [PUBLIC_KEY]: true });
    expect(guard.canActivate(contextFor(undefined))).toBe(true);
  });

  it('fails closed on an undecorated endpoint with no user', () => {
    // An endpoint that forgets both @Public and @RequirePermissions must still
    // demand authentication, so a missing decorator is never an open door.
    const guard = guardWith({});
    expect(() => guard.canActivate(contextFor(undefined))).toThrow();
  });

  it('allows an authenticated user through an undecorated endpoint', () => {
    const guard = guardWith({});
    expect(guard.canActivate(contextFor(parent))).toBe(true);
  });

  it('refuses a user lacking the required permission', () => {
    const guard = guardWith({ [PERMISSIONS_KEY]: ['teacher:verification:decide'] });
    expect(() => guard.canActivate(contextFor(parent))).toThrow();
  });

  it('admits a user holding the required permission', () => {
    const guard = guardWith({ [PERMISSIONS_KEY]: ['teacher:verification:decide'] });
    expect(guard.canActivate(contextFor(adminOps))).toBe(true);
  });

  it('requires every permission when several are demanded', () => {
    // admin_ops holds the first but not the second.
    const guard = guardWith({
      [PERMISSIONS_KEY]: ['teacher:verification:decide', 'payout:approve'],
    });
    expect(() => guard.canActivate(contextFor(adminOps))).toThrow();
  });

  it('grants the super admin every permission by construction', () => {
    const guard = guardWith({ [PERMISSIONS_KEY]: ['payout:approve', 'config:write'] });
    expect(guard.canActivate(contextFor(superAdmin))).toBe(true);
  });

  it('honours a role requirement', () => {
    const guard = guardWith({ [ROLES_KEY]: ['admin_finance'] });
    expect(() => guard.canActivate(contextFor(adminOps))).toThrow();
    expect(
      guard.canActivate(
        contextFor({ id: 'u4', roles: ['admin_finance'], preferredLanguage: 'en' }),
      ),
    ).toBe(true);
  });
});

describe('PermissionsGuard — FR-RBA-005: "view as" is read-only', () => {
  const impersonating: AuthenticatedUser = {
    ...adminOps,
    impersonating: { targetUserId: 'learner-1', grantId: 'grant-1' },
  };

  it('permits reads while impersonating', () => {
    const guard = guardWith({ [PERMISSIONS_KEY]: ['user:read:any'] });
    expect(guard.canActivate(contextFor(impersonating, 'GET'))).toBe(true);
  });

  it('refuses every write while impersonating', () => {
    const guard = guardWith({ [PERMISSIONS_KEY]: ['user:read:any'] });
    for (const method of ['POST', 'PATCH', 'PUT', 'DELETE']) {
      expect(() => guard.canActivate(contextFor(impersonating, method))).toThrow();
    }
  });

  it('refuses a write even where the role would otherwise permit it', () => {
    const guard = guardWith({ [PERMISSIONS_KEY]: ['teacher:verification:decide'] });
    expect(() => guard.canActivate(contextFor(impersonating, 'POST'))).toThrow();
  });
});
