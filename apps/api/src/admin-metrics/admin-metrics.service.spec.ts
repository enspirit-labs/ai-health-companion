import { Test } from '@nestjs/testing';

import { PrismaService } from '../prisma/prisma.service';
import { AdminMetricsService } from './admin-metrics.service';

const whereOf = (fn: jest.Mock) =>
  (fn.mock.calls[0] as [{ where: Record<string, unknown> }])[0].where;

describe('AdminMetricsService', () => {
  let service: AdminMetricsService;
  let prisma: {
    user: Record<string, jest.Mock>;
    assessment: Record<string, jest.Mock>;
    userGoal: Record<string, jest.Mock>;
    weeklyActionCompletion: Record<string, jest.Mock>;
    activityLog: Record<string, jest.Mock>;
  };

  beforeEach(async () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-11-02T12:00:00.000Z')); // a Monday

    prisma = {
      user: { findMany: jest.fn().mockResolvedValue([]) },
      assessment: { findMany: jest.fn().mockResolvedValue([]) },
      userGoal: { groupBy: jest.fn().mockResolvedValue([]) },
      weeklyActionCompletion: {
        count: jest.fn().mockResolvedValue(0),
        groupBy: jest.fn().mockResolvedValue([]),
      },
      activityLog: { count: jest.fn().mockResolvedValue(0) },
    };

    const moduleRef = await Test.createTestingModule({
      providers: [
        AdminMetricsService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();
    service = moduleRef.get(AdminMetricsService);
  });

  afterEach(() => jest.useRealTimers());

  describe('getPilotMetrics', () => {
    it('returns zeroed aggregates and null rates for an empty cohort', async () => {
      const m = await service.getPilotMetrics();

      expect(m.cohortSize).toBe(0);
      expect(m.retention.map((r) => r.rate)).toEqual([null, null, null]);
      expect(m.checkIns).toEqual({
        total: 0,
        activeDays: 0,
        perActiveDay: null,
      });
      expect(m.lapseRecovery.rate).toBeNull();
      expect(m.goalChoices.every((g) => g.users === 0)).toBe(true);
      expect(m.streakDistribution).toHaveLength(6);
    });

    it('scopes every query to USER-role accounts, never staff', async () => {
      await service.getPilotMetrics();

      expect(whereOf(prisma.user.findMany)).toEqual({ role: 'USER' });
      expect(whereOf(prisma.assessment.findMany).user).toEqual({
        role: 'USER',
      });
      expect(whereOf(prisma.activityLog.count).user).toEqual({ role: 'USER' });
    });

    it('applies cohortStart as a createdAt lower bound', async () => {
      await service.getPilotMetrics({ cohortStart: '2026-10-15' });

      expect(whereOf(prisma.user.findMany)).toEqual({
        role: 'USER',
        createdAt: { gte: new Date('2026-10-15T00:00:00.000Z') },
      });
    });

    it('computes retention, check-ins per active day and active users from completed assessments', async () => {
      prisma.user.findMany.mockResolvedValue([
        {
          id: 'u1',
          timezone: null,
          createdAt: new Date('2026-10-20T08:00:00Z'),
        },
        {
          id: 'u2',
          timezone: null,
          createdAt: new Date('2026-10-20T09:00:00Z'),
        },
      ]);
      prisma.assessment.findMany.mockResolvedValue([
        { userId: 'u1', completedAt: new Date('2026-10-21T10:00:00Z') },
        { userId: 'u1', completedAt: new Date('2026-10-21T18:00:00Z') }, // same day, second check-in
        { userId: 'u1', completedAt: new Date('2026-11-02T07:00:00Z') },
      ]);

      const m = await service.getPilotMetrics();

      expect(m.retention[0]).toEqual({
        day: 1,
        eligibleUsers: 2,
        retainedUsers: 1,
        rate: 0.5,
      });
      expect(m.checkIns).toEqual({
        total: 3,
        activeDays: 2,
        perActiveDay: 1.5,
      });
      expect(m.activeUsersLast7Days).toBe(1);
    });

    it('buckets each user in their own timezone', async () => {
      // 23:30 UTC on 20 Oct is already 21 Oct in Kolkata, so D1 is 22 Oct there.
      prisma.user.findMany.mockResolvedValue([
        {
          id: 'u1',
          timezone: 'Asia/Kolkata',
          createdAt: new Date('2026-10-20T23:30:00Z'),
        },
      ]);
      prisma.assessment.findMany.mockResolvedValue([
        { userId: 'u1', completedAt: new Date('2026-10-22T05:00:00Z') },
      ]);

      const m = await service.getPilotMetrics();

      expect(m.retention[0].retainedUsers).toBe(1);
    });

    it('reports last full week action completion against users with active goals', async () => {
      prisma.userGoal.groupBy
        .mockResolvedValueOnce([{ goal: 'SLEEP', _count: { _all: 2 } }])
        .mockResolvedValueOnce([
          { userId: 'u1' },
          { userId: 'u2' },
          { userId: 'u3' },
          { userId: 'u4' },
        ]);
      prisma.weeklyActionCompletion.count.mockResolvedValue(9);
      prisma.weeklyActionCompletion.groupBy.mockResolvedValue([
        { userId: 'u1', _count: { _all: 2 } },
        { userId: 'u2', _count: { _all: 1 } },
      ]);

      const m = await service.getPilotMetrics();

      expect(m.weeklyActions.lastWeek).toEqual({
        weekStart: '2026-10-26',
        completions: 3,
        usersCompleting: 2,
        completionRate: 0.5,
      });
      expect(m.weeklyActions.totalCompletions).toBe(9);
      expect(m.goalChoices.find((g) => g.goal === 'SLEEP')?.users).toBe(2);
    });

    it('returns the safety-event count and nothing identifying', async () => {
      prisma.user.findMany.mockResolvedValue([
        { id: 'u1', timezone: null, createdAt: new Date('2026-10-20') },
      ]);
      prisma.activityLog.count.mockResolvedValue(3);

      const m = await service.getPilotMetrics();

      expect(m.safetyEvents).toEqual({ total: 3 });
      const json = JSON.stringify(m);
      expect(json).not.toContain('u1');
      expect(whereOf(prisma.activityLog.count).action).toBe('chat.escalation');
    });
  });
});
