import type { AssessmentType } from './assessment-types';
import type { FeatureFlags } from './dashboard';

/**
 * Assessment types gated behind a FeatureFlag row, by DB key (what the API's
 * FeatureFlagsService reads) and by FeatureFlags field (what the web reads
 * from GET /feature-flags). Like every flag, a missing row means disabled — so
 * these stay off until someone explicitly enables them. Unlike
 * HIDDEN_ASSESSMENT_TYPES, the API also refuses to start a gated type.
 */
export const ASSESSMENT_TYPE_FEATURE_FLAGS = {
  VOICE: { key: 'assessment_voice', field: 'assessmentVoice' },
  TONGUE: { key: 'assessment_tongue', field: 'assessmentTongue' },
} as const satisfies Partial<Record<AssessmentType, { key: string; field: keyof FeatureFlags }>>;

type FlaggedAssessmentType = keyof typeof ASSESSMENT_TYPE_FEATURE_FLAGS;

function isFlaggedAssessmentType(type: AssessmentType): type is FlaggedAssessmentType {
  return type in ASSESSMENT_TYPE_FEATURE_FLAGS;
}

/** The FeatureFlag DB key gating `type`, or null when the type isn't gated. */
export function assessmentTypeFeatureFlagKey(type: AssessmentType): string | null {
  return isFlaggedAssessmentType(type) ? ASSESSMENT_TYPE_FEATURE_FLAGS[type].key : null;
}

/**
 * Whether `type` is switched off by its feature flag. Fails closed: while
 * `flags` hasn't loaded (undefined), every gated type counts as off.
 * Ungated types are never off.
 */
export function isAssessmentTypeFlaggedOff(type: AssessmentType, flags: FeatureFlags | undefined): boolean {
  if (!isFlaggedAssessmentType(type)) return false;
  return !flags?.[ASSESSMENT_TYPE_FEATURE_FLAGS[type].field];
}
