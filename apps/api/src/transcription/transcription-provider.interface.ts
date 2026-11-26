export const TRANSCRIPTION_PROVIDER = Symbol('TRANSCRIPTION_PROVIDER');

export interface TranscriptionResult {
  text: string;
}

/**
 * Decouples the Voice Assessment (and any future audio-based module) from
 * which speech-to-text engine actually transcribes a recording. Distinct
 * from AiProvider — Claude does the wellness reasoning, this only turns
 * audio into text for that reasoning step to consume.
 */
export interface TranscriptionProvider {
  transcribe(buffer: Buffer, mimeType: string): Promise<TranscriptionResult>;
}
