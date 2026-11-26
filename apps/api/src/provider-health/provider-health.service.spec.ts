import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';

import { AI_PROVIDER } from '../ai/ai-provider.interface';
import { AnthropicAiProvider } from '../ai/providers/anthropic-ai.provider';
import { MockAiProvider } from '../ai/providers/mock-ai.provider';
import { LocalStorageProvider } from '../storage/providers/local-storage.provider';
import { SupabaseStorageProvider } from '../storage/providers/supabase-storage.provider';
import { STORAGE_PROVIDER } from '../storage/storage-provider.interface';
import { MockTranscriptionProvider } from '../transcription/providers/mock-transcription.provider';
import { WhisperTranscriptionProvider } from '../transcription/providers/whisper-transcription.provider';
import { TRANSCRIPTION_PROVIDER } from '../transcription/transcription-provider.interface';
import { ProviderHealthService } from './provider-health.service';

// Real classes are only used for instanceof checks; they are never constructed.
const instanceOf = <T>(cls: abstract new (...args: never[]) => T): T =>
  Object.create(cls.prototype as object) as T;

async function build(opts: { ai: object; storage: object; transcription: object; model?: string }) {
  const moduleRef = await Test.createTestingModule({
    providers: [
      ProviderHealthService,
      { provide: AI_PROVIDER, useValue: opts.ai },
      { provide: STORAGE_PROVIDER, useValue: opts.storage },
      { provide: TRANSCRIPTION_PROVIDER, useValue: opts.transcription },
      {
        provide: ConfigService,
        useValue: {
          get: jest.fn((key: string) => {
            if (key === 'ANTHROPIC_MODEL') return opts.model;
            // A secret that must never appear in the response.
            if (key === 'ANTHROPIC_API_KEY') return 'sk-ant-secret';
            return undefined;
          }),
        },
      },
    ],
  }).compile();
  return moduleRef.get(ProviderHealthService);
}

describe('ProviderHealthService', () => {
  describe('getHealth', () => {
    it('reports real providers and the configured model', async () => {
      const service = await build({
        ai: instanceOf(AnthropicAiProvider),
        storage: instanceOf(SupabaseStorageProvider),
        transcription: instanceOf(WhisperTranscriptionProvider),
        model: 'claude-opus-5',
      });

      expect(service.getHealth()).toEqual({
        ai: { provider: 'anthropic', model: 'claude-opus-5' },
        storage: { provider: 'supabase' },
        transcription: { provider: 'whisper' },
        anyMock: false,
      });
    });

    it('flags mock AI and transcription and reports no model', async () => {
      const service = await build({
        ai: instanceOf(MockAiProvider),
        storage: instanceOf(LocalStorageProvider),
        transcription: instanceOf(MockTranscriptionProvider),
        model: 'claude-opus-5',
      });

      expect(service.getHealth()).toEqual({
        ai: { provider: 'mock', model: null },
        storage: { provider: 'local' },
        transcription: { provider: 'mock' },
        anyMock: true,
      });
    });

    it('flags anyMock when only transcription is mock', async () => {
      const service = await build({
        ai: instanceOf(AnthropicAiProvider),
        storage: instanceOf(SupabaseStorageProvider),
        transcription: instanceOf(MockTranscriptionProvider),
        model: 'm',
      });

      expect(service.getHealth().anyMock).toBe(true);
    });

    it('never includes keys or secrets in the response', async () => {
      const service = await build({
        ai: instanceOf(AnthropicAiProvider),
        storage: instanceOf(SupabaseStorageProvider),
        transcription: instanceOf(WhisperTranscriptionProvider),
        model: 'claude-opus-5',
      });

      expect(JSON.stringify(service.getHealth())).not.toContain('sk-ant-secret');
    });
  });

  describe('getMode', () => {
    it('is mock only when the AI provider is the mock', async () => {
      const mock = await build({
        ai: instanceOf(MockAiProvider),
        storage: instanceOf(LocalStorageProvider),
        transcription: instanceOf(MockTranscriptionProvider),
      });
      const real = await build({
        ai: instanceOf(AnthropicAiProvider),
        storage: instanceOf(LocalStorageProvider),
        transcription: instanceOf(MockTranscriptionProvider),
        model: 'm',
      });

      expect(mock.getMode()).toEqual({ mock: true });
      expect(real.getMode()).toEqual({ mock: false });
    });
  });
});
