import { ExecutionContext } from '@nestjs/common';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { Reflector } from '@nestjs/core';
import {
  SkipThrottle,
  ThrottlerException,
  ThrottlerStorageService,
} from '@nestjs/throttler';

import { AuthController } from '../../auth/auth.controller';
import {
  AUTH_THROTTLE_LIMITS,
  AUTH_THROTTLE_MESSAGE,
  AUTH_THROTTLE_PROFILE_KEY,
  type AuthThrottleProfile,
} from './auth-throttle.constants';
import { AuthThrottle } from './auth-throttle.decorator';
import { AuthCredentialThrottleGuard } from './auth-credential-throttle.guard';

class FakeController {
  // Mirrors the real routes: the global IP throttle is skipped, this guard must still apply.
  @SkipThrottle()
  @AuthThrottle('login')
  login() {}

  @AuthThrottle('signup')
  signup() {}

  @AuthThrottle('refresh')
  refresh() {}

  unmarked() {}
}

function buildContext(handler: () => void, body: unknown): ExecutionContext {
  const req = { body, ip: '127.0.0.1', headers: {} };
  const res = { header: jest.fn() };
  return {
    getHandler: () => handler,
    getClass: () => FakeController,
    switchToHttp: () => ({ getRequest: () => req, getResponse: () => res }),
  } as unknown as ExecutionContext;
}

describe('AuthCredentialThrottleGuard', () => {
  let guard: AuthCredentialThrottleGuard;
  let storage: ThrottlerStorageService;
  const controller = new FakeController();

  const login = (email: unknown) =>
    guard.canActivate(buildContext(controller.login, { email, password: 'x' }));
  const signup = (email: string) =>
    guard.canActivate(buildContext(controller.signup, { email }));
  const refresh = (refreshToken: unknown) =>
    guard.canActivate(buildContext(controller.refresh, { refreshToken }));

  async function exhaust(call: () => Promise<boolean>, times: number) {
    for (let i = 0; i < times; i++) await call();
  }

  beforeEach(async () => {
    storage = new ThrottlerStorageService();
    guard = new AuthCredentialThrottleGuard(
      [
        { name: 'burst', ttl: 60_000, limit: 1 },
        { name: 'hourly', ttl: 3_600_000, limit: 1 },
        { name: 'overall', ttl: 60_000, limit: 1 },
      ],
      storage,
      new Reflector(),
    );
    await guard.onModuleInit();
  });

  // The in-memory storage keeps a cleanup interval alive; stop it so jest can exit.
  afterEach(() => {
    storage.onApplicationShutdown();
    jest.useRealTimers();
  });

  describe('canActivate', () => {
    it('allows logins up to the per-email limit and then rejects with the friendly message', async () => {
      const limit = AUTH_THROTTLE_LIMITS.login.burst;
      await exhaust(() => login('a@example.com'), limit);

      await expect(login('a@example.com')).rejects.toThrow(ThrottlerException);
      await expect(login('a@example.com')).rejects.toThrow(
        AUTH_THROTTLE_MESSAGE,
      );
    });

    it('keys by email, so one account hitting its limit does not lock out anyone else', async () => {
      await exhaust(
        () => login('a@example.com'),
        AUTH_THROTTLE_LIMITS.login.burst,
      );
      await expect(login('a@example.com')).rejects.toThrow(ThrottlerException);

      await expect(login('b@example.com')).resolves.toBe(true);
    });

    it('treats case and surrounding spaces as the same email', async () => {
      await exhaust(
        () => login('A@Example.com'),
        AUTH_THROTTLE_LIMITS.login.burst,
      );

      await expect(login('  a@example.COM ')).rejects.toThrow(
        ThrottlerException,
      );
    });

    it('caps total attempts on a route, so rotating emails cannot get unlimited tries', async () => {
      const overall = AUTH_THROTTLE_LIMITS.login.overall;
      for (let i = 0; i < overall; i++) {
        await expect(login(`user${i}@example.com`)).resolves.toBe(true);
      }

      await expect(login('fresh@example.com')).rejects.toThrow(
        ThrottlerException,
      );
    });

    it('applies the hourly per-email limit even when each minute stays under the burst limit', async () => {
      jest.useFakeTimers();
      const { burst, hourly } = AUTH_THROTTLE_LIMITS.signup;
      let sent = 0;
      while (sent < hourly) {
        const batch = Math.min(burst, hourly - sent);
        await exhaust(() => signup('s@example.com'), batch);
        sent += batch;
        jest.advanceTimersByTime(61_000);
      }

      await expect(signup('s@example.com')).rejects.toThrow(ThrottlerException);
    });

    it('keys refresh by token, so one session refreshing often does not affect another', async () => {
      await exhaust(
        () => refresh('token-a'),
        AUTH_THROTTLE_LIMITS.refresh.burst,
      );
      await expect(refresh('token-a')).rejects.toThrow(ThrottlerException);

      await expect(refresh('token-b')).resolves.toBe(true);
    });

    it('puts requests without a usable credential in one shared bucket', async () => {
      await exhaust(() => login(undefined), AUTH_THROTTLE_LIMITS.login.burst);

      await expect(login(42)).rejects.toThrow(ThrottlerException);
      await expect(login('real@example.com')).resolves.toBe(true);
    });

    it('keeps each route budget separate', async () => {
      await exhaust(
        () => login('a@example.com'),
        AUTH_THROTTLE_LIMITS.login.burst,
      );

      await expect(signup('a@example.com')).resolves.toBe(true);
    });

    it('passes routes that carry no auth profile', async () => {
      await expect(
        guard.canActivate(buildContext(controller.unmarked, {})),
      ).resolves.toBe(true);
    });

    it('never stores the raw email or token in the throttle store', async () => {
      await login('secret.person@example.com');
      await refresh('raw-refresh-token-value');

      const keys = [...storage.storage.keys()].join(' ');
      expect(keys).not.toContain('secret.person');
      expect(keys).not.toContain('raw-refresh-token-value');
    });
  });

  describe('AuthController wiring', () => {
    const reflector = new Reflector();
    const routes: Array<[keyof AuthController, AuthThrottleProfile]> = [
      ['signup', 'signup'],
      ['login', 'login'],
      ['refresh', 'refresh'],
      ['forgotPassword', 'forgot-password'],
      ['resetPassword', 'reset-password'],
      ['logout', 'logout'],
    ];

    it.each(routes)(
      '%s skips the global IP throttle and uses the %s credential budget',
      (method, profile) => {
        const handler = AuthController.prototype[
          method
        ] as unknown as () => void;

        expect(reflector.get(AUTH_THROTTLE_PROFILE_KEY, handler)).toBe(profile);
        expect(reflector.get('THROTTLER:SKIPdefault', handler)).toBe(true);
        expect(reflector.get(GUARDS_METADATA, handler)).toEqual([
          AuthCredentialThrottleGuard,
        ]);
      },
    );

    it('leaves the signed-in routes on the global throttle', () => {
      for (const method of ['me', 'updateMe'] as const) {
        const handler = AuthController.prototype[
          method
        ] as unknown as () => void;
        expect(reflector.get('THROTTLER:SKIPdefault', handler)).toBeUndefined();
        expect(
          reflector.get(AUTH_THROTTLE_PROFILE_KEY, handler),
        ).toBeUndefined();
      }
    });
  });
});
