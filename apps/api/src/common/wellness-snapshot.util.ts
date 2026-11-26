import { ASSESSMENT_TYPES, type AssessmentType, type LatestTypeScore } from '@aidoctor/shared';

import { PrismaService } from '../prisma/prisma.service';

// Prisma's `in` filter wants a mutable array. Scoping to known types also keeps
// rows whose `type` predates the current enum from ever being deserialized.
const KNOWN_ASSESSMENT_TYPES: AssessmentType[] = [...ASSESSMENT_TYPES];

export function findLatestWellnessSnapshot(prisma: PrismaService, userId: string) {
  return prisma.wellnessSnapshot.findFirst({
    where: { userId },
    orderBy: { capturedAt: 'desc' },
  });
}

export interface LatestTypeScoreRow extends LatestTypeScore {
  completedAt: Date | null;
}

/**
 * The most recent scored FULL completion of each assessment type, newest
 * first. This is the only input the dashboard summary needs. PULSE check-ins
 * have no Score row, so the `score: { isNot: null }` filter leaves them out
 * on its own, and `mode` is filtered as well to make that explicit.
 */
export async function findLatestScoresByType(prisma: PrismaService, userId: string): Promise<LatestTypeScoreRow[]> {
  const rows = await prisma.assessment.findMany({
    where: {
      userId,
      status: 'COMPLETED',
      mode: 'FULL',
      type: { in: KNOWN_ASSESSMENT_TYPES },
      score: { isNot: null },
    },
    orderBy: { completedAt: 'desc' },
    distinct: ['type'],
    select: { type: true, completedAt: true, score: { select: { value: true } } },
  });

  return rows
    .filter((r): r is typeof r & { score: { value: number } } => r.score !== null)
    .map((r) => ({ type: r.type, score: r.score.value, completedAt: r.completedAt }));
}
