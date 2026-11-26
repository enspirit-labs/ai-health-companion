import { hasHealthProfile } from './health-profile.util';

describe('hasHealthProfile', () => {
  function mockPrisma(count: number) {
    return { healthProfile: { count: jest.fn().mockResolvedValue(count) } };
  }

  it('returns true when a health profile exists', async () => {
    const prisma = mockPrisma(1);
    await expect(hasHealthProfile(prisma as never, 'user-1')).resolves.toBe(true);
    expect(prisma.healthProfile.count).toHaveBeenCalledWith({ where: { userId: 'user-1' } });
  });

  it('returns false when no health profile exists', async () => {
    const prisma = mockPrisma(0);
    await expect(hasHealthProfile(prisma as never, 'user-1')).resolves.toBe(false);
  });
});
