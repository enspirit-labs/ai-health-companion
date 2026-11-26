export const ASSESSMENT_TYPES = [
  'FACE',
  'EYE',
  'HAIR',
  'SKIN',
  'TEETH',
  'TONGUE',
  'VOICE',
  'WALKING',
  'POSTURE',
  'HAND_COORDINATION',
  'MEMORY',
  'SQUATS',
  'MENTAL_WELLNESS',
  'LIFESTYLE',
] as const;

export type AssessmentType = (typeof ASSESSMENT_TYPES)[number];

// Temporarily hidden from assessment-selection UI (picker, upcoming list,
// recommendations) while still fully implemented end to end — remove an
// entry here to re-expose it. Existing completed assessments, results, and
// history for these types are unaffected.
export const HIDDEN_ASSESSMENT_TYPES: readonly AssessmentType[] = ['HAIR', 'WALKING'];

export function isAssessmentTypeHidden(type: AssessmentType): boolean {
  return HIDDEN_ASSESSMENT_TYPES.includes(type);
}

export const RISK_LEVELS = ['LOW', 'MODERATE', 'ELEVATED', 'HIGH'] as const;
export type RiskLevel = (typeof RISK_LEVELS)[number];

export const ASSESSMENT_INPUT_MODES = [
  'CAMERA_IMAGE',
  'CAMERA_VIDEO',
  'MICROPHONE_AUDIO',
  'QUESTIONNAIRE',
  'INTERACTIVE_TEST',
  'FILE_UPLOAD',
] as const;
export type AssessmentInputMode = (typeof ASSESSMENT_INPUT_MODES)[number];

export const ASSESSMENT_STATUS = [
  'NOT_STARTED',
  'IN_PROGRESS',
  'COMPLETED',
  'ABANDONED',
  'FAILED',
] as const;
export type AssessmentStatus = (typeof ASSESSMENT_STATUS)[number];
