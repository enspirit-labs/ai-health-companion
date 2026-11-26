import { BadRequestException, ForbiddenException, InternalServerErrorException, NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';

import { AUTH_PROVIDER } from '../auth/providers/auth-provider.interface';
import { PrismaService } from '../prisma/prisma.service';
import { STORAGE_PROVIDER } from '../storage/storage-provider.interface';
import { DataRightsService } from './data-rights.service';

describe('DataRightsService', () => {
  let service: DataRightsService;
  let prisma: {
    user: Record<string, jest.Mock>;
    mediaAsset: Record<string, jest.Mock>;
    report: Record<string, jest.Mock>;
    activityLog: Record<string, jest.Mock>;
    $transaction: jest.Mock;
    [model: string]: Record<string, jest.Mock> | jest.Mock;
  };
  let storage: { delete: jest.Mock };
  let authProvider: { verifyCredential: jest.Mock; deleteCredential: jest.Mock };

  const emailUser = {
    id: 'user-a',
    email: 'a@example.test',
    passwordHash: 'hash',
    supabaseAuthId: null,
    authProvider: 'EMAIL',
  };

  beforeEach(async () => {
    prisma = {
      user: { findUnique: jest.fn().mockResolvedValue(emailUser), delete: jest.fn().mockReturnValue('user-delete-op') },
      mediaAsset: { findMany: jest.fn().mockResolvedValue([{ storagePath: 'a-1.jpg' }, { storagePath: 'a-2.webm' }]) },
      report: { findMany: jest.fn().mockResolvedValue([{ pdfStoragePath: 'a-report.pdf' }]) },
      activityLog: { deleteMany: jest.fn().mockReturnValue('log-delete-op') },
      $transaction: jest.fn().mockResolvedValue([{ count: 3 }, {}]),
    };
    storage = { delete: jest.fn().mockResolvedValue(undefined) };
    authProvider = {
      verifyCredential: jest.fn().mockResolvedValue(true),
      deleteCredential: jest.fn().mockResolvedValue(undefined),
    };

    const moduleRef = await Test.createTestingModule({
      providers: [
        DataRightsService,
        { provide: PrismaService, useValue: prisma },
        { provide: STORAGE_PROVIDER, useValue: storage },
        { provide: AUTH_PROVIDER, useValue: authProvider },
      ],
    }).compile();
    service = moduleRef.get(DataRightsService);
  });

  describe('deleteAccount', () => {
    it('deletes every stored object, the activity logs and the user row, scoped to the caller', async () => {
      await service.deleteAccount('user-a', { confirmation: 'DELETE', password: 'pw' });

      expect(storage.delete).toHaveBeenCalledTimes(3);
      expect(storage.delete).toHaveBeenCalledWith('a-1.jpg');
      expect(storage.delete).toHaveBeenCalledWith('a-2.webm');
      expect(storage.delete).toHaveBeenCalledWith('a-report.pdf');
      expect(prisma.mediaAsset.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { assessment: { userId: 'user-a' } } }),
      );
      expect(prisma.report.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ userId: 'user-a' }) }),
      );
      expect(prisma.activityLog.deleteMany).toHaveBeenCalledWith({ where: { userId: 'user-a' } });
      expect(prisma.user.delete).toHaveBeenCalledWith({ where: { id: 'user-a' } });
      expect(prisma.$transaction).toHaveBeenCalledWith(['log-delete-op', 'user-delete-op']);
      expect(authProvider.deleteCredential).toHaveBeenCalledWith({ externalId: null, email: 'a@example.test' });
    });

    it('only ever touches the calling user: user B is never queried or deleted', async () => {
      await service.deleteAccount('user-a', { confirmation: 'DELETE', password: 'pw' });

      const calls = JSON.stringify([
        prisma.user.findUnique.mock.calls,
        prisma.user.delete.mock.calls,
        prisma.mediaAsset.findMany.mock.calls,
        prisma.report.findMany.mock.calls,
        prisma.activityLog.deleteMany.mock.calls,
      ]);
      expect(calls).toContain('user-a');
      expect(calls).not.toContain('user-b');
    });

    it('rejects a wrong password with 403 and deletes nothing', async () => {
      authProvider.verifyCredential.mockResolvedValue(false);

      await expect(service.deleteAccount('user-a', { confirmation: 'DELETE', password: 'nope' })).rejects.toBeInstanceOf(
        ForbiddenException,
      );
      expect(storage.delete).not.toHaveBeenCalled();
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('requires a password for a password account', async () => {
      await expect(service.deleteAccount('user-a', { confirmation: 'DELETE' })).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('accepts the typed confirmation alone for an account without a password', async () => {
      prisma.user.findUnique.mockResolvedValue({ ...emailUser, authProvider: 'GOOGLE', passwordHash: null });

      await service.deleteAccount('user-a', { confirmation: 'DELETE' });

      expect(authProvider.verifyCredential).not.toHaveBeenCalled();
      expect(prisma.$transaction).toHaveBeenCalled();
    });

    it('aborts without removing any row if a stored object cannot be deleted', async () => {
      storage.delete.mockRejectedValueOnce(new Error('boom'));

      await expect(service.deleteAccount('user-a', { confirmation: 'DELETE', password: 'pw' })).rejects.toBeInstanceOf(
        InternalServerErrorException,
      );
      expect(prisma.$transaction).not.toHaveBeenCalled();
      expect(authProvider.deleteCredential).not.toHaveBeenCalled();
    });

    it('still succeeds when the external credential cleanup fails', async () => {
      authProvider.deleteCredential.mockRejectedValue(new Error('supabase down'));

      await expect(service.deleteAccount('user-a', { confirmation: 'DELETE', password: 'pw' })).resolves.toEqual({
        message: expect.any(String),
      });
    });

    it('returns 404 for a user that no longer exists', async () => {
      prisma.user.findUnique.mockResolvedValue(null);

      await expect(service.deleteAccount('ghost', { confirmation: 'DELETE', password: 'pw' })).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  describe('exportData', () => {
    const exportModels = [
      'healthProfile',
      'consentRecord',
      'assessment',
      'report',
      'chatSession',
      'userGoal',
      'weeklyActionCompletion',
      'wellnessSnapshot',
      'feedback',
      'activityLog',
    ];

    beforeEach(() => {
      prisma.user.findUnique.mockResolvedValue({ id: 'user-a', email: 'a@example.test', fullName: 'A' });
      for (const model of exportModels) {
        prisma[model] = {
          findMany: jest.fn().mockResolvedValue([]),
          findUnique: jest.fn().mockResolvedValue(null),
        };
      }
      (prisma.chatSession as Record<string, jest.Mock>).findMany.mockResolvedValue([
        { id: 'c1', title: null, createdAt: new Date(), messages: [{ role: 'USER', content: 'hi', createdAt: new Date() }] },
      ]);
    });

    it('returns the profile, consents, assessments, reports and chat in one object', async () => {
      const result = await service.exportData('user-a');

      expect(result).toEqual(
        expect.objectContaining({
          user: expect.objectContaining({ id: 'user-a' }),
          consents: [],
          assessments: [],
          reports: [],
          chatSessions: [expect.objectContaining({ id: 'c1' })],
        }),
      );
    });

    it('scopes every query to the caller and never reads another user', async () => {
      await service.exportData('user-a');

      expect(prisma.user.findUnique).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'user-a' } }));
      for (const model of exportModels) {
        const m = prisma[model] as Record<string, jest.Mock>;
        const calls = [...m.findMany.mock.calls, ...m.findUnique.mock.calls];
        expect(calls.length).toBeGreaterThan(0);
        for (const [args] of calls as [{ where: { userId?: string } }][]) {
          expect(args.where.userId).toBe('user-a');
        }
      }
    });

    it('selects no secrets: no password hash, tokens, share tokens or storage paths', async () => {
      await service.exportData('user-a');

      const userSelect = (prisma.user.findUnique.mock.calls[0] as [{ select: Record<string, boolean> }])[0].select;
      expect(userSelect).not.toHaveProperty('passwordHash');
      expect(userSelect).not.toHaveProperty('supabaseAuthId');
      const everything = JSON.stringify(
        exportModels.map((m) => [
          (prisma[m] as Record<string, jest.Mock>).findMany.mock.calls,
          (prisma[m] as Record<string, jest.Mock>).findUnique.mock.calls,
        ]),
      );
      expect(everything).not.toMatch(/shareToken|storagePath|pdfStoragePath|passwordHash|tokenHash/);
    });

    it('returns 404 for a user that no longer exists', async () => {
      prisma.user.findUnique.mockResolvedValue(null);

      await expect(service.exportData('ghost')).rejects.toBeInstanceOf(NotFoundException);
    });
  });
});
