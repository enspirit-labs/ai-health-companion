import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { ASSESSMENT_TYPES } from '@aidoctor/shared';
import type {
  AdminPromptTemplateDto,
  AdminStatsDto,
  AdminUserDto,
  UpdateAdminPromptTemplateInput,
  UpdateAdminUserInput,
} from '@aidoctor/shared';

import { PrismaService } from '../prisma/prisma.service';
import { toPrismaPageArgs, type PaginationParams } from '../common/pagination.util';
import { compactLineDiff } from '../common/line-diff.util';

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;
const PROMPT_TEMPLATE_UPDATED_ACTION = 'admin.prompt_template.updated';

type UserRow = { id: string; email: string; fullName: string; role: string; isActive: boolean; createdAt: Date };
type PromptTemplateRow = {
  id: string;
  key: string;
  assessmentType: string | null;
  systemPrompt: string;
  version: number;
  isActive: boolean;
  updatedAt: Date;
};

@Injectable()
export class AdminService {
  constructor(private readonly prisma: PrismaService) {}

  async listUsers(pagination?: PaginationParams): Promise<AdminUserDto[]> {
    const [users, counts] = await Promise.all([
      this.prisma.user.findMany({ orderBy: { createdAt: 'desc' }, ...toPrismaPageArgs(pagination) }),
      this.prisma.assessment.groupBy({ by: ['userId'], where: { status: 'COMPLETED' }, _count: { _all: true } }),
    ]);
    const countByUser = new Map(counts.map((c) => [c.userId, c._count._all]));
    return users.map((u) => this.toUserDto(u, countByUser.get(u.id) ?? 0));
  }

  async updateUser(adminUserId: string, targetUserId: string, input: UpdateAdminUserInput): Promise<AdminUserDto> {
    if (targetUserId === adminUserId) {
      if (input.role && input.role !== 'ADMIN') {
        throw new BadRequestException('You cannot change your own admin role.');
      }
      if (input.isActive === false) {
        throw new BadRequestException('You cannot deactivate your own account.');
      }
    }

    // The count doesn't depend on the update's result — same targetUserId
    // either way — so there's no reason to wait on one before starting the
    // other.
    const [user, completedAssessmentCount] = await Promise.all([
      this.prisma.user.update({ where: { id: targetUserId }, data: input }),
      this.prisma.assessment.count({ where: { userId: targetUserId, status: 'COMPLETED' } }),
    ]);
    return this.toUserDto(user, completedAssessmentCount);
  }

  async getStats(): Promise<AdminStatsDto> {
    const thirtyDaysAgo = new Date(Date.now() - THIRTY_DAYS_MS);

    const [totalUsers, activeUsers, signupsLast30Days, totalCompletedAssessments, totalReports, assessmentGroups] =
      await Promise.all([
        this.prisma.user.count(),
        this.prisma.user.count({ where: { isActive: true } }),
        this.prisma.user.count({ where: { createdAt: { gte: thirtyDaysAgo } } }),
        this.prisma.assessment.count({ where: { status: 'COMPLETED' } }),
        this.prisma.report.count(),
        this.prisma.assessment.groupBy({ by: ['type'], where: { status: 'COMPLETED' }, _count: { _all: true } }),
      ]);

    const countByType = new Map(assessmentGroups.map((g) => [g.type, g._count._all]));

    return {
      totalUsers,
      activeUsers,
      signupsLast30Days,
      totalCompletedAssessments,
      totalReports,
      assessmentsByType: ASSESSMENT_TYPES.map((type) => ({ type, count: countByType.get(type) ?? 0 })),
    };
  }

  async listPromptTemplates(): Promise<AdminPromptTemplateDto[]> {
    const templates = await this.prisma.aiPromptTemplate.findMany({ orderBy: { key: 'asc' } });
    return templates.map((t) => this.toPromptTemplateDto(t));
  }

  /**
   * Every change is audit-logged with the acting admin and a line diff of the
   * prompt, so a safety regression introduced through the admin UI can be
   * traced to who changed what. The version is bumped only when
   * the prompt text itself changes — toggling isActive isn't a new version.
   * Read, update and log run in one transaction so the log's old/new values
   * can't drift from what was actually written.
   */
  async updatePromptTemplate(
    adminUserId: string,
    id: string,
    input: UpdateAdminPromptTemplateInput,
  ): Promise<AdminPromptTemplateDto> {
    const template = await this.prisma.$transaction(async (tx) => {
      const existing = await tx.aiPromptTemplate.findUnique({ where: { id } });
      if (!existing) throw new NotFoundException('Prompt template not found.');

      const promptChanged = input.systemPrompt !== undefined && input.systemPrompt !== existing.systemPrompt;
      const updated = await tx.aiPromptTemplate.update({
        where: { id },
        data: promptChanged ? { ...input, version: { increment: 1 } } : input,
      });

      await tx.activityLog.create({
        data: {
          userId: adminUserId,
          action: PROMPT_TEMPLATE_UPDATED_ACTION,
          metadata: {
            templateId: updated.id,
            key: updated.key,
            oldVersion: existing.version,
            newVersion: updated.version,
            ...(existing.isActive !== updated.isActive && {
              isActive: { from: existing.isActive, to: updated.isActive },
            }),
            systemPromptDiff: compactLineDiff(existing.systemPrompt, updated.systemPrompt),
          },
        },
      });

      return updated;
    });
    return this.toPromptTemplateDto(template);
  }

  private toUserDto(user: UserRow, completedAssessmentCount: number): AdminUserDto {
    return {
      id: user.id,
      email: user.email,
      fullName: user.fullName,
      role: user.role as AdminUserDto['role'],
      isActive: user.isActive,
      createdAt: user.createdAt.toISOString(),
      completedAssessmentCount,
    };
  }

  private toPromptTemplateDto(template: PromptTemplateRow): AdminPromptTemplateDto {
    return {
      id: template.id,
      key: template.key,
      assessmentType: template.assessmentType as AdminPromptTemplateDto['assessmentType'],
      systemPrompt: template.systemPrompt,
      version: template.version,
      isActive: template.isActive,
      updatedAt: template.updatedAt.toISOString(),
    };
  }
}
