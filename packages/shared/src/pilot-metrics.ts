import { z } from 'zod';
import { PERSONAL_GOALS } from './goals';

/**
 * E6 pilot habit-loop metrics. Aggregates only: counts and rates,
 * never a user id, email, message or row-level health value, so the same
 * payload backs both the admin view and the anonymised export.
 */

/** Days after signup measured by the retention metric. */
export const PILOT_RETENTION_DAYS = [1, 7, 14] as const;

/** A lapse is this many consecutive days without a check-in. */
export const PILOT_LAPSE_MIN_GAP_DAYS = 2;
/** A lapsed user counts as recovered if they check in within this many days of the lapse. */
export const PILOT_LAPSE_RECOVERY_DAYS = 7;

export const STREAK_BUCKETS = ['LAPSED', 'NONE', '1-2', '3-6', '7-13', '14+'] as const;
export type StreakBucket = (typeof STREAK_BUCKETS)[number];

const DateKeySchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD.');

/** GET /admin/pilot-metrics query. `cohortStart` limits the cohort to users who signed up on or after that day. */
export const PilotMetricsQuerySchema = z.object({
  cohortStart: DateKeySchema.optional(),
});
export type PilotMetricsQuery = z.infer<typeof PilotMetricsQuerySchema>;

const RateSchema = z.number().min(0).max(1).nullable();

export const PilotMetricsSchema = z.object({
  generatedAt: z.string().datetime(),
  cohortStart: DateKeySchema.nullable(),
  cohortSize: z.number().int(),
  activeUsersLast7Days: z.number().int(),
  retention: z.array(
    z.object({
      day: z.number().int(),
      eligibleUsers: z.number().int(),
      retainedUsers: z.number().int(),
      rate: RateSchema,
    }),
  ),
  checkIns: z.object({
    total: z.number().int(),
    activeDays: z.number().int(),
    perActiveDay: z.number().nullable(),
  }),
  lapseRecovery: z.object({
    lapsedUsers: z.number().int(),
    recoveredUsers: z.number().int(),
    rate: RateSchema,
  }),
  weeklyActions: z.object({
    totalCompletions: z.number().int(),
    usersWithActiveGoals: z.number().int(),
    lastWeek: z.object({
      weekStart: DateKeySchema,
      completions: z.number().int(),
      usersCompleting: z.number().int(),
      completionRate: RateSchema,
    }),
  }),
  streakDistribution: z.array(z.object({ bucket: z.enum(STREAK_BUCKETS), users: z.number().int() })),
  goalChoices: z.array(z.object({ goal: z.enum(PERSONAL_GOALS), users: z.number().int() })),
  safetyEvents: z.object({ total: z.number().int() }),
});
export type PilotMetricsDto = z.infer<typeof PilotMetricsSchema>;

function pct(rate: number | null): string {
  return rate === null ? '' : (rate * 100).toFixed(1);
}

/**
 * Flattens the metrics into `metric,value` rows for the anonymised CSV export.
 * Aggregates only, so there is nothing to strip.
 */
export function pilotMetricsToRows(m: PilotMetricsDto): Array<[string, string | number]> {
  const rows: Array<[string, string | number]> = [
    ['generated_at', m.generatedAt],
    ['cohort_start', m.cohortStart ?? ''],
    ['cohort_size', m.cohortSize],
    ['active_users_last_7_days', m.activeUsersLast7Days],
  ];
  for (const r of m.retention) {
    rows.push([`d${r.day}_retention_eligible_users`, r.eligibleUsers]);
    rows.push([`d${r.day}_retention_retained_users`, r.retainedUsers]);
    rows.push([`d${r.day}_retention_percent`, pct(r.rate)]);
  }
  rows.push(['check_ins_total', m.checkIns.total]);
  rows.push(['check_in_active_days', m.checkIns.activeDays]);
  rows.push(['check_ins_per_active_day', m.checkIns.perActiveDay === null ? '' : m.checkIns.perActiveDay.toFixed(2)]);
  rows.push(['lapsed_users', m.lapseRecovery.lapsedUsers]);
  rows.push(['lapse_recovered_users', m.lapseRecovery.recoveredUsers]);
  rows.push(['lapse_recovery_percent', pct(m.lapseRecovery.rate)]);
  rows.push(['weekly_action_completions_total', m.weeklyActions.totalCompletions]);
  rows.push(['users_with_active_goals', m.weeklyActions.usersWithActiveGoals]);
  rows.push(['weekly_action_last_week_start', m.weeklyActions.lastWeek.weekStart]);
  rows.push(['weekly_action_last_week_completions', m.weeklyActions.lastWeek.completions]);
  rows.push(['weekly_action_last_week_users_completing', m.weeklyActions.lastWeek.usersCompleting]);
  rows.push(['weekly_action_last_week_completion_percent', pct(m.weeklyActions.lastWeek.completionRate)]);
  for (const s of m.streakDistribution) rows.push([`streak_bucket_${s.bucket}_users`, s.users]);
  for (const g of m.goalChoices) rows.push([`goal_${g.goal.toLowerCase()}_users`, g.users]);
  rows.push(['safety_events_total', m.safetyEvents.total]);
  return rows;
}

export function pilotMetricsToCsv(m: PilotMetricsDto): string {
  return ['metric,value', ...pilotMetricsToRows(m).map(([k, v]) => `${k},${v}`)].join('\n') + '\n';
}
