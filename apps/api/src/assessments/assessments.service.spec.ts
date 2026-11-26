import { BadRequestException,
  ServiceUnavailableException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { CHAT_SYSTEM_GUARDRAIL, CRISIS_SAFETY_RULES } from '@aidoctor/shared';

import { PrismaService } from '../prisma/prisma.service';
import { AI_PROVIDER } from '../ai/ai-provider.interface';
import { STORAGE_PROVIDER } from '../storage/storage-provider.interface';
import { TRANSCRIPTION_PROVIDER } from '../transcription/transcription-provider.interface';
import { ReportsService } from '../reports/reports.service';
import { FeatureFlagsService } from '../feature-flags/feature-flags.service';
import { ConsentService } from '../consent/consent.service';
import { AssessmentsService } from './assessments.service';

const LIFESTYLE_DEFINITION = {
  id: 'def-1',
  assessmentType: 'LIFESTYLE',
  isActive: true,
  questions: [
    { id: 'q1', key: 'exerciseDays', prompt: 'How many days do you exercise?', inputType: 'NUMBER', options: null, order: 0, isRequired: true },
    { id: 'q2', key: 'waterGlasses', prompt: 'How many glasses of water?', inputType: 'NUMBER', options: null, order: 1, isRequired: true },
  ],
};

// Mirrors the real seed.ts MENTAL_WELLNESS_QUESTIONS shape (6 questions);
// DAILY_PULSE_QUESTION_KEYS.MENTAL_WELLNESS narrows this to the first 5.
const MENTAL_WELLNESS_DEFINITION = {
  id: 'def-2',
  assessmentType: 'MENTAL_WELLNESS',
  isActive: true,
  questions: [
    { id: 'q1', key: 'moodRating', prompt: 'How is your mood?', inputType: 'SCALE', options: null, order: 0, isRequired: true },
    { id: 'q2', key: 'stressLevel', prompt: 'How stressed are you?', inputType: 'SINGLE_CHOICE', options: null, order: 1, isRequired: true },
    { id: 'q3', key: 'sleepQuality', prompt: 'How was your sleep?', inputType: 'SINGLE_CHOICE', options: null, order: 2, isRequired: true },
    { id: 'q4', key: 'socialConnection', prompt: 'Do you feel connected?', inputType: 'SINGLE_CHOICE', options: null, order: 3, isRequired: true },
    { id: 'q5', key: 'anxietyFrequency', prompt: 'How often anxious?', inputType: 'SINGLE_CHOICE', options: null, order: 4, isRequired: true },
    { id: 'q6', key: 'copingConfidence', prompt: 'Coping confidence?', inputType: 'SCALE', options: null, order: 5, isRequired: true },
  ],
};

describe('AssessmentsService', () => {
  let service: AssessmentsService;
  let prisma: {
    questionnaireDefinition: Record<string, jest.Mock>;
    assessment: Record<string, jest.Mock>;
    questionnaireAnswer: Record<string, jest.Mock>;
    mediaAsset: Record<string, jest.Mock>;
    aiPromptTemplate: Record<string, jest.Mock>;
    score: Record<string, jest.Mock>;
    reportSection: Record<string, jest.Mock>;
    wellnessSnapshot: Record<string, jest.Mock>;
    user: Record<string, jest.Mock>;
    consentRecord: Record<string, jest.Mock>;
    $transaction: jest.Mock;
  };
  let aiProvider: { reason: jest.Mock };
  let storageProvider: { upload: jest.Mock; getBuffer: jest.Mock; delete: jest.Mock };
  let transcriptionProvider: { transcribe: jest.Mock };
  let featureFlags: { isEnabled: jest.Mock };
  let reportsService: { generateForAssessment: jest.Mock; maybeGenerateWeeklyPulseRollup: jest.Mock };

  beforeEach(async () => {
    prisma = {
      questionnaireDefinition: { findFirst: jest.fn() },
      // findMany backs the latest-score-per-type read in updateWellnessSnapshot.
      assessment: {
        findFirst: jest.fn(),
        findUnique: jest.fn(),
        findMany: jest.fn().mockResolvedValue([]),
        create: jest.fn(),
        update: jest.fn(),
      },
      questionnaireAnswer: { findMany: jest.fn().mockResolvedValue([]), upsert: jest.fn() },
      mediaAsset: { create: jest.fn(), findMany: jest.fn() },
      aiPromptTemplate: { findFirst: jest.fn() },
      score: { create: jest.fn() },
      reportSection: { findFirst: jest.fn().mockResolvedValue(null) },
      wellnessSnapshot: { findFirst: jest.fn(), create: jest.fn() },
      // Only ever touched by the new Daily Pulse stale-day check — no
      // pre-existing test (all of which use mode: FULL implicitly) reaches
      // this mock at all.
      user: { findUnique: jest.fn() },
      // Real ConsentService runs over this mock; default is consent granted so
      // the pre-existing tests are unaffected. The block overrides it.
      consentRecord: {
        findFirst: jest.fn().mockResolvedValue({ granted: true, createdAt: new Date('2030-01-01T00:00:00.000Z') }),
      },
      $transaction: jest.fn().mockResolvedValue(undefined),
    };
    aiProvider = { reason: jest.fn() };
    storageProvider = {
      upload: jest.fn().mockResolvedValue({ storagePath: 'stub-path.jpg' }),
      getBuffer: jest.fn().mockResolvedValue(Buffer.from('fake-image-bytes')),
      delete: jest.fn(),
    };
    transcriptionProvider = {
      transcribe: jest.fn().mockResolvedValue({ text: 'stub transcript' }),
    };
    // Defaults to enabled so every pre-existing test (none of which pass
    // mode: 'PULSE') is completely unaffected regardless of this value.
    featureFlags = { isEnabled: jest.fn().mockResolvedValue(true) };
    reportsService = { generateForAssessment: jest.fn(), maybeGenerateWeeklyPulseRollup: jest.fn() };

    const moduleRef = await Test.createTestingModule({
      providers: [
        AssessmentsService,
        { provide: PrismaService, useValue: prisma },
        { provide: AI_PROVIDER, useValue: aiProvider },
        { provide: STORAGE_PROVIDER, useValue: storageProvider },
        { provide: TRANSCRIPTION_PROVIDER, useValue: transcriptionProvider },
        { provide: ReportsService, useValue: reportsService },
        { provide: FeatureFlagsService, useValue: featureFlags },
        ConsentService,
      ],
    }).compile();

    service = moduleRef.get(AssessmentsService);
  });

  describe('start', () => {
    it('rejects a type with no active questionnaire', async () => {
      prisma.questionnaireDefinition.findFirst.mockResolvedValue(null);

      await expect(service.start('user-1', 'MENTAL_WELLNESS')).rejects.toBeInstanceOf(NotFoundException);
    });

    it('rejects a type with no recognized input mode (defensive fallback)', async () => {
      await expect(service.start('user-1', 'NOT_A_REAL_TYPE' as never)).rejects.toBeInstanceOf(NotFoundException);
    });

    it('creates a new assessment when none is in progress', async () => {
      prisma.questionnaireDefinition.findFirst.mockResolvedValue(LIFESTYLE_DEFINITION);
      prisma.assessment.findFirst.mockResolvedValue(null);
      prisma.assessment.create.mockResolvedValue({ id: 'a1', type: 'LIFESTYLE', status: 'IN_PROGRESS' });
      prisma.questionnaireAnswer.findMany.mockResolvedValue([]);

      const result = await service.start('user-1', 'LIFESTYLE');

      expect(prisma.assessment.create).toHaveBeenCalled();
      expect(result.nextQuestion?.key).toBe('exerciseDays');
      expect(result.isReadyToComplete).toBe(false);
    });

    it('resumes an existing in-progress assessment instead of creating a new one', async () => {
      prisma.questionnaireDefinition.findFirst.mockResolvedValue(LIFESTYLE_DEFINITION);
      prisma.assessment.findFirst.mockResolvedValue({ id: 'existing', type: 'LIFESTYLE', status: 'IN_PROGRESS' });
      prisma.questionnaireAnswer.findMany.mockResolvedValue([]);

      const result = await service.start('user-1', 'LIFESTYLE');

      expect(prisma.assessment.create).not.toHaveBeenCalled();
      expect(result.id).toBe('existing');
    });
  });

  describe('answerQuestion', () => {
    it('rejects an assessment owned by another user', async () => {
      prisma.assessment.findUnique.mockResolvedValue({ id: 'a1', userId: 'someone-else', status: 'IN_PROGRESS', type: 'LIFESTYLE' });

      await expect(
        service.answerQuestion('user-1', 'a1', { questionKey: 'exerciseDays', answer: 3 }),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('rejects an unknown question key', async () => {
      prisma.assessment.findUnique.mockResolvedValue({ id: 'a1', userId: 'user-1', status: 'IN_PROGRESS', type: 'LIFESTYLE' });
      prisma.questionnaireDefinition.findFirst.mockResolvedValue(LIFESTYLE_DEFINITION);

      await expect(
        service.answerQuestion('user-1', 'a1', { questionKey: 'notReal', answer: 3 }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejects answering a completed assessment', async () => {
      prisma.assessment.findUnique.mockResolvedValue({ id: 'a1', userId: 'user-1', status: 'COMPLETED', type: 'LIFESTYLE' });

      await expect(
        service.answerQuestion('user-1', 'a1', { questionKey: 'exerciseDays', answer: 3 }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('upserts a valid answer and returns updated state', async () => {
      prisma.assessment.findUnique.mockResolvedValue({ id: 'a1', userId: 'user-1', status: 'IN_PROGRESS', type: 'LIFESTYLE' });
      prisma.questionnaireDefinition.findFirst.mockResolvedValue(LIFESTYLE_DEFINITION);
      prisma.questionnaireAnswer.findMany.mockResolvedValue([
        { questionKey: 'exerciseDays', answer: 3 },
      ]);

      const result = await service.answerQuestion('user-1', 'a1', { questionKey: 'exerciseDays', answer: 3 });

      expect(prisma.questionnaireAnswer.upsert).toHaveBeenCalled();
      expect(result.nextQuestion?.key).toBe('waterGlasses');
    });
  });

  describe('complete', () => {
    const baseAssessment = { id: 'a1', userId: 'user-1', status: 'IN_PROGRESS', type: 'LIFESTYLE' };


    it('rejects when required questions are unanswered', async () => {
      prisma.assessment.findUnique.mockResolvedValue(baseAssessment);
      prisma.questionnaireDefinition.findFirst.mockResolvedValue(LIFESTYLE_DEFINITION);
      prisma.questionnaireAnswer.findMany.mockResolvedValue([{ questionKey: 'exerciseDays', answer: 3 }]);

      await expect(service.complete('user-1', 'a1')).rejects.toBeInstanceOf(BadRequestException);
    });

    it('turns an AI provider failure into a retryable 503 and saves nothing', async () => {
      prisma.assessment.findUnique.mockResolvedValue(baseAssessment);
      prisma.questionnaireDefinition.findFirst.mockResolvedValue(LIFESTYLE_DEFINITION);
      prisma.questionnaireAnswer.findMany.mockResolvedValue([
        { questionKey: 'exerciseDays', answer: 3 },
        { questionKey: 'waterGlasses', answer: 6 },
      ]);
      prisma.aiPromptTemplate.findFirst.mockResolvedValue(null);
      aiProvider.reason.mockRejectedValue(new Error('upstream unavailable'));

      await expect(service.complete('user-1', 'a1')).rejects.toBeInstanceOf(ServiceUnavailableException);
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    describe('when the assessment was already completed', () => {
      const completedAt = new Date('2026-11-18T15:00:10.000Z');
      const completed = { ...baseAssessment, type: 'FACE', status: 'COMPLETED', mode: 'FULL', completedAt };
      const savedScore = {
        value: 74,
        riskLevel: 'LOW',
        confidence: 80,
        observations: [{ label: 'skinTone', value: 'even' }],
        disclaimer: 'Wellness only.',
        recommendations: [{ id: 'r1', title: 'Sleep 8 hours', detail: 'Keep a regular bedtime.', priority: 'MEDIUM' }],
      };

      it('returns the saved result instead of rejecting, without calling the AI again', async () => {
        prisma.assessment.findUnique
          .mockResolvedValueOnce(completed)
          .mockResolvedValueOnce({ ...completed, score: savedScore });
        prisma.reportSection.findFirst.mockResolvedValue({ reportId: 'report-1' });

        const result = await service.complete('user-1', 'a1');

        expect(result).toEqual({
          assessmentId: 'a1',
          type: 'FACE',
          completedAt: '2026-11-18T15:00:10.000Z',
          score: 74,
          riskLevel: 'LOW',
          confidence: 80,
          observations: [{ label: 'skinTone', value: 'even' }],
          recommendations: [{ title: 'Sleep 8 hours', detail: 'Keep a regular bedtime.', priority: 'MEDIUM' }],
          disclaimer: 'Wellness only.',
          reportId: 'report-1',
        });
        expect(aiProvider.reason).not.toHaveBeenCalled();
        expect(prisma.$transaction).not.toHaveBeenCalled();
        expect(reportsService.generateForAssessment).not.toHaveBeenCalled();
        expect(prisma.wellnessSnapshot.create).not.toHaveBeenCalled();
      });

      it('leaves out reportId when no report section was saved', async () => {
        prisma.assessment.findUnique
          .mockResolvedValueOnce(completed)
          .mockResolvedValueOnce({ ...completed, score: savedScore });

        const result = await service.complete('user-1', 'a1');

        expect(result).not.toHaveProperty('reportId');
        expect(result.score).toBe(74);
      });

      it('still rejects when the completed assessment has no saved score', async () => {
        prisma.assessment.findUnique
          .mockResolvedValueOnce(completed)
          .mockResolvedValueOnce({ ...completed, score: null });

        await expect(service.complete('user-1', 'a1')).rejects.toThrow('This assessment is not in progress.');
      });

      it('still rejects an abandoned assessment', async () => {
        prisma.assessment.findUnique.mockResolvedValue({ ...completed, status: 'ABANDONED' });

        await expect(service.complete('user-1', 'a1')).rejects.toThrow('This assessment is not in progress.');
      });

      it("refuses another user's completed assessment", async () => {
        prisma.assessment.findUnique.mockResolvedValue({ ...completed, userId: 'someone-else' });

        await expect(service.complete('user-1', 'a1')).rejects.toBeInstanceOf(ForbiddenException);
        expect(prisma.reportSection.findFirst).not.toHaveBeenCalled();
      });
    });

    describe('when a second call overlaps the first', () => {
      function stubScorableLifestyle() {
        prisma.questionnaireDefinition.findFirst.mockResolvedValue(LIFESTYLE_DEFINITION);
        prisma.questionnaireAnswer.findMany.mockResolvedValue([
          { questionKey: 'exerciseDays', answer: 3 },
          { questionKey: 'waterGlasses', answer: 6 },
        ]);
        prisma.aiPromptTemplate.findFirst.mockResolvedValue(null);
        aiProvider.reason.mockResolvedValue({
          score: 82,
          observations: [],
          recommendations: [],
          riskLevel: 'LOW',
          confidence: 88,
          disclaimer: 'Wellness only.',
        });
      }

      it('runs the AI analysis once and gives both calls the same result', async () => {
        prisma.assessment.findUnique.mockResolvedValue(baseAssessment);
        stubScorableLifestyle();

        const [first, second] = await Promise.all([service.complete('user-1', 'a1'), service.complete('user-1', 'a1')]);

        expect(aiProvider.reason).toHaveBeenCalledTimes(1);
        expect(prisma.$transaction).toHaveBeenCalledTimes(1);
        expect(second).toBe(first);
      });

      it('does not share an in-flight completion with a different user', async () => {
        prisma.assessment.findUnique.mockResolvedValue(baseAssessment);
        stubScorableLifestyle();

        const results = await Promise.allSettled([service.complete('user-1', 'a1'), service.complete('user-2', 'a1')]);

        expect(results[0].status).toBe('fulfilled');
        expect(results[1]).toEqual(expect.objectContaining({ status: 'rejected' }));
      });

      it('lets a retry run again once a failed completion has finished', async () => {
        prisma.assessment.findUnique.mockResolvedValue(baseAssessment);
        stubScorableLifestyle();
        aiProvider.reason.mockRejectedValueOnce(new Error('AI down'));

        await expect(service.complete('user-1', 'a1')).rejects.toBeInstanceOf(ServiceUnavailableException);
        await expect(service.complete('user-1', 'a1')).resolves.toEqual(expect.objectContaining({ score: 82 }));
        expect(aiProvider.reason).toHaveBeenCalledTimes(2);
      });

      it('returns the saved result when another instance completed it first (unique constraint on Score)', async () => {
        prisma.assessment.findUnique.mockResolvedValueOnce(baseAssessment).mockResolvedValueOnce({
          ...baseAssessment,
          status: 'COMPLETED',
          completedAt: new Date('2026-11-19T04:40:00.000Z'),
          score: {
            value: 62,
            riskLevel: 'MODERATE',
            confidence: 80,
            observations: [],
            disclaimer: 'Wellness only.',
            recommendations: [],
          },
        });
        stubScorableLifestyle();
        prisma.$transaction.mockRejectedValueOnce(Object.assign(new Error('Unique constraint failed'), { code: 'P2002' }));

        const result = await service.complete('user-1', 'a1');

        expect(result.score).toBe(62);
        expect(prisma.wellnessSnapshot.create).not.toHaveBeenCalled();
        expect(reportsService.generateForAssessment).not.toHaveBeenCalled();
      });

      it('rethrows a transaction error that is not a unique-constraint conflict', async () => {
        prisma.assessment.findUnique.mockResolvedValue(baseAssessment);
        stubScorableLifestyle();
        prisma.$transaction.mockRejectedValueOnce(new Error('connection lost'));

        await expect(service.complete('user-1', 'a1')).rejects.toThrow('connection lost');
      });
    });

    it('scores the assessment, persists results, and updates the wellness snapshot', async () => {
      prisma.assessment.findUnique.mockResolvedValue(baseAssessment);
      prisma.questionnaireDefinition.findFirst.mockResolvedValue(LIFESTYLE_DEFINITION);
      prisma.questionnaireAnswer.findMany.mockResolvedValue([
        { questionKey: 'exerciseDays', answer: 3 },
        { questionKey: 'waterGlasses', answer: 6 },
      ]);
      prisma.aiPromptTemplate.findFirst.mockResolvedValue(null);
      prisma.wellnessSnapshot.findFirst.mockResolvedValue(null);
      aiProvider.reason.mockResolvedValue({
        score: 82,
        observations: [{ label: 'exerciseDays', value: '3' }],
        recommendations: [{ title: 'Drink more water', detail: 'Aim for 8 glasses.', priority: 'MEDIUM' }],
        riskLevel: 'LOW',
        confidence: 88,
        disclaimer: 'Wellness only.',
      });

      const result = await service.complete('user-1', 'a1');

      expect(aiProvider.reason).toHaveBeenCalledWith(
        expect.objectContaining({ input: { exerciseDays: 3, waterGlasses: 6 } }),
      );
      expect(prisma.$transaction).toHaveBeenCalled();
      expect(prisma.wellnessSnapshot.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ lifestyleScore: 82, overallScore: 82 }),
        }),
      );
      expect(result.score).toBe(82);
      expect(result.assessmentId).toBe('a1');
    });

    it('rebuilds the snapshot from the latest score of every type instead of copying the previous snapshot forward', async () => {
      prisma.assessment.findUnique.mockResolvedValue(baseAssessment);
      prisma.questionnaireDefinition.findFirst.mockResolvedValue(LIFESTYLE_DEFINITION);
      prisma.questionnaireAnswer.findMany.mockResolvedValue([
        { questionKey: 'exerciseDays', answer: 3 },
        { questionKey: 'waterGlasses', answer: 6 },
      ]);
      prisma.aiPromptTemplate.findFirst.mockResolvedValue(null);
      // A legacy snapshot written under the earlier mapping, with EYE's
      // score in mentalWellnessScore. It must not carry forward.
      prisma.wellnessSnapshot.findFirst.mockResolvedValue({ mentalWellnessScore: 82, cardioScore: 74, overallScore: 78 });
      prisma.assessment.findMany.mockResolvedValue([
        { type: 'LIFESTYLE', completedAt: new Date('2026-08-06T12:23:00.000Z'), score: { value: 65 } },
        { type: 'EYE', completedAt: new Date('2026-08-07T05:00:00.000Z'), score: { value: 82 } },
        { type: 'SKIN', completedAt: new Date('2026-08-07T04:19:00.000Z'), score: { value: 74 } },
      ]);
      aiProvider.reason.mockResolvedValue({
        score: 80,
        observations: [],
        recommendations: [],
        riskLevel: 'LOW',
        confidence: 88,
        disclaimer: 'Wellness only.',
      });

      await service.complete('user-1', 'a1');

      // The just-completed LIFESTYLE score (80) wins over its older row (65).
      expect(prisma.wellnessSnapshot.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          lifestyleScore: 80,
          cardioScore: 74,
          mentalWellnessScore: null,
          overallScore: (80 + 82 + 74) / 3,
        }),
      });
    });

    it('keeps only allowlisted observation labels for a questionnaire module', async () => {
      prisma.assessment.findUnique.mockResolvedValue(baseAssessment);
      prisma.questionnaireDefinition.findFirst.mockResolvedValue(LIFESTYLE_DEFINITION);
      prisma.questionnaireAnswer.findMany.mockResolvedValue([
        { questionKey: 'exerciseDays', answer: 3 },
        { questionKey: 'waterGlasses', answer: 6 },
      ]);
      prisma.aiPromptTemplate.findFirst.mockResolvedValue(null);
      prisma.wellnessSnapshot.findFirst.mockResolvedValue(null);
      aiProvider.reason.mockResolvedValue({
        score: 82,
        observations: [
          { label: 'sleepHoursPerNight', value: '7' },
          { label: 'hypertensionRisk', value: 'Elevated' },
        ],
        recommendations: [],
        riskLevel: 'LOW',
        confidence: 88,
        disclaimer: 'Wellness only.',
      });

      const result = await service.complete('user-1', 'a1');

      expect(result.observations).toEqual([{ label: 'sleepHoursPerNight', value: '7' }]);
    });

    it('does not touch the wellness snapshot for a type outside the enum', async () => {
      // Every real AssessmentType has a dimension (a compile-time guarantee),
      // so the only way to reach updateWellnessSnapshot's guard is a legacy
      // type string that predates the current enum.
      prisma.assessment.findUnique.mockResolvedValue({ ...baseAssessment, type: 'UNMAPPED_TYPE' as never });
      prisma.aiPromptTemplate.findFirst.mockResolvedValue(null);
      prisma.mediaAsset.findMany.mockResolvedValue([
        { id: 'm1', storagePath: 'stub-path.jpg', mimeType: 'image/jpeg', captureLabel: 'front' },
      ]);
      aiProvider.reason.mockResolvedValue({
        score: 70,
        observations: [],
        recommendations: [],
        riskLevel: 'MODERATE',
        confidence: 60,
        disclaimer: 'Wellness only.',
      });

      await service.complete('user-1', 'a1');

      expect(prisma.wellnessSnapshot.create).not.toHaveBeenCalled();
    });

    describe('system prompt composition', () => {
      function stubScorableLifestyle(template: { systemPrompt: string } | null) {
        prisma.assessment.findUnique.mockResolvedValue(baseAssessment);
        prisma.questionnaireDefinition.findFirst.mockResolvedValue(LIFESTYLE_DEFINITION);
        prisma.questionnaireAnswer.findMany.mockResolvedValue([
          { questionKey: 'exerciseDays', answer: 3 },
          { questionKey: 'waterGlasses', answer: 6 },
        ]);
        prisma.aiPromptTemplate.findFirst.mockResolvedValue(template);
        prisma.wellnessSnapshot.findFirst.mockResolvedValue(null);
        aiProvider.reason.mockResolvedValue({
          score: 82,
          observations: [],
          recommendations: [],
          riskLevel: 'LOW',
          confidence: 88,
          disclaimer: 'Wellness only.',
        });
      }

      it('keeps the guardrail and crisis rules when the active DB template omits them', async () => {
        stubScorableLifestyle({ systemPrompt: 'Score this lifestyle questionnaire.' });

        await service.complete('user-1', 'a1');

        const [[{ systemPrompt }]] = aiProvider.reason.mock.calls as [[{ systemPrompt: string }]];
        expect(systemPrompt).toBe(
          `${CHAT_SYSTEM_GUARDRAIL}\n\n${CRISIS_SAFETY_RULES}\n\nScore this lifestyle questionnaire.`,
        );
      });

      it('does not duplicate the guardrail when the DB template already includes it', async () => {
        stubScorableLifestyle({ systemPrompt: `${CHAT_SYSTEM_GUARDRAIL}\n\nScore this lifestyle questionnaire.` });

        await service.complete('user-1', 'a1');

        const [[{ systemPrompt }]] = aiProvider.reason.mock.calls as [[{ systemPrompt: string }]];
        expect(systemPrompt.split(CHAT_SYSTEM_GUARDRAIL)).toHaveLength(2);
        expect(systemPrompt.split(CRISIS_SAFETY_RULES)).toHaveLength(2);
      });

      it('does not duplicate the guardrail in the code default, which already embeds it', async () => {
        stubScorableLifestyle(null);

        await service.complete('user-1', 'a1');

        const [[{ systemPrompt }]] = aiProvider.reason.mock.calls as [[{ systemPrompt: string }]];
        expect(systemPrompt.startsWith(`${CHAT_SYSTEM_GUARDRAIL}\n\n${CRISIS_SAFETY_RULES}`)).toBe(true);
        expect(systemPrompt.split(CHAT_SYSTEM_GUARDRAIL)).toHaveLength(2);
      });
    });
  });

  describe('server-side media consent', () => {
    const CAMERA_TYPES = ['FACE', 'EYE', 'HAIR', 'SKIN', 'TEETH', 'TONGUE', 'POSTURE', 'WALKING'] as const;
    const upload = (id: string, mime = 'image/jpeg') =>
      service.uploadMedia('user-1', id, { buffer: Buffer.from('x'), mimeType: mime });
    const own = (type: string) =>
      prisma.assessment.findUnique.mockResolvedValue({ id: 'a1', userId: 'user-1', status: 'IN_PROGRESS', type });
    const consentOnly = (granted: Record<string, boolean>) =>
      prisma.consentRecord.findFirst.mockImplementation(({ where }: { where: { type: string } }) =>
        Promise.resolve(
          where.type in granted
            ? { granted: granted[where.type], createdAt: new Date('2030-01-01T00:00:00.000Z') }
            : null,
        ),
      );

    describe.each(CAMERA_TYPES)('%s (camera)', (type) => {
      it('rejects upload and complete with CONSENT_REQUIRED_CAMERA when never granted', async () => {
        own(type);
        consentOnly({});
        await expect(upload('a1')).rejects.toMatchObject({ status: 403, response: { code: 'CONSENT_REQUIRED_CAMERA' } });
        await expect(service.complete('user-1', 'a1')).rejects.toBeInstanceOf(ForbiddenException);
        expect(storageProvider.upload).not.toHaveBeenCalled();
        expect(aiProvider.reason).not.toHaveBeenCalled();
      });

      it('rejects when camera consent was granted then revoked', async () => {
        own(type);
        consentOnly({ CAMERA: false });
        await expect(upload('a1')).rejects.toBeInstanceOf(ForbiddenException);
      });

      it('does not accept microphone consent in place of camera', async () => {
        own(type);
        consentOnly({ MICROPHONE: true });
        await expect(upload('a1')).rejects.toBeInstanceOf(ForbiddenException);
      });

      it('accepts upload when camera consent is granted', async () => {
        own(type);
        consentOnly({ CAMERA: true });
        prisma.mediaAsset.findMany.mockResolvedValue([]);
        await expect(upload('a1')).resolves.toBeDefined();
        expect(storageProvider.upload).toHaveBeenCalled();
      });
    });

    describe('VOICE (microphone)', () => {
      it('rejects upload and complete with CONSENT_REQUIRED_MICROPHONE when never granted', async () => {
        own('VOICE');
        consentOnly({ CAMERA: true });
        await expect(upload('a1', 'audio/webm')).rejects.toMatchObject({
          status: 403,
          response: { code: 'CONSENT_REQUIRED_MICROPHONE' },
        });
        await expect(service.complete('user-1', 'a1')).rejects.toBeInstanceOf(ForbiddenException);
      });

      it('rejects when microphone consent was granted then revoked', async () => {
        own('VOICE');
        consentOnly({ MICROPHONE: false });
        await expect(upload('a1', 'audio/webm')).rejects.toBeInstanceOf(ForbiddenException);
      });

      it('accepts upload when microphone consent is granted', async () => {
        own('VOICE');
        consentOnly({ MICROPHONE: true });
        prisma.mediaAsset.findMany.mockResolvedValue([]);
        await expect(upload('a1', 'audio/webm')).resolves.toBeDefined();
      });
    });

    describe.each(['HAND_COORDINATION', 'MEMORY', 'SQUATS', 'LIFESTYLE', 'MENTAL_WELLNESS'])(
      '%s (no media)',
      (type) => {
        it('never consults media consent on complete', async () => {
          own(type);
          // AI-processing consent is a separate concern; only media consent is under test here.
          consentOnly({ DATA_PROCESSING: true });
          aiProvider.reason.mockResolvedValue({
            score: 70, observations: [], recommendations: [], riskLevel: 'LOW', confidence: 0.8, disclaimer: '',
          });
          prisma.questionnaireDefinition.findFirst.mockResolvedValue(LIFESTYLE_DEFINITION);
          await service.complete('user-1', 'a1').catch((e) => {
            expect(e).not.toBeInstanceOf(ForbiddenException);
          });
          const consulted = prisma.consentRecord.findFirst.mock.calls.map(
            (c: [{ where: { type: string } }]) => c[0].where.type,
          );
          expect(consulted).not.toContain('CAMERA');
          expect(consulted).not.toContain('MICROPHONE');
        });
      },
    );

    it('does not block interactive-test uploads of results (no media consent involved)', async () => {
      own('MEMORY');
      consentOnly({});
      prisma.mediaAsset.findMany.mockResolvedValue([]);
      await expect(
        service.recordTestResult('user-1', 'a1', { key: 'score', value: 3 } as never),
      ).resolves.toBeDefined();
    });
  });

  describe('AI-processing consent on complete', () => {
    const records = (map: Record<string, { granted: boolean; createdAt: string }>) =>
      prisma.consentRecord.findFirst.mockImplementation(({ where }: { where: { type: string } }) =>
        Promise.resolve(map[where.type] ? { ...map[where.type], createdAt: new Date(map[where.type].createdAt) } : null),
      );
    const NOW = '2026-11-01T00:00:00.000Z';
    const own = (type: string, mode?: string) =>
      prisma.assessment.findUnique.mockResolvedValue({ id: 'a1', userId: 'user-1', status: 'IN_PROGRESS', type, mode });

    it.each(['LIFESTYLE', 'MEMORY'])('refuses to complete a FULL %s without AI consent, before any AI call', async (type) => {
      own(type, 'FULL');
      records({});
      await expect(service.complete('user-1', 'a1')).rejects.toMatchObject({
        status: 403,
        response: { code: 'CONSENT_REQUIRED_AI_PROCESSING' },
      });
      expect(aiProvider.reason).not.toHaveBeenCalled();
      expect(prisma.assessment.update).not.toHaveBeenCalled();
    });

    it('refuses when only the pre-valid-from auto-grant exists, and after a withdrawal', async () => {
      own('LIFESTYLE', 'FULL');
      records({ DATA_PROCESSING: { granted: true, createdAt: '2026-10-26T12:00:00.000Z' } });
      await expect(service.complete('user-1', 'a1')).rejects.toBeInstanceOf(ForbiddenException);
      records({ DATA_PROCESSING: { granted: false, createdAt: NOW } });
      await expect(service.complete('user-1', 'a1')).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('does not block Daily Pulse completion (no AI call), even with consent withdrawn', async () => {
      own('MENTAL_WELLNESS', 'PULSE');
      records({ DATA_PROCESSING: { granted: false, createdAt: NOW } });
      await expect(service.complete('user-1', 'a1')).resolves.toMatchObject({ assessmentId: 'a1' });
      expect(aiProvider.reason).not.toHaveBeenCalled();
    });

    it('still lets the user upload and answer without AI consent', async () => {
      own('FACE', 'FULL');
      records({ CAMERA: { granted: true, createdAt: NOW } });
      prisma.mediaAsset.findMany.mockResolvedValue([]);
      await expect(
        service.uploadMedia('user-1', 'a1', { buffer: Buffer.from('x'), mimeType: 'image/jpeg' }),
      ).resolves.toBeDefined();
    });

    it('proceeds to the AI call once a current grant exists', async () => {
      own('LIFESTYLE', 'FULL');
      records({ DATA_PROCESSING: { granted: true, createdAt: NOW } });
      prisma.questionnaireDefinition.findFirst.mockResolvedValue(LIFESTYLE_DEFINITION);
      prisma.questionnaireAnswer.findMany.mockResolvedValue([
        { questionKey: 'exerciseDays', answer: 3 },
        { questionKey: 'waterGlasses', answer: 6 },
      ]);
      aiProvider.reason.mockResolvedValue({
        score: 70, observations: [], recommendations: [], riskLevel: 'LOW', confidence: 80, disclaimer: '',
      });
      await service.complete('user-1', 'a1');
      expect(aiProvider.reason).toHaveBeenCalled();
    });
  });

  describe('abandon', () => {
    it('marks an in-progress assessment as abandoned', async () => {
      prisma.assessment.findUnique.mockResolvedValue({ id: 'a1', userId: 'user-1', status: 'IN_PROGRESS' });

      await service.abandon('user-1', 'a1');

      expect(prisma.assessment.update).toHaveBeenCalledWith({
        where: { id: 'a1' },
        data: { status: 'ABANDONED' },
      });
    });

    it('rejects abandoning a non-in-progress assessment', async () => {
      prisma.assessment.findUnique.mockResolvedValue({ id: 'a1', userId: 'user-1', status: 'COMPLETED' });

      await expect(service.abandon('user-1', 'a1')).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('camera-based assessments (FACE)', () => {
    it('starts without requiring a questionnaire definition', async () => {
      prisma.assessment.findFirst.mockResolvedValue(null);
      prisma.assessment.create.mockResolvedValue({ id: 'face-1', type: 'FACE', status: 'IN_PROGRESS' });
      prisma.mediaAsset.findMany.mockResolvedValue([]);

      const result = await service.start('user-1', 'FACE');

      expect(prisma.questionnaireDefinition.findFirst).not.toHaveBeenCalled();
      expect(result.inputMode).toBe('CAMERA_IMAGE');
      expect(result.isReadyToComplete).toBe(false);
    });

    it('rejects answering questions on a camera-mode assessment', async () => {
      prisma.assessment.findUnique.mockResolvedValue({ id: 'face-1', userId: 'user-1', status: 'IN_PROGRESS', type: 'FACE' });

      await expect(
        service.answerQuestion('user-1', 'face-1', { questionKey: 'x', answer: '1' }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('uploads a photo via the storage provider and creates a MediaAsset', async () => {
      prisma.assessment.findUnique.mockResolvedValue({ id: 'face-1', userId: 'user-1', status: 'IN_PROGRESS', type: 'FACE' });
      prisma.mediaAsset.findMany.mockResolvedValue([{ id: 'm1', kind: 'IMAGE', captureLabel: 'front' }]);

      const result = await service.uploadMedia(
        'user-1',
        'face-1',
        { buffer: Buffer.from('jpeg-bytes'), mimeType: 'image/jpeg' },
        'front',
      );

      expect(storageProvider.upload).toHaveBeenCalledWith(
        expect.objectContaining({ mimeType: 'image/jpeg' }),
      );
      expect(prisma.mediaAsset.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ assessmentId: 'face-1', kind: 'IMAGE', captureLabel: 'front' }),
        }),
      );
      expect(result.mediaAssets).toHaveLength(1);
      expect(result.isReadyToComplete).toBe(true);
    });

    it('rejects an unsupported mime type', async () => {
      prisma.assessment.findUnique.mockResolvedValue({ id: 'face-1', userId: 'user-1', status: 'IN_PROGRESS', type: 'FACE' });

      await expect(
        service.uploadMedia('user-1', 'face-1', { buffer: Buffer.from('x'), mimeType: 'application/pdf' }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejects completing with no captured photos', async () => {
      prisma.assessment.findUnique.mockResolvedValue({ id: 'face-1', userId: 'user-1', status: 'IN_PROGRESS', type: 'FACE' });
      prisma.aiPromptTemplate.findFirst.mockResolvedValue(null);
      prisma.mediaAsset.findMany.mockResolvedValue([]);

      await expect(service.complete('user-1', 'face-1')).rejects.toBeInstanceOf(BadRequestException);
    });

    it('completes by sending captured images to the AI provider', async () => {
      prisma.assessment.findUnique.mockResolvedValue({ id: 'face-1', userId: 'user-1', status: 'IN_PROGRESS', type: 'FACE' });
      prisma.aiPromptTemplate.findFirst.mockResolvedValue(null);
      prisma.mediaAsset.findMany.mockResolvedValue([
        { id: 'm1', storagePath: 'stub-path.jpg', mimeType: 'image/jpeg', captureLabel: 'front' },
      ]);
      prisma.wellnessSnapshot.findFirst.mockResolvedValue(null);
      aiProvider.reason.mockResolvedValue({
        score: 78,
        observations: [{ label: 'darkCircles', value: 'Mild' }],
        recommendations: [{ title: 'Get more sleep', detail: 'Aim for 8 hours.', priority: 'MEDIUM' }],
        riskLevel: 'LOW',
        confidence: 70,
        disclaimer: 'Wellness only.',
      });

      const result = await service.complete('user-1', 'face-1');

      expect(storageProvider.getBuffer).toHaveBeenCalledWith('stub-path.jpg');
      expect(aiProvider.reason).toHaveBeenCalledWith(
        expect.objectContaining({
          images: [expect.objectContaining({ mediaType: 'image/jpeg' })],
        }),
      );
      expect(result.score).toBe(78);
      // FACE has its own dashboard tile and no snapshot column, but it must
      // still write a trend point, counted in the overall score and kept out
      // of mental wellness (regression: a Face completion used to write no
      // snapshot at all, so the dashboard never changed).
      expect(prisma.wellnessSnapshot.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ overallScore: 78, mentalWellnessScore: null }) }),
      );
    });

    it('drops observation labels outside the FACE allowlist before persisting them', async () => {
      prisma.assessment.findUnique.mockResolvedValue({ id: 'face-1', userId: 'user-1', status: 'IN_PROGRESS', type: 'FACE' });
      prisma.aiPromptTemplate.findFirst.mockResolvedValue(null);
      prisma.mediaAsset.findMany.mockResolvedValue([
        { id: 'm1', storagePath: 'stub-path.jpg', mimeType: 'image/jpeg', captureLabel: 'front' },
      ]);
      prisma.wellnessSnapshot.findFirst.mockResolvedValue(null);
      aiProvider.reason.mockResolvedValue({
        score: 78,
        observations: [
          { label: 'Dark circles', value: 'Mild' },
          { label: 'estimatedStressLevel', value: 'High' },
          { label: 'hydrationLevel', value: 'Low' },
        ],
        recommendations: [],
        riskLevel: 'LOW',
        confidence: 70,
        disclaimer: 'Wellness only.',
      });

      const result = await service.complete('user-1', 'face-1');

      expect(result.observations).toEqual([{ label: 'darkCircles', value: 'Mild' }]);
      expect(prisma.score.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ observations: [{ label: 'darkCircles', value: 'Mild' }] }),
        }),
      );
    });
  });

  describe('microphone-based assessments (VOICE)', () => {
    it('starts a VOICE assessment as MICROPHONE_AUDIO', async () => {
      prisma.assessment.findFirst.mockResolvedValue(null);
      prisma.assessment.create.mockResolvedValue({ id: 'voice-1', type: 'VOICE', status: 'IN_PROGRESS' });
      prisma.mediaAsset.findMany.mockResolvedValue([]);

      const result = await service.start('user-1', 'VOICE');

      expect(result.inputMode).toBe('MICROPHONE_AUDIO');
      expect(result.isReadyToComplete).toBe(false);
    });

    it('uploads a recording as an AUDIO MediaAsset', async () => {
      prisma.assessment.findUnique.mockResolvedValue({ id: 'voice-1', userId: 'user-1', status: 'IN_PROGRESS', type: 'VOICE' });
      prisma.mediaAsset.findMany.mockResolvedValue([{ id: 'm1', kind: 'AUDIO', captureLabel: 'reading' }]);

      const result = await service.uploadMedia(
        'user-1',
        'voice-1',
        { buffer: Buffer.from('webm-bytes'), mimeType: 'audio/webm' },
        'reading',
      );

      expect(prisma.mediaAsset.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ assessmentId: 'voice-1', kind: 'AUDIO', captureLabel: 'reading' }),
        }),
      );
      expect(result.mediaAssets).toHaveLength(1);
      expect(result.isReadyToComplete).toBe(true);
    });

    it('rejects an unsupported audio mime type', async () => {
      prisma.assessment.findUnique.mockResolvedValue({ id: 'voice-1', userId: 'user-1', status: 'IN_PROGRESS', type: 'VOICE' });

      await expect(
        service.uploadMedia('user-1', 'voice-1', { buffer: Buffer.from('x'), mimeType: 'image/jpeg' }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('completes by transcribing the recording and sending the transcript to the AI provider', async () => {
      prisma.assessment.findUnique.mockResolvedValue({ id: 'voice-1', userId: 'user-1', status: 'IN_PROGRESS', type: 'VOICE' });
      prisma.aiPromptTemplate.findFirst.mockResolvedValue(null);
      prisma.mediaAsset.findMany.mockResolvedValue([
        { id: 'm1', kind: 'AUDIO', storagePath: 'stub-path.webm', mimeType: 'audio/webm', captureLabel: 'reading' },
      ]);
      prisma.wellnessSnapshot.findFirst.mockResolvedValue(null);
      transcriptionProvider.transcribe.mockResolvedValue({ text: 'Today I feel energetic and well rested.' });
      aiProvider.reason.mockResolvedValue({
        score: 82,
        observations: [],
        recommendations: [],
        riskLevel: 'LOW',
        confidence: 65,
        disclaimer: 'Wellness only.',
      });

      const result = await service.complete('user-1', 'voice-1');

      expect(transcriptionProvider.transcribe).toHaveBeenCalledWith(expect.any(Buffer), 'audio/webm');
      expect(aiProvider.reason).toHaveBeenCalledWith(
        expect.objectContaining({
          input: expect.objectContaining({ transcript: 'Today I feel energetic and well rested.' }),
          images: [],
        }),
      );
      expect(result.score).toBe(82);
      // VOICE has its own tile and never feeds mental wellness, but it counts
      // in the overall score.
      expect(prisma.wellnessSnapshot.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ overallScore: 82, mentalWellnessScore: null }) }),
      );
    });
  });

  describe('video-based assessments (WALKING)', () => {
    it('starts a WALKING assessment as CAMERA_VIDEO', async () => {
      prisma.assessment.findFirst.mockResolvedValue(null);
      prisma.assessment.create.mockResolvedValue({ id: 'walk-1', type: 'WALKING', status: 'IN_PROGRESS' });
      prisma.mediaAsset.findMany.mockResolvedValue([]);

      const result = await service.start('user-1', 'WALKING');

      expect(result.inputMode).toBe('CAMERA_VIDEO');
      expect(result.isReadyToComplete).toBe(false);
    });

    it('uploads an extracted frame as an IMAGE MediaAsset', async () => {
      prisma.assessment.findUnique.mockResolvedValue({ id: 'walk-1', userId: 'user-1', status: 'IN_PROGRESS', type: 'WALKING' });
      prisma.mediaAsset.findMany.mockResolvedValue([{ id: 'm1', kind: 'IMAGE', captureLabel: 'frame-0' }]);

      const result = await service.uploadMedia(
        'user-1',
        'walk-1',
        { buffer: Buffer.from('jpeg-bytes'), mimeType: 'image/jpeg' },
        'frame-0',
      );

      expect(prisma.mediaAsset.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ assessmentId: 'walk-1', kind: 'IMAGE', captureLabel: 'frame-0' }),
        }),
      );
      expect(result.mediaAssets).toHaveLength(1);
      expect(result.isReadyToComplete).toBe(true);
    });

    it('completes by sending the extracted frames to the AI provider', async () => {
      prisma.assessment.findUnique.mockResolvedValue({ id: 'walk-1', userId: 'user-1', status: 'IN_PROGRESS', type: 'WALKING' });
      prisma.aiPromptTemplate.findFirst.mockResolvedValue(null);
      prisma.mediaAsset.findMany.mockResolvedValue([
        { id: 'm1', kind: 'IMAGE', storagePath: 'stub-path-0.jpg', mimeType: 'image/jpeg', captureLabel: 'frame-0' },
        { id: 'm2', kind: 'IMAGE', storagePath: 'stub-path-1.jpg', mimeType: 'image/jpeg', captureLabel: 'frame-1' },
      ]);
      prisma.wellnessSnapshot.findFirst.mockResolvedValue(null);
      aiProvider.reason.mockResolvedValue({
        score: 74,
        observations: [],
        recommendations: [],
        riskLevel: 'LOW',
        confidence: 60,
        disclaimer: 'Wellness only.',
      });

      const result = await service.complete('user-1', 'walk-1');

      expect(aiProvider.reason).toHaveBeenCalledWith(
        expect.objectContaining({ images: expect.arrayContaining([expect.objectContaining({ mediaType: 'image/jpeg' })]) }),
      );
      expect(result.score).toBe(74);
      expect(prisma.wellnessSnapshot.create).toHaveBeenCalledWith(
        // WALKING has its own tile now (no combined Activity column); it counts in the overall score.
        expect.objectContaining({ data: expect.objectContaining({ overallScore: 74, fitnessScore: null }) }),
      );
    });
  });

  describe('interactive-test assessments (HAND_COORDINATION / MEMORY)', () => {
    it('starts a HAND_COORDINATION assessment as INTERACTIVE_TEST, not ready to complete yet', async () => {
      prisma.assessment.findFirst.mockResolvedValue(null);
      prisma.assessment.create.mockResolvedValue({ id: 'hc-1', type: 'HAND_COORDINATION', status: 'IN_PROGRESS' });
      prisma.mediaAsset.findMany.mockResolvedValue([]);

      const result = await service.start('user-1', 'HAND_COORDINATION');

      expect(result.inputMode).toBe('INTERACTIVE_TEST');
      expect(result.mediaAssets).toHaveLength(0);
      expect(result.isReadyToComplete).toBe(false);
    });

    it('becomes ready to complete once a test result is recorded, with no media required', async () => {
      prisma.assessment.findUnique.mockResolvedValue({ id: 'hc-1', userId: 'user-1', status: 'IN_PROGRESS', type: 'HAND_COORDINATION' });
      prisma.mediaAsset.findMany.mockResolvedValue([]);
      prisma.questionnaireAnswer.findMany.mockResolvedValue([
        { questionKey: 'handCoordination', answer: { averageReactionMs: 420, accuracy: 0.9, rating: 'Good' } },
      ]);

      const result = await service.recordTestResult('user-1', 'hc-1', {
        key: 'handCoordination',
        value: { averageReactionMs: 420, accuracy: 0.9, rating: 'Good' },
      });

      expect(result.isReadyToComplete).toBe(true);
      expect(result.testResults.handCoordination).toEqual({ averageReactionMs: 420, accuracy: 0.9, rating: 'Good' });
    });

    it('rejects completing before any test result is recorded', async () => {
      prisma.assessment.findUnique.mockResolvedValue({ id: 'hc-1', userId: 'user-1', status: 'IN_PROGRESS', type: 'HAND_COORDINATION' });
      prisma.aiPromptTemplate.findFirst.mockResolvedValue(null);
      prisma.mediaAsset.findMany.mockResolvedValue([]);
      prisma.questionnaireAnswer.findMany.mockResolvedValue([]);

      await expect(service.complete('user-1', 'hc-1')).rejects.toBeInstanceOf(BadRequestException);
    });

    it('completes by sending the recorded test result to the AI provider with an empty images array', async () => {
      prisma.assessment.findUnique.mockResolvedValue({ id: 'mem-1', userId: 'user-1', status: 'IN_PROGRESS', type: 'MEMORY' });
      prisma.aiPromptTemplate.findFirst.mockResolvedValue(null);
      prisma.mediaAsset.findMany.mockResolvedValue([]);
      prisma.questionnaireAnswer.findMany.mockResolvedValue([
        { questionKey: 'memoryTest', answer: { longestSequence: 6, rating: 'Good' } },
      ]);
      prisma.wellnessSnapshot.findFirst.mockResolvedValue(null);
      aiProvider.reason.mockResolvedValue({
        score: 71,
        observations: [],
        recommendations: [],
        riskLevel: 'LOW',
        confidence: 55,
        disclaimer: 'Wellness only.',
      });

      const result = await service.complete('user-1', 'mem-1');

      expect(aiProvider.reason).toHaveBeenCalledWith(
        expect.objectContaining({
          images: [],
          input: expect.objectContaining({ memoryTest: { longestSequence: 6, rating: 'Good' } }),
        }),
      );
      expect(result.score).toBe(71);
      // MEMORY has its own Memory tile: not Activity, not mental wellness.
      expect(prisma.wellnessSnapshot.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ overallScore: 71, fitnessScore: null, mentalWellnessScore: null }),
        }),
      );
    });

    it('flattens the raw Hand Coordination result into clean fields before sending it to the AI provider', async () => {
      prisma.assessment.findUnique.mockResolvedValue({
        id: 'hc-1',
        userId: 'user-1',
        status: 'IN_PROGRESS',
        type: 'HAND_COORDINATION',
      });
      prisma.aiPromptTemplate.findFirst.mockResolvedValue(null);
      prisma.mediaAsset.findMany.mockResolvedValue([]);
      prisma.questionnaireAnswer.findMany.mockResolvedValue([
        {
          questionKey: 'handCoordination',
          answer: {
            accuracy: 0.9091,
            averageReactionMs: 1204,
            reactionConsistencyMs: 40,
            missPattern: [
              true,
              true,
              true,
              false,
              true,
              true,
              true,
              true,
              true,
              true,
              true,
            ],
            rawReactionTimes: [996.89, 1104.2],
            roundLog: [
              {
                hit: false,
                distancePx: null,
                isPractice: true,
                reactionMs: null,
                normalizedReactionMs: null,
              },
            ],
            rating: 'Good',
          },
        },
      ]);
      prisma.wellnessSnapshot.findFirst.mockResolvedValue(null);
      aiProvider.reason.mockResolvedValue({
        score: 63,
        observations: [],
        recommendations: [],
        riskLevel: 'MODERATE',
        confidence: 55,
        disclaimer: 'Wellness only.',
      });

      await service.complete('user-1', 'hc-1');

      // An exact (not partial) match on `input` — this is what proves the
      // bulky/raw fields (rawReactionTimes, roundLog, captureLabels) never
      // reach the AI input at all, not just that the clean ones are present.
      expect(aiProvider.reason).toHaveBeenCalledWith(
        expect.objectContaining({
          input: {
            accuracy: '91%',
            averageReactionTime: '1.20s',
            consistency: 'Excellent',
            missPattern: '1 miss (round 4 of 11)',
            rating: 'Good',
          },
        }),
      );
    });
  });

  describe('recordTestResult (Eye Assessment sub-tests)', () => {
    it('rejects for a questionnaire-mode assessment', async () => {
      prisma.assessment.findUnique.mockResolvedValue({ id: 'a1', userId: 'user-1', status: 'IN_PROGRESS', type: 'LIFESTYLE' });

      await expect(
        service.recordTestResult('user-1', 'a1', { key: 'visualAcuity', value: 'Good' }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejects for a completed assessment', async () => {
      prisma.assessment.findUnique.mockResolvedValue({ id: 'eye-1', userId: 'user-1', status: 'COMPLETED', type: 'EYE' });

      await expect(
        service.recordTestResult('user-1', 'eye-1', { key: 'visualAcuity', value: 'Good' }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('upserts the result and returns it in testResults', async () => {
      prisma.assessment.findUnique.mockResolvedValue({ id: 'eye-1', userId: 'user-1', status: 'IN_PROGRESS', type: 'EYE' });
      prisma.mediaAsset.findMany.mockResolvedValue([]);
      prisma.questionnaireAnswer.findMany.mockResolvedValue([
        { questionKey: 'visualAcuity', answer: 'Good' },
      ]);

      const result = await service.recordTestResult('user-1', 'eye-1', { key: 'visualAcuity', value: 'Good' });

      expect(prisma.questionnaireAnswer.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { assessmentId_questionKey: { assessmentId: 'eye-1', questionKey: 'visualAcuity' } },
        }),
      );
      expect(result.testResults).toEqual({ visualAcuity: 'Good' });
    });

    it('folds test results into the AI reasoning input alongside images', async () => {
      prisma.assessment.findUnique.mockResolvedValue({ id: 'eye-1', userId: 'user-1', status: 'IN_PROGRESS', type: 'EYE' });
      prisma.aiPromptTemplate.findFirst.mockResolvedValue(null);
      prisma.mediaAsset.findMany.mockResolvedValue([
        { id: 'm1', storagePath: 'stub-path.jpg', mimeType: 'image/jpeg', captureLabel: 'center' },
      ]);
      prisma.questionnaireAnswer.findMany.mockResolvedValue([
        { questionKey: 'visualAcuity', answer: 'Good' },
        { questionKey: 'dryEyeQuestionnaire', answer: { score: 3 } },
      ]);
      prisma.wellnessSnapshot.findFirst.mockResolvedValue(null);
      aiProvider.reason.mockResolvedValue({
        score: 82,
        observations: [],
        recommendations: [],
        riskLevel: 'LOW',
        confidence: 65,
        disclaimer: 'Wellness only.',
      });

      await service.complete('user-1', 'eye-1');

      expect(aiProvider.reason).toHaveBeenCalledWith(
        expect.objectContaining({
          input: expect.objectContaining({
            visualAcuity: 'Good',
            dryEyeQuestionnaire: { score: 3 },
          }),
        }),
      );
    });
  });

  describe('Daily Pulse mode', () => {
    describe('start', () => {
      it('rejects mode: PULSE for a type with no configured pulse subset', async () => {
        await expect(service.start('user-1', 'LIFESTYLE', 'PULSE')).rejects.toBeInstanceOf(BadRequestException);
      });

      it('rejects mode: PULSE when the daily_pulse flag is off', async () => {
        featureFlags.isEnabled.mockResolvedValue(false);

        await expect(service.start('user-1', 'MENTAL_WELLNESS', 'PULSE')).rejects.toBeInstanceOf(NotFoundException);
      });

      it('looks up the in-progress row scoped to mode: PULSE, not just type/status', async () => {
        prisma.questionnaireDefinition.findFirst.mockResolvedValue(MENTAL_WELLNESS_DEFINITION);
        prisma.assessment.findFirst.mockResolvedValue(null);
        prisma.assessment.create.mockResolvedValue({ id: 'pulse-1', type: 'MENTAL_WELLNESS', status: 'IN_PROGRESS', mode: 'PULSE' });

        await service.start('user-1', 'MENTAL_WELLNESS', 'PULSE');

        expect(prisma.assessment.findFirst).toHaveBeenCalledWith({
          where: { userId: 'user-1', type: 'MENTAL_WELLNESS', status: 'IN_PROGRESS', mode: 'PULSE' },
        });
        expect(prisma.assessment.create).toHaveBeenCalledWith(
          expect.objectContaining({ data: expect.objectContaining({ mode: 'PULSE' }) }),
        );
      });

      it('a FULL row in progress does not block creating a PULSE row for the same type', async () => {
        // The mode-scoped findFirst simply finds nothing for PULSE, even
        // though a FULL row exists elsewhere in the real table — this is
        // exactly what the `mode` field in the where-clause guarantees.
        prisma.questionnaireDefinition.findFirst.mockResolvedValue(MENTAL_WELLNESS_DEFINITION);
        prisma.assessment.findFirst.mockResolvedValue(null);
        prisma.assessment.create.mockResolvedValue({ id: 'pulse-1', type: 'MENTAL_WELLNESS', status: 'IN_PROGRESS', mode: 'PULSE' });

        const result = await service.start('user-1', 'MENTAL_WELLNESS', 'PULSE');

        expect(result.mode).toBe('PULSE');
      });

      it('abandons a PULSE row IN_PROGRESS from a prior local day and starts fresh', async () => {
        jest.useFakeTimers().setSystemTime(new Date('2026-01-16T10:00:00.000Z'));
        prisma.questionnaireDefinition.findFirst.mockResolvedValue(MENTAL_WELLNESS_DEFINITION);
        prisma.assessment.findFirst.mockResolvedValue({
          id: 'stale-pulse',
          type: 'MENTAL_WELLNESS',
          status: 'IN_PROGRESS',
          mode: 'PULSE',
          startedAt: new Date('2026-01-15T09:00:00.000Z'), // yesterday, UTC
        });
        prisma.user.findUnique.mockResolvedValue({ timezone: 'UTC' });
        prisma.assessment.create.mockResolvedValue({ id: 'fresh-pulse', type: 'MENTAL_WELLNESS', status: 'IN_PROGRESS', mode: 'PULSE' });

        const result = await service.start('user-1', 'MENTAL_WELLNESS', 'PULSE');

        expect(prisma.assessment.update).toHaveBeenCalledWith({
          where: { id: 'stale-pulse' },
          data: { status: 'ABANDONED' },
        });
        expect(prisma.assessment.create).toHaveBeenCalled();
        expect(result.id).toBe('fresh-pulse');

        jest.useRealTimers();
      });

      it('resumes a PULSE row IN_PROGRESS from earlier today instead of abandoning it', async () => {
        jest.useFakeTimers().setSystemTime(new Date('2026-01-16T10:00:00.000Z'));
        prisma.questionnaireDefinition.findFirst.mockResolvedValue(MENTAL_WELLNESS_DEFINITION);
        prisma.assessment.findFirst.mockResolvedValue({
          id: 'todays-pulse',
          type: 'MENTAL_WELLNESS',
          status: 'IN_PROGRESS',
          mode: 'PULSE',
          startedAt: new Date('2026-01-16T02:00:00.000Z'), // earlier today, UTC
        });
        prisma.user.findUnique.mockResolvedValue({ timezone: 'UTC' });

        const result = await service.start('user-1', 'MENTAL_WELLNESS', 'PULSE');

        expect(prisma.assessment.update).not.toHaveBeenCalled();
        expect(prisma.assessment.create).not.toHaveBeenCalled();
        expect(result.id).toBe('todays-pulse');

        jest.useRealTimers();
      });

      it('exposes exactly the 5 curated pulse questions, not all 6', async () => {
        prisma.questionnaireDefinition.findFirst.mockResolvedValue(MENTAL_WELLNESS_DEFINITION);
        prisma.assessment.findFirst.mockResolvedValue(null);
        prisma.assessment.create.mockResolvedValue({ id: 'pulse-1', type: 'MENTAL_WELLNESS', status: 'IN_PROGRESS', mode: 'PULSE' });

        const result = await service.start('user-1', 'MENTAL_WELLNESS', 'PULSE');

        expect(result.questions.map((q) => q.key)).toEqual([
          'moodRating',
          'stressLevel',
          'sleepQuality',
          'socialConnection',
          'anxietyFrequency',
        ]);
      });
    });

    describe('isReadyToComplete — PULSE vs FULL regression guard', () => {
      it('PULSE is ready only once all 5 curated questions are answered', async () => {
        prisma.assessment.findUnique.mockResolvedValue({ id: 'pulse-1', userId: 'user-1', status: 'IN_PROGRESS', type: 'MENTAL_WELLNESS', mode: 'PULSE' });
        prisma.questionnaireDefinition.findFirst.mockResolvedValue(MENTAL_WELLNESS_DEFINITION);
        prisma.questionnaireAnswer.findMany.mockResolvedValue([
          { questionKey: 'moodRating', answer: 4 },
          { questionKey: 'stressLevel', answer: 'low' },
          { questionKey: 'sleepQuality', answer: 'good' },
          { questionKey: 'socialConnection', answer: 'often' },
        ]);

        const partial = await service.answerQuestion('user-1', 'pulse-1', { questionKey: 'socialConnection', answer: 'often' });
        expect(partial.isReadyToComplete).toBe(false);

        prisma.questionnaireAnswer.findMany.mockResolvedValue([
          { questionKey: 'moodRating', answer: 4 },
          { questionKey: 'stressLevel', answer: 'low' },
          { questionKey: 'sleepQuality', answer: 'good' },
          { questionKey: 'socialConnection', answer: 'often' },
          { questionKey: 'anxietyFrequency', answer: 'rarely' },
        ]);
        const complete = await service.answerQuestion('user-1', 'pulse-1', { questionKey: 'anxietyFrequency', answer: 'rarely' });
        expect(complete.isReadyToComplete).toBe(true);
      });

      it('regression guard: an otherwise-identical FULL assessment with the same 5 answers stays NOT ready', async () => {
        prisma.assessment.findUnique.mockResolvedValue({ id: 'full-1', userId: 'user-1', status: 'IN_PROGRESS', type: 'MENTAL_WELLNESS', mode: 'FULL' });
        prisma.questionnaireDefinition.findFirst.mockResolvedValue(MENTAL_WELLNESS_DEFINITION);
        prisma.questionnaireAnswer.findMany.mockResolvedValue([
          { questionKey: 'moodRating', answer: 4 },
          { questionKey: 'stressLevel', answer: 'low' },
          { questionKey: 'sleepQuality', answer: 'good' },
          { questionKey: 'socialConnection', answer: 'often' },
          { questionKey: 'anxietyFrequency', answer: 'rarely' },
        ]);

        const result = await service.answerQuestion('user-1', 'full-1', { questionKey: 'anxietyFrequency', answer: 'rarely' });

        expect(result.isReadyToComplete).toBe(false); // 5 of 6 required questions answered
        expect(result.questions).toHaveLength(6);
      });
    });

    describe('answerQuestion — pulse-key guard', () => {
      it('rejects an answer key outside the pulse set on a PULSE assessment', async () => {
        prisma.assessment.findUnique.mockResolvedValue({ id: 'pulse-1', userId: 'user-1', status: 'IN_PROGRESS', type: 'MENTAL_WELLNESS', mode: 'PULSE' });

        await expect(
          service.answerQuestion('user-1', 'pulse-1', { questionKey: 'copingConfidence', answer: 3 }),
        ).rejects.toBeInstanceOf(BadRequestException);
      });

      it('accepts a pulse-set key on a PULSE assessment', async () => {
        prisma.assessment.findUnique.mockResolvedValue({ id: 'pulse-1', userId: 'user-1', status: 'IN_PROGRESS', type: 'MENTAL_WELLNESS', mode: 'PULSE' });
        prisma.questionnaireDefinition.findFirst.mockResolvedValue(MENTAL_WELLNESS_DEFINITION);
        prisma.questionnaireAnswer.findMany.mockResolvedValue([{ questionKey: 'moodRating', answer: 4 }]);

        await expect(
          service.answerQuestion('user-1', 'pulse-1', { questionKey: 'moodRating', answer: 4 }),
        ).resolves.toBeDefined();
      });

      it('does not gate a FULL assessment by the pulse key set at all', async () => {
        prisma.assessment.findUnique.mockResolvedValue({ id: 'full-1', userId: 'user-1', status: 'IN_PROGRESS', type: 'MENTAL_WELLNESS', mode: 'FULL' });
        prisma.questionnaireDefinition.findFirst.mockResolvedValue(MENTAL_WELLNESS_DEFINITION);
        prisma.questionnaireAnswer.findMany.mockResolvedValue([{ questionKey: 'copingConfidence', answer: 3 }]);

        await expect(
          service.answerQuestion('user-1', 'full-1', { questionKey: 'copingConfidence', answer: 3 }),
        ).resolves.toBeDefined();
      });
    });

    describe('complete', () => {
      it('bypasses the AI pipeline entirely for a PULSE completion, marking the row COMPLETED with a zeroed placeholder result', async () => {
        prisma.assessment.findUnique.mockResolvedValue({ id: 'pulse-1', userId: 'user-1', status: 'IN_PROGRESS', type: 'MENTAL_WELLNESS', mode: 'PULSE' });

        const result = await service.complete('user-1', 'pulse-1');

        expect(prisma.assessment.update).toHaveBeenCalledWith({
          where: { id: 'pulse-1' },
          data: { status: 'COMPLETED', completedAt: expect.any(Date) },
        });
        expect(aiProvider.reason).not.toHaveBeenCalled();
        expect(result.assessmentId).toBe('pulse-1');
        expect(result.score).toBe(0);
      });

      it('does not touch ReportsService, Score/Recommendation rows, or the wellness snapshot for a PULSE completion — regression guard for the AI-pipeline bypass', async () => {
        prisma.assessment.findUnique.mockResolvedValue({ id: 'pulse-1', userId: 'user-1', status: 'IN_PROGRESS', type: 'MENTAL_WELLNESS', mode: 'PULSE' });

        await service.complete('user-1', 'pulse-1');

        expect(reportsService.generateForAssessment).not.toHaveBeenCalled();
        expect(reportsService.maybeGenerateWeeklyPulseRollup).not.toHaveBeenCalled();
        expect(prisma.score.create).not.toHaveBeenCalled();
        expect(prisma.wellnessSnapshot.create).not.toHaveBeenCalled();
      });

      it('still generates a per-completion report for a FULL completion — regression guard', async () => {
        prisma.assessment.findUnique.mockResolvedValue({ id: 'a1', userId: 'user-1', status: 'IN_PROGRESS', type: 'LIFESTYLE', mode: 'FULL' });
        prisma.questionnaireDefinition.findFirst.mockResolvedValue(LIFESTYLE_DEFINITION);
        prisma.aiPromptTemplate.findFirst.mockResolvedValue(null);
        prisma.questionnaireAnswer.findMany.mockResolvedValue([
          { questionKey: 'exerciseDays', answer: 3 },
          { questionKey: 'waterGlasses', answer: 6 },
        ]);
        prisma.wellnessSnapshot.findFirst.mockResolvedValue(null);
        aiProvider.reason.mockResolvedValue({
          score: 82,
          observations: [],
          recommendations: [],
          riskLevel: 'LOW',
          confidence: 88,
          disclaimer: 'Wellness only.',
        });

        await service.complete('user-1', 'a1');

        expect(reportsService.generateForAssessment).toHaveBeenCalledWith('user-1', 'a1');
        expect(reportsService.maybeGenerateWeeklyPulseRollup).not.toHaveBeenCalled();
      });

      it('still requires all 6 questions to complete a FULL Mental Wellness assessment', async () => {
        prisma.assessment.findUnique.mockResolvedValue({ id: 'full-1', userId: 'user-1', status: 'IN_PROGRESS', type: 'MENTAL_WELLNESS', mode: 'FULL' });
        prisma.questionnaireDefinition.findFirst.mockResolvedValue(MENTAL_WELLNESS_DEFINITION);
        prisma.aiPromptTemplate.findFirst.mockResolvedValue(null);
        prisma.questionnaireAnswer.findMany.mockResolvedValue([
          { questionKey: 'moodRating', answer: 4 },
          { questionKey: 'stressLevel', answer: 'low' },
          { questionKey: 'sleepQuality', answer: 'good' },
        ]);

        await expect(service.complete('user-1', 'full-1')).rejects.toBeInstanceOf(BadRequestException);
      });

      describe('support card', () => {
        const mwAnswers = (mood: number, anxiety: string) => [
          { questionKey: 'moodRating', answer: mood },
          { questionKey: 'stressLevel', answer: 'high' },
          { questionKey: 'sleepQuality', answer: 'poor' },
          { questionKey: 'socialConnection', answer: 'rarely' },
          { questionKey: 'anxietyFrequency', answer: anxiety },
          { questionKey: 'copingConfidence', answer: 2 },
        ];

        function arrange(answers: unknown[]) {
          prisma.assessment.findUnique.mockResolvedValue({ id: 'full-1', userId: 'user-1', status: 'IN_PROGRESS', type: 'MENTAL_WELLNESS', mode: 'FULL' });
          prisma.questionnaireDefinition.findFirst.mockResolvedValue(MENTAL_WELLNESS_DEFINITION);
          prisma.aiPromptTemplate.findFirst.mockResolvedValue(null);
          prisma.questionnaireAnswer.findMany.mockResolvedValue(answers);
          prisma.wellnessSnapshot.findFirst.mockResolvedValue(null);
          aiProvider.reason.mockResolvedValue({
            score: 55,
            observations: [],
            recommendations: [],
            riskLevel: 'MODERATE',
            confidence: 80,
            disclaimer: 'Wellness only.',
          });
        }

        it('returns supportCard: true for a severe answer set', async () => {
          arrange(mwAnswers(1, 'often'));
          const result = await service.complete('user-1', 'full-1');
          expect(result.supportCard).toBe(true);
        });

        it('omits supportCard for a mild answer set', async () => {
          arrange(mwAnswers(4, 'rarely'));
          const result = await service.complete('user-1', 'full-1');
          expect(result.supportCard).toBeUndefined();
        });
      });
    });
  });
});
