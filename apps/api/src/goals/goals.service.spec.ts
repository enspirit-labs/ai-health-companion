import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';

import { PrismaService } from '../prisma/prisma.service';
import { GoalsService } from './goals.service';

describe('GoalsService', () => {
  let service: GoalsService;
  let prisma: { userGoal: Record<string, jest.Mock>; $transaction: jest.Mock };

  beforeEach(async () => {
    prisma = {
      userGoal: {
        findMany: jest.fn().mockResolvedValue([]),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        upsert: jest.fn().mockResolvedValue({}),
      },
      $transaction: jest.fn((ops: Promise<unknown>[]) => Promise.all(ops)),
    };

    const moduleRef = await Test.createTestingModule({
      providers: [GoalsService, { provide: PrismaService, useValue: prisma }],
    }).compile();

    service = moduleRef.get(GoalsService);
  });

  describe('getGoals', () => {
    it("returns only the requesting user's active goals", async () => {
      prisma.userGoal.findMany.mockResolvedValue([{ goal: 'SLEEP' }, { goal: 'STRESS' }]);

      await expect(service.getGoals('user-1')).resolves.toEqual({ goals: ['SLEEP', 'STRESS'] });
      expect(prisma.userGoal.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { userId: 'user-1', active: true } }),
      );
    });
  });

  describe('setGoals', () => {
    it('creates or reactivates newly chosen goals scoped to the user', async () => {
      await service.setGoals('user-1', ['SLEEP', 'MOVEMENT']);

      expect(prisma.userGoal.upsert).toHaveBeenCalledTimes(2);
      expect(prisma.userGoal.upsert).toHaveBeenCalledWith({
        where: { userId_goal: { userId: 'user-1', goal: 'SLEEP' } },
        create: { userId: 'user-1', goal: 'SLEEP' },
        update: { active: true },
      });
    });

    it('deactivates active goals that were left out instead of deleting them', async () => {
      prisma.userGoal.findMany.mockResolvedValue([{ goal: 'SLEEP' }]);

      await service.setGoals('user-1', ['STRESS']);

      expect(prisma.userGoal.updateMany).toHaveBeenCalledWith({
        where: { userId: 'user-1', active: true, goal: { notIn: ['STRESS'] } },
        data: { active: false },
      });
    });

    it('does not touch goals that are already active', async () => {
      prisma.userGoal.findMany.mockResolvedValue([{ goal: 'SLEEP' }]);

      await service.setGoals('user-1', ['SLEEP', 'STRESS']);

      expect(prisma.userGoal.upsert).toHaveBeenCalledTimes(1);
      expect(prisma.userGoal.upsert).toHaveBeenCalledWith(
        expect.objectContaining({ create: { userId: 'user-1', goal: 'STRESS' } }),
      );
    });

    it('refuses more than two goals', async () => {
      await expect(service.setGoals('user-1', ['SLEEP', 'STRESS', 'MOVEMENT'])).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });
  });

  describe('removeGoal', () => {
    it('deactivates the goal for this user only', async () => {
      await service.removeGoal('user-1', 'SLEEP');

      expect(prisma.userGoal.updateMany).toHaveBeenCalledWith({
        where: { userId: 'user-1', goal: 'SLEEP', active: true },
        data: { active: false },
      });
    });

    it('throws NotFound when the user has no such active goal', async () => {
      prisma.userGoal.updateMany.mockResolvedValue({ count: 0 });

      await expect(service.removeGoal('user-1', 'SLEEP')).rejects.toBeInstanceOf(NotFoundException);
    });
  });
});
