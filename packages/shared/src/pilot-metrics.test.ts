import { describe, expect, it } from 'vitest';

import { PilotMetricsQuerySchema, pilotMetricsToCsv, type PilotMetricsDto } from './pilot-metrics';

const metrics: PilotMetricsDto = {
  generatedAt: '2026-11-01T00:00:00.000Z',
  cohortStart: null,
  cohortSize: 10,
  activeUsersLast7Days: 6,
  retention: [
    { day: 1, eligibleUsers: 10, retainedUsers: 7, rate: 0.7 },
    { day: 7, eligibleUsers: 0, retainedUsers: 0, rate: null },
  ],
  checkIns: { total: 30, activeDays: 20, perActiveDay: 1.5 },
  lapseRecovery: { lapsedUsers: 4, recoveredUsers: 3, rate: 0.75 },
  weeklyActions: {
    totalCompletions: 12,
    usersWithActiveGoals: 8,
    lastWeek: { weekStart: '2026-10-19', completions: 5, usersCompleting: 4, completionRate: 0.5 },
  },
  streakDistribution: [{ bucket: '3-6', users: 2 }],
  goalChoices: [{ goal: 'SLEEP', users: 5 }],
  safetyEvents: { total: 1 },
};

describe('pilotMetricsToCsv', () => {
  const csv = pilotMetricsToCsv(metrics);

  it('writes a metric,value header and one row per metric', () => {
    const lines = csv.trim().split('\n');
    expect(lines[0]).toBe('metric,value');
    expect(lines).toContain('d1_retention_percent,70.0');
    expect(lines).toContain('lapse_recovery_percent,75.0');
    expect(lines).toContain('check_ins_per_active_day,1.50');
    expect(lines).toContain('goal_sleep_users,5');
    expect(lines).toContain('safety_events_total,1');
  });

  it('leaves rates empty rather than zero when there is nobody eligible', () => {
    expect(csv).toContain('d7_retention_percent,\n');
  });

  it('carries no identifier columns, only metric names and numbers', () => {
    expect(csv).not.toMatch(/@|userId|email/i);
  });
});

describe('PilotMetricsQuerySchema', () => {
  it('accepts an empty query and a YYYY-MM-DD cohortStart', () => {
    expect(PilotMetricsQuerySchema.safeParse({}).success).toBe(true);
    expect(PilotMetricsQuerySchema.safeParse({ cohortStart: '2026-10-01' }).success).toBe(true);
  });

  it('rejects a malformed cohortStart', () => {
    expect(PilotMetricsQuerySchema.safeParse({ cohortStart: '01/10/2026' }).success).toBe(false);
  });
});
