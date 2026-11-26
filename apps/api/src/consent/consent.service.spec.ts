import { ForbiddenException } from '@nestjs/common';
import { Test } from '@nestjs/testing';

import { PrismaService } from '../prisma/prisma.service';
import { ConsentService } from './consent.service';

describe('ConsentService', () => {
  let service: ConsentService;
  let prisma: { consentRecord: Record<string, jest.Mock> };

  beforeEach(async () => {
    prisma = {
      consentRecord: {
        findFirst: jest.fn(),
        create: jest.fn(),
      },
    };

    const moduleRef = await Test.createTestingModule({
      providers: [ConsentService, { provide: PrismaService, useValue: prisma }],
    }).compile();

    service = moduleRef.get(ConsentService);
  });

  describe('getStatus', () => {
    it('reports both camera and microphone as ungranted when no consent record exists', async () => {
      prisma.consentRecord.findFirst.mockResolvedValue(null);

      const result = await service.getStatus('user-1');

      expect(result).toEqual({ camera: false, microphone: false, aiProcessing: false });
    });

    it('reflects the most recent record per type', async () => {
      prisma.consentRecord.findFirst.mockImplementation(({ where }: { where: { type: string } }) =>
        Promise.resolve(where.type === 'CAMERA' ? { granted: true } : { granted: false }),
      );

      const result = await service.getStatus('user-1');

      expect(result).toEqual({ camera: true, microphone: false, aiProcessing: false });
    });

    it('scopes both lookups to the requesting user', async () => {
      prisma.consentRecord.findFirst.mockResolvedValue(null);

      await service.getStatus('user-1');

      for (const call of prisma.consentRecord.findFirst.mock.calls) {
        expect(call[0].where.userId).toBe('user-1');
      }
    });

    it('orders each lookup by createdAt desc so an older grant does not override a newer revocation', async () => {
      prisma.consentRecord.findFirst.mockResolvedValue(null);

      await service.getStatus('user-1');

      for (const call of prisma.consentRecord.findFirst.mock.calls) {
        expect(call[0].orderBy).toEqual({ createdAt: 'desc' });
      }
    });
  });

  describe('aiProcessing (DATA_PROCESSING)', () => {
    const dp = (granted: boolean, iso: string) =>
      prisma.consentRecord.findFirst.mockImplementation(({ where }: { where: { type: string } }) =>
        Promise.resolve(where.type === 'DATA_PROCESSING' ? { granted, createdAt: new Date(iso) } : null),
      );

    it('does not count a grant from before 2026-10-27 (the old signup auto-grant)', async () => {
      dp(true, '2026-10-26T23:59:59.999Z');
      expect((await service.getStatus('user-1')).aiProcessing).toBe(false);
    });

    it('counts a grant created exactly at the valid-from instant or later', async () => {
      dp(true, '2026-10-27T00:00:00.000Z');
      expect((await service.getStatus('user-1')).aiProcessing).toBe(true);
      dp(true, '2027-01-05T10:00:00.000Z');
      expect((await service.getStatus('user-1')).aiProcessing).toBe(true);
    });

    it('is false after a withdrawal, however recent', async () => {
      dp(false, '2027-01-05T10:00:00.000Z');
      expect((await service.getStatus('user-1')).aiProcessing).toBe(false);
    });

    it('requireConsent(AI_PROCESSING) throws CONSENT_REQUIRED_AI_PROCESSING for a stale grant and passes for a current one', async () => {
      dp(true, '2026-10-01T00:00:00.000Z');
      await expect(service.requireConsent('user-1', 'AI_PROCESSING')).rejects.toMatchObject({
        status: 403,
        response: { code: 'CONSENT_REQUIRED_AI_PROCESSING' },
      });
      dp(true, '2026-11-01T00:00:00.000Z');
      await expect(service.requireConsent('user-1', 'AI_PROCESSING')).resolves.toBeUndefined();
    });

    it('recordConsent(DATA_PROCESSING) appends a record and reports the new status', async () => {
      prisma.consentRecord.create.mockResolvedValue({});
      dp(false, '2026-11-01T00:00:00.000Z');
      const result = await service.recordConsent('user-1', 'DATA_PROCESSING', false, {});
      expect(prisma.consentRecord.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ userId: 'user-1', type: 'DATA_PROCESSING', granted: false }),
      });
      expect(result.aiProcessing).toBe(false);
    });
  });

  describe('requireConsent', () => {
    it.each(['CAMERA', 'MICROPHONE'] as const)('throws 403 with a stable code when %s was never granted', async (type) => {
      prisma.consentRecord.findFirst.mockResolvedValue(null);
      await expect(service.requireConsent('user-1', type)).rejects.toMatchObject({
        status: 403,
        response: { code: `CONSENT_REQUIRED_${type}` },
      });
    });

    it('throws when the latest record is a withdrawal', async () => {
      prisma.consentRecord.findFirst.mockResolvedValue({ granted: false });
      await expect(service.requireConsent('user-1', 'CAMERA')).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('resolves when the latest record is granted, looking up newest first for this user and type', async () => {
      prisma.consentRecord.findFirst.mockResolvedValue({ granted: true });
      await expect(service.requireConsent('user-1', 'MICROPHONE')).resolves.toBeUndefined();
      expect(prisma.consentRecord.findFirst).toHaveBeenCalledWith({
        where: { userId: 'user-1', type: 'MICROPHONE' },
        orderBy: { createdAt: 'desc' },
      });
    });
  });

  describe('recordConsent', () => {
    it('appends a new record rather than mutating an existing one (audit trail)', async () => {
      prisma.consentRecord.create.mockResolvedValue({});
      prisma.consentRecord.findFirst.mockResolvedValue({ granted: true });

      await service.recordConsent('user-1', 'CAMERA', true, {
        ipAddress: '127.0.0.1',
        userAgent: 'jest',
      });

      expect(prisma.consentRecord.create).toHaveBeenCalledWith({
        data: {
          userId: 'user-1',
          type: 'CAMERA',
          granted: true,
          ipAddress: '127.0.0.1',
          userAgent: 'jest',
        },
      });
    });

    it('returns the recomputed status after recording, not a stale snapshot', async () => {
      prisma.consentRecord.create.mockResolvedValue({});
      prisma.consentRecord.findFirst.mockImplementation(({ where }: { where: { type: string } }) =>
        Promise.resolve(where.type === 'CAMERA' ? { granted: true } : null),
      );

      const result = await service.recordConsent('user-1', 'CAMERA', true, {});

      expect(result).toEqual({ camera: true, microphone: false, aiProcessing: false });
    });

    it('revokes consent by recording a granted:false record rather than deleting history', async () => {
      prisma.consentRecord.create.mockResolvedValue({});
      prisma.consentRecord.findFirst.mockResolvedValue(null);

      await service.recordConsent('user-1', 'MICROPHONE', false, {});

      expect(prisma.consentRecord.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ granted: false }) }),
      );
    });
  });
});
