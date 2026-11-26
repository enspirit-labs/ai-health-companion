import { Module } from '@nestjs/common';

import { FeatureFlagsModule } from '../feature-flags/feature-flags.module';
import { AiModule } from '../ai/ai.module';
import { DashboardController } from './dashboard.controller';
import { DashboardService } from './dashboard.service';

@Module({
  imports: [FeatureFlagsModule, AiModule],
  controllers: [DashboardController],
  providers: [DashboardService],
})
export class DashboardModule {}
