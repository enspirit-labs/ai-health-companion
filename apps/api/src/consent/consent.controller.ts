import { Body, Controller, Get, HttpCode, HttpStatus, Post, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { UpdateConsentSchema, type UpdateConsentInput } from '@aidoctor/shared';

import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { CurrentUser, type RequestUser } from '../auth/decorators/current-user.decorator';
import { ConsentService } from './consent.service';

@ApiTags('consent')
@ApiBearerAuth()
@Controller('consent')
export class ConsentController {
  constructor(private readonly consentService: ConsentService) {}

  @Get()
  getStatus(@CurrentUser() user: RequestUser) {
    return this.consentService.getStatus(user.id);
  }

  @HttpCode(HttpStatus.OK)
  @Post()
  update(
    @CurrentUser() user: RequestUser,
    @Body(new ZodValidationPipe(UpdateConsentSchema)) body: UpdateConsentInput,
    @Req() req: Request,
  ) {
    return this.consentService.recordConsent(user.id, body.type, body.granted, {
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    });
  }
}
