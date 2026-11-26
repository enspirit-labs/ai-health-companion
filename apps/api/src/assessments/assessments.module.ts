import { Module } from '@nestjs/common';

import { AiThrottleModule } from '../common/throttle/ai-throttle.module';
import { AiModule } from '../ai/ai.module';
import { StorageModule } from '../storage/storage.module';
import { TranscriptionModule } from '../transcription/transcription.module';
import { ReportsModule } from '../reports/reports.module';
import { ConsentModule } from '../consent/consent.module';
import { FeatureFlagsModule } from '../feature-flags/feature-flags.module';
import { AssessmentsController } from './assessments.controller';
import { AssessmentsService } from './assessments.service';

@Module({
  imports: [AiModule, StorageModule, TranscriptionModule, ReportsModule, FeatureFlagsModule, ConsentModule, AiThrottleModule],
  controllers: [AssessmentsController],
  providers: [AssessmentsService],
})
export class AssessmentsModule {}
