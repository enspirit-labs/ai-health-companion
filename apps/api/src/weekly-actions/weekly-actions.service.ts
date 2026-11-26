import { Injectable, NotFoundException } from '@nestjs/common';
import {
  getWeeklyActionDef,
  isoWeekStartKey,
  selectWeeklyActions,
  type WeeklyActions,
} from '@aidoctor/shared';

import { GoalsService } from '../goals/goals.service';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class WeeklyActionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly goalsService: GoalsService,
  ) {}

  /**
   * This week's actions (ISO week, UTC) for the user's goals, with completion
   * state. `lapsed` swaps in the lighter set; callers pass it from the
   * welcome-back state (defaults to false until that signal is wired in).
   */
  async getWeek(userId: string, lapsed = false, now = new Date()): Promise<WeeklyActions> {
    const weekStart = isoWeekStartKey(now);
    const goals = await this.goalsService.getActiveGoals(userId);
    const defs = selectWeeklyActions(goals, lapsed);

    const completions = await this.prisma.weeklyActionCompletion.findMany({
      where: { userId, weekStart: toDate(weekStart) },
    });
    const completedAt = new Map(completions.map((c) => [c.actionId, c.completedAt]));

    return {
      weekStart,
      lighter: lapsed,
      actions: defs.map((def) => ({
        id: def.id,
        goal: def.goal,
        title: def.title,
        detail: def.detail,
        completed: completedAt.has(def.id),
        completedAt: completedAt.get(def.id)?.toISOString() ?? null,
      })),
    };
  }

  /** Idempotent: ticking an already-ticked action leaves the original completion time. */
  async complete(userId: string, actionId: string, now = new Date()): Promise<{ actionId: string; completed: true }> {
    const goal = await this.assertActionForActiveGoal(userId, actionId);
    const weekStart = toDate(isoWeekStartKey(now));

    await this.prisma.weeklyActionCompletion.upsert({
      where: { userId_weekStart_actionId: { userId, weekStart, actionId } },
      create: { userId, weekStart, actionId, goal },
      update: {},
    });
    return { actionId, completed: true };
  }

  async uncomplete(userId: string, actionId: string, now = new Date()): Promise<{ actionId: string; completed: false }> {
    await this.assertActionForActiveGoal(userId, actionId);
    await this.prisma.weeklyActionCompletion.deleteMany({
      where: { userId, weekStart: toDate(isoWeekStartKey(now)), actionId },
    });
    return { actionId, completed: false };
  }

  private async assertActionForActiveGoal(userId: string, actionId: string) {
    const def = getWeeklyActionDef(actionId);
    const goals = await this.goalsService.getActiveGoals(userId);
    if (!def || !goals.includes(def.goal)) {
      throw new NotFoundException('Action not found');
    }
    return def.goal;
  }
}

function toDate(dayKey: string): Date {
  return new Date(`${dayKey}T00:00:00.000Z`);
}
