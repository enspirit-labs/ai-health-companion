import { Body, Controller, Delete, Get, Param, Put } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { PersonalGoalSchema, SetGoalsSchema, type PersonalGoal, type SetGoalsInput } from '@aidoctor/shared';

import { CurrentUser, type RequestUser } from '../auth/decorators/current-user.decorator';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { GoalsService } from './goals.service';

@ApiTags('goals')
@ApiBearerAuth()
@Controller('goals')
export class GoalsController {
  constructor(private readonly goalsService: GoalsService) {}

  @Get()
  getGoals(@CurrentUser() user: RequestUser) {
    return this.goalsService.getGoals(user.id);
  }

  @Put()
  setGoals(
    @CurrentUser() user: RequestUser,
    @Body(new ZodValidationPipe(SetGoalsSchema)) body: SetGoalsInput,
  ) {
    return this.goalsService.setGoals(user.id, body.goals);
  }

  @Delete(':goal')
  removeGoal(
    @CurrentUser() user: RequestUser,
    @Param('goal', new ZodValidationPipe(PersonalGoalSchema)) goal: PersonalGoal,
  ) {
    return this.goalsService.removeGoal(user.id, goal);
  }
}
