import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { UserRole } from '@prisma/client';

import { ROLES_KEY } from '../auth/decorators/roles.decorator';
import { RolesGuard } from '../auth/guards/roles.guard';
import { PrismaService } from '../prisma/prisma.service';
import { STORAGE_PROVIDER } from '../storage/storage-provider.interface';
import { MediaRetentionController } from './media-retention.controller';
import { MEDIA_RETENTION_DAYS, MediaRetentionService } from './media-retention.service';

const NOW = new Date('2026-11-01T12:00:00.000Z');
const DAY = 24 * 60 * 60 * 1000;

describe('MediaRetentionService', () => {
  let service: MediaRetentionService;
  let prisma: { mediaAsset: Record<string, jest.Mock> };
  let storage: { delete: jest.Mock };

  beforeEach(async () => {
    prisma = {
      mediaAsset: {
        findMany: jest
          .fn()
          .mockResolvedValueOnce([
            { id: 'm1', storagePath: 'p1.jpg' },
            { id: 'm2', storagePath: 'p2.webm' },
          ])
          .mockResolvedValue([]),
        deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
    };
    storage = { delete: jest.fn().mockResolvedValue(undefined) };

    const moduleRef = await Test.createTestingModule({
      providers: [
        MediaRetentionService,
        { provide: PrismaService, useValue: prisma },
        { provide: STORAGE_PROVIDER, useValue: storage },
      ],
    }).compile();
    service = moduleRef.get(MediaRetentionService);
  });

  describe('purgeExpiredMedia', () => {
    it('uses a 30-day cutoff measured from the fixed clock, on completed assessments only', async () => {
      await service.purgeExpiredMedia(NOW);

      expect(MEDIA_RETENTION_DAYS).toBe(30);
      const args = prisma.mediaAsset.findMany.mock.calls[0][0] as {
        where: { assessment: { status: string; completedAt: { lt: Date } } };
      };
      expect(args.where.assessment.status).toBe('COMPLETED');
      expect(args.where.assessment.completedAt.lt).toEqual(new Date(NOW.getTime() - 30 * DAY));
    });

    it('deletes the stored object and then the row for each expired asset', async () => {
      const result = await service.purgeExpiredMedia(NOW);

      expect(result).toEqual({ deleted: 2, failed: 0 });
      expect(storage.delete).toHaveBeenCalledWith('p1.jpg');
      expect(storage.delete).toHaveBeenCalledWith('p2.webm');
      expect(prisma.mediaAsset.deleteMany).toHaveBeenCalledWith({ where: { id: 'm1' } });
      expect(prisma.mediaAsset.deleteMany).toHaveBeenCalledWith({ where: { id: 'm2' } });
    });

    it('never touches scores, reports or assessments (only media_assets rows)', async () => {
      await service.purgeExpiredMedia(NOW);

      // The only Prisma model the service has access to in this test is mediaAsset;
      // any other model access would throw on undefined.
      expect(Object.keys(prisma)).toEqual(['mediaAsset']);
      expect(Object.keys(prisma.mediaAsset).sort()).toEqual(['deleteMany', 'findMany']);
    });

    it('keeps the row, and retries next run, when the stored object cannot be deleted', async () => {
      storage.delete.mockRejectedValueOnce(new Error('boom'));

      const result = await service.purgeExpiredMedia(NOW);

      expect(result).toEqual({ deleted: 1, failed: 1 });
      expect(prisma.mediaAsset.deleteMany).toHaveBeenCalledTimes(1);
      expect(prisma.mediaAsset.deleteMany).toHaveBeenCalledWith({ where: { id: 'm2' } });
    });

    it('is idempotent: a second run with nothing left deletes nothing', async () => {
      await service.purgeExpiredMedia(NOW);
      storage.delete.mockClear();
      prisma.mediaAsset.deleteMany.mockClear();

      const second = await service.purgeExpiredMedia(NOW);

      expect(second).toEqual({ deleted: 0, failed: 0 });
      expect(storage.delete).not.toHaveBeenCalled();
      expect(prisma.mediaAsset.deleteMany).not.toHaveBeenCalled();
    });

    it('pages through batches, continuing after the last id seen', async () => {
      prisma.mediaAsset.findMany.mockReset();
      prisma.mediaAsset.findMany
        .mockResolvedValueOnce([{ id: 'a', storagePath: 'a' }])
        .mockResolvedValueOnce([{ id: 'b', storagePath: 'b' }])
        .mockResolvedValue([]);

      const result = await service.purgeExpiredMedia(NOW);

      expect(result.deleted).toBe(2);
      expect(prisma.mediaAsset.findMany.mock.calls[1][0]).toEqual(
        expect.objectContaining({ where: expect.objectContaining({ id: { gt: 'a' } }) }),
      );
    });
  });
});

describe('MediaRetentionController', () => {
  function contextFor(role: UserRole): ExecutionContext {
    return {
      // eslint-disable-next-line @typescript-eslint/unbound-method -- only read for its metadata
      getHandler: () => MediaRetentionController.prototype.purge,
      getClass: () => MediaRetentionController,
      switchToHttp: () => ({ getRequest: () => ({ user: { id: 'u1', email: 'a@b.test', role } }) }),
    } as unknown as ExecutionContext;
  }

  it('is restricted to ADMIN', () => {
    expect(Reflect.getMetadata(ROLES_KEY, MediaRetentionController)).toEqual([UserRole.ADMIN]);
  });

  it('lets an ADMIN through and rejects USER and SUPPORT', () => {
    const guard = new RolesGuard(new Reflector());
    expect(guard.canActivate(contextFor(UserRole.ADMIN))).toBe(true);
    expect(() => guard.canActivate(contextFor(UserRole.USER))).toThrow(ForbiddenException);
    expect(() => guard.canActivate(contextFor(UserRole.SUPPORT))).toThrow(ForbiddenException);
  });

  it('runs the purge', async () => {
    const retention = { purgeExpiredMedia: jest.fn().mockResolvedValue({ deleted: 3, failed: 0 }) };
    const controller = new MediaRetentionController(retention as never);

    await expect(controller.purge()).resolves.toEqual({ deleted: 3, failed: 0 });
  });
});
