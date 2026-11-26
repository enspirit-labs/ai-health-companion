import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { createEnvSwitchedProvider } from '../common/conditional-provider.factory';
import { AI_PROVIDER } from './ai-provider.interface';
import { AnthropicAiProvider } from './providers/anthropic-ai.provider';
import { MockAiProvider } from './providers/mock-ai.provider';

@Module({
  imports: [ConfigModule],
  providers: [
    MockAiProvider,
    AnthropicAiProvider,
    createEnvSwitchedProvider({
      provide: AI_PROVIDER,
      primary: AnthropicAiProvider,
      fallback: MockAiProvider,
      usePrimaryWhen: (config) => Boolean(config.get<string>('ANTHROPIC_API_KEY')),
    }),
  ],
  exports: [AI_PROVIDER],
})
export class AiModule {}
