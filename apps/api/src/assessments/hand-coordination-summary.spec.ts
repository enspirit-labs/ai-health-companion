import { summarizeHandCoordinationResult } from './hand-coordination-summary';

describe('summarizeHandCoordinationResult', () => {
  it('produces clean, human-readable fields from a full result', () => {
    const summary = summarizeHandCoordinationResult({
      accuracy: 0.9091,
      averageReactionMs: 1204,
      reactionConsistencyMs: 40,
      missPattern: [
        true,
        true,
        true,
        false,
        true,
        true,
        true,
        true,
        true,
        true,
        true,
      ],
      rawReactionTimes: [996.89, 1104.2, 1300.5],
      roundLog: [
        {
          hit: false,
          distancePx: null,
          isPractice: true,
          reactionMs: null,
          normalizedReactionMs: null,
        },
      ],
      rating: 'Good',
    });

    expect(summary).toEqual({
      accuracy: '91%',
      averageReactionTime: '1.20s',
      consistency: 'Excellent',
      missPattern: '1 miss (round 4 of 11)',
      rating: 'Good',
    });
    // The bulky/raw fields must never leak into the summary.
    expect(summary).not.toHaveProperty('rawReactionTimes');
    expect(summary).not.toHaveProperty('roundLog');
  });

  it('labels consistency across the Good/Fair/Needs improvement bands', () => {
    expect(
      summarizeHandCoordinationResult({ reactionConsistencyMs: 30 })
        .consistency,
    ).toBe('Excellent');
    expect(
      summarizeHandCoordinationResult({ reactionConsistencyMs: 90 })
        .consistency,
    ).toBe('Good');
    expect(
      summarizeHandCoordinationResult({ reactionConsistencyMs: 180 })
        .consistency,
    ).toBe('Fair');
    expect(
      summarizeHandCoordinationResult({ reactionConsistencyMs: 400 })
        .consistency,
    ).toBe('Needs improvement');
  });

  it('summarizes a perfect run with no misses', () => {
    const summary = summarizeHandCoordinationResult({
      missPattern: [true, true, true],
    });
    expect(summary.missPattern).toBe('No misses — perfect accuracy');
  });

  it('summarizes multiple misses with their round numbers', () => {
    const summary = summarizeHandCoordinationResult({
      missPattern: [true, false, true, true, false],
    });
    expect(summary.missPattern).toBe('2 misses (rounds 2, 5 of 5)');
  });

  it('degrades gracefully for an older, pre-overhaul stored result', () => {
    const summary = summarizeHandCoordinationResult({
      averageReactionMs: 420,
      accuracy: 0.9,
      rating: 'Good',
    });
    expect(summary).toEqual({
      accuracy: '90%',
      averageReactionTime: '0.42s',
      rating: 'Good',
    });
    expect(summary).not.toHaveProperty('consistency');
    expect(summary).not.toHaveProperty('missPattern');
  });

  it('returns an empty object for missing/malformed input without throwing', () => {
    expect(() => summarizeHandCoordinationResult(undefined)).not.toThrow();
    expect(summarizeHandCoordinationResult(undefined)).toEqual({});
    expect(summarizeHandCoordinationResult(null)).toEqual({});
    expect(summarizeHandCoordinationResult('not an object')).toEqual({});
    expect(summarizeHandCoordinationResult({})).toEqual({});
  });
});
