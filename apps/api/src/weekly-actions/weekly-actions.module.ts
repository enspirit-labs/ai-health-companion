import { Module } from '@nestjs/common';

import { GoalsModule } from '../goals/goals.module';
import { WeeklyActionsController } from './weekly-actions.controller';
import { WeeklyActionsService } from './weekly-actions.service';

@Module({
  imports: [GoalsModule],
  controllers: [WeeklyActionsController],
  providers: [WeeklyActionsService],
})
export class WeeklyActionsModule {}
