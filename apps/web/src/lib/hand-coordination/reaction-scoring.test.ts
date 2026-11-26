import { rateHandCoordination, removeIqrOutliers, scoreHandCoordinationRounds, type RoundLogEntry } from './reaction-scoring';

const TIMEOUT_MS = 1500;

function practiceRound(reactionMs: number | null): RoundLogEntry {
  return { isPractice: true, hit: reactionMs !== null, reactionMs, distancePx: 100, normalizedReactionMs: reactionMs !== null ? reactionMs / 100 : null };
}

function hitRound(reactionMs: number, distancePx: number | null = 100): RoundLogEntry {
  return {
    isPractice: false,
    hit: true,
    reactionMs,
    distancePx,
    normalizedReactionMs: distancePx && distancePx > 0 ? reactionMs / distancePx : null,
  };
}

function missRound(): RoundLogEntry {
  return { isPractice: false, hit: false, reactionMs: null, distancePx: 100, normalizedReactionMs: null };
}

describe('removeIqrOutliers', () => {
  it('drops values far outside the interquartile range', () => {
    const values = [400, 410, 420, 430, 440, 450, 2000];
    const result = removeIqrOutliers(values);
    expect(result).not.toContain(2000);
    expect(result).toEqual([400, 410, 420, 430, 440, 450]);
  });

  it('skips filtering below 4 samples, however spread out they are', () => {
    const values = [300, 2000, 5000];
    expect(removeIqrOutliers(values)).toEqual(values);
  });

  it('keeps a tight, outlier-free set untouched', () => {
    const values = [400, 410, 420, 430];
    expect(removeIqrOutliers(values)).toEqual(values);
  });
});

describe('rateHandCoordination', () => {
  it('rates a fast, accurate, consistent performance as Excellent', () => {
    expect(rateHandCoordination({ medianReactionMs: 350, accuracy: 0.95, consistencyMs: 40 })).toBe('Excellent');
  });

  it('rates a slow, inaccurate, erratic performance as Needs improvement', () => {
    expect(rateHandCoordination({ medianReactionMs: 900, accuracy: 0.4, consistencyMs: 300 })).toBe('Needs improvement');
  });

  it('lets a middling-speed but highly consistent performance out-score a notably faster but erratic one', () => {
    // Same accuracy for both — isolates the speed/consistency trade-off.
    const steadyButAverage = rateHandCoordination({ medianReactionMs: 550, accuracy: 0.85, consistencyMs: 10 });
    const fastButErratic = rateHandCoordination({ medianReactionMs: 400, accuracy: 0.85, consistencyMs: 280 });

    const rank = ['Needs improvement', 'Fair', 'Good', 'Excellent'];
    expect(rank.indexOf(steadyButAverage)).toBeGreaterThan(rank.indexOf(fastButErratic));
  });

  it('is monotonic: improving any one dimension never lowers the rating tier', () => {
    const rank = ['Needs improvement', 'Fair', 'Good', 'Excellent'];
    const base = { medianReactionMs: 600, accuracy: 0.7, consistencyMs: 150 };
    const base_tier = rank.indexOf(rateHandCoordination(base));

    expect(rank.indexOf(rateHandCoordination({ ...base, medianReactionMs: 350 }))).toBeGreaterThanOrEqual(base_tier);
    expect(rank.indexOf(rateHandCoordination({ ...base, accuracy: 0.95 }))).toBeGreaterThanOrEqual(base_tier);
    expect(rank.indexOf(rateHandCoordination({ ...base, consistencyMs: 20 }))).toBeGreaterThanOrEqual(base_tier);
  });
});

describe('scoreHandCoordinationRounds', () => {
  it('excludes practice rounds from scoring but keeps them in the round log', () => {
    const rounds = [
      practiceRound(800), // slow practice round — should NOT affect scoring
      practiceRound(750),
      ...Array.from({ length: 10 }, () => hitRound(400)),
      missRound(),
    ];
    const result = scoreHandCoordinationRounds(rounds, TIMEOUT_MS);

    expect(result.roundLog).toHaveLength(13);
    expect(result.missPattern).toHaveLength(11);
    expect(result.accuracy).toBeCloseTo(10 / 11, 5);
    expect(result.rawReactionTimes).toHaveLength(10);
    expect(result.rawReactionTimes).not.toContain(800);
    expect(result.rawReactionTimes).not.toContain(750);
  });

  it('reports a median-based averageReactionMs robust to a single outlier hit', () => {
    const rounds = [
      practiceRound(500),
      practiceRound(500),
      hitRound(400),
      hitRound(410),
      hitRound(420),
      hitRound(430),
      hitRound(440),
      hitRound(450),
      hitRound(3000), // one wild outlier
      missRound(),
      missRound(),
      missRound(),
      missRound(),
    ];
    const result = scoreHandCoordinationRounds(rounds, TIMEOUT_MS);

    // Outlier excluded from stats, so median comes from the tight cluster.
    expect(result.averageReactionMs).toBeLessThan(500);
    expect(result.rawReactionTimes).toContain(3000);
  });

  it('records which specific scored rounds were misses, in order', () => {
    const rounds = [
      practiceRound(500),
      practiceRound(500),
      hitRound(400),
      missRound(),
      hitRound(410),
      hitRound(420),
      missRound(),
      hitRound(430),
      hitRound(440),
      hitRound(450),
      hitRound(460),
      hitRound(470),
      hitRound(480),
    ];
    const result = scoreHandCoordinationRounds(rounds, TIMEOUT_MS);
    expect(result.missPattern).toEqual([true, false, true, true, false, true, true, true, true, true, true]);
  });

  it('falls back to the timeout value when every scored round is a miss', () => {
    const rounds = [practiceRound(500), practiceRound(500), ...Array.from({ length: 11 }, () => missRound())];
    const result = scoreHandCoordinationRounds(rounds, TIMEOUT_MS);
    expect(result.accuracy).toBe(0);
    expect(result.averageReactionMs).toBe(TIMEOUT_MS);
    expect(result.reactionConsistencyMs).toBe(0);
  });

  it('computes a median normalizedReactionMs from distance-normalized hits', () => {
    const rounds = [
      practiceRound(500),
      practiceRound(500),
      hitRound(400, 100), // normalized 4
      hitRound(800, 200), // normalized 4
      hitRound(600, null), // no distance -> excluded from normalized median
      ...Array.from({ length: 8 }, () => hitRound(400, 100)),
    ];
    const result = scoreHandCoordinationRounds(rounds, TIMEOUT_MS);
    expect(result.normalizedReactionMs).toBeCloseTo(4, 5);
  });

  it('returns null normalizedReactionMs when no scored hit has a usable distance', () => {
    const rounds = [practiceRound(500), practiceRound(500), ...Array.from({ length: 11 }, () => hitRound(400, null))];
    const result = scoreHandCoordinationRounds(rounds, TIMEOUT_MS);
    expect(result.normalizedReactionMs).toBeNull();
  });
});
