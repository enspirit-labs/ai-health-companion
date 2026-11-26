import { Test } from '@nestjs/testing';

import { PrismaService } from '../prisma/prisma.service';
import { HealthProfileService } from './health-profile.service';

describe('HealthProfileService', () => {
  let service: HealthProfileService;
  let prisma: { healthProfile: Record<string, jest.Mock> };

  beforeEach(async () => {
    prisma = {
      healthProfile: {
        findUnique: jest.fn(),
        upsert: jest.fn(),
      },
    };

    const moduleRef = await Test.createTestingModule({
      providers: [HealthProfileService, { provide: PrismaService, useValue: prisma }],
    }).compile();

    service = moduleRef.get(HealthProfileService);
  });

  describe('getForUser', () => {
    it('reports the first question as next when no profile exists', async () => {
      prisma.healthProfile.findUnique.mockResolvedValue(null);

      const result = await service.getForUser('user-1');

      expect(result.profile).toBeNull();
      expect(result.isComplete).toBe(false);
      expect(result.nextQuestion).toBe('age');
    });

    it('does not mistake a false/default value for an answered question', async () => {
      // smoking defaults to `false` at the DB level; if answeredQuestionKeys
      // is empty, that must NOT be read as "smoking has been answered".
      prisma.healthProfile.findUnique.mockResolvedValue({
        smoking: false,
        alcohol: false,
        existingConditions: [],
        answeredQuestionKeys: ['age'],
      });

      const result = await service.getForUser('user-1');

      expect(result.nextQuestion).toBe('gender');
      expect(result.isComplete).toBe(false);
    });
  });

  describe('upsertAnswer', () => {
    it('creates a new profile on the first answer and tracks the answered key', async () => {
      prisma.healthProfile.findUnique.mockResolvedValue(null);
      prisma.healthProfile.upsert.mockImplementation(({ create }: any) =>
        Promise.resolve({ ...create, answeredQuestionKeys: create.answeredQuestionKeys }),
      );

      const result = await service.upsertAnswer('user-1', { age: 30 });

      expect(prisma.healthProfile.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { userId: 'user-1' },
          create: expect.objectContaining({ userId: 'user-1', age: 30, answeredQuestionKeys: ['age'] }),
        }),
      );
      expect(result.nextQuestion).toBe('gender');
    });

    it('accumulates answered keys across multiple calls', async () => {
      prisma.healthProfile.findUnique.mockResolvedValue({ answeredQuestionKeys: ['age'] });
      prisma.healthProfile.upsert.mockImplementation(({ update }: any) =>
        Promise.resolve({ ...update, answeredQuestionKeys: update.answeredQuestionKeys }),
      );

      const result = await service.upsertAnswer('user-1', { gender: 'FEMALE' });

      expect(prisma.healthProfile.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          update: expect.objectContaining({ answeredQuestionKeys: ['age', 'gender'] }),
        }),
      );
      expect(result.nextQuestion).toBe('heightCm');
    });

    it('flattens emergencyContact into individual columns', async () => {
      prisma.healthProfile.findUnique.mockResolvedValue({
        answeredQuestionKeys: [
          'age',
          'gender',
          'heightCm',
          'weightKg',
          'bloodGroup',
          'exerciseLevel',
          'dietType',
          'sleepHours',
          'smoking',
          'alcohol',
          'existingConditions',
          'medications',
          'allergies',
        ],
      });
      prisma.healthProfile.upsert.mockImplementation(({ update }: any) =>
        Promise.resolve({ ...update, answeredQuestionKeys: update.answeredQuestionKeys }),
      );

      const result = await service.upsertAnswer('user-1', {
        emergencyContact: { name: 'Alex', relationship: 'Sibling', phone: '+15551234567' },
      });

      expect(prisma.healthProfile.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          update: expect.objectContaining({
            emergencyContactName: 'Alex',
            emergencyContactRelationship: 'Sibling',
            emergencyContactPhone: '+15551234567',
          }),
        }),
      );
      expect(result.isComplete).toBe(true);
      expect(result.nextQuestion).toBeNull();
    });
  });
});
