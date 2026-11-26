/** Per-round outcome log for the reaction/tapping test — one entry per
 * round, in round order, including practice rounds (excluded from scoring
 * but kept for the full log). */
export interface RoundLogEntry {
  isPractice: boolean;
  hit: boolean;
  /** Time from target appearing to tap, in ms. Null for a timeout miss. */
  reactionMs: number | null;
  /** Distance in px from the previous target's position. Null for the very
   * first round of the whole session, since there's no previous target. */
  distancePx: number | null;
  /** reactionMs / distancePx — null when there's no reaction, no previous
   * target, or the target didn't move (distancePx === 0). */
  normalizedReactionMs: number | null;
}

// A type alias (not `interface`) so this remains structurally assignable to
// the `Record<string, unknown>` value type expected by recordTestResult's
// generic test-result payload — matches how the other interactive tests
// (SquatsTest, MemoryTest) declare their onComplete result shape inline.
export type HandCoordinationResult = {
  /** hits / scored rounds. */
  accuracy: number;
  /** Median reaction time (ms) of scored hits, after IQR outlier removal.
   * Field name kept as `averageReactionMs` for backward compatibility with
   * existing consumers, even though it's now median-based. */
  averageReactionMs: number;
  /** Standard deviation (ms) of scored hits, after IQR outlier removal. */
  reactionConsistencyMs: number;
  /** One entry per scored round, in order — true when hit. Lets downstream
   * analysis distinguish misses clustering late (fatigue) from misses
   * scattered randomly (attention). */
  missPattern: boolean[];
  /** All scored-round hit reaction times, before outlier removal. */
  rawReactionTimes: number[];
  /** Median of distance-normalized reaction times across scored hits, or
   * null if no scored hit has a usable distance. */
  normalizedReactionMs: number | null;
  /** Full per-round detail (including practice rounds) for future analysis. */
  roundLog: RoundLogEntry[];
  rating: string;
};

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

function quantile(sortedValues: number[], q: number): number {
  if (sortedValues.length === 0) return 0;
  if (sortedValues.length === 1) return sortedValues[0];
  const index = q * (sortedValues.length - 1);
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  const fraction = index - lower;
  return sortedValues[lower] + (sortedValues[upper] - sortedValues[lower]) * fraction;
}

/** Drops values more than 1.5x the interquartile range beyond Q1/Q3. Skipped
 * below 4 samples — IQR bounds are too noisy to be meaningful on that few
 * points, and would risk discarding most of an already-small sample. */
export function removeIqrOutliers(values: number[]): number[] {
  if (values.length < 4) return values;
  const sorted = [...values].sort((a, b) => a - b);
  const q1 = quantile(sorted, 0.25);
  const q3 = quantile(sorted, 0.75);
  const iqr = q3 - q1;
  const lowerBound = q1 - 1.5 * iqr;
  const upperBound = q3 + 1.5 * iqr;
  return values.filter((v) => v >= lowerBound && v <= upperBound);
}

/** Sample standard deviation (n-1). 0 for fewer than 2 values — there's no
 * meaningful spread to report from a single point. */
function standardDeviation(values: number[]): number {
  if (values.length < 2) return 0;
  const mean = values.reduce((sum, v) => sum + v, 0) / values.length;
  const variance = values.reduce((sum, v) => sum + (v - mean) ** 2, 0) / (values.length - 1);
  return Math.sqrt(variance);
}

// --- Rating ---------------------------------------------------------------
//
// Speed, accuracy, and consistency are each converted to a 0-100 sub-score,
// then combined into one weighted composite. This (rather than nested
// speed+accuracy thresholds, as the old rating did) is what lets consistency
// meaningfully offset speed: someone with middling speed but very low
// variance can out-score someone faster but erratic — see
// reaction-scoring.test.ts for a worked example of exactly that trade-off.

/** Reaction time at/below this scores full marks on speed; at/above the
 * ceiling scores zero. Linearly interpolated between. */
const SPEED_FLOOR_MS = 300;
const SPEED_CEILING_MS = 900;
/** Standard deviation at/above this scores zero on consistency. */
const CONSISTENCY_CEILING_MS = 300;

const SPEED_WEIGHT = 0.4;
const ACCURACY_WEIGHT = 0.35;
const CONSISTENCY_WEIGHT = 0.25;

const RATING_THRESHOLDS: [minComposite: number, label: string][] = [
  [85, 'Excellent'],
  [70, 'Good'],
  [50, 'Fair'],
];
const DEFAULT_RATING = 'Needs improvement';

function clampScore(value: number): number {
  return Math.max(0, Math.min(100, value));
}

function speedScoreFor(medianReactionMs: number): number {
  return clampScore(100 - ((medianReactionMs - SPEED_FLOOR_MS) / (SPEED_CEILING_MS - SPEED_FLOOR_MS)) * 100);
}

function consistencyScoreFor(consistencyMs: number): number {
  return clampScore(100 - (consistencyMs / CONSISTENCY_CEILING_MS) * 100);
}

export function rateHandCoordination(input: { medianReactionMs: number; accuracy: number; consistencyMs: number }): string {
  const speedScore = speedScoreFor(input.medianReactionMs);
  const accuracyScore = clampScore(input.accuracy * 100);
  const consistencyScore = consistencyScoreFor(input.consistencyMs);

  const composite = SPEED_WEIGHT * speedScore + ACCURACY_WEIGHT * accuracyScore + CONSISTENCY_WEIGHT * consistencyScore;

  for (const [minComposite, label] of RATING_THRESHOLDS) {
    if (composite >= minComposite) return label;
  }
  return DEFAULT_RATING;
}

/** Scores a completed session's round log into the final result. `rounds`
 * should include practice rounds — this filters them out itself. */
export function scoreHandCoordinationRounds(rounds: RoundLogEntry[], timeoutMs: number): HandCoordinationResult {
  const scoredRounds = rounds.filter((r) => !r.isPractice);
  const hits = scoredRounds.filter((r) => r.hit);

  const accuracy = scoredRounds.length > 0 ? hits.length / scoredRounds.length : 0;
  const missPattern = scoredRounds.map((r) => r.hit);

  const rawReactionTimes = hits.map((r) => r.reactionMs).filter((v): v is number => v !== null);
  const filteredHitTimes = removeIqrOutliers(rawReactionTimes);
  // If outlier removal ever leaves nothing (shouldn't happen given the < 4
  // guard, but a hard floor is cheap insurance), fall back to the raw times
  // rather than reporting a meaningless median of an empty array.
  const statsSource = filteredHitTimes.length > 0 ? filteredHitTimes : rawReactionTimes;

  const averageReactionMs = statsSource.length > 0 ? median(statsSource) : timeoutMs;
  const reactionConsistencyMs = standardDeviation(statsSource);

  const normalizedValues = hits.map((r) => r.normalizedReactionMs).filter((v): v is number => v !== null);
  const normalizedReactionMs = normalizedValues.length > 0 ? median(normalizedValues) : null;

  const rating = rateHandCoordination({ medianReactionMs: averageReactionMs, accuracy, consistencyMs: reactionConsistencyMs });

  return {
    accuracy,
    averageReactionMs,
    reactionConsistencyMs,
    missPattern,
    rawReactionTimes,
    normalizedReactionMs,
    roundLog: rounds,
    rating,
  };
}
