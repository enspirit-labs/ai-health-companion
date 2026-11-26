/**
 * Medical condition names the app must never put in model-written text
 * Single source of truth shared by the runtime output filter
 * (`output-filter.ts`) and `scripts/claims-lint.mjs`, which reads the quoted
 * entries below straight from this file and skips scanning it as copy.
 *
 * Plain lowercase strings, one per line, no other quoted text in the array.
 * Biased towards recall: a false hit costs one regeneration, a miss puts a
 * condition name in front of the user. "stroke" is left out on purpose: it is
 * also a drawing term and part of the emergency wording the chat guardrail and
 * the red-flag detector must be able to use.
 */
export const CONDITION_TERMS = [
  'anaemia',
  'anemia',
  'iron deficiency',
  'gingivitis',
  'periodontitis',
  'gum disease',
  'cavity',
  'cavities',
  'tooth decay',
  'caries',
  'alopecia',
  'eczema',
  'dermatitis',
  'psoriasis',
  'rosacea',
  'acne',
  'melanoma',
  'skin cancer',
  'cancer',
  'kyphosis',
  'lordosis',
  'scoliosis',
  'osteoporosis',
  'arthritis',
  'depression',
  'depressive disorder',
  'bipolar',
  'anxiety disorder',
  'generalised anxiety',
  'generalized anxiety',
  'panic disorder',
  'ptsd',
  'adhd',
  'ocd',
  'schizophrenia',
  'dementia',
  'alzheimer',
  'parkinson',
  'hypertension',
  'high blood pressure',
  'hypotension',
  'diabetes',
  'diabetic',
  'prediabetes',
  'hypothyroidism',
  'hyperthyroidism',
  'asthma',
  'copd',
  'sleep apnea',
  'sleep apnoea',
  'arrhythmia',
  'atrial fibrillation',
  'heart disease',
  'heart failure',
  'heart attack',
] as const;
