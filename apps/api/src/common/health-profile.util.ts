import { PrismaService } from '../prisma/prisma.service';

export async function hasHealthProfile(prisma: PrismaService, userId: string): Promise<boolean> {
  const count = await prisma.healthProfile.count({ where: { userId } });
  return count > 0;
}
