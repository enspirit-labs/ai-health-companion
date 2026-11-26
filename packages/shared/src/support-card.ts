import type { AssessmentType } from './assessment-types';

// Rule signed off by a clinician on 28 Oct 2026 (question Q1). It shows the
// support card when mood is at the lowest two points AND at least one further marker of
// significant distress is present. Mood on its own never fires it.
/** moodRating is a 1-5 SCALE question; the lowest two options are 1 and 2. */
export const SUPPORT_CARD_MOOD_MAX = 2;
/** anxietyFrequency's highest option in the seeded questionnaire. */
export const SUPPORT_CARD_ANXIETY_VALUE = 'often';
/** stressLevel options that count as a further marker. */
export const SUPPORT_CARD_STRESS_VALUES = ['high', 'severe'] as const;
/** copingConfidence is a 1-5 SCALE question; 1 or 2 counts as a further marker. */
export const SUPPORT_CARD_COPING_MAX = 2;
/** socialConnection's lowest option in the seeded questionnaire. */
export const SUPPORT_CARD_SOCIAL_VALUE = 'rarely';

function scaleValue(raw: unknown): number | null {
  if (typeof raw === 'number') return Number.isFinite(raw) ? raw : null;
  if (typeof raw === 'string' && raw.trim() !== '') {
    const n = Number(raw);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

/**
 * Deterministic rule for the support card on a FULL Mental Wellness result: fires when
 * mood is at the lowest two options AND at least one further distress marker is present
 * (frequent anxiety, high or severe stress, coping confidence of 1 or 2, or rare social
 * connection). A missing or unreadable answer never fires it and never counts as a marker.
 * Pure, with no model involvement.
 */
export function needsSupportCard(answers: Record<string, unknown> | null | undefined): boolean {
  if (!answers) return false;
  const mood = scaleValue(answers.moodRating);
  if (mood === null || mood > SUPPORT_CARD_MOOD_MAX) return false;

  const coping = scaleValue(answers.copingConfidence);
  const furtherMarker =
    answers.anxietyFrequency === SUPPORT_CARD_ANXIETY_VALUE ||
    (typeof answers.stressLevel === 'string' &&
      (SUPPORT_CARD_STRESS_VALUES as readonly string[]).includes(answers.stressLevel)) ||
    (coping !== null && coping <= SUPPORT_CARD_COPING_MAX) ||
    answers.socialConnection === SUPPORT_CARD_SOCIAL_VALUE;
  return furtherMarker;
}

/** Only Mental Wellness can ever produce a support card. */
export function needsSupportCardFor(type: AssessmentType, answers: Record<string, unknown> | null | undefined): boolean {
  return type === 'MENTAL_WELLNESS' && needsSupportCard(answers);
}
