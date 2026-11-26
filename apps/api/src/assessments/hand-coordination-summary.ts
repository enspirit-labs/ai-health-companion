/**
 * Turns the raw, richly-nested Hand Coordination test result (as stored
 * verbatim in `QuestionnaireAnswer.answer` — round-by-round logs, per-round
 * reaction times, etc.) into a small set of clean, human-readable fields
 * suitable for an AI prompt input / report observation.
 *
 * Without this, the raw result's array/object fields (`roundLog`,
 * `rawReactionTimes`, `missPattern`) get JSON-stringified wholesale by
 * MockAiProvider's generic observation fallback, producing an unreadable
 * dump on the report screen. `apps/web`'s actual `HandCoordinationResult`
 * type isn't importable here (different app in the monorepo), so this
 * duck-types the shape defensively and includes a field only when it's
 * actually present — the same posture as the `content.assessmentType as
 * AssessmentType` casts already used in reports.service.ts. This means an
 * older, pre-overhaul stored result (just `{averageReactionMs, accuracy,
 * rating}`, no consistency/miss-pattern data) still degrades gracefully to
 * a smaller-but-still-clean set of fields rather than erroring.
 */

interface RawHandCoordinationResult {
  accuracy?: unknown;
  averageReactionMs?: unknown;
  reactionConsistencyMs?: unknown;
  missPattern?: unknown;
  rating?: unknown;
}

const CONSISTENCY_EXCELLENT_MAX_MS = 50;
const CONSISTENCY_GOOD_MAX_MS = 120;
const CONSISTENCY_FAIR_MAX_MS = 220;

function describeConsistency(consistencyMs: number): string {
  if (consistencyMs < CONSISTENCY_EXCELLENT_MAX_MS) return 'Excellent';
  if (consistencyMs < CONSISTENCY_GOOD_MAX_MS) return 'Good';
  if (consistencyMs < CONSISTENCY_FAIR_MAX_MS) return 'Fair';
  return 'Needs improvement';
}

function describeMissPattern(missPattern: boolean[]): string {
  const missedRounds = missPattern
    .map((hit, index) => (hit ? null : index + 1))
    .filter((round): round is number => round !== null);

  if (missedRounds.length === 0) return 'No misses — perfect accuracy';
  if (missedRounds.length === 1)
    return `1 miss (round ${missedRounds[0]} of ${missPattern.length})`;
  return `${missedRounds.length} misses (rounds ${missedRounds.join(', ')} of ${missPattern.length})`;
}

export function summarizeHandCoordinationResult(
  raw: unknown,
): Record<string, string> {
  if (!raw || typeof raw !== 'object') return {};
  const result = raw as RawHandCoordinationResult;
  const summary: Record<string, string> = {};

  if (typeof result.accuracy === 'number') {
    summary.accuracy = `${Math.round(result.accuracy * 100)}%`;
  }
  if (typeof result.averageReactionMs === 'number') {
    summary.averageReactionTime = `${(result.averageReactionMs / 1000).toFixed(2)}s`;
  }
  if (typeof result.reactionConsistencyMs === 'number') {
    summary.consistency = describeConsistency(result.reactionConsistencyMs);
  }
  if (Array.isArray(result.missPattern)) {
    summary.missPattern = describeMissPattern(result.missPattern as boolean[]);
  }
  if (typeof result.rating === 'string') {
    summary.rating = result.rating;
  }

  return summary;
}
