import type { AssessmentType } from './assessment-types';

/**
 * Curated subset of a supporting type's questionnaire that's short and
 * state-like enough to ask once a day. Only MENTAL_WELLNESS qualifies today —
 * LIFESTYLE's questions (exercise days/week, diet quality, etc.) are
 * habit-framed, not daily-volatile, so it's deliberately excluded.
 *
 * Kept as a hardcoded map, not a DB-configurable flag on
 * `QuestionnaireQuestion` — this is a single curated triage decision,
 * reviewable in a PR diff. Revisit as DB-configurable only if it ever needs
 * to be ops-tunable (e.g. A/B testing which questions count as "pulse").
 */
export const DAILY_PULSE_QUESTION_KEYS: Partial<Record<AssessmentType, string[]>> = {
  MENTAL_WELLNESS: ['moodRating', 'stressLevel', 'sleepQuality', 'socialConnection', 'anxietyFrequency'],
};

export function supportsDailyPulse(type: AssessmentType): boolean {
  return type in DAILY_PULSE_QUESTION_KEYS;
}
