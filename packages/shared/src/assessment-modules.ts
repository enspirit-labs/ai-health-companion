import type { AssessmentType } from './assessment-types';

export const ASSESSMENT_MODULE_IDS = [
  'VISUAL',
  'PHYSICAL_MOVEMENT',
  'VOCAL',
  'MENTAL_COGNITIVE',
  'LIFESTYLE',
] as const;

export type AssessmentModuleId = (typeof ASSESSMENT_MODULE_IDS)[number];

export interface AssessmentModule {
  id: AssessmentModuleId;
  label: string;
  description: string;
  types: readonly AssessmentType[];
}

/**
 * Groups the 14 assessment types into the 5 modules documented in
 * https://enspirit.atlassian.net/wiki/spaces/ALPHA/pages/1840382012 — order here
 * is the display order on the Assessments page, and matches that doc's table
 * order rather than ASSESSMENT_TYPES' declaration order.
 */
export const ASSESSMENT_MODULES: readonly AssessmentModule[] = [
  {
    id: 'VISUAL',
    label: 'Visual',
    description: 'Camera-based photo capture, analyzed by AI vision.',
    types: ['FACE', 'EYE', 'HAIR', 'SKIN', 'TEETH', 'TONGUE'],
  },
  {
    id: 'PHYSICAL_MOVEMENT',
    label: 'Physical & Movement',
    description: 'Live pose tracking for mobility, form and coordination.',
    types: ['WALKING', 'POSTURE', 'SQUATS', 'HAND_COORDINATION'],
  },
  {
    id: 'VOCAL',
    label: 'Vocal',
    description: 'A short voice recording, analyzed for speech patterns.',
    types: ['VOICE'],
  },
  {
    id: 'MENTAL_COGNITIVE',
    label: 'Mental & Cognitive',
    description: 'Interactive tests and check-ins on mental wellbeing.',
    types: ['MEMORY', 'MENTAL_WELLNESS'],
  },
  {
    id: 'LIFESTYLE',
    label: 'Lifestyle',
    description: 'A quick questionnaire about daily habits.',
    types: ['LIFESTYLE'],
  },
] as const;
