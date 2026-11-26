import { Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { UserRole } from '@prisma/client';

import { Roles } from '../auth/decorators/roles.decorator';
import { MediaRetentionService } from './media-retention.service';

/** Admin-only manual trigger for the same job the server cron runs (see apps/api/scripts). */
@ApiTags('admin')
@ApiBearerAuth()
@Roles(UserRole.ADMIN)
@Controller('admin/media-retention')
export class MediaRetentionController {
  constructor(private readonly retention: MediaRetentionService) {}

  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @HttpCode(HttpStatus.OK)
  @Post('purge')
  purge() {
    return this.retention.purgeExpiredMedia();
  }
}
