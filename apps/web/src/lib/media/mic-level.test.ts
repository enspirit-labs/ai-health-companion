import { classifyMicLevel, MIC_LEVEL_THRESHOLDS, rmsFromTimeDomain } from './mic-level';

/** Builds a time-domain buffer (128 = silence) holding a square wave at the
 * given amplitude in 0–1, so its RMS equals that amplitude. */
function buffer(amplitude: number, length = 64): Uint8Array {
  const samples = new Uint8Array(length);
  for (let i = 0; i < length; i += 1) {
    const offset = amplitude * 128 * (i % 2 === 0 ? 1 : -1);
    samples[i] = 128 + offset;
  }
  return samples;
}

describe('rmsFromTimeDomain', () => {
  it('reports zero for a silent buffer', () => {
    const silent = new Uint8Array(64).fill(128);
    expect(rmsFromTimeDomain(silent)).toBe(0);
  });

  it('reports the amplitude of a square wave', () => {
    expect(rmsFromTimeDomain(buffer(0.5))).toBeCloseTo(0.5, 2);
  });

  it('handles an empty buffer without dividing by zero', () => {
    expect(rmsFromTimeDomain(new Uint8Array(0))).toBe(0);
  });
});

describe('classifyMicLevel', () => {
  it('flags silence and asks the user to start reading', () => {
    const r = classifyMicLevel(0);
    expect(r.verdict).toBe('silent');
    expect(r.hint).toMatch(/hear|out loud/i);
    expect(r.meter).toBe(0);
  });

  it('asks a quiet speaker to be louder and clearer', () => {
    const r = classifyMicLevel(0.02);
    expect(r.verdict).toBe('quiet');
    expect(r.hint).toMatch(/louder|clearly/i);
  });

  it('accepts a normal speaking level with no hint', () => {
    const r = classifyMicLevel(0.2);
    expect(r.verdict).toBe('good');
    expect(r.hint).toBeNull();
  });

  it('asks an over-loud speaker to ease off', () => {
    const r = classifyMicLevel(0.8);
    expect(r.verdict).toBe('loud');
    expect(r.hint).toMatch(/softer|too loud/i);
  });

  it('clamps the meter to 0–1 even past the loud threshold', () => {
    expect(classifyMicLevel(5).meter).toBe(1);
  });

  it('treats the quiet threshold itself as good (boundary is exclusive)', () => {
    expect(classifyMicLevel(MIC_LEVEL_THRESHOLDS.quiet).verdict).toBe('good');
  });
});
