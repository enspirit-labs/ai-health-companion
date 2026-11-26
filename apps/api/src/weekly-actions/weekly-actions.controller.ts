import { Controller, Delete, Get, Param, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { WeeklyActionIdParamSchema, WeeklyActionsQuerySchema, type WeeklyActionsQuery } from '@aidoctor/shared';

import { CurrentUser, type RequestUser } from '../auth/decorators/current-user.decorator';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { WeeklyActionsService } from './weekly-actions.service';

@ApiTags('weekly-actions')
@ApiBearerAuth()
@Controller('weekly-actions')
export class WeeklyActionsController {
  constructor(private readonly weeklyActionsService: WeeklyActionsService) {}

  @Get()
  getWeek(
    @CurrentUser() user: RequestUser,
    @Query(new ZodValidationPipe(WeeklyActionsQuerySchema)) query: WeeklyActionsQuery,
  ) {
    return this.weeklyActionsService.getWeek(user.id, query.lapsed);
  }

  @Post(':actionId/complete')
  complete(
    @CurrentUser() user: RequestUser,
    @Param('actionId', new ZodValidationPipe(WeeklyActionIdParamSchema)) actionId: string,
  ) {
    return this.weeklyActionsService.complete(user.id, actionId);
  }

  @Delete(':actionId/complete')
  uncomplete(
    @CurrentUser() user: RequestUser,
    @Param('actionId', new ZodValidationPipe(WeeklyActionIdParamSchema)) actionId: string,
  ) {
    return this.weeklyActionsService.uncomplete(user.id, actionId);
  }
}
