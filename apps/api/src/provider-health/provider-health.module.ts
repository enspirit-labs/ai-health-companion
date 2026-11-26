import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { AiModule } from '../ai/ai.module';
import { StorageModule } from '../storage/storage.module';
import { TranscriptionModule } from '../transcription/transcription.module';
import { ProviderHealthController } from './provider-health.controller';
import { ProviderHealthService } from './provider-health.service';

@Module({
  imports: [ConfigModule, AiModule, StorageModule, TranscriptionModule],
  controllers: [ProviderHealthController],
  providers: [ProviderHealthService],
})
export class ProviderHealthModule {}
