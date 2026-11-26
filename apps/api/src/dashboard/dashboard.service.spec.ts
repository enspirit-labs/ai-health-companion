import { Test } from '@nestjs/testing';
import { CHAT_SYSTEM_GUARDRAIL, CRISIS_SAFETY_RULES } from '@aidoctor/shared';

import { PrismaService } from '../prisma/prisma.service';
import { FeatureFlagsService } from '../feature-flags/feature-flags.service';
import { AI_PROVIDER } from '../ai/ai-provider.interface';
import { DashboardService } from './dashboard.service';

describe('DashboardService', () => {
  let service: DashboardService;
  let prisma: {
    wellnessSnapshot: Record<string, jest.Mock>;
    assessment: Record<string, jest.Mock>;
    report: Record<string, jest.Mock>;
    recommendation: Record<string, jest.Mock>;
    user: Record<string, jest.Mock>;
    questionnaireAnswer: Record<string, jest.Mock>;
    dailyPulseGame: Record<string, jest.Mock>;
    aiPromptTemplate: Record<string, jest.Mock>;
    activityLog: Record<string, jest.Mock>;
  };
  let featureFlags: { isEnabled: jest.Mock };
  let aiProvider: { generatePulseGame: jest.Mock };

  const PULSE_ANSWER_ROWS = [
    { questionKey: 'moodRating', answer: 3 },
    { questionKey: 'stressLevel', answer: 'moderate' },
    { questionKey: 'sleepQuality', answer: 'good' },
    { questionKey: 'socialConnection', answer: 'sometimes' },
    { questionKey: 'anxietyFrequency', answer: 'rarely' },
  ];
  const STRESSED_ANSWER_ROWS = PULSE_ANSWER_ROWS.map((row) =>
    row.questionKey === 'stressLevel' ? { ...row, answer: 'high' } : row,
  );

  beforeEach(async () => {
    prisma = {
      wellnessSnapshot: { findFirst: jest.fn(), findMany: jest.fn() },
      assessment: { findMany: jest.fn() },
      report: { findMany: jest.fn() },
      recommendation: { findMany: jest.fn() },
      user: { findUnique: jest.fn() },
      questionnaireAnswer: { findMany: jest.fn().mockResolvedValue(PULSE_ANSWER_ROWS) },
      dailyPulseGame: {
        findUnique: jest.fn().mockResolvedValue(null),
        upsert: jest.fn((args: { create: { content: unknown } }) => Promise.resolve({ content: args.create.content })),
      },
      aiPromptTemplate: { findFirst: jest.fn().mockResolvedValue(null) },
      activityLog: { create: jest.fn(), findMany: jest.fn().mockResolvedValue([]) },
    };
    // Defaults to daily_pulse on, daily_pulse_games off — matches today's
    // shipped behavior. Individual tests override per key to exercise the
    // game path without perturbing the existing assessment-rotation tests.
    featureFlags = { isEnabled: jest.fn((key: string) => Promise.resolve(key === 'daily_pulse')) };
    aiProvider = { generatePulseGame: jest.fn() };

    const moduleRef = await Test.createTestingModule({
      providers: [
        DashboardService,
        { provide: PrismaService, useValue: prisma },
        { provide: FeatureFlagsService, useValue: featureFlags },
        { provide: AI_PROVIDER, useValue: aiProvider },
      ],
    }).compile();

    service = moduleRef.get(DashboardService);
  });

  describe('getSummary', () => {
    const at = (iso: string) => new Date(iso);

    it('reports hasData=false with every dimension empty when nothing is completed', async () => {
      prisma.assessment.findMany.mockResolvedValue([]);

      const result = await service.getSummary('user-1');

      expect(result.hasData).toBe(false);
      expect(result.overallScore).toBeNull();
      expect(result.riskLevel).toBeNull();
      expect(result.includedTypes).toEqual([]);
      expect(result.generatedAt).toBeNull();
      expect(result.dimensions.every((d) => d.score === null)).toBe(true);
    });

    it('computes the summary from Score rows, not from a stored snapshot', async () => {
      prisma.assessment.findMany.mockResolvedValue([]);

      await service.getSummary('user-1');

      expect(prisma.wellnessSnapshot.findFirst).not.toHaveBeenCalled();
      expect(prisma.assessment.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ userId: 'user-1', status: 'COMPLETED', mode: 'FULL' }),
          distinct: ['type'],
        }),
      );
    });

    it('shows every completed type under its own label and includes all of them in the overall score', async () => {
      // The account from the production bug report (alpha, Nov 2026).
      prisma.assessment.findMany.mockResolvedValue([
        { type: 'FACE', completedAt: at('2026-11-19T04:40:00.000Z'), score: { value: 72 } },
        { type: 'EYE', completedAt: at('2026-08-07T05:00:45.906Z'), score: { value: 82 } },
        { type: 'SKIN', completedAt: at('2026-08-07T04:19:00.000Z'), score: { value: 74 } },
        { type: 'LIFESTYLE', completedAt: at('2026-08-06T12:23:00.000Z'), score: { value: 65 } },
        { type: 'MEMORY', completedAt: at('2026-08-06T12:22:00.000Z'), score: { value: 28 } },
        { type: 'TEETH', completedAt: at('2026-08-06T11:55:00.000Z'), score: { value: 62 } },
      ]);

      const result = await service.getSummary('user-1');
      const byLabel = Object.fromEntries(result.dimensions.map((d) => [d.label, d.score]));

      expect(byLabel).toMatchObject({ Face: 72, Eye: 82, Skin: 74, Lifestyle: 65, Memory: 28, Teeth: 62 });
      expect(byLabel['Stress & Mental Wellness']).toBeNull();
      expect(result.overallScore).toBeCloseTo(383 / 6);
      expect(result.riskLevel).toBe('MODERATE');
      expect(result.includedTypes).toEqual(['FACE', 'EYE', 'SKIN', 'LIFESTYLE', 'MEMORY', 'TEETH']);
      expect(result.generatedAt).toBe('2026-11-19T04:40:00.000Z');
    });

    it('leaves Stress & Mental Wellness empty when the only result is an Eye assessment', async () => {
      prisma.assessment.findMany.mockResolvedValue([
        { type: 'EYE', completedAt: at('2026-08-07T05:00:00.000Z'), score: { value: 82 } },
      ]);

      const result = await service.getSummary('user-1');

      expect(result.dimensions.find((d) => d.key === 'mentalWellness')?.score).toBeNull();
      expect(result.dimensions.find((d) => d.key === 'eye')?.score).toBe(82);
    });
  });

  describe('getTrends', () => {
    it('maps snapshots to trend points within range', async () => {
      prisma.wellnessSnapshot.findMany.mockResolvedValue([
        { capturedAt: new Date('2026-01-01T00:00:00.000Z'), overallScore: 70 },
        { capturedAt: new Date('2026-01-02T00:00:00.000Z'), overallScore: 75 },
      ]);

      const result = await service.getTrends('user-1', 30);

      expect(result).toEqual([
        { capturedAt: '2026-01-01T00:00:00.000Z', overallScore: 70 },
        { capturedAt: '2026-01-02T00:00:00.000Z', overallScore: 75 },
      ]);
    });
  });

  describe('getAssessmentHistory', () => {
    it('flattens score fields onto each history item', async () => {
      prisma.assessment.findMany.mockResolvedValue([
        {
          id: 'a1',
          type: 'FACE',
          status: 'COMPLETED',
          completedAt: new Date('2026-01-01T00:00:00.000Z'),
          score: { value: 88, riskLevel: 'LOW' },
        },
        {
          id: 'a2',
          type: 'EYE',
          status: 'COMPLETED',
          completedAt: new Date('2026-01-02T00:00:00.000Z'),
          score: null,
        },
      ]);

      const result = await service.getAssessmentHistory('user-1');

      expect(result[0]).toEqual({
        id: 'a1',
        type: 'FACE',
        status: 'COMPLETED',
        score: 88,
        riskLevel: 'LOW',
        completedAt: '2026-01-01T00:00:00.000Z',
      });
      expect(result[1].score).toBeNull();
    });

    it('threads the mode through so history can label a Daily Pulse check-in apart from a full questionnaire', async () => {
      prisma.assessment.findMany.mockResolvedValue([
        {
          id: 'a1',
          type: 'MENTAL_WELLNESS',
          status: 'COMPLETED',
          completedAt: new Date('2026-01-01T00:00:00.000Z'),
          mode: 'PULSE',
          score: { value: 80, riskLevel: 'LOW' },
        },
      ]);

      const result = await service.getAssessmentHistory('user-1');

      expect(result[0].mode).toBe('PULSE');
    });
  });

  describe('getUpcomingAssessments', () => {
    it('returns all 14 types when nothing is completed', async () => {
      prisma.assessment.findMany.mockResolvedValue([]);

      const result = await service.getUpcomingAssessments('user-1');

      expect(result).toHaveLength(14);
    });

    it('excludes types that already have a completed FULL assessment', async () => {
      prisma.assessment.findMany.mockResolvedValue([{ type: 'FACE' }, { type: 'EYE' }]);

      const result = await service.getUpcomingAssessments('user-1');

      expect(result).not.toContain('FACE');
      expect(result).not.toContain('EYE');
      expect(result).toHaveLength(12);
    });

    it('scopes the completed-lookup query to mode: FULL, so a Daily Pulse completion never counts', async () => {
      prisma.assessment.findMany.mockResolvedValue([]);

      await service.getUpcomingAssessments('user-1');

      expect(prisma.assessment.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ mode: 'FULL' }) }),
      );
    });
  });

  describe('getStreak', () => {
    beforeEach(() => {
      jest.useFakeTimers().setSystemTime(new Date('2026-01-10T12:00:00.000Z'));
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it('reports 0 and completedToday=false when nothing is completed', async () => {
      prisma.user.findUnique.mockResolvedValue({ timezone: null });
      prisma.assessment.findMany.mockResolvedValue([]);

      const result = await service.getStreak('user-1');

      expect(result).toEqual({ currentStreak: 0, completedToday: false, goalDays: 30, totalActiveDays: 0, lapsed: false });
    });

    it('rejects when the daily_pulse flag is off', async () => {
      featureFlags.isEnabled.mockResolvedValue(false);

      await expect(service.getStreak('user-1')).rejects.toThrow();
      expect(prisma.assessment.findMany).not.toHaveBeenCalled();
    });

    it('counts an unbroken run of consecutive UTC days including today', async () => {
      prisma.user.findUnique.mockResolvedValue({ timezone: null });
      prisma.assessment.findMany.mockResolvedValue([
        { completedAt: new Date('2026-01-10T08:00:00.000Z') },
        { completedAt: new Date('2026-01-09T08:00:00.000Z') },
        { completedAt: new Date('2026-01-08T08:00:00.000Z') },
      ]);

      const result = await service.getStreak('user-1');

      expect(result).toEqual({ currentStreak: 3, completedToday: true, goalDays: 30, totalActiveDays: 3, lapsed: false });
    });

    it('tolerates a single missed day (grace) without breaking the streak', async () => {
      prisma.user.findUnique.mockResolvedValue({ timezone: null });
      prisma.assessment.findMany.mockResolvedValue([
        { completedAt: new Date('2026-01-10T08:00:00.000Z') },
        { completedAt: new Date('2026-01-08T08:00:00.000Z') },
      ]);

      const result = await service.getStreak('user-1');

      expect(result).toEqual({ currentStreak: 2, completedToday: true, goalDays: 30, totalActiveDays: 2, lapsed: false });
    });

    it('breaks the streak after two missed days', async () => {
      prisma.user.findUnique.mockResolvedValue({ timezone: null });
      prisma.assessment.findMany.mockResolvedValue([
        { completedAt: new Date('2026-01-10T08:00:00.000Z') },
        { completedAt: new Date('2026-01-07T08:00:00.000Z') },
      ]);

      const result = await service.getStreak('user-1');

      expect(result).toEqual({ currentStreak: 1, completedToday: true, goalDays: 30, totalActiveDays: 2, lapsed: false });
    });

    it('flags lapsed and keeps totalActiveDays after a long break', async () => {
      prisma.user.findUnique.mockResolvedValue({ timezone: null });
      prisma.assessment.findMany.mockResolvedValue([
        { completedAt: new Date('2026-01-02T08:00:00.000Z') },
        { completedAt: new Date('2026-01-01T08:00:00.000Z') },
      ]);

      const result = await service.getStreak('user-1');

      expect(result).toEqual({ currentStreak: 0, completedToday: false, goalDays: 30, totalActiveDays: 2, lapsed: true });
    });

    it('any of the 14 assessment types keeps the streak alive, not just Mental Wellness', async () => {
      prisma.user.findUnique.mockResolvedValue({ timezone: null });
      prisma.assessment.findMany.mockResolvedValue([{ completedAt: new Date('2026-01-10T08:00:00.000Z') }]);

      const result = await service.getStreak('user-1');

      expect(result.currentStreak).toBe(1);
      expect(prisma.assessment.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ status: 'COMPLETED' }) }),
      );
    });

    it('buckets completions using the user own timezone, not UTC', async () => {
      // 2026-01-10T20:00 UTC is already 2026-01-11 in Asia/Kolkata (+05:30) —
      // without per-user zone bucketing this would land on the wrong day key.
      jest.setSystemTime(new Date('2026-01-11T01:00:00.000Z'));
      prisma.user.findUnique.mockResolvedValue({ timezone: 'Asia/Kolkata' });
      prisma.assessment.findMany.mockResolvedValue([{ completedAt: new Date('2026-01-10T20:00:00.000Z') }]);

      const result = await service.getStreak('user-1');

      expect(result).toEqual({ currentStreak: 1, completedToday: true, goalDays: 30, totalActiveDays: 1, lapsed: false });
    });

    it('counts old completions toward totalActiveDays (never reset) but marks the user lapsed', async () => {
      prisma.user.findUnique.mockResolvedValue({ timezone: null });
      prisma.assessment.findMany.mockResolvedValue([{ completedAt: new Date('2024-01-01T08:00:00.000Z') }]);

      const result = await service.getStreak('user-1');

      expect(result).toEqual({ currentStreak: 0, completedToday: false, goalDays: 30, totalActiveDays: 1, lapsed: true });
    });
  });

  describe('getRecommendations', () => {
    it('flattens the assessment type from the nested score relation', async () => {
      prisma.recommendation.findMany.mockResolvedValue([
        {
          title: 'Drink more water',
          detail: 'Aim for 2L daily.',
          priority: 'MEDIUM',
          createdAt: new Date('2026-01-01T00:00:00.000Z'),
          score: { assessment: { type: 'SKIN' } },
        },
      ]);

      const result = await service.getRecommendations('user-1');

      expect(result[0].sourceAssessment).toBe('SKIN');
    });

    it('scopes the FULL and PULSE queries by assessment mode', async () => {
      prisma.recommendation.findMany.mockResolvedValue([]);

      await service.getRecommendations('user-1');

      expect(prisma.recommendation.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { score: { assessment: expect.objectContaining({ mode: 'FULL' }) } } }),
      );
      expect(prisma.recommendation.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { score: { assessment: expect.objectContaining({ mode: 'PULSE' }) } } }),
      );
    });

    it('reserves 4 FULL + 2 PULSE slots even when PULSE recommendations are more numerous and higher priority', async () => {
      const fullRecs = Array.from({ length: 6 }, (_, i) => ({
        title: `full-${i}`,
        detail: 'd',
        priority: 'LOW',
        createdAt: new Date(2026, 0, 10 - i),
        score: { assessment: { type: 'FACE' } },
      }));
      // Higher priority AND more recent than every FULL rec — a naive
      // priority-then-recency query alone would return only these.
      const pulseRecs = Array.from({ length: 6 }, (_, i) => ({
        title: `pulse-${i}`,
        detail: 'd',
        priority: 'HIGH',
        createdAt: new Date(2026, 0, 20 - i),
        score: { assessment: { type: 'MENTAL_WELLNESS' } },
      }));
      prisma.recommendation.findMany.mockImplementation(
        ({ where }: { where: { score: { assessment: { mode?: string } } } }) =>
          Promise.resolve(where.score.assessment.mode === 'PULSE' ? pulseRecs : fullRecs),
      );

      const result = await service.getRecommendations('user-1');

      expect(result.filter((r) => r.sourceAssessment === 'FACE')).toHaveLength(4);
      expect(result.filter((r) => r.sourceAssessment === 'MENTAL_WELLNESS')).toHaveLength(2);
    });

    it('backfills with extra FULL recommendations when fewer than 2 PULSE recommendations exist', async () => {
      const fullRecs = Array.from({ length: 6 }, (_, i) => ({
        title: `full-${i}`,
        detail: 'd',
        priority: 'MEDIUM',
        createdAt: new Date(2026, 0, 10 - i),
        score: { assessment: { type: 'FACE' } },
      }));
      const pulseRecs = [
        {
          title: 'pulse-0',
          detail: 'd',
          priority: 'MEDIUM',
          createdAt: new Date(2026, 0, 20),
          score: { assessment: { type: 'MENTAL_WELLNESS' } },
        },
      ];
      prisma.recommendation.findMany.mockImplementation(
        ({ where }: { where: { score: { assessment: { mode?: string } } } }) =>
          Promise.resolve(where.score.assessment.mode === 'PULSE' ? pulseRecs : fullRecs),
      );

      const result = await service.getRecommendations('user-1');

      expect(result).toHaveLength(6);
      expect(result.filter((r) => r.sourceAssessment === 'MENTAL_WELLNESS')).toHaveLength(1);
      expect(result.filter((r) => r.sourceAssessment === 'FACE')).toHaveLength(5);
    });
  });

  describe('getRecommendedAssessment', () => {
    afterEach(() => {
      jest.useRealTimers();
    });

    it('never recommends MENTAL_WELLNESS — it is already served by Daily Pulse itself', async () => {
      jest.useFakeTimers().setSystemTime(new Date('2026-01-01T00:00:00.000Z')); // dayOfYear = 1
      prisma.assessment.findMany.mockResolvedValue([]);

      await service.getRecommendedAssessment('user-1');

      expect(prisma.assessment.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ type: expect.objectContaining({ in: expect.not.arrayContaining(['MENTAL_WELLNESS']) }) }) }),
      );
    });

    it('treats a never-completed type as maximally stale, ranking it into the rotation pool ahead of a completed one', async () => {
      jest.useFakeTimers().setSystemTime(new Date('2026-01-01T00:00:00.000Z')); // dayOfYear = 1
      // FACE was completed recently; every other candidate is untouched —
      // the rotation pool (top 3 most stale) should be all never-completed
      // types, never FACE.
      prisma.assessment.findMany.mockResolvedValue([{ type: 'FACE', completedAt: new Date('2026-01-01T00:00:00.000Z') }]);

      const result = await service.getRecommendedAssessment('user-1');
      if (result.kind !== 'ASSESSMENT') throw new Error('expected ASSESSMENT');

      expect(result.type).not.toBe('FACE');
    });

    it('ranks by oldest completedAt first among completed types', async () => {
      jest.useFakeTimers().setSystemTime(new Date('2026-01-01T00:00:00.000Z')); // dayOfYear = 1, so index 1 of the pool
      // Every candidate has been completed at some point, at staggered
      // times, so the rotation pool is deterministically the 3 oldest.
      const completions = [
        { type: 'FACE', completedAt: new Date('2026-01-05T00:00:00.000Z') },
        { type: 'EYE', completedAt: new Date('2020-01-01T00:00:00.000Z') }, // oldest
        { type: 'HAIR', completedAt: new Date('2026-01-04T00:00:00.000Z') },
        { type: 'SKIN', completedAt: new Date('2021-01-01T00:00:00.000Z') }, // 2nd oldest
        { type: 'TEETH', completedAt: new Date('2026-01-03T00:00:00.000Z') },
        { type: 'TONGUE', completedAt: new Date('2022-01-01T00:00:00.000Z') }, // 3rd oldest
        { type: 'VOICE', completedAt: new Date('2026-01-02T00:00:00.000Z') },
        { type: 'WALKING', completedAt: new Date('2026-01-06T00:00:00.000Z') },
        { type: 'POSTURE', completedAt: new Date('2026-01-07T00:00:00.000Z') },
        { type: 'HAND_COORDINATION', completedAt: new Date('2026-01-08T00:00:00.000Z') },
        { type: 'MEMORY', completedAt: new Date('2026-01-09T00:00:00.000Z') },
        { type: 'SQUATS', completedAt: new Date('2026-01-10T00:00:00.000Z') },
        { type: 'LIFESTYLE', completedAt: new Date('2026-01-11T00:00:00.000Z') },
      ];
      prisma.assessment.findMany.mockResolvedValue(completions);

      const result = await service.getRecommendedAssessment('user-1');
      if (result.kind !== 'ASSESSMENT') throw new Error('expected ASSESSMENT');

      // Rotation pool (3 oldest) is [EYE, SKIN, TONGUE]; dayOfYear(1) % 3 === 1 → SKIN.
      expect(result.type).toBe('SKIN');
    });

    it('rotates the recommendation as the day-of-year index changes, over the same staleness ranking', async () => {
      // Every candidate has been completed — EYE/SKIN/TONGUE deliberately the
      // oldest, so the rotation pool is deterministically just those 3.
      const recentTypes = ['FACE', 'TEETH', 'VOICE', 'WALKING', 'POSTURE', 'HAND_COORDINATION', 'MEMORY', 'SQUATS', 'LIFESTYLE', 'HAIR'];
      const completions = [
        { type: 'EYE', completedAt: new Date('2020-01-01T00:00:00.000Z') },
        { type: 'SKIN', completedAt: new Date('2021-01-01T00:00:00.000Z') },
        { type: 'TONGUE', completedAt: new Date('2022-01-01T00:00:00.000Z') },
        ...recentTypes.map((type) => ({ type, completedAt: new Date('2026-01-01T00:00:00.000Z') })),
      ];
      prisma.assessment.findMany.mockResolvedValue(completions);

      jest.useFakeTimers().setSystemTime(new Date('2026-01-01T00:00:00.000Z')); // dayOfYear = 1 → index 1 → SKIN
      const day1 = await service.getRecommendedAssessment('user-1');

      jest.setSystemTime(new Date('2026-01-02T00:00:00.000Z')); // dayOfYear = 2 → index 2 → TONGUE
      const day2 = await service.getRecommendedAssessment('user-1');

      if (day1.kind !== 'ASSESSMENT' || day2.kind !== 'ASSESSMENT') throw new Error('expected ASSESSMENT');
      expect(day1.type).toBe('SKIN');
      expect(day2.type).toBe('TONGUE');
    });

    it('rejects when the daily_pulse flag is off', async () => {
      featureFlags.isEnabled.mockResolvedValue(false);

      await expect(service.getRecommendedAssessment('user-1')).rejects.toThrow();
      expect(prisma.assessment.findMany).not.toHaveBeenCalled();
    });

    describe('with daily_pulse_games on', () => {
      beforeEach(() => {
        featureFlags.isEnabled.mockImplementation((key: string) =>
          Promise.resolve(key === 'daily_pulse' || key === 'daily_pulse_games'),
        );
      });

      it('still falls back to an ASSESSMENT recommendation when today\'s pulse is not complete', async () => {
        prisma.assessment.findMany.mockResolvedValue([]); // no PULSE completions, no FULL completions either

        const result = await service.getRecommendedAssessment('user-1');

        expect(result.kind).toBe('ASSESSMENT');
      });

      it('returns a TANGO game for a calm vibe', async () => {
        prisma.assessment.findMany.mockResolvedValue([
          { id: 'pulse-1', completedAt: new Date() },
        ]);

        const result = await service.getRecommendedAssessment('user-1');

        if (result.kind !== 'GAME') throw new Error('expected GAME');
        expect(result.game.type).toBe('TANGO');
        expect(prisma.dailyPulseGame.upsert).toHaveBeenCalled();
      });

      it('includes a blurb and difficulty so the dashboard tile can explain the pick', async () => {
        prisma.assessment.findMany.mockResolvedValue([{ id: 'pulse-1', completedAt: new Date() }]);

        const result = await service.getRecommendedAssessment('user-1');

        if (result.kind !== 'GAME') throw new Error('expected GAME');
        expect(result.blurb.length).toBeGreaterThan(0);
        expect(result.difficulty).toBe('STANDARD');
      });

      it('reports solvedToday=false when no completion was logged today', async () => {
        prisma.assessment.findMany.mockResolvedValue([{ id: 'pulse-1', completedAt: new Date() }]);
        prisma.activityLog.findMany.mockResolvedValue([]);

        const result = await service.getRecommendedAssessment('user-1');

        if (result.kind !== 'GAME') throw new Error('expected GAME');
        expect(result.solvedToday).toBe(false);
      });

      it('reports solvedToday=true once a completion is logged today', async () => {
        prisma.assessment.findMany.mockResolvedValue([{ id: 'pulse-1', completedAt: new Date() }]);
        prisma.activityLog.findMany.mockResolvedValue([{ createdAt: new Date() }]);

        const result = await service.getRecommendedAssessment('user-1');

        if (result.kind !== 'GAME') throw new Error('expected GAME');
        expect(result.solvedToday).toBe(true);
      });

      it('does not count yesterday\'s completion as solved today', async () => {
        prisma.assessment.findMany.mockResolvedValue([{ id: 'pulse-1', completedAt: new Date() }]);
        prisma.activityLog.findMany.mockResolvedValue([
          { createdAt: new Date(Date.now() - 24 * 60 * 60 * 1000) },
        ]);

        const result = await service.getRecommendedAssessment('user-1');

        if (result.kind !== 'GAME') throw new Error('expected GAME');
        expect(result.solvedToday).toBe(false);
      });

      it('returns a PINPOINT game for a non-calm (high stress) vibe', async () => {
        prisma.assessment.findMany.mockResolvedValue([{ id: 'pulse-1', completedAt: new Date() }]);
        prisma.questionnaireAnswer.findMany.mockResolvedValue(STRESSED_ANSWER_ROWS);
        aiProvider.generatePulseGame.mockResolvedValue({ theme: 'Renewal', clues: ['a', 'b', 'c'] });

        const result = await service.getRecommendedAssessment('user-1');

        if (result.kind !== 'GAME') throw new Error('expected GAME');
        expect(result.game.type).toBe('PINPOINT');
        expect(aiProvider.generatePulseGame).toHaveBeenCalled();
      });

      it('keeps the guardrail and crisis rules when the active Pinpoint DB template omits them', async () => {
        prisma.assessment.findMany.mockResolvedValue([{ id: 'pulse-1', completedAt: new Date() }]);
        prisma.questionnaireAnswer.findMany.mockResolvedValue(STRESSED_ANSWER_ROWS);
        prisma.aiPromptTemplate.findFirst.mockResolvedValue({ systemPrompt: 'Make a fun word puzzle.' });
        aiProvider.generatePulseGame.mockResolvedValue({ theme: 'Renewal', clues: ['a', 'b', 'c'] });

        await service.getRecommendedAssessment('user-1');

        expect(aiProvider.generatePulseGame).toHaveBeenCalledWith(
          expect.objectContaining({
            systemPrompt: `${CHAT_SYSTEM_GUARDRAIL}\n\n${CRISIS_SAFETY_RULES}\n\nMake a fun word puzzle.`,
          }),
        );
      });

      it('falls back to TANGO when Pinpoint generation fails twice', async () => {
        prisma.assessment.findMany.mockResolvedValue([{ id: 'pulse-1', completedAt: new Date() }]);
        prisma.questionnaireAnswer.findMany.mockResolvedValue(STRESSED_ANSWER_ROWS);
        aiProvider.generatePulseGame.mockRejectedValue(new Error('AI is down'));

        const result = await service.getRecommendedAssessment('user-1');

        if (result.kind !== 'GAME') throw new Error('expected GAME');
        expect(result.game.type).toBe('TANGO');
        expect(aiProvider.generatePulseGame).toHaveBeenCalledTimes(2);
      });

      it('reuses the cached game on a second call the same day instead of regenerating', async () => {
        prisma.assessment.findMany.mockResolvedValue([{ id: 'pulse-1', completedAt: new Date() }]);
        const cached = { type: 'TANGO', title: 'Cached', size: 6, grid: [], constraints: [], solution: [] };
        prisma.dailyPulseGame.findUnique.mockResolvedValue({ content: cached });

        const result = await service.getRecommendedAssessment('user-1');

        if (result.kind !== 'GAME') throw new Error('expected GAME');
        expect(result.game).toEqual(cached);
        expect(prisma.dailyPulseGame.upsert).not.toHaveBeenCalled();
      });

      it('logs a pulse_game_shown activity event, once, only when the game is freshly generated', async () => {
        prisma.assessment.findMany.mockResolvedValue([{ id: 'pulse-1', completedAt: new Date() }]);

        await service.getRecommendedAssessment('user-1');

        expect(prisma.activityLog.create).toHaveBeenCalledTimes(1);
        expect(prisma.activityLog.create).toHaveBeenCalledWith(
          expect.objectContaining({
            data: expect.objectContaining({
              userId: 'user-1',
              action: 'pulse_game_shown',
              metadata: expect.objectContaining({ gameType: 'TANGO' }),
            }),
          }),
        );
      });

      it('does not log pulse_game_shown again on a cache hit', async () => {
        prisma.assessment.findMany.mockResolvedValue([{ id: 'pulse-1', completedAt: new Date() }]);
        prisma.dailyPulseGame.findUnique.mockResolvedValue({
          content: { type: 'TANGO', title: 'Cached', size: 6, grid: [], constraints: [], solution: [] },
        });

        await service.getRecommendedAssessment('user-1');

        expect(prisma.activityLog.create).not.toHaveBeenCalled();
      });
    });
  });

  describe('logPulseGameCompleted', () => {
    it('logs a pulse_game_completed activity event for the given game type', async () => {
      await service.logPulseGameCompleted('user-1', { gameType: 'PINPOINT' });

      expect(prisma.activityLog.create).toHaveBeenCalledWith({
        data: { userId: 'user-1', action: 'pulse_game_completed', metadata: { gameType: 'PINPOINT' } },
      });
    });

    it('records the supplied duration/hint/guess metrics alongside the game type', async () => {
      await service.logPulseGameCompleted('user-1', {
        gameType: 'TANGO',
        durationMs: 92_000,
        hintsUsed: 2,
      });

      expect(prisma.activityLog.create).toHaveBeenCalledWith({
        data: {
          userId: 'user-1',
          action: 'pulse_game_completed',
          metadata: { gameType: 'TANGO', durationMs: 92_000, hintsUsed: 2 },
        },
      });
    });

    it('omits metrics the client did not send rather than writing nulls that would skew averages', async () => {
      await service.logPulseGameCompleted('user-1', { gameType: 'TANGO', hintsUsed: 0 });

      const { metadata } = prisma.activityLog.create.mock.calls[0][0].data;
      expect(metadata).toEqual({ gameType: 'TANGO', hintsUsed: 0 });
      expect('durationMs' in metadata).toBe(false);
      expect('guessesUsed' in metadata).toBe(false);
    });
  });
});
