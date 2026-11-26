import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Param,
  Patch,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiConsumes, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { memoryStorage } from 'multer';
import {
  AnswerAssessmentQuestionSchema,
  CaptureLabelSchema,
  RecordTestResultSchema,
  StartAssessmentSchema,
  type AnswerAssessmentQuestionInput,
  type CaptureLabel,
  type RecordTestResultInput,
  type StartAssessmentInput,
} from '@aidoctor/shared';

import { AiThrottle } from '../common/throttle/ai-throttle.decorator';
import { AiUserThrottleGuard } from '../common/throttle/ai-user-throttle.guard';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { CurrentUser, type RequestUser } from '../auth/decorators/current-user.decorator';
import { FeatureFlagsService } from '../feature-flags/feature-flags.service';
import { AssessmentsService } from './assessments.service';

const MAX_UPLOAD_BYTES = 8 * 1024 * 1024;

@ApiTags('assessments')
@ApiBearerAuth()
@Controller('assessments')
export class AssessmentsController {
  constructor(
    private readonly assessmentsService: AssessmentsService,
    private readonly featureFlags: FeatureFlagsService,
  ) {}

  @Post()
  async start(
    @CurrentUser() user: RequestUser,
    @Body(new ZodValidationPipe(StartAssessmentSchema)) body: StartAssessmentInput,
  ) {
    // Flag-gated types (Voice, Tongue) fail closed — same 404 the service
    // uses for any type that isn't available, so the web shows its usual
    // "not available" state.
    if (!(await this.featureFlags.isAssessmentTypeEnabled(body.type))) {
      throw new NotFoundException(`This assessment isn't available yet. Check back soon.`);
    }
    // body.mode is optional (omission = FULL, unchanged for every existing
    // caller) — the service's own default parameter handles `undefined`.
    return this.assessmentsService.start(user.id, body.type, body.mode);
  }

  @Get(':id')
  getState(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    return this.assessmentsService.getState(user.id, id);
  }

  @Patch(':id/answers')
  answerQuestion(
    @CurrentUser() user: RequestUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(AnswerAssessmentQuestionSchema)) body: AnswerAssessmentQuestionInput,
  ) {
    return this.assessmentsService.answerQuestion(user.id, id, body);
  }

  @Patch(':id/data')
  recordTestResult(
    @CurrentUser() user: RequestUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(RecordTestResultSchema)) body: RecordTestResultInput,
  ) {
    return this.assessmentsService.recordTestResult(user.id, id, body);
  }

  @ApiConsumes('multipart/form-data')
  @Post(':id/media')
  // Tighter than the global 120/min default (app.module.ts): this endpoint is
  // shared by every camera/mic-based assessment (Face, Eye, Tongue, Posture,
  // Teeth, ...), not just Eye. 30/min comfortably covers Eye's own 5-photo
  // sequence plus reasonable retakes within a session, while meaningfully
  // reducing spam/abuse headroom versus the generic limit.
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: MAX_UPLOAD_BYTES },
    }),
  )
  uploadMedia(
    @CurrentUser() user: RequestUser,
    @Param('id') id: string,
    @UploadedFile() file: Express.Multer.File | undefined,
    // Becomes part of the storage path, so it is held to a strict slug here.
    @Body('captureLabel', new ZodValidationPipe(CaptureLabelSchema)) captureLabel?: CaptureLabel,
  ) {
    if (!file) {
      throw new BadRequestException('No file uploaded');
    }
    return this.assessmentsService.uploadMedia(
      user.id,
      id,
      { buffer: file.buffer, mimeType: file.mimetype, originalName: file.originalname },
      captureLabel,
    );
  }

  // Per-user AI budget: complete runs the analysis pipeline.
  @UseGuards(AiUserThrottleGuard)
  @AiThrottle('complete')
  @HttpCode(HttpStatus.OK)
  @Post(':id/complete')
  complete(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    return this.assessmentsService.complete(user.id, id);
  }

  @HttpCode(HttpStatus.NO_CONTENT)
  @Delete(':id')
  abandon(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    return this.assessmentsService.abandon(user.id, id);
  }
}
