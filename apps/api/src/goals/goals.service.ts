import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { MAX_ACTIVE_GOALS, type PersonalGoal, type UserGoals } from '@aidoctor/shared';

import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class GoalsService {
  constructor(private readonly prisma: PrismaService) {}

  /** Active goals in the order the user chose them (oldest first). */
  async getActiveGoals(userId: string): Promise<PersonalGoal[]> {
    const rows = await this.prisma.userGoal.findMany({
      where: { userId, active: true },
      orderBy: { updatedAt: 'asc' },
    });
    return rows.map((row) => row.goal);
  }

  async getGoals(userId: string): Promise<UserGoals> {
    return { goals: await this.getActiveGoals(userId) };
  }

  /**
   * Replaces the user's active goals with `goals`. Goals left out are
   * deactivated (not deleted); newly chosen ones are created or reactivated.
   */
  async setGoals(userId: string, goals: PersonalGoal[]): Promise<UserGoals> {
    const wanted = [...new Set(goals)];
    if (wanted.length > MAX_ACTIVE_GOALS) {
      throw new BadRequestException(`You can pick up to ${MAX_ACTIVE_GOALS} goals`);
    }

    const alreadyActive = new Set(await this.getActiveGoals(userId));
    const toActivate = wanted.filter((goal) => !alreadyActive.has(goal));

    await this.prisma.$transaction([
      this.prisma.userGoal.updateMany({
        where: { userId, active: true, goal: { notIn: wanted } },
        data: { active: false },
      }),
      ...toActivate.map((goal) =>
        this.prisma.userGoal.upsert({
          where: { userId_goal: { userId, goal } },
          create: { userId, goal },
          update: { active: true },
        }),
      ),
    ]);

    return this.getGoals(userId);
  }

  async removeGoal(userId: string, goal: PersonalGoal): Promise<UserGoals> {
    const { count } = await this.prisma.userGoal.updateMany({
      where: { userId, goal, active: true },
      data: { active: false },
    });
    if (count === 0) {
      throw new NotFoundException('Goal not found');
    }
    return this.getGoals(userId);
  }
}
