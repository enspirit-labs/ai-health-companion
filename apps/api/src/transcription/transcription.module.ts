import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { createEnvSwitchedProvider } from '../common/conditional-provider.factory';
import { TRANSCRIPTION_PROVIDER } from './transcription-provider.interface';
import { MockTranscriptionProvider } from './providers/mock-transcription.provider';
import { WhisperTranscriptionProvider } from './providers/whisper-transcription.provider';

@Module({
  imports: [ConfigModule],
  providers: [
    MockTranscriptionProvider,
    WhisperTranscriptionProvider,
    createEnvSwitchedProvider({
      provide: TRANSCRIPTION_PROVIDER,
      primary: WhisperTranscriptionProvider,
      fallback: MockTranscriptionProvider,
      usePrimaryWhen: (config) => Boolean(config.get<string>('OPENAI_API_KEY')),
    }),
  ],
  exports: [TRANSCRIPTION_PROVIDER],
})
export class TranscriptionModule {}
