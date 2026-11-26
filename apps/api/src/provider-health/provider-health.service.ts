import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { ProviderHealthDto, ProviderModeDto } from '@aidoctor/shared';

import { AI_PROVIDER, type AiProvider } from '../ai/ai-provider.interface';
import { MockAiProvider } from '../ai/providers/mock-ai.provider';
import { LocalStorageProvider } from '../storage/providers/local-storage.provider';
import { STORAGE_PROVIDER, type StorageProvider } from '../storage/storage-provider.interface';
import { MockTranscriptionProvider } from '../transcription/providers/mock-transcription.provider';
import {
  TRANSCRIPTION_PROVIDER,
  type TranscriptionProvider,
} from '../transcription/transcription-provider.interface';

/**
 * Reports which concrete provider each env-switched service resolved to.
 * Reads the injected provider instances (not env vars), so it reflects what is
 * actually serving requests. Only names and the model ID are returned: never
 * keys, URLs or other config values.
 */
@Injectable()
export class ProviderHealthService {
  constructor(
    @Inject(AI_PROVIDER) private readonly ai: AiProvider,
    @Inject(STORAGE_PROVIDER) private readonly storage: StorageProvider,
    @Inject(TRANSCRIPTION_PROVIDER) private readonly transcription: TranscriptionProvider,
    private readonly config: ConfigService,
  ) {}

  getHealth(): ProviderHealthDto {
    const aiMock = this.ai instanceof MockAiProvider;
    const transcriptionMock = this.transcription instanceof MockTranscriptionProvider;
    return {
      ai: {
        provider: aiMock ? 'mock' : 'anthropic',
        model: aiMock ? null : (this.config.get<string>('ANTHROPIC_MODEL') ?? null),
      },
      storage: { provider: this.storage instanceof LocalStorageProvider ? 'local' : 'supabase' },
      transcription: { provider: transcriptionMock ? 'mock' : 'whisper' },
      anyMock: aiMock || transcriptionMock,
    };
  }

  getMode(): ProviderModeDto {
    return { mock: this.ai instanceof MockAiProvider };
  }
}
