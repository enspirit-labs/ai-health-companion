import { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';

import { JwtAuthGuard } from './jwt-auth.guard';

function buildContext(): ExecutionContext {
  return {
    getHandler: () => ({}),
    getClass: () => ({}),
    switchToHttp: () => ({ getRequest: () => ({}) }),
  } as unknown as ExecutionContext;
}

describe('JwtAuthGuard', () => {
  let reflector: { getAllAndOverride: jest.Mock };
  let guard: JwtAuthGuard;
  // `super.canActivate` belongs to the AuthGuard('jwt') mixin instance that
  // JwtAuthGuard actually extends. Calling AuthGuard('jwt') again would return
  // a *different* mixin class, so we spy on the real parent prototype
  // (JwtAuthGuard's own home object for `super`) rather than a fresh one.
  let superCanActivate: jest.SpyInstance;

  beforeEach(() => {
    reflector = { getAllAndOverride: jest.fn() };
    guard = new JwtAuthGuard(reflector as unknown as Reflector);
    superCanActivate = jest
      .spyOn(Object.getPrototypeOf(JwtAuthGuard.prototype), 'canActivate')
      .mockReturnValue(true);
  });

  afterEach(() => {
    superCanActivate.mockRestore();
  });

  describe('canActivate', () => {
    it('short-circuits to true on a @Public() route without invoking passport', () => {
      reflector.getAllAndOverride.mockReturnValue(true);

      expect(guard.canActivate(buildContext())).toBe(true);
      expect(superCanActivate).not.toHaveBeenCalled();
    });

    it('delegates to the passport strategy when the route is not public', () => {
      reflector.getAllAndOverride.mockReturnValue(false);

      const context = buildContext();
      const result = guard.canActivate(context);

      expect(superCanActivate).toHaveBeenCalledWith(context);
      expect(result).toBe(true);
    });

    it('delegates to the passport strategy when no @Public()/@Roles() metadata is present at all', () => {
      reflector.getAllAndOverride.mockReturnValue(undefined);

      guard.canActivate(buildContext());

      expect(superCanActivate).toHaveBeenCalled();
    });
  });
});
