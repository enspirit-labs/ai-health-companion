import { NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';

import { GoalsService } from '../goals/goals.service';
import { PrismaService } from '../prisma/prisma.service';
import { WeeklyActionsService } from './weekly-actions.service';

// Wednesday; ISO week starts Monday 2026-10-26.
const NOW = new Date('2026-10-28T10:00:00Z');
const WEEK_START = new Date('2026-10-26T00:00:00.000Z');

describe('WeeklyActionsService', () => {
  let service: WeeklyActionsService;
  let prisma: { weeklyActionCompletion: Record<string, jest.Mock> };
  let goals: { getActiveGoals: jest.Mock };

  beforeEach(async () => {
    prisma = {
      weeklyActionCompletion: {
        findMany: jest.fn().mockResolvedValue([]),
        upsert: jest.fn().mockResolvedValue({}),
        deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
    };
    goals = { getActiveGoals: jest.fn().mockResolvedValue(['SLEEP']) };

    const moduleRef = await Test.createTestingModule({
      providers: [
        WeeklyActionsService,
        { provide: PrismaService, useValue: prisma },
        { provide: GoalsService, useValue: goals },
      ],
    }).compile();

    service = moduleRef.get(WeeklyActionsService);
  });

  describe('getWeek', () => {
    it('offers three actions for the chosen goal with nothing ticked yet', async () => {
      const week = await service.getWeek('user-1', false, NOW);

      expect(week.weekStart).toBe('2026-10-26');
      expect(week.lighter).toBe(false);
      expect(week.actions).toHaveLength(3);
      expect(week.actions.every((a) => a.goal === 'SLEEP' && !a.completed)).toBe(true);
    });

    it('marks actions completed this week and scopes the lookup to the user and week', async () => {
      const completedAt = new Date('2026-10-27T08:00:00Z');
      prisma.weeklyActionCompletion.findMany.mockResolvedValue([{ actionId: 'sleep-wind-down', completedAt }]);

      const week = await service.getWeek('user-1', false, NOW);

      expect(prisma.weeklyActionCompletion.findMany).toHaveBeenCalledWith({
        where: { userId: 'user-1', weekStart: WEEK_START },
      });
      const ticked = week.actions.find((a) => a.id === 'sleep-wind-down');
      expect(ticked).toMatchObject({ completed: true, completedAt: completedAt.toISOString() });
      expect(week.actions.filter((a) => a.completed)).toHaveLength(1);
    });

    it('offers a lighter set of two when lapsed', async () => {
      const week = await service.getWeek('user-1', true, NOW);

      expect(week.lighter).toBe(true);
      expect(week.actions).toHaveLength(2);
    });

    it('offers nothing when the user has no goals', async () => {
      goals.getActiveGoals.mockResolvedValue([]);

      const week = await service.getWeek('user-1', false, NOW);

      expect(week.actions).toEqual([]);
    });
  });

  describe('complete', () => {
    it('records the completion for this ISO week, idempotently', async () => {
      await service.complete('user-1', 'sleep-wind-down', NOW);

      expect(prisma.weeklyActionCompletion.upsert).toHaveBeenCalledWith({
        where: { userId_weekStart_actionId: { userId: 'user-1', weekStart: WEEK_START, actionId: 'sleep-wind-down' } },
        create: { userId: 'user-1', weekStart: WEEK_START, actionId: 'sleep-wind-down', goal: 'SLEEP' },
        update: {},
      });
    });

    it('refuses an action for a goal the user has not chosen', async () => {
      await expect(service.complete('user-1', 'movement-walk', NOW)).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.weeklyActionCompletion.upsert).not.toHaveBeenCalled();
    });

    it('refuses an unknown action id', async () => {
      await expect(service.complete('user-1', 'nope', NOW)).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('uncomplete', () => {
    it("removes only this user's completion for this week", async () => {
      await service.uncomplete('user-1', 'sleep-wind-down', NOW);

      expect(prisma.weeklyActionCompletion.deleteMany).toHaveBeenCalledWith({
        where: { userId: 'user-1', weekStart: WEEK_START, actionId: 'sleep-wind-down' },
      });
    });
  });
});
