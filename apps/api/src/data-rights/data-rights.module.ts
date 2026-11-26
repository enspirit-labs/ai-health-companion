import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';
import { StorageModule } from '../storage/storage.module';
import { DataRightsController } from './data-rights.controller';
import { DataRightsService } from './data-rights.service';
import { MediaRetentionController } from './media-retention.controller';
import { MediaRetentionService } from './media-retention.service';

@Module({
  imports: [AuthModule, StorageModule],
  controllers: [DataRightsController, MediaRetentionController],
  providers: [DataRightsService, MediaRetentionService],
  exports: [MediaRetentionService],
})
export class DataRightsModule {}
