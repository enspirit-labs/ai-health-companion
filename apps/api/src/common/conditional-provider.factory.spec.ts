import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';

import { createEnvSwitchedProvider } from './conditional-provider.factory';

@Injectable()
class Primary {}

@Injectable()
class Fallback {}

const TOKEN = Symbol('TEST_PROVIDER');

async function buildModule(configValue: string | undefined) {
  const moduleRef = await Test.createTestingModule({
    providers: [
      Primary,
      Fallback,
      createEnvSwitchedProvider({
        provide: TOKEN,
        primary: Primary,
        fallback: Fallback,
        usePrimaryWhen: (config) => Boolean(config.get<string>('TEST_KEY')),
      }),
      { provide: ConfigService, useValue: { get: () => configValue } },
    ],
  }).compile();
  return moduleRef.get(TOKEN);
}

describe('createEnvSwitchedProvider', () => {
  it('resolves to the primary provider when usePrimaryWhen is true', async () => {
    const resolved = await buildModule('some-key');
    expect(resolved).toBeInstanceOf(Primary);
  });

  it('resolves to the fallback provider when usePrimaryWhen is false', async () => {
    const resolved = await buildModule(undefined);
    expect(resolved).toBeInstanceOf(Fallback);
  });
});
