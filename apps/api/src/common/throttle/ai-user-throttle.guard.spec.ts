import { ExecutionContext } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { Reflector } from '@nestjs/core';
import { ThrottlerException, ThrottlerModule, ThrottlerStorageService, getOptionsToken } from '@nestjs/throttler';

import { AI_THROTTLE_MESSAGE } from './ai-throttle.constants';
import { AiThrottle } from './ai-throttle.decorator';
import { AiThrottleModule } from './ai-throttle.module';
import { AiUserThrottleGuard } from './ai-user-throttle.guard';
import { envSchema } from '../../config/env.validation';

class FakeController {
  @AiThrottle('chat')
  send() {}

  @AiThrottle('chat')
  sendToSession() {}

  @AiThrottle('complete')
  complete() {}

  unmarked() {}
}

const CRISIS_TEXT = 'I want to kill myself';
const EMERGENCY_TEXT = 'I am having chest pain and cannot breathe';

function buildContext(handler: () => void, req: Record<string, unknown>): ExecutionContext {
  const res = { header: jest.fn() };
  return {
    getHandler: () => handler,
    getClass: () => FakeController,
    switchToHttp: () => ({ getRequest: () => req, getResponse: () => res }),
  } as unknown as ExecutionContext;
}

const asUser = (id: string, body: unknown = { content: 'Hello' }) => ({
  user: { id },
  body,
  ip: '1.1.1.1',
  headers: {},
});

describe('AiUserThrottleGuard', () => {
  let guard: AiUserThrottleGuard;
  let controller: FakeController;
  let env: Record<string, number>;
  let config: { getOrThrow: jest.Mock };
  const storages: ThrottlerStorageService[] = [];

  async function buildGuard() {
    config = { getOrThrow: jest.fn((key: string) => env[key]) };
    const storage = new ThrottlerStorageService();
    storages.push(storage);
    guard = new AiUserThrottleGuard(
      [
        { name: 'burst', ttl: 60_000, limit: 1 },
        { name: 'hourly', ttl: 3_600_000, limit: 1 },
      ],
      storage,
      new Reflector(),
      config as unknown as ConfigService,
    );
    await guard.onModuleInit();
  }

  beforeEach(async () => {
    controller = new FakeController();
    env = {
      AI_THROTTLE_CHAT_PER_MINUTE: 3,
      AI_THROTTLE_CHAT_PER_HOUR: 5,
      AI_THROTTLE_COMPLETE_PER_MINUTE: 2,
      AI_THROTTLE_COMPLETE_PER_HOUR: 4,
    };
    await buildGuard();
  });

  // The in-memory storage keeps a cleanup interval alive; stop it so jest can exit.
  afterEach(() => {
    storages.splice(0).forEach((storage) => storage.onApplicationShutdown());
  });

  describe('canActivate', () => {
    it('allows requests up to the per-minute limit and then rejects with the friendly message', async () => {
      const call = () => guard.canActivate(buildContext(controller.send, asUser('u1')));

      await expect(call()).resolves.toBe(true);
      await expect(call()).resolves.toBe(true);
      await expect(call()).resolves.toBe(true);
      await expect(call()).rejects.toThrow(ThrottlerException);
      await expect(call()).rejects.toThrow(AI_THROTTLE_MESSAGE);
    });

    it('keys by user, so one user hitting the limit does not block another on the same IP', async () => {
      for (let i = 0; i < 3; i++) {
        await guard.canActivate(buildContext(controller.send, asUser('u1')));
      }
      await expect(guard.canActivate(buildContext(controller.send, asUser('u1')))).rejects.toThrow(ThrottlerException);

      await expect(guard.canActivate(buildContext(controller.send, asUser('u2')))).resolves.toBe(true);
    });

    it('shares one chat budget across the session-scoped and session-less send routes', async () => {
      await guard.canActivate(buildContext(controller.send, asUser('u1')));
      await guard.canActivate(buildContext(controller.sendToSession, asUser('u1')));
      await guard.canActivate(buildContext(controller.send, asUser('u1')));

      await expect(guard.canActivate(buildContext(controller.sendToSession, asUser('u1')))).rejects.toThrow(
        ThrottlerException,
      );
    });

    it('keeps the chat and complete budgets separate', async () => {
      for (let i = 0; i < 3; i++) {
        await guard.canActivate(buildContext(controller.send, asUser('u1')));
      }

      await expect(guard.canActivate(buildContext(controller.complete, asUser('u1', {})))).resolves.toBe(true);
    });

    it('applies the complete limits to the complete route', async () => {
      const call = () => guard.canActivate(buildContext(controller.complete, asUser('u1', {})));

      await call();
      await call();

      await expect(call()).rejects.toThrow(ThrottlerException);
    });

    it('enforces the hourly cap even when the per-minute burst cap is not reached', async () => {
      env.AI_THROTTLE_CHAT_PER_MINUTE = 100;
      env.AI_THROTTLE_CHAT_PER_HOUR = 2;
      await buildGuard();

      await guard.canActivate(buildContext(controller.send, asUser('u1')));
      await guard.canActivate(buildContext(controller.send, asUser('u1')));

      await expect(guard.canActivate(buildContext(controller.send, asUser('u1')))).rejects.toThrow(ThrottlerException);
    });

    it('reads the limits from config, so an env override changes the cap', async () => {
      env.AI_THROTTLE_CHAT_PER_MINUTE = 1;
      await buildGuard();

      await guard.canActivate(buildContext(controller.send, asUser('u1')));

      await expect(guard.canActivate(buildContext(controller.send, asUser('u1')))).rejects.toThrow(ThrottlerException);
      expect(config.getOrThrow).toHaveBeenCalledWith('AI_THROTTLE_CHAT_PER_MINUTE');
    });

    it('does not throttle a route that carries no AI profile', async () => {
      for (let i = 0; i < 10; i++) {
        await expect(guard.canActivate(buildContext(controller.unmarked, asUser('u1')))).resolves.toBe(true);
      }
    });

    it('falls back to the IP when there is no authenticated user', async () => {
      const anonymous = {
        body: { content: 'Hello' },
        ip: '9.9.9.9',
        headers: {},
      };
      for (let i = 0; i < 3; i++) {
        await guard.canActivate(buildContext(controller.send, anonymous));
      }

      await expect(guard.canActivate(buildContext(controller.send, anonymous))).rejects.toThrow(ThrottlerException);
    });
  });

  describe('crisis and emergency messages', () => {
    it.each([
      ['a crisis message', CRISIS_TEXT],
      ['an emergency message', EMERGENCY_TEXT],
    ])('lets %s through even when the user is over the limit', async (_label, text) => {
      for (let i = 0; i < 3; i++) {
        await guard.canActivate(buildContext(controller.send, asUser('u1')));
      }
      await expect(guard.canActivate(buildContext(controller.send, asUser('u1')))).rejects.toThrow(ThrottlerException);

      await expect(guard.canActivate(buildContext(controller.send, asUser('u1', { content: text })))).resolves.toBe(
        true,
      );
    });

    it('does not spend the budget on a crisis message', async () => {
      for (let i = 0; i < 10; i++) {
        await guard.canActivate(buildContext(controller.send, asUser('u1', { content: CRISIS_TEXT })));
      }

      await expect(guard.canActivate(buildContext(controller.send, asUser('u1')))).resolves.toBe(true);
    });

    it('still throttles an ordinary message sent right after a crisis one', async () => {
      for (let i = 0; i < 3; i++) {
        await guard.canActivate(buildContext(controller.send, asUser('u1')));
      }
      await guard.canActivate(buildContext(controller.send, asUser('u1', { content: CRISIS_TEXT })));

      await expect(guard.canActivate(buildContext(controller.send, asUser('u1')))).rejects.toThrow(ThrottlerException);
    });

    it('does not crash on a body without text content', async () => {
      await expect(guard.canActivate(buildContext(controller.send, asUser('u1', undefined)))).resolves.toBe(true);
      await expect(guard.canActivate(buildContext(controller.send, asUser('u1', { content: 42 })))).resolves.toBe(true);
    });
  });
});

describe('AI throttle env defaults', () => {
  const REQUIRED = {
    DATABASE_URL: 'postgresql://aidoctor:aidoctor@localhost:5432/aidoctor',
    JWT_SECRET: 'test-secret-test-secret-test-secret-32',
  };

  it('uses safe defaults when unset', () => {
    const parsed = envSchema.parse(REQUIRED);

    expect(parsed.AI_THROTTLE_CHAT_PER_MINUTE).toBe(20);
    expect(parsed.AI_THROTTLE_CHAT_PER_HOUR).toBe(150);
    expect(parsed.AI_THROTTLE_COMPLETE_PER_MINUTE).toBe(15);
    expect(parsed.AI_THROTTLE_COMPLETE_PER_HOUR).toBe(60);
  });

  it('treats an empty string as unset and accepts an override', () => {
    const parsed = envSchema.parse({
      ...REQUIRED,
      AI_THROTTLE_CHAT_PER_MINUTE: '',
      AI_THROTTLE_CHAT_PER_HOUR: '500',
    });

    expect(parsed.AI_THROTTLE_CHAT_PER_MINUTE).toBe(20);
    expect(parsed.AI_THROTTLE_CHAT_PER_HOUR).toBe(500);
  });

  it.each(['0', '-1', 'abc', '1.5'])('rejects %j', (value) => {
    expect(envSchema.safeParse({ ...REQUIRED, AI_THROTTLE_COMPLETE_PER_HOUR: value }).success).toBe(false);
  });
});

describe('AiThrottleModule', () => {
  it('wires the guard with its own throttler options, storage and the global config', async () => {
    const limits = {
      AI_THROTTLE_CHAT_PER_MINUTE: 1,
      AI_THROTTLE_CHAT_PER_HOUR: 5,
      AI_THROTTLE_COMPLETE_PER_MINUTE: 1,
      AI_THROTTLE_COMPLETE_PER_HOUR: 5,
    };
    const moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          ignoreEnvFile: true,
          load: [() => limits],
        }),
        AiThrottleModule,
      ],
    }).compile();
    const guard = moduleRef.get(AiUserThrottleGuard);
    await guard.onModuleInit();
    const call = () => guard.canActivate(buildContext(new FakeController().send, asUser('u1')));

    await expect(call()).resolves.toBe(true);
    await expect(call()).rejects.toThrow(ThrottlerException);

    await moduleRef.close();
  });

  it('does not override the global IP throttle options registered by ThrottlerModule.forRoot', async () => {
    // Regression: a ThrottlerModule.forRoot inside AiThrottleModule replaced the global
    // options with limit 1, which 429'd every route. The global options must survive.
    const globalLimit = 120;
    const moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          ignoreEnvFile: true,
          load: [
            () => ({
              AI_THROTTLE_CHAT_PER_MINUTE: 1,
              AI_THROTTLE_CHAT_PER_HOUR: 5,
              AI_THROTTLE_COMPLETE_PER_MINUTE: 1,
              AI_THROTTLE_COMPLETE_PER_HOUR: 5,
            }),
          ],
        }),
        ThrottlerModule.forRoot([{ ttl: 60_000, limit: globalLimit }]),
        AiThrottleModule,
      ],
    }).compile();

    const globalOptions = moduleRef.get<Array<{ limit: number }>>(getOptionsToken(), { strict: false });
    expect(globalOptions).toEqual([{ ttl: 60_000, limit: globalLimit }]);

    await moduleRef.close();
  });
});
