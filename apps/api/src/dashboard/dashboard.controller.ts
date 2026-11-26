import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { PulseGameCompletedSchema, type PulseGameCompletedInput } from '@aidoctor/shared';

import { CurrentUser, type RequestUser } from '../auth/decorators/current-user.decorator';
import { parsePositiveInt } from '../common/pagination.util';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { DashboardService } from './dashboard.service';

@ApiTags('dashboard')
@ApiBearerAuth()
@Controller('dashboard')
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  @Get('summary')
  getSummary(@CurrentUser() user: RequestUser) {
    return this.dashboardService.getSummary(user.id);
  }

  @Get('trends')
  getTrends(@CurrentUser() user: RequestUser, @Query('days') days?: string) {
    const parsed = Number(days);
    const rangeDays = Number.isFinite(parsed) && parsed > 0 ? Math.min(parsed, 365) : 30;
    return this.dashboardService.getTrends(user.id, rangeDays);
  }

  @Get('assessments/history')
  getAssessmentHistory(@CurrentUser() user: RequestUser, @Query('limit') limit?: string) {
    const parsed = parsePositiveInt(limit);
    return this.dashboardService.getAssessmentHistory(user.id, parsed ? Math.min(parsed, 100) : undefined);
  }

  @Get('assessments/upcoming')
  getUpcomingAssessments(@CurrentUser() user: RequestUser) {
    return this.dashboardService.getUpcomingAssessments(user.id);
  }

  @Get('streak')
  getStreak(@CurrentUser() user: RequestUser) {
    return this.dashboardService.getStreak(user.id);
  }

  @Get('assessments/recommended')
  getRecommendedAssessment(@CurrentUser() user: RequestUser) {
    return this.dashboardService.getRecommendedAssessment(user.id);
  }

  @Post('pulse-game/completed')
  logPulseGameCompleted(
    @CurrentUser() user: RequestUser,
    @Body(new ZodValidationPipe(PulseGameCompletedSchema)) body: PulseGameCompletedInput,
  ) {
    return this.dashboardService.logPulseGameCompleted(user.id, body);
  }

  @Get('reports/recent')
  getRecentReports(@CurrentUser() user: RequestUser) {
    return this.dashboardService.getRecentReports(user.id);
  }

  @Get('recommendations')
  getRecommendations(@CurrentUser() user: RequestUser) {
    return this.dashboardService.getRecommendations(user.id);
  }
}
