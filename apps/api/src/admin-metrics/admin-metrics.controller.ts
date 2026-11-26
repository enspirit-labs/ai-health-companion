import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import {
  PilotMetricsQuerySchema,
  type PilotMetricsQuery,
} from '@aidoctor/shared';

import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { Roles } from '../auth/decorators/roles.decorator';
import { AdminMetricsService } from './admin-metrics.service';

@ApiTags('admin')
@ApiBearerAuth()
@Roles(UserRole.ADMIN)
@Controller('admin/pilot-metrics')
export class AdminMetricsController {
  constructor(private readonly metricsService: AdminMetricsService) {}

  @Get()
  getPilotMetrics(
    @Query(new ZodValidationPipe(PilotMetricsQuerySchema))
    query: PilotMetricsQuery,
  ) {
    return this.metricsService.getPilotMetrics(query);
  }
}
