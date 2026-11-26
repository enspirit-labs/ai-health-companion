import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';

import { PrismaService } from '../prisma/prisma.service';
import { AdminService } from './admin.service';

describe('AdminService', () => {
  let service: AdminService;
  let prisma: {
    user: Record<string, jest.Mock>;
    assessment: Record<string, jest.Mock>;
    report: Record<string, jest.Mock>;
    aiPromptTemplate: Record<string, jest.Mock>;
    activityLog: Record<string, jest.Mock>;
    $transaction: jest.Mock;
  };

  beforeEach(async () => {
    prisma = {
      user: { findMany: jest.fn(), update: jest.fn(), count: jest.fn() },
      assessment: { groupBy: jest.fn().mockResolvedValue([]), count: jest.fn().mockResolvedValue(0) },
      report: { count: jest.fn().mockResolvedValue(0) },
      aiPromptTemplate: { findMany: jest.fn(), findUnique: jest.fn(), update: jest.fn() },
      activityLog: { create: jest.fn() },
      $transaction: jest.fn(),
    };
    // Interactive transaction: run the callback against the same mock client.
    prisma.$transaction.mockImplementation((fn: (tx: typeof prisma) => Promise<unknown>) => fn(prisma));

    const moduleRef = await Test.createTestingModule({
      providers: [AdminService, { provide: PrismaService, useValue: prisma }],
    }).compile();

    service = moduleRef.get(AdminService);
  });

  describe('listUsers', () => {
    it('merges completed-assessment counts into each user', async () => {
      prisma.user.findMany.mockResolvedValue([
        { id: 'u1', email: 'a@example.com', fullName: 'Alice', role: 'USER', isActive: true, createdAt: new Date() },
        { id: 'u2', email: 'b@example.com', fullName: 'Bob', role: 'ADMIN', isActive: true, createdAt: new Date() },
      ]);
      prisma.assessment.groupBy.mockResolvedValue([{ userId: 'u1', _count: { _all: 3 } }]);

      const result = await service.listUsers();

      expect(result.find((u) => u.id === 'u1')?.completedAssessmentCount).toBe(3);
      expect(result.find((u) => u.id === 'u2')?.completedAssessmentCount).toBe(0);
    });

    it('queries without take/skip when no pagination is given', async () => {
      prisma.user.findMany.mockResolvedValue([]);
      await service.listUsers();
      expect(prisma.user.findMany).toHaveBeenCalledWith({ orderBy: { createdAt: 'desc' } });
    });

    it('applies take/skip when page and limit are given', async () => {
      prisma.user.findMany.mockResolvedValue([]);
      await service.listUsers({ page: 2, limit: 10 });
      expect(prisma.user.findMany).toHaveBeenCalledWith({
        orderBy: { createdAt: 'desc' },
        take: 10,
        skip: 10,
      });
    });
  });

  describe('updateUser', () => {
    it('rejects an admin removing their own admin role', async () => {
      await expect(service.updateUser('admin-1', 'admin-1', { role: 'USER' })).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(prisma.user.update).not.toHaveBeenCalled();
    });

    it('rejects an admin deactivating their own account', async () => {
      await expect(service.updateUser('admin-1', 'admin-1', { isActive: false })).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(prisma.user.update).not.toHaveBeenCalled();
    });

    it('allows an admin to deactivate a different user', async () => {
      prisma.user.update.mockResolvedValue({
        id: 'u2',
        email: 'b@example.com',
        fullName: 'Bob',
        role: 'USER',
        isActive: false,
        createdAt: new Date(),
      });
      prisma.assessment.count.mockResolvedValue(2);

      const result = await service.updateUser('admin-1', 'u2', { isActive: false });

      expect(prisma.user.update).toHaveBeenCalledWith({ where: { id: 'u2' }, data: { isActive: false } });
      expect(result.isActive).toBe(false);
      expect(result.completedAssessmentCount).toBe(2);
    });
  });

  describe('getStats', () => {
    it('fills in zero counts for assessment types with no completions', async () => {
      prisma.user.count.mockResolvedValue(10);
      prisma.assessment.count.mockResolvedValue(5);
      prisma.report.count.mockResolvedValue(3);
      prisma.assessment.groupBy.mockResolvedValue([{ type: 'FACE', _count: { _all: 4 } }]);

      const result = await service.getStats();

      expect(result.assessmentsByType.find((a) => a.type === 'FACE')?.count).toBe(4);
      expect(result.assessmentsByType.find((a) => a.type === 'EYE')?.count).toBe(0);
      expect(result.totalReports).toBe(3);
    });
  });

  describe('updatePromptTemplate', () => {
    const existing = {
      id: 't1',
      key: 'assessment.FACE.system',
      assessmentType: 'FACE',
      systemPrompt: 'Line one\nOld rule\nLine three',
      version: 3,
      isActive: true,
      updatedAt: new Date(),
    };

    it('bumps the version when the prompt text changes and returns the template', async () => {
      prisma.aiPromptTemplate.findUnique.mockResolvedValue(existing);
      prisma.aiPromptTemplate.update.mockResolvedValue({
        ...existing,
        systemPrompt: 'Line one\nNew rule\nLine three',
        version: 4,
      });

      const result = await service.updatePromptTemplate('admin-1', 't1', {
        systemPrompt: 'Line one\nNew rule\nLine three',
      });

      expect(prisma.aiPromptTemplate.update).toHaveBeenCalledWith({
        where: { id: 't1' },
        data: { systemPrompt: 'Line one\nNew rule\nLine three', version: { increment: 1 } },
      });
      expect(result.systemPrompt).toBe('Line one\nNew rule\nLine three');
      expect(result.version).toBe(4);
    });

    it('writes an activity log with the actor, key, old and new version, and a line diff', async () => {
      prisma.aiPromptTemplate.findUnique.mockResolvedValue(existing);
      prisma.aiPromptTemplate.update.mockResolvedValue({
        ...existing,
        systemPrompt: 'Line one\nNew rule\nLine three',
        version: 4,
      });

      await service.updatePromptTemplate('admin-1', 't1', { systemPrompt: 'Line one\nNew rule\nLine three' });

      expect(prisma.activityLog.create).toHaveBeenCalledTimes(1);
      expect(prisma.activityLog.create).toHaveBeenCalledWith({
        data: {
          userId: 'admin-1',
          action: 'admin.prompt_template.updated',
          metadata: {
            templateId: 't1',
            key: 'assessment.FACE.system',
            oldVersion: 3,
            newVersion: 4,
            systemPromptDiff: '-Old rule\n+New rule',
          },
        },
      });
    });

    it('logs an isActive toggle without bumping the version', async () => {
      prisma.aiPromptTemplate.findUnique.mockResolvedValue(existing);
      prisma.aiPromptTemplate.update.mockResolvedValue({ ...existing, isActive: false });

      await service.updatePromptTemplate('admin-1', 't1', { isActive: false });

      expect(prisma.aiPromptTemplate.update).toHaveBeenCalledWith({ where: { id: 't1' }, data: { isActive: false } });
      expect(prisma.activityLog.create).toHaveBeenCalledWith({
        data: {
          userId: 'admin-1',
          action: 'admin.prompt_template.updated',
          metadata: {
            templateId: 't1',
            key: 'assessment.FACE.system',
            oldVersion: 3,
            newVersion: 3,
            isActive: { from: true, to: false },
            systemPromptDiff: '',
          },
        },
      });
    });

    it('throws NotFoundException and writes nothing when the template does not exist', async () => {
      prisma.aiPromptTemplate.findUnique.mockResolvedValue(null);

      await expect(
        service.updatePromptTemplate('admin-1', 'missing', { systemPrompt: 'x' }),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.aiPromptTemplate.update).not.toHaveBeenCalled();
      expect(prisma.activityLog.create).not.toHaveBeenCalled();
    });
  });
});
