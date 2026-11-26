import { Injectable } from '@nestjs/common';
import {
  ASSESSMENT_TYPES,
  PERSONAL_GOALS,
  PILOT_RETENTION_DAYS,
  STREAK_BUCKETS,
} from '@aidoctor/shared';
import type { PilotMetricsDto, PilotMetricsQuery } from '@aidoctor/shared';

import { PrismaService } from '../prisma/prisma.service';
import { dateKeyInZone } from '../common/date.util';
import {
  addDays,
  computeLapseRecovery,
  computeRetention,
  rate,
  streakBucket,
  weekStartOf,
  type UserDays,
} from './pilot-metrics.util';

const SAFETY_EVENT_ACTION = 'chat.escalation';
const ACTIVE_WINDOW_DAYS = 7;

/**
 * E6 pilot metrics. Aggregates only: nothing here returns a user
 * id, email, message or per-user row. The cohort is every USER-role account
 * (staff are not pilot participants), optionally limited to signups on or
 * after `cohortStart`, because the schema has no explicit pilot-cohort flag.
 */
@Injectable()
export class AdminMetricsService {
  constructor(private readonly prisma: PrismaService) {}

  async getPilotMetrics(
    query: PilotMetricsQuery = {},
  ): Promise<PilotMetricsDto> {
    const now = new Date();
    const cohortStart = query.cohortStart ?? null;
    const cohortWhere = {
      role: 'USER' as const,
      ...(cohortStart && {
        createdAt: { gte: new Date(`${cohortStart}T00:00:00.000Z`) },
      }),
    };

    const [users, completions, goalGroups, usersWithActiveGoals, safetyEvents] =
      await Promise.all([
        this.prisma.user.findMany({
          where: cohortWhere,
          select: { id: true, timezone: true, createdAt: true },
        }),
        this.prisma.assessment.findMany({
          where: {
            status: 'COMPLETED',
            type: { in: [...ASSESSMENT_TYPES] },
            completedAt: { not: null },
            user: cohortWhere,
          },
          select: { userId: true, completedAt: true },
        }),
        this.prisma.userGoal.groupBy({
          by: ['goal'],
          where: { active: true, user: cohortWhere },
          _count: { _all: true },
        }),
        this.prisma.userGoal.groupBy({
          by: ['userId'],
          where: { active: true, user: cohortWhere },
        }),
        this.prisma.activityLog.count({
          where: { action: SAFETY_EVENT_ACTION, user: cohortWhere },
        }),
      ]);

    const zoneByUser = new Map(users.map((u) => [u.id, u.timezone]));
    const daysByUser = new Map<string, Set<string>>(
      users.map((u) => [u.id, new Set<string>()]),
    );
    let checkInTotal = 0;
    for (const c of completions) {
      if (!c.completedAt) continue;
      daysByUser
        .get(c.userId)
        ?.add(dateKeyInZone(c.completedAt, zoneByUser.get(c.userId)));
      checkInTotal += 1;
    }

    const todayKeyOf = (tz: string | null) => dateKeyInZone(now, tz);
    const userDays: Array<UserDays & { todayKey: string }> = users.map((u) => ({
      signupKey: dateKeyInZone(u.createdAt, u.timezone),
      dayKeys: daysByUser.get(u.id) ?? new Set<string>(),
      todayKey: todayKeyOf(u.timezone),
    }));

    // Each user is judged against "today" in their own timezone. Cohorts mix
    // zones only slightly, so the retention and lapse helpers take one key;
    // group by key so every user keeps their own.
    const byToday = new Map<string, UserDays[]>();
    for (const u of userDays)
      byToday.set(u.todayKey, [...(byToday.get(u.todayKey) ?? []), u]);

    const retention = PILOT_RETENTION_DAYS.map((day) => {
      let eligibleUsers = 0;
      let retainedUsers = 0;
      for (const [todayKey, group] of byToday) {
        const r = computeRetention(group, todayKey, day);
        eligibleUsers += r.eligibleUsers;
        retainedUsers += r.retainedUsers;
      }
      return {
        day,
        eligibleUsers,
        retainedUsers,
        rate: rate(retainedUsers, eligibleUsers),
      };
    });

    let lapsedUsers = 0;
    let recoveredUsers = 0;
    const bucketCounts = new Map<string, number>();
    let activeUsersLast7Days = 0;
    for (const [todayKey, group] of byToday) {
      const l = computeLapseRecovery(group, todayKey);
      lapsedUsers += l.lapsedUsers;
      recoveredUsers += l.recoveredUsers;
      const windowStart = addDays(todayKey, -(ACTIVE_WINDOW_DAYS - 1));
      for (const u of group) {
        const bucket = streakBucket(u.dayKeys, todayKey);
        bucketCounts.set(bucket, (bucketCounts.get(bucket) ?? 0) + 1);
        if ([...u.dayKeys].some((k) => k >= windowStart && k <= todayKey))
          activeUsersLast7Days += 1;
      }
    }

    const activeDays = userDays.reduce((sum, u) => sum + u.dayKeys.size, 0);

    // Last full ISO week (Monday UTC), matching how weekStart is stored.
    const todayUtc = dateKeyInZone(now, 'UTC');
    const lastWeekStart = addDays(weekStartOf(todayUtc), -7);
    const [totalCompletions, lastWeekRows] = await Promise.all([
      this.prisma.weeklyActionCompletion.count({
        where: { user: cohortWhere },
      }),
      this.prisma.weeklyActionCompletion.groupBy({
        by: ['userId'],
        where: {
          weekStart: new Date(`${lastWeekStart}T00:00:00.000Z`),
          user: cohortWhere,
        },
        _count: { _all: true },
      }),
    ]);
    const usersWithGoals = usersWithActiveGoals.length;
    const lastWeekCompletions = lastWeekRows.reduce(
      (sum, r) => sum + r._count._all,
      0,
    );

    const goalCounts = new Map(goalGroups.map((g) => [g.goal, g._count._all]));

    return {
      generatedAt: now.toISOString(),
      cohortStart,
      cohortSize: users.length,
      activeUsersLast7Days,
      retention,
      checkIns: {
        total: checkInTotal,
        activeDays,
        perActiveDay: rate(checkInTotal, activeDays),
      },
      lapseRecovery: {
        lapsedUsers,
        recoveredUsers,
        rate: rate(recoveredUsers, lapsedUsers),
      },
      weeklyActions: {
        totalCompletions,
        usersWithActiveGoals: usersWithGoals,
        lastWeek: {
          weekStart: lastWeekStart,
          completions: lastWeekCompletions,
          usersCompleting: lastWeekRows.length,
          completionRate: rate(lastWeekRows.length, usersWithGoals),
        },
      },
      streakDistribution: STREAK_BUCKETS.map((bucket) => ({
        bucket,
        users: bucketCounts.get(bucket) ?? 0,
      })),
      goalChoices: PERSONAL_GOALS.map((goal) => ({
        goal,
        users: goalCounts.get(goal) ?? 0,
      })),
      safetyEvents: { total: safetyEvents },
    };
  }
}
