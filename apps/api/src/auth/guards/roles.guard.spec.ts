import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { UserRole } from '@prisma/client';

import { RolesGuard } from './roles.guard';

function buildContext(user: unknown): ExecutionContext {
  return {
    getHandler: () => ({}),
    getClass: () => ({}),
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
  } as unknown as ExecutionContext;
}

describe('RolesGuard', () => {
  let reflector: { getAllAndOverride: jest.Mock };
  let guard: RolesGuard;

  beforeEach(() => {
    reflector = { getAllAndOverride: jest.fn() };
    guard = new RolesGuard(reflector as unknown as Reflector);
  });

  describe('canActivate', () => {
    it('allows the request when no @Roles() metadata is present', () => {
      reflector.getAllAndOverride.mockReturnValue(undefined);

      expect(guard.canActivate(buildContext(undefined))).toBe(true);
    });

    it('allows the request when @Roles() is present but empty', () => {
      reflector.getAllAndOverride.mockReturnValue([]);

      expect(guard.canActivate(buildContext(undefined))).toBe(true);
    });

    it('allows a user whose role matches one of the required roles', () => {
      reflector.getAllAndOverride.mockReturnValue([UserRole.ADMIN, UserRole.SUPPORT]);

      const context = buildContext({ id: 'u1', email: 'a@b.com', role: UserRole.ADMIN });

      expect(guard.canActivate(context)).toBe(true);
    });

    it('throws ForbiddenException when the user role does not match', () => {
      reflector.getAllAndOverride.mockReturnValue([UserRole.ADMIN]);

      const context = buildContext({ id: 'u1', email: 'a@b.com', role: UserRole.USER });

      expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
      expect(() => guard.canActivate(context)).toThrow('Insufficient permissions');
    });

    it('throws a clean ForbiddenException rather than a raw TypeError when request.user is missing', () => {
      // Guard order (Throttler -> JwtAuthGuard -> RolesGuard) is load-bearing:
      // this guard assumes JwtAuthGuard already populated request.user. If that
      // invariant is ever violated — e.g. a route mixes @Public() with @Roles() —
      // this must fail closed with a 403, not crash on `user.role`.
      reflector.getAllAndOverride.mockReturnValue([UserRole.ADMIN]);

      const context = buildContext(undefined);

      expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
      expect(() => guard.canActivate(context)).not.toThrow(TypeError);
    });
  });
});
