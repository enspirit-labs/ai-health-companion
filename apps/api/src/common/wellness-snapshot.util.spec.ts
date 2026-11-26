import { findLatestScoresByType, findLatestWellnessSnapshot } from './wellness-snapshot.util';

describe('findLatestWellnessSnapshot', () => {
  it('queries the latest snapshot by capturedAt desc for the given user', async () => {
    const findFirst = jest.fn().mockResolvedValue({ id: 'snap-1' });
    const prisma = { wellnessSnapshot: { findFirst } } as never;

    await expect(findLatestWellnessSnapshot(prisma, 'user-1')).resolves.toEqual({ id: 'snap-1' });
    expect(findFirst).toHaveBeenCalledWith({
      where: { userId: 'user-1' },
      orderBy: { capturedAt: 'desc' },
    });
  });
});

describe('findLatestScoresByType', () => {
  it('takes the newest scored FULL completion of each type for the given user', async () => {
    const completedAt = new Date('2026-11-19T04:40:00.000Z');
    const findMany = jest.fn().mockResolvedValue([{ type: 'FACE', completedAt, score: { value: 72 } }]);
    const prisma = { assessment: { findMany } } as never;

    await expect(findLatestScoresByType(prisma, 'user-1')).resolves.toEqual([
      { type: 'FACE', score: 72, completedAt },
    ]);
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ userId: 'user-1', status: 'COMPLETED', mode: 'FULL', score: { isNot: null } }),
        orderBy: { completedAt: 'desc' },
        distinct: ['type'],
      }),
    );
  });

  it('drops a row whose score is missing', async () => {
    const findMany = jest.fn().mockResolvedValue([{ type: 'SKIN', completedAt: new Date(), score: null }]);
    const prisma = { assessment: { findMany } } as never;

    await expect(findLatestScoresByType(prisma, 'user-1')).resolves.toEqual([]);
  });
});
