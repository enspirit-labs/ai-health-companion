import { Body, Controller, Get, Patch } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { HealthProfileUpdateSchema, type HealthProfileUpdateInput } from '@aidoctor/shared';

import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { CurrentUser, type RequestUser } from '../auth/decorators/current-user.decorator';
import { HealthProfileService } from './health-profile.service';

@ApiTags('health-profile')
@ApiBearerAuth()
@Controller('health-profile')
export class HealthProfileController {
  constructor(private readonly healthProfileService: HealthProfileService) {}

  @Get('me')
  async getMine(@CurrentUser() user: RequestUser) {
    return this.healthProfileService.getForUser(user.id);
  }

  @Patch('me')
  async updateMine(
    @CurrentUser() user: RequestUser,
    @Body(new ZodValidationPipe(HealthProfileUpdateSchema)) body: HealthProfileUpdateInput,
  ) {
    return this.healthProfileService.upsertAnswer(user.id, body);
  }
}
