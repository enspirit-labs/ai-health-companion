/**
 * Pure classification of a microphone input level into actionable coaching.
 * Kept separate from the component (same spirit as lib/cv/*) so the thresholds
 * are unit-tested rather than buried in a rAF loop.
 *
 * Input is an RMS amplitude in 0–1, as computed from a time-domain Web Audio
 * buffer — NOT decibels, and not a frequency spectrum.
 */

export const MIC_LEVEL_THRESHOLDS = {
  /** Below this the mic is picking up essentially nothing — likely muted, far
   * away, or the user hasn't started speaking. */
  silent: 0.01,
  /** Below this there's a signal but it's too quiet to analyze reliably. */
  quiet: 0.045,
  /** Above this the input is clipping-ish and consonants get mushy. */
  loud: 0.5,
} as const;

export type MicLevelVerdict = 'silent' | 'quiet' | 'good' | 'loud';

export interface MicLevelResult {
  verdict: MicLevelVerdict;
  /** Coaching cue for UI + voice, or null when the level is fine. */
  hint: string | null;
  /** 0–1 normalized meter fill, clamped — for the level bar. */
  meter: number;
}

/** Computes RMS amplitude from a time-domain buffer of 0–255 samples (the
 * format `AnalyserNode.getByteTimeDomainData` fills), where 128 is silence. */
export function rmsFromTimeDomain(samples: Uint8Array): number {
  if (samples.length === 0) return 0;
  let sumSquares = 0;
  for (let i = 0; i < samples.length; i += 1) {
    const centered = (samples[i] - 128) / 128;
    sumSquares += centered * centered;
  }
  return Math.sqrt(sumSquares / samples.length);
}

export function classifyMicLevel(
  rms: number,
  thresholds: typeof MIC_LEVEL_THRESHOLDS = MIC_LEVEL_THRESHOLDS,
): MicLevelResult {
  // Scaled so a "good" speaking level lands mid-bar rather than as a sliver.
  const meter = Math.max(0, Math.min(1, rms / thresholds.loud));

  if (rms < thresholds.silent) {
    return { verdict: 'silent', hint: 'I can’t hear you — start reading out loud', meter };
  }
  if (rms < thresholds.quiet) {
    return { verdict: 'quiet', hint: 'Speak louder and more clearly', meter };
  }
  if (rms > thresholds.loud) {
    return { verdict: 'loud', hint: 'A little softer — you’re too loud for the mic', meter };
  }
  return { verdict: 'good', hint: null, meter };
}
