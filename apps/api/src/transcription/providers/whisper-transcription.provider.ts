import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI, { toFile } from 'openai';

import { TranscriptionProvider, TranscriptionResult } from '../transcription-provider.interface';

/**
 * Real speech-to-text via OpenAI's Whisper model. Activated automatically
 * once OPENAI_API_KEY is set — see TranscriptionModule's provider factory.
 */
@Injectable()
export class WhisperTranscriptionProvider implements TranscriptionProvider {
  private clientInstance: OpenAI | undefined;

  constructor(private readonly config: ConfigService) {}

  private get client(): OpenAI {
    if (!this.clientInstance) {
      this.clientInstance = new OpenAI({ apiKey: this.config.get<string>('OPENAI_API_KEY') });
    }
    return this.clientInstance;
  }

  async transcribe(buffer: Buffer, mimeType: string): Promise<TranscriptionResult> {
    const file = await toFile(buffer, `recording.${mimeType.split('/')[1] ?? 'webm'}`, { type: mimeType });

    const transcription = await this.client.audio.transcriptions.create({
      file,
      model: 'whisper-1',
    });

    if (typeof transcription.text !== 'string') {
      throw new InternalServerErrorException('Transcription response did not include text');
    }

    return { text: transcription.text };
  }
}
