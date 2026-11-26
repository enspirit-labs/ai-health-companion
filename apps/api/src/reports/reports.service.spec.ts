import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { CHAT_SYSTEM_GUARDRAIL, CRISIS_SAFETY_RULES } from '@aidoctor/shared';

import { PrismaService } from '../prisma/prisma.service';
import { AI_PROVIDER } from '../ai/ai-provider.interface';
import { ReportsService } from './reports.service';

describe('ReportsService', () => {
  let service: ReportsService;
  let prisma: {
    assessment: Record<string, jest.Mock>;
    report: Record<string, jest.Mock>;
    reportSection: Record<string, jest.Mock>;
    $transaction: jest.Mock;
  };
  let aiProvider: { reason: jest.Mock; summarize: jest.Mock };

  beforeEach(async () => {
    prisma = {
      assessment: { findUnique: jest.fn(), findFirst: jest.fn(), findMany: jest.fn() },
      report: { create: jest.fn(), update: jest.fn(), findMany: jest.fn(), findUnique: jest.fn(), findFirst: jest.fn() },
      reportSection: { create: jest.fn() },
      $transaction: jest.fn().mockResolvedValue(undefined),
    };
    aiProvider = { reason: jest.fn(), summarize: jest.fn() };

    const moduleRef = await Test.createTestingModule({
      providers: [
        ReportsService,
        { provide: PrismaService, useValue: prisma },
        { provide: AI_PROVIDER, useValue: aiProvider },
      ],
    }).compile();

    service = moduleRef.get(ReportsService);
  });

  describe('generateForAssessment', () => {
    it('does nothing if the assessment has no score yet', async () => {
      prisma.assessment.findUnique.mockResolvedValue({ id: 'a1', type: 'FACE', score: null });

      await service.generateForAssessment('user-1', 'a1');

      expect(prisma.report.create).not.toHaveBeenCalled();
    });

    it('creates a READY report with an AI summary and one section', async () => {
      prisma.assessment.findUnique.mockResolvedValue({
        id: 'a1',
        type: 'FACE',
        score: {
          value: 82,
          riskLevel: 'LOW',
          observations: [{ label: 'darkCircles', value: 'Mild' }],
          recommendations: [{ title: 'Sleep more', detail: 'Aim for 8 hours.', priority: 'MEDIUM' }],
        },
      });
      prisma.report.create.mockResolvedValue({ id: 'r1' });
      aiProvider.summarize.mockResolvedValue({ summary: 'You are doing well overall.' });

      await service.generateForAssessment('user-1', 'a1');

      expect(prisma.report.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ userId: 'user-1', status: 'GENERATING' }) }),
      );
      expect(aiProvider.summarize).toHaveBeenCalledWith(
        expect.objectContaining({ input: expect.objectContaining({ assessmentType: 'FACE', score: 82 }) }),
      );
      const [[{ systemPrompt }]] = aiProvider.summarize.mock.calls as [[{ systemPrompt: string }]];
      expect(systemPrompt.startsWith(`${CHAT_SYSTEM_GUARDRAIL}\n\n${CRISIS_SAFETY_RULES}\n\n`)).toBe(true);
      expect(systemPrompt.split(CHAT_SYSTEM_GUARDRAIL)).toHaveLength(2);
      expect(prisma.$transaction).toHaveBeenCalledWith([
        expect.objectContaining({}),
        expect.objectContaining({}),
      ]);
    });

    it('marks the report FAILED if summarization throws', async () => {
      prisma.assessment.findUnique.mockResolvedValue({
        id: 'a1',
        type: 'FACE',
        score: { value: 82, riskLevel: 'LOW', observations: [], recommendations: [] },
      });
      prisma.report.create.mockResolvedValue({ id: 'r1' });
      aiProvider.summarize.mockRejectedValue(new Error('AI is down'));

      await service.generateForAssessment('user-1', 'a1');

      expect(prisma.report.update).toHaveBeenCalledWith({ where: { id: 'r1' }, data: { status: 'FAILED' } });
    });
  });

  describe('list', () => {
    it('queries without take/skip when no pagination is given', async () => {
      prisma.report.findMany.mockResolvedValue([]);
      await service.list('user-1');
      expect(prisma.report.findMany).toHaveBeenCalledWith({
        where: { userId: 'user-1' },
        orderBy: { createdAt: 'desc' },
      });
    });

    it('applies take/skip when page and limit are given', async () => {
      prisma.report.findMany.mockResolvedValue([]);
      await service.list('user-1', { page: 2, limit: 5 });
      expect(prisma.report.findMany).toHaveBeenCalledWith({
        where: { userId: 'user-1' },
        orderBy: { createdAt: 'desc' },
        take: 5,
        skip: 5,
      });
    });
  });

  describe('getOne', () => {
    it('rejects a report owned by another user', async () => {
      prisma.report.findUnique.mockResolvedValue({ id: 'r1', userId: 'someone-else', sections: [] });

      await expect(service.getOne('user-1', 'r1')).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('rejects a report that does not exist', async () => {
      prisma.report.findUnique.mockResolvedValue(null);

      await expect(service.getOne('user-1', 'missing')).rejects.toBeInstanceOf(NotFoundException);
    });

    it('returns the report with its sections mapped from JSON content', async () => {
      prisma.report.findUnique.mockResolvedValue({
        id: 'r1',
        userId: 'user-1',
        title: 'Face Assessment Report',
        status: 'READY',
        summary: 'Great job.',
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
        sections: [
          {
            id: 's1',
            heading: 'Face Assessment',
            order: 0,
            content: {
              assessmentType: 'FACE',
              score: 82,
              riskLevel: 'LOW',
              observations: [{ label: 'darkCircles', value: 'Mild' }],
              recommendations: [{ title: 'Sleep more', detail: 'Aim for 8 hours.', priority: 'MEDIUM' }],
            },
          },
        ],
      });

      const result = await service.getOne('user-1', 'r1');

      expect(result.title).toBe('Face Assessment Report');
      expect(result.sections).toHaveLength(1);
      expect(result.sections[0].score).toBe(82);
      expect(result.sections[0].observations).toEqual([{ label: 'darkCircles', value: 'Mild' }]);
    });
  });

  describe('maybeGenerateWeeklyPulseRollup (Rev 2)', () => {
    afterEach(() => {
      jest.useRealTimers();
    });

    it('does nothing when the user has no pulse completions and no prior rollup', async () => {
      prisma.report.findFirst.mockResolvedValue(null);
      prisma.assessment.findFirst.mockResolvedValue(null);

      await service.maybeGenerateWeeklyPulseRollup('user-1');

      expect(prisma.report.create).not.toHaveBeenCalled();
    });

    it('is not due yet when the first pulse was less than 7 days ago and there is no prior rollup', async () => {
      jest.useFakeTimers().setSystemTime(new Date('2026-01-10T00:00:00.000Z'));
      prisma.report.findFirst.mockResolvedValue(null);
      prisma.assessment.findFirst.mockResolvedValue({ completedAt: new Date('2026-01-05T00:00:00.000Z') }); // 5 days ago

      await service.maybeGenerateWeeklyPulseRollup('user-1');

      expect(prisma.report.create).not.toHaveBeenCalled();
    });

    it('fires the first-ever rollup once a full week has passed since the oldest pulse', async () => {
      jest.useFakeTimers().setSystemTime(new Date('2026-01-13T00:00:00.000Z'));
      prisma.report.findFirst.mockResolvedValue(null);
      prisma.assessment.findFirst.mockResolvedValue({ completedAt: new Date('2026-01-05T00:00:00.000Z') }); // 8 days ago
      prisma.assessment.findMany.mockResolvedValue([
        { id: 'p1', completedAt: new Date('2026-01-05T00:00:00.000Z'), score: { value: 70, riskLevel: 'LOW' } },
        { id: 'p2', completedAt: new Date('2026-01-08T00:00:00.000Z'), score: { value: 75, riskLevel: 'LOW' } },
      ]);
      prisma.report.create.mockResolvedValue({ id: 'rollup-1' });
      aiProvider.summarize.mockResolvedValue({ summary: 'Steady week overall.' });

      await service.maybeGenerateWeeklyPulseRollup('user-1');

      expect(prisma.report.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ userId: 'user-1', status: 'GENERATING', title: expect.stringContaining('Weekly Summary') }),
        }),
      );
      expect(aiProvider.summarize).toHaveBeenCalledWith(
        expect.objectContaining({ input: expect.objectContaining({ checkInCount: 2, scores: [70, 75] }) }),
      );
      const [[{ systemPrompt }]] = aiProvider.summarize.mock.calls as [[{ systemPrompt: string }]];
      expect(systemPrompt.startsWith(`${CHAT_SYSTEM_GUARDRAIL}\n\n${CRISIS_SAFETY_RULES}\n\n`)).toBe(true);
    });

    it('is not due yet when less than 7 days have passed since the last rollup', async () => {
      jest.useFakeTimers().setSystemTime(new Date('2026-01-13T00:00:00.000Z'));
      prisma.report.findFirst.mockResolvedValue({ createdAt: new Date('2026-01-10T00:00:00.000Z') }); // 3 days ago

      await service.maybeGenerateWeeklyPulseRollup('user-1');

      expect(prisma.report.create).not.toHaveBeenCalled();
      // Confirms the last-rollup watermark takes priority over the
      // oldest-pulse fallback once a rollup exists.
      expect(prisma.assessment.findFirst).toHaveBeenCalled();
    });

    it('rolls up only pulses completed since the last rollup once a new week is due', async () => {
      jest.useFakeTimers().setSystemTime(new Date('2026-01-20T00:00:00.000Z'));
      prisma.report.findFirst.mockResolvedValue({ createdAt: new Date('2026-01-12T00:00:00.000Z') }); // 8 days ago
      prisma.assessment.findMany.mockResolvedValue([
        { id: 'p3', completedAt: new Date('2026-01-15T00:00:00.000Z'), score: { value: 80, riskLevel: 'LOW' } },
      ]);
      prisma.report.create.mockResolvedValue({ id: 'rollup-2' });
      aiProvider.summarize.mockResolvedValue({ summary: 'Improving.' });

      await service.maybeGenerateWeeklyPulseRollup('user-1');

      expect(prisma.assessment.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            userId: 'user-1',
            mode: 'PULSE',
            status: 'COMPLETED',
            completedAt: { gt: new Date('2026-01-12T00:00:00.000Z'), lte: new Date('2026-01-20T00:00:00.000Z') },
          }),
        }),
      );
      expect(prisma.report.create).toHaveBeenCalled();
    });

    it('creates no report when the window is due but no pulses fall inside it', async () => {
      jest.useFakeTimers().setSystemTime(new Date('2026-01-20T00:00:00.000Z'));
      prisma.report.findFirst.mockResolvedValue({ createdAt: new Date('2026-01-12T00:00:00.000Z') });
      prisma.assessment.findMany.mockResolvedValue([]);

      await service.maybeGenerateWeeklyPulseRollup('user-1');

      expect(prisma.report.create).not.toHaveBeenCalled();
    });

    it('marks the rollup FAILED if summarization throws — does not block the caller', async () => {
      jest.useFakeTimers().setSystemTime(new Date('2026-01-13T00:00:00.000Z'));
      prisma.report.findFirst.mockResolvedValue(null);
      prisma.assessment.findFirst.mockResolvedValue({ completedAt: new Date('2026-01-05T00:00:00.000Z') });
      prisma.assessment.findMany.mockResolvedValue([
        { id: 'p1', completedAt: new Date('2026-01-05T00:00:00.000Z'), score: { value: 70, riskLevel: 'LOW' } },
      ]);
      prisma.report.create.mockResolvedValue({ id: 'rollup-1' });
      aiProvider.summarize.mockRejectedValue(new Error('AI is down'));

      await expect(service.maybeGenerateWeeklyPulseRollup('user-1')).resolves.toBeUndefined();

      expect(prisma.report.update).toHaveBeenCalledWith({ where: { id: 'rollup-1' }, data: { status: 'FAILED' } });
    });
  });
});
