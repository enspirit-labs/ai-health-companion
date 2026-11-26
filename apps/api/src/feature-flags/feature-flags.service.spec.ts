import { Test } from '@nestjs/testing';

import { PrismaService } from '../prisma/prisma.service';
import { FeatureFlagsService } from './feature-flags.service';

describe('FeatureFlagsService', () => {
  let service: FeatureFlagsService;
  let prisma: { featureFlag: Record<string, jest.Mock> };

  beforeEach(async () => {
    prisma = { featureFlag: { findUnique: jest.fn() } };

    const moduleRef = await Test.createTestingModule({
      providers: [FeatureFlagsService, { provide: PrismaService, useValue: prisma }],
    }).compile();

    service = moduleRef.get(FeatureFlagsService);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('isEnabled', () => {
    it('returns true when the flag row is enabled', async () => {
      prisma.featureFlag.findUnique.mockResolvedValue({ key: 'daily_pulse', enabled: true });

      expect(await service.isEnabled('daily_pulse')).toBe(true);
    });

    it('returns false when the flag row is explicitly disabled', async () => {
      prisma.featureFlag.findUnique.mockResolvedValue({ key: 'daily_pulse', enabled: false });

      expect(await service.isEnabled('daily_pulse')).toBe(false);
    });

    it('fails closed (false) when the flag row does not exist at all', async () => {
      prisma.featureFlag.findUnique.mockResolvedValue(null);

      expect(await service.isEnabled('some_flag_never_seeded')).toBe(false);
    });

    it('caches a read — a second call within the TTL issues no second query', async () => {
      prisma.featureFlag.findUnique.mockResolvedValue({ key: 'daily_pulse', enabled: true });

      await service.isEnabled('daily_pulse');
      await service.isEnabled('daily_pulse');

      expect(prisma.featureFlag.findUnique).toHaveBeenCalledTimes(1);
    });

    it('re-queries after the cache TTL expires', async () => {
      jest.useFakeTimers();
      prisma.featureFlag.findUnique.mockResolvedValue({ key: 'daily_pulse', enabled: true });

      await service.isEnabled('daily_pulse');
      jest.advanceTimersByTime(31_000); // TTL is 30s
      await service.isEnabled('daily_pulse');

      expect(prisma.featureFlag.findUnique).toHaveBeenCalledTimes(2);
    });

    it('picks up a toggle once the cache expires', async () => {
      jest.useFakeTimers();
      prisma.featureFlag.findUnique.mockResolvedValueOnce({ key: 'daily_pulse', enabled: false });
      expect(await service.isEnabled('daily_pulse')).toBe(false);

      jest.advanceTimersByTime(31_000);
      prisma.featureFlag.findUnique.mockResolvedValueOnce({ key: 'daily_pulse', enabled: true });
      expect(await service.isEnabled('daily_pulse')).toBe(true);
    });
  });

  describe('getAll', () => {
    it('returns every flag by key', async () => {
      prisma.featureFlag.findUnique.mockImplementation(({ where: { key } }: { where: { key: string } }) =>
        Promise.resolve({ key, enabled: key === 'daily_pulse' || key === 'assessment_tongue' }),
      );

      expect(await service.getAll()).toEqual({
        dailyPulse: true,
        slackReminders: false,
        assessmentVoice: false,
        assessmentTongue: true,
      });
    });

    it('reports the assessment flags as off when their rows are missing', async () => {
      prisma.featureFlag.findUnique.mockResolvedValue(null);

      expect(await service.getAll()).toMatchObject({ assessmentVoice: false, assessmentTongue: false });
    });
  });

  describe('isAssessmentTypeEnabled', () => {
    it('fails closed for a gated type with no flag row', async () => {
      prisma.featureFlag.findUnique.mockResolvedValue(null);

      expect(await service.isAssessmentTypeEnabled('VOICE')).toBe(false);
      expect(prisma.featureFlag.findUnique).toHaveBeenCalledWith({ where: { key: 'assessment_voice' } });
    });

    it('is true for a gated type whose flag is enabled', async () => {
      prisma.featureFlag.findUnique.mockResolvedValue({ key: 'assessment_tongue', enabled: true });

      expect(await service.isAssessmentTypeEnabled('TONGUE')).toBe(true);
    });

    it('is always true for an ungated type, without a query', async () => {
      expect(await service.isAssessmentTypeEnabled('SQUATS')).toBe(true);
      expect(prisma.featureFlag.findUnique).not.toHaveBeenCalled();
    });
  });

  describe('invalidate', () => {
    it('forces the next isEnabled to re-query instead of trusting the cache', async () => {
      prisma.featureFlag.findUnique.mockResolvedValueOnce({ key: 'daily_pulse', enabled: false });
      expect(await service.isEnabled('daily_pulse')).toBe(false);

      service.invalidate('daily_pulse');

      prisma.featureFlag.findUnique.mockResolvedValueOnce({ key: 'daily_pulse', enabled: true });
      expect(await service.isEnabled('daily_pulse')).toBe(true);
      expect(prisma.featureFlag.findUnique).toHaveBeenCalledTimes(2);
    });

    it('is a no-op for a key that was never cached', () => {
      expect(() => service.invalidate('never_read')).not.toThrow();
    });
  });
});
