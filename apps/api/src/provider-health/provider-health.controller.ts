import { Controller, Get } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';

import { Roles } from '../auth/decorators/roles.decorator';
import { ProviderHealthService } from './provider-health.service';

@ApiTags('provider-health')
@ApiBearerAuth()
@Controller()
export class ProviderHealthController {
  constructor(private readonly providerHealthService: ProviderHealthService) {}

  /** Active AI / storage / transcription providers and the model ID. Admin-only (also used by the CI smoke check). */
  @Roles(UserRole.ADMIN)
  @Get('admin/providers')
  getHealth() {
    return this.providerHealthService.getHealth();
  }

  /** Any signed-in user: only whether AI output is mocked, so the web can show a banner. */
  @Get('providers/mode')
  getMode() {
    return this.providerHealthService.getMode();
  }
}
