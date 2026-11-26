import { z } from 'zod';
import { PersonalGoalSchema, type PersonalGoal } from './goals';

export interface WeeklyActionDef {
  id: string;
  goal: PersonalGoal;
  /** LIGHT actions replace the standard set for a week after a lapse. */
  weight: 'STANDARD' | 'LIGHT';
  title: string;
  detail: string;
}

/**
 * Action catalogue: plain wellness wording, no health claims.
 * Needs clinician review.
 * Each goal has three standard actions and two lighter ones.
 */
export const WEEKLY_ACTION_CATALOGUE: readonly WeeklyActionDef[] = [
  { id: 'movement-walk', goal: 'MOVEMENT', weight: 'STANDARD', title: 'Take a 10-minute walk', detail: 'Step outside or stroll around the house, on any three days this week.' },
  { id: 'movement-stretch', goal: 'MOVEMENT', weight: 'STANDARD', title: 'Stretch for 5 minutes', detail: 'A few gentle stretches after you wake up or between tasks.' },
  { id: 'movement-stairs', goal: 'MOVEMENT', weight: 'STANDARD', title: 'Pick the stairs once a day', detail: 'Choose stairs over the lift whenever it is easy to do so.' },
  { id: 'movement-light-stand', goal: 'MOVEMENT', weight: 'LIGHT', title: 'Stand up and stretch', detail: 'Once a day, stand up and stretch for a minute or two.' },
  { id: 'movement-light-walk', goal: 'MOVEMENT', weight: 'LIGHT', title: 'Walk around the block', detail: 'One short stroll this week, as slow as you like.' },

  { id: 'sleep-wind-down', goal: 'SLEEP', weight: 'STANDARD', title: 'Wind down for 15 minutes', detail: 'Dim the lights and put screens away before bed on three nights.' },
  { id: 'sleep-regular-time', goal: 'SLEEP', weight: 'STANDARD', title: 'Keep a regular bedtime', detail: 'Aim for roughly the same bedtime on most nights this week.' },
  { id: 'sleep-caffeine', goal: 'SLEEP', weight: 'STANDARD', title: 'Skip caffeine after lunch', detail: 'Try a caffeine-free drink in the afternoon and evening.' },
  { id: 'sleep-light-screens', goal: 'SLEEP', weight: 'LIGHT', title: 'Screens down a little earlier', detail: 'Put your phone away 10 minutes earlier on one night.' },
  { id: 'sleep-light-breathe', goal: 'SLEEP', weight: 'LIGHT', title: 'Take three slow breaths in bed', detail: 'Before you sleep, breathe in and out slowly three times.' },

  { id: 'stress-pause', goal: 'STRESS', weight: 'STANDARD', title: 'Take a 2-minute pause', detail: 'Sit quietly and breathe slowly once a day.' },
  { id: 'stress-outside', goal: 'STRESS', weight: 'STANDARD', title: 'Get some fresh air', detail: 'Spend a few minutes outside on two days this week.' },
  { id: 'stress-reach-out', goal: 'STRESS', weight: 'STANDARD', title: 'Chat with someone you like', detail: 'Call or message a friend or family member.' },
  { id: 'stress-light-breath', goal: 'STRESS', weight: 'LIGHT', title: 'Take five slow breaths', detail: 'One time this week, pause and breathe slowly five times.' },
  { id: 'stress-light-music', goal: 'STRESS', weight: 'LIGHT', title: 'Listen to a song you enjoy', detail: 'Put on something that makes you feel good.' },

  { id: 'hydration-morning', goal: 'HYDRATION', weight: 'STANDARD', title: 'Start the day with a glass of water', detail: 'Have a glass before your first drink of the day.' },
  { id: 'hydration-bottle', goal: 'HYDRATION', weight: 'STANDARD', title: 'Keep a water bottle nearby', detail: 'Fill it up and keep it within reach while you work or study.' },
  { id: 'hydration-meals', goal: 'HYDRATION', weight: 'STANDARD', title: 'Have water with each meal', detail: 'Pour a glass of water with your meals on most days.' },
  { id: 'hydration-light-glass', goal: 'HYDRATION', weight: 'LIGHT', title: 'Have one extra glass of water', detail: 'Add one more glass on any day this week.' },
  { id: 'hydration-light-bottle', goal: 'HYDRATION', weight: 'LIGHT', title: 'Put a water bottle where you can see it', detail: 'A simple reminder to sip through the day.' },

  { id: 'selfcare-me-time', goal: 'SELF_CARE', weight: 'STANDARD', title: 'Set aside 15 minutes for yourself', detail: 'Do something just for you, like reading or a hobby, on three days.' },
  { id: 'selfcare-good-moment', goal: 'SELF_CARE', weight: 'STANDARD', title: 'Write down one thing that went well', detail: 'Jot down a good moment from your day, twice this week.' },
  { id: 'selfcare-routine', goal: 'SELF_CARE', weight: 'STANDARD', title: 'Keep a small daily routine', detail: 'Pick one tiny habit, like a skincare step or tidying your desk.' },
  { id: 'selfcare-light-treat', goal: 'SELF_CARE', weight: 'LIGHT', title: 'Do one thing you enjoy', detail: 'Choose something small that makes you smile.' },
  { id: 'selfcare-light-note', goal: 'SELF_CARE', weight: 'LIGHT', title: 'Note one good moment', detail: 'Write down one thing that went well this week.' },
];

export const WEEKLY_ACTIONS_STANDARD_COUNT = 3;
export const WEEKLY_ACTIONS_LIGHT_COUNT = 2;

export function getWeeklyActionDef(id: string): WeeklyActionDef | undefined {
  return WEEKLY_ACTION_CATALOGUE.find((a) => a.id === id);
}

/**
 * Picks this week's actions for the user's goals. Standard weeks offer 3
 * actions, lighter weeks (after a lapse) offer 2, shared out across goals in
 * turn (goal 1, goal 2, goal 1, ...) so two goals never double the load.
 */
export function selectWeeklyActions(goals: readonly PersonalGoal[], lighter: boolean): WeeklyActionDef[] {
  if (goals.length === 0) return [];
  const weight = lighter ? 'LIGHT' : 'STANDARD';
  const total = lighter ? WEEKLY_ACTIONS_LIGHT_COUNT : WEEKLY_ACTIONS_STANDARD_COUNT;
  const perGoal = goals.map((goal) => WEEKLY_ACTION_CATALOGUE.filter((a) => a.goal === goal && a.weight === weight));
  const picked: WeeklyActionDef[] = [];
  for (let round = 0; picked.length < total && round < total; round++) {
    for (const list of perGoal) {
      if (picked.length < total && list[round]) picked.push(list[round]);
    }
  }
  return picked;
}

/** Monday of the ISO week (UTC) containing `date`, as "YYYY-MM-DD". */
export function isoWeekStartKey(date: Date): string {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const daysFromMonday = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - daysFromMonday);
  return d.toISOString().slice(0, 10);
}

export const WeeklyActionIdParamSchema = z
  .string()
  .refine((id) => getWeeklyActionDef(id) !== undefined, 'Unknown action');

export const WeeklyActionsQuerySchema = z.object({
  /** "true" when the user is coming back after a lapse; offers the lighter set. */
  lapsed: z
    .enum(['true', 'false'])
    .optional()
    .transform((v) => v === 'true'),
});
export type WeeklyActionsQuery = z.infer<typeof WeeklyActionsQuerySchema>;

export const WeeklyActionItemSchema = z.object({
  id: z.string(),
  goal: PersonalGoalSchema,
  title: z.string(),
  detail: z.string(),
  completed: z.boolean(),
  completedAt: z.string().datetime().nullable(),
});
export type WeeklyActionItem = z.infer<typeof WeeklyActionItemSchema>;

export const WeeklyActionsSchema = z.object({
  /** Monday of the ISO week (UTC), "YYYY-MM-DD". */
  weekStart: z.string(),
  lighter: z.boolean(),
  actions: z.array(WeeklyActionItemSchema),
});
export type WeeklyActions = z.infer<typeof WeeklyActionsSchema>;
