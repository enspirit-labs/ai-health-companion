import { Injectable } from '@nestjs/common';

import { TranscriptionProvider, TranscriptionResult } from '../transcription-provider.interface';

/**
 * Default provider: returns a canned transcript instantly. Swapped for
 * WhisperTranscriptionProvider once OPENAI_API_KEY is configured (see
 * TranscriptionModule's factory).
 */
@Injectable()
export class MockTranscriptionProvider implements TranscriptionProvider {
  async transcribe(): Promise<TranscriptionResult> {
    return {
      text: 'This is a mock transcript. Configure OPENAI_API_KEY for real speech-to-text.',
    };
  }
}
