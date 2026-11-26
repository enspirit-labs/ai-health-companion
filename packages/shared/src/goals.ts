import { z } from 'zod';
import type { AssessmentType } from './assessment-types';

/** Source of truth for the personal-goal union; mirrored by the Prisma `PersonalGoal` enum. */
export const PERSONAL_GOALS = ['MOVEMENT', 'SLEEP', 'STRESS', 'HYDRATION', 'SELF_CARE'] as const;
export type PersonalGoal = (typeof PERSONAL_GOALS)[number];

export const MAX_ACTIVE_GOALS = 2;

// Needs clinician review: plain wellness wording for the goal picker.
export const PERSONAL_GOAL_LABELS: Record<PersonalGoal, string> = {
  MOVEMENT: 'Move more',
  SLEEP: 'Sleep better',
  STRESS: 'Feel calmer',
  HYDRATION: 'Drink more water',
  SELF_CARE: 'Look after myself',
};

export const PERSONAL_GOAL_DESCRIPTIONS: Record<PersonalGoal, string> = {
  MOVEMENT: 'Small ways to be more active through the week.',
  SLEEP: 'Gentle habits that help you wind down and rest.',
  STRESS: 'Short pauses and routines for a calmer day.',
  HYDRATION: 'Easy reminders to keep water close by.',
  SELF_CARE: 'Little things that put you first.',
};

export const PersonalGoalSchema = z.enum(PERSONAL_GOALS);

/** PUT /goals body: the full set of goals the user wants (1 or 2, no duplicates). */
export const SetGoalsSchema = z.object({
  goals: z
    .array(PersonalGoalSchema)
    .min(1, 'Pick at least one goal')
    .max(MAX_ACTIVE_GOALS, `Pick up to ${MAX_ACTIVE_GOALS} goals`)
    .refine((goals) => new Set(goals).size === goals.length, 'Pick each goal only once'),
});
export type SetGoalsInput = z.infer<typeof SetGoalsSchema>;

export const UserGoalsSchema = z.object({
  goals: z.array(PersonalGoalSchema).max(MAX_ACTIVE_GOALS),
});
export type UserGoals = z.infer<typeof UserGoalsSchema>;

/**
 * Which assessments' guidance is most relevant to each goal. Used only to
 * order and filter recommendations; never to infer anything about the user.
 */
export const GOAL_RELATED_ASSESSMENTS: Record<PersonalGoal, readonly AssessmentType[]> = {
  MOVEMENT: ['SQUATS', 'POSTURE', 'WALKING', 'HAND_COORDINATION'],
  SLEEP: ['LIFESTYLE', 'EYE', 'FACE'],
  STRESS: ['MENTAL_WELLNESS', 'VOICE', 'LIFESTYLE'],
  HYDRATION: ['LIFESTYLE', 'SKIN', 'TONGUE'],
  SELF_CARE: ['SKIN', 'HAIR', 'TEETH', 'MENTAL_WELLNESS'],
};

export function isAssessmentRelatedToGoals(type: AssessmentType, goals: readonly PersonalGoal[]): boolean {
  return goals.some((goal) => GOAL_RELATED_ASSESSMENTS[goal].includes(type));
}

const PRIORITY_RANK: Record<string, number> = { HIGH: 3, MEDIUM: 2, LOW: 1 };

/**
 * Ranks recommendations for the user's goals: goal-related guidance first,
 * then by priority, preserving the incoming order otherwise (stable sort).
 * With no goals the list is returned unchanged. When `onlyGoalRelated` is
 * set, unrelated items are dropped.
 */
export function rankRecommendationsByGoals<T extends { priority: string; sourceAssessment: AssessmentType }>(
  recommendations: readonly T[],
  goals: readonly PersonalGoal[],
  options: { onlyGoalRelated?: boolean } = {},
): T[] {
  if (goals.length === 0) return [...recommendations];
  const related = (r: T) => isAssessmentRelatedToGoals(r.sourceAssessment, goals);
  const kept = options.onlyGoalRelated ? recommendations.filter(related) : [...recommendations];
  return kept
    .map((rec, index) => ({ rec, index }))
    .sort(
      (a, b) =>
        Number(related(b.rec)) - Number(related(a.rec)) ||
        (PRIORITY_RANK[b.rec.priority] ?? 0) - (PRIORITY_RANK[a.rec.priority] ?? 0) ||
        a.index - b.index,
    )
    .map(({ rec }) => rec);
}
