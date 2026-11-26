import type { AssessmentType } from './assessment-types';

/**
 * Dashboard dimension keys. Each key is named after what its tile actually
 * shows. The older keys (cardio/nutrition/hydration/fitness/recovery/sleep)
 * came from a category set this app never had assessments for, and their
 * mismatch with the displayed labels made wrong mappings easy to miss.
 *
 * The WellnessSnapshot DB columns keep their historical names. See
 * DIMENSION_TO_SNAPSHOT_COLUMN in the API for the translation.
 */
export const WELLNESS_DIMENSION_KEYS = [
  'skin',
  'mentalWellness',
  'hair',
  'tongue',
  'posture',
  'squats',
  'handCoordination',
  'walking',
  'teeth',
  'lifestyle',
  'face',
  'eye',
  'voice',
  'memory',
] as const;
export type WellnessDimensionKey = (typeof WELLNESS_DIMENSION_KEYS)[number];

export const WELLNESS_DIMENSION_LABELS: Record<WellnessDimensionKey, string> = {
  skin: 'Skin',
  mentalWellness: 'Stress & Mental Wellness',
  hair: 'Hair',
  tongue: 'Tongue',
  posture: 'Posture',
  squats: 'Squats',
  handCoordination: 'Hand Coordination',
  walking: 'Walking',
  teeth: 'Teeth',
  lifestyle: 'Lifestyle',
  face: 'Face',
  eye: 'Eye',
  voice: 'Voice',
  memory: 'Memory',
};

/**
 * The one mapping from assessment type to dashboard dimension. It's a total
 * Record, so adding an AssessmentType without a dimension is a compile error,
 * and no completed assessment can go missing from the dashboard.
 *
 * One tile per assessment: users look for each test they took by name. The
 * physical tests used to share a combined "Activity" tile, which
 * hid e.g. the Squats score, so each now has its own.
 *
 * `mentalWellness` is fed only by the MENTAL_WELLNESS questionnaire. A selfie,
 * eye photo or voice clip must never move a mental-wellness number.
 */
export const ASSESSMENT_TYPE_TO_DIMENSION: Record<AssessmentType, WellnessDimensionKey> = {
  FACE: 'face',
  EYE: 'eye',
  HAIR: 'hair',
  SKIN: 'skin',
  TEETH: 'teeth',
  TONGUE: 'tongue',
  VOICE: 'voice',
  WALKING: 'walking',
  POSTURE: 'posture',
  HAND_COORDINATION: 'handCoordination',
  MEMORY: 'memory',
  SQUATS: 'squats',
  MENTAL_WELLNESS: 'mentalWellness',
  LIFESTYLE: 'lifestyle',
};

/** Every assessment type that feeds `key`, in ASSESSMENT_TYPE_TO_DIMENSION order. */
export function assessmentTypesForDimension(key: WellnessDimensionKey): AssessmentType[] {
  return (Object.keys(ASSESSMENT_TYPE_TO_DIMENSION) as AssessmentType[]).filter(
    (type) => ASSESSMENT_TYPE_TO_DIMENSION[type] === key,
  );
}

export interface LatestTypeScore {
  type: AssessmentType;
  score: number;
}

export interface WellnessSummaryScores {
  /** Mean of the latest score of every completed type, or null with no data. */
  overallScore: number | null;
  dimensions: { key: WellnessDimensionKey; label: string; score: number | null }[];
  /** The types overallScore is based on, so the UI can say what it covers. */
  includedTypes: AssessmentType[];
}

const mean = (values: number[]): number => values.reduce((sum, v) => sum + v, 0) / values.length;

/**
 * Builds the dashboard numbers from the latest score per assessment type.
 * Pure, so the live summary and the stored trend snapshot are always computed
 * the same way.
 *
 * - A dimension's score is the mean of the latest scores of the types that
 *   feed it. Today every dimension has exactly one source, so it is simply
 *   that type's latest score.
 * - The overall score is the plain mean over every completed type, not over
 *   dimensions, so each assessment counts once.
 *
 * Expects at most one entry per type. If a type appears twice, only its first
 * entry is used.
 */
export function computeWellnessSummary(latest: readonly LatestTypeScore[]): WellnessSummaryScores {
  const byType = new Map<AssessmentType, number>();
  for (const { type, score } of latest) {
    if (!byType.has(type)) byType.set(type, score);
  }

  const dimensions = WELLNESS_DIMENSION_KEYS.map((key) => {
    const scores = assessmentTypesForDimension(key)
      .map((type) => byType.get(type))
      .filter((s): s is number => s !== undefined);
    return { key, label: WELLNESS_DIMENSION_LABELS[key], score: scores.length > 0 ? mean(scores) : null };
  });

  const includedTypes = [...byType.keys()];
  return {
    overallScore: includedTypes.length > 0 ? mean([...byType.values()]) : null,
    dimensions,
    includedTypes,
  };
}
