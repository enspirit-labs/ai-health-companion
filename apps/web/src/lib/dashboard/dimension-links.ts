import { assessmentTypesForDimension, isAssessmentTypeFlaggedOff, isAssessmentTypeHidden } from '@aidoctor/shared';
import type { AssessmentType, DashboardSummary, FeatureFlags } from '@aidoctor/shared';
import { slugFromAssessmentType } from '@/lib/assessments/type-slug';

type DimensionKey = DashboardSummary['dimensions'][number]['key'];

/** True when a user can currently start `type` from the assessment picker. */
function isAssessmentTypeAvailable(type: AssessmentType, featureFlags?: FeatureFlags): boolean {
  return !isAssessmentTypeHidden(type) && !isAssessmentTypeFlaggedOff(type, featureFlags);
}

/**
 * Whether a dimension tile belongs on the dashboard. A tile with a score is
 * always shown, so no completed assessment is ever invisible, even one whose
 * type has since been hidden or switched off. An empty tile is shown only when
 * at least one of its source assessments can actually be started; otherwise it
 * would be a permanent blank with nowhere to go. Fails closed: without
 * `featureFlags`, flag-gated sources count as unavailable.
 */
export function isDimensionTileVisible(key: DimensionKey, score: number | null, featureFlags?: FeatureFlags): boolean {
  if (score !== null) return true;
  return assessmentTypesForDimension(key).some((type) => isAssessmentTypeAvailable(type, featureFlags));
}

/**
 * Where a dashboard dimension tile should send the user: the history page if
 * that dimension already has a score, or straight to the one assessment that
 * feeds it (e.g. an empty Squats tile opens /assessments/squats). Falls back to
 * the assessments hub only when that assessment is switched off by its feature
 * flag, and, failing closed, whenever `featureFlags` isn't passed.
 */
export function dashboardDimensionHref(
  key: DimensionKey,
  score: number | null,
  featureFlags?: FeatureFlags,
): string {
  if (score !== null) {
    return '/assessments/history';
  }

  const sources = assessmentTypesForDimension(key);
  const type = sources.length === 1 ? sources[0] : undefined;
  return type && !isAssessmentTypeFlaggedOff(type, featureFlags)
    ? `/assessments/${slugFromAssessmentType(type)}`
    : '/assessments';
}
