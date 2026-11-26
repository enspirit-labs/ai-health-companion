import type { WellnessDimensionKey } from '@aidoctor/shared';

export type WellnessDimensionField =
  | 'cardioScore'
  | 'mentalWellnessScore'
  | 'nutritionScore'
  | 'hydrationScore'
  | 'fitnessScore'
  | 'recoveryScore'
  | 'sleepScore'
  | 'lifestyleScore';

/**
 * Which WellnessSnapshot column stores each dashboard dimension. The column
 * names are historical: cardio/nutrition/hydration/recovery/sleep now hold
 * Skin/Hair/Tongue/Posture/Teeth. They weren't renamed so that no migration is
 * needed.
 *
 * `fitnessScore` held the combined Activity score. Activity was split into
 * one tile per physical test, so nothing writes that column any more; older
 * rows keep their value. Dimensions with no column (face, eye, voice, memory,
 * squats, handCoordination, walking) still count in `overallScore`. The live
 * dashboard summary is computed from Score rows (see
 * DashboardService.getSummary) and doesn't read these columns. The snapshot
 * exists for the trend chart and the chat context, which read only
 * `overallScore` and `riskLevel`, and those already include every type.
 *
 * Which assessment type feeds which dimension is defined once, in
 * ASSESSMENT_TYPE_TO_DIMENSION in @aidoctor/shared.
 */
export const DIMENSION_TO_SNAPSHOT_COLUMN: Partial<Record<WellnessDimensionKey, WellnessDimensionField>> = {
  skin: 'cardioScore',
  mentalWellness: 'mentalWellnessScore',
  hair: 'nutritionScore',
  tongue: 'hydrationScore',
  posture: 'recoveryScore',
  teeth: 'sleepScore',
  lifestyle: 'lifestyleScore',
};
