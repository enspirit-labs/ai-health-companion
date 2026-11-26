import { Body, Controller, Delete, Get, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { DeleteAccountSchema, type DeleteAccountInput } from '@aidoctor/shared';

import { CurrentUser, type RequestUser } from '../auth/decorators/current-user.decorator';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { DataRightsService } from './data-rights.service';

// Shares the `auth` route prefix so the endpoints read as DELETE /auth/me and
// GET /auth/me/export without touching the auth module's own controller.
@ApiTags('data-rights')
@ApiBearerAuth()
@Controller('auth')
export class DataRightsController {
  constructor(private readonly dataRights: DataRightsService) {}

  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @HttpCode(HttpStatus.OK)
  @Delete('me')
  deleteMe(
    @CurrentUser() user: RequestUser,
    @Body(new ZodValidationPipe(DeleteAccountSchema)) body: DeleteAccountInput,
  ) {
    return this.dataRights.deleteAccount(user.id, body);
  }

  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Get('me/export')
  exportMe(@CurrentUser() user: RequestUser) {
    return this.dataRights.exportData(user.id);
  }
}
