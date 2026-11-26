import { describe, expect, it } from 'vitest';

import { assessmentTypeFeatureFlagKey, isAssessmentTypeFlaggedOff } from './assessment-feature-flags';
import type { FeatureFlags } from './dashboard';

const ALL_OFF: FeatureFlags = {
  dailyPulse: false,
  slackReminders: false,
  assessmentVoice: false,
  assessmentTongue: false,
};

describe('assessmentTypeFeatureFlagKey', () => {
  it('maps Voice and Tongue to their FeatureFlag keys', () => {
    expect(assessmentTypeFeatureFlagKey('VOICE')).toBe('assessment_voice');
    expect(assessmentTypeFeatureFlagKey('TONGUE')).toBe('assessment_tongue');
  });

  it('returns null for an ungated type', () => {
    expect(assessmentTypeFeatureFlagKey('FACE')).toBeNull();
  });
});

describe('isAssessmentTypeFlaggedOff', () => {
  it('treats gated types as off while flags have not loaded (fail closed)', () => {
    expect(isAssessmentTypeFlaggedOff('VOICE', undefined)).toBe(true);
    expect(isAssessmentTypeFlaggedOff('TONGUE', undefined)).toBe(true);
  });

  it('treats gated types as off when their flag is disabled', () => {
    expect(isAssessmentTypeFlaggedOff('VOICE', ALL_OFF)).toBe(true);
    expect(isAssessmentTypeFlaggedOff('TONGUE', ALL_OFF)).toBe(true);
  });

  it('treats a gated type as on only when its own flag is enabled', () => {
    const flags = { ...ALL_OFF, assessmentVoice: true };
    expect(isAssessmentTypeFlaggedOff('VOICE', flags)).toBe(false);
    expect(isAssessmentTypeFlaggedOff('TONGUE', flags)).toBe(true);
  });

  it('never treats an ungated type as off', () => {
    expect(isAssessmentTypeFlaggedOff('FACE', undefined)).toBe(false);
    expect(isAssessmentTypeFlaggedOff('SQUATS', ALL_OFF)).toBe(false);
  });
});
