import { Controller, Get } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';

import { FeatureFlagsService } from './feature-flags.service';

@ApiTags('feature-flags')
@ApiBearerAuth()
@Controller('feature-flags')
export class FeatureFlagsController {
  constructor(private readonly featureFlagsService: FeatureFlagsService) {}

  @Get()
  getAll() {
    return this.featureFlagsService.getAll();
  }
}
