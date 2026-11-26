import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import {
  ASSESSMENT_INPUT_MODE_MAP,
  ASSESSMENT_TYPE_TO_DIMENSION,
  CHAT_SYSTEM_GUARDRAIL,
  computeWellnessSummary,
  DAILY_PULSE_QUESTION_KEYS,
  WELLNESS_DISCLAIMER,
  filterObservationsByAllowlist,
  needsSupportCardFor,
  supportsDailyPulse,
} from '@aidoctor/shared';
import type {
  AnswerAssessmentQuestionInput,
  AssessmentInputMode,
  AssessmentMode,
  AssessmentResult,
  AssessmentState,
  AssessmentType,
  RecordTestResultInput,
} from '@aidoctor/shared';

import { PrismaService } from '../prisma/prisma.service';
import { AI_PROVIDER, type AiProvider, type AiReasoningImage } from '../ai/ai-provider.interface';
import { composeSystemPrompt } from '../ai/compose-system-prompt';
import { STORAGE_PROVIDER, type StorageProvider } from '../storage/storage-provider.interface';
import {
  TRANSCRIPTION_PROVIDER,
  type TranscriptionProvider,
} from '../transcription/transcription-provider.interface';
import { ReportsService } from '../reports/reports.service';
import { ConsentService } from '../consent/consent.service';
import { FeatureFlagsService } from '../feature-flags/feature-flags.service';
import { riskLevelForScore } from '../common/risk-level.util';
import { findLatestScoresByType } from '../common/wellness-snapshot.util';
import { assertOwnedResource } from '../common/owned-resource.util';
import { isSameDayInZone } from '../common/date.util';
import { summarizeHandCoordinationResult } from './hand-coordination-summary';
import { DIMENSION_TO_SNAPSHOT_COLUMN, type WellnessDimensionField } from './assessment-dimension-map';

const DEFAULT_SYSTEM_PROMPT = `${CHAT_SYSTEM_GUARDRAIL}\n\nYou are scoring a wellness assessment. Given the structured input, produce a score (0-100), a short list of observations, actionable recommendations, an overall risk level, and your confidence. ${WELLNESS_DISCLAIMER}`;

/** Camera-based modules with a real capture flow wired up. */
const IMPLEMENTED_VISION_ASSESSMENTS: AssessmentType[] = ['FACE', 'EYE', 'TEETH', 'HAIR', 'SKIN', 'TONGUE', 'POSTURE'];

/** Microphone-based modules with a real capture flow wired up. */
const IMPLEMENTED_AUDIO_ASSESSMENTS: AssessmentType[] = ['VOICE'];

/** Video-based modules with a real capture flow wired up. The client records
 * a short clip and extracts a handful of frames from it — those frames are
 * uploaded and reasoned over as plain images, same as FACE/EYE/etc. Claude's
 * vision input doesn't accept video, so there's no separate video-reasoning
 * path; "CAMERA_VIDEO" only describes what the user does, not the artifact. */
const IMPLEMENTED_VIDEO_ASSESSMENTS: AssessmentType[] = ['WALKING'];

/** Interactive-test modules with a real capture flow wired up. These have no
 * media at all — the client runs a self-contained task (a tapping test, a
 * memory game) and submits its result via recordTestResult, same mechanism
 * Eye Assessment uses for its sub-tests. */
const IMPLEMENTED_INTERACTIVE_ASSESSMENTS: AssessmentType[] = ['HAND_COORDINATION', 'MEMORY', 'SQUATS'];

const MIME_TO_IMAGE_TYPE: Record<string, AiReasoningImage['mediaType']> = {
  'image/jpeg': 'image/jpeg',
  'image/jpg': 'image/jpeg',
  'image/png': 'image/png',
  'image/webp': 'image/webp',
};

const SUPPORTED_AUDIO_MIME_TYPES = [
  'audio/webm',
  'audio/wav',
  'audio/wave',
  'audio/x-wav',
  'audio/mpeg',
  'audio/mp3',
  'audio/mp4',
  'audio/ogg',
];

const RESULT_UNAVAILABLE_MESSAGE =
  "Your result couldn't be generated just now. Nothing you entered was lost, so please try again in a moment.";

/** Prisma's unique-constraint violation. Duck-typed so tests needn't build a real PrismaClientKnownRequestError. */
function isUniqueConstraintError(error: unknown): boolean {
  return typeof error === 'object' && error !== null && (error as { code?: unknown }).code === 'P2002';
}

@Injectable()
export class AssessmentsService {
  private readonly logger = new Logger(AssessmentsService.name);

  /**
   * Completions currently running in this process, keyed by user + assessment.
   * A FULL completion spends ~10s in AI analysis while the row is still
   * IN_PROGRESS, so a second /complete (double click, retry) used to pass the
   * status check too, run the AI again and then fail with a 500 on Score's
   * unique assessmentId. A repeat call now joins the first.
   */
  private readonly inFlightCompletions = new Map<string, Promise<AssessmentResult>>();

  constructor(
    private readonly prisma: PrismaService,
    @Inject(AI_PROVIDER) private readonly aiProvider: AiProvider,
    @Inject(STORAGE_PROVIDER) private readonly storage: StorageProvider,
    @Inject(TRANSCRIPTION_PROVIDER) private readonly transcription: TranscriptionProvider,
    private readonly reportsService: ReportsService,
    private readonly featureFlags: FeatureFlagsService,
    private readonly consent: ConsentService,
  ) {}

  async start(userId: string, type: AssessmentType, mode: AssessmentMode = 'FULL'): Promise<AssessmentState> {
    // Checked once, up front, regardless of which input-mode branch this
    // type resolves to below — DAILY_PULSE_QUESTION_KEYS only ever covers
    // MENTAL_WELLNESS today (a QUESTIONNAIRE type), so in practice this is
    // the only guard the media/interactive branches ever need against a
    // stray `mode: 'PULSE'` on an unsupported type.
    if (mode === 'PULSE') {
      if (!supportsDailyPulse(type)) {
        throw new BadRequestException(`Daily Pulse isn't available for ${type}.`);
      }
      if (!(await this.featureFlags.isEnabled('daily_pulse'))) {
        throw new NotFoundException(`This assessment isn't available yet. Check back soon.`);
      }
    }

    const inputMode = ASSESSMENT_INPUT_MODE_MAP[type];

    if (inputMode === 'QUESTIONNAIRE') {
      return this.startQuestionnaire(userId, type, mode);
    }

    if (inputMode === 'CAMERA_IMAGE' && IMPLEMENTED_VISION_ASSESSMENTS.includes(type)) {
      const assessment = await this.findOrCreateInProgress(userId, type);
      return this.buildMediaState(assessment.id, type, assessment.status, inputMode);
    }

    if (inputMode === 'MICROPHONE_AUDIO' && IMPLEMENTED_AUDIO_ASSESSMENTS.includes(type)) {
      const assessment = await this.findOrCreateInProgress(userId, type);
      return this.buildMediaState(assessment.id, type, assessment.status, inputMode);
    }

    if (inputMode === 'CAMERA_VIDEO' && IMPLEMENTED_VIDEO_ASSESSMENTS.includes(type)) {
      const assessment = await this.findOrCreateInProgress(userId, type);
      return this.buildMediaState(assessment.id, type, assessment.status, inputMode);
    }

    if (inputMode === 'INTERACTIVE_TEST' && IMPLEMENTED_INTERACTIVE_ASSESSMENTS.includes(type)) {
      const assessment = await this.findOrCreateInProgress(userId, type);
      return this.buildMediaState(assessment.id, type, assessment.status, inputMode);
    }

    throw new NotFoundException(`This assessment isn't available yet. Check back soon.`);
  }

  async getState(userId: string, assessmentId: string): Promise<AssessmentState> {
    const assessment = await this.findOwnedAssessment(userId, assessmentId);
    const inputMode = ASSESSMENT_INPUT_MODE_MAP[assessment.type];

    if (inputMode === 'QUESTIONNAIRE') {
      // `?? 'FULL'` covers both the real column default (never actually
      // undefined once read from Postgres) and the many pre-existing test
      // fixtures across this spec file that predate `mode` and never set it.
      return this.buildQuestionnaireState(assessment.id, assessment.type, assessment.status, assessment.mode ?? 'FULL');
    }
    return this.buildMediaState(assessment.id, assessment.type, assessment.status, inputMode);
  }

  async answerQuestion(
    userId: string,
    assessmentId: string,
    input: AnswerAssessmentQuestionInput,
  ): Promise<AssessmentState> {
    const assessment = await this.findOwnedAssessment(userId, assessmentId);
    if (assessment.status !== 'IN_PROGRESS') {
      throw new BadRequestException('This assessment is no longer in progress.');
    }
    if (ASSESSMENT_INPUT_MODE_MAP[assessment.type] !== 'QUESTIONNAIRE') {
      throw new BadRequestException('This assessment does not use questionnaire answers.');
    }

    const mode: AssessmentMode = assessment.mode ?? 'FULL';
    if (mode === 'PULSE') {
      // Defense in depth — the Daily Pulse UI only ever renders/submits the
      // pulse keys, but a stray request shouldn't be able to attach an
      // out-of-scope answer to a PULSE row and have it leak into
      // reasonFromQuestionnaire's AI input.
      const pulseKeys = DAILY_PULSE_QUESTION_KEYS[assessment.type];
      if (!pulseKeys?.includes(input.questionKey)) {
        throw new BadRequestException(`${input.questionKey} isn't part of the Daily Pulse check-in.`);
      }
    }

    const definition = await this.prisma.questionnaireDefinition.findFirst({
      where: { assessmentType: assessment.type, isActive: true },
      include: { questions: { orderBy: { order: 'asc' } } },
    });
    const question = definition?.questions.find((q) => q.key === input.questionKey);
    if (!definition || !question) {
      throw new BadRequestException(`Unknown question key: ${input.questionKey}`);
    }

    await this.prisma.questionnaireAnswer.upsert({
      where: { assessmentId_questionKey: { assessmentId, questionKey: input.questionKey } },
      update: { answer: input.answer as object, question: question.prompt },
      create: {
        assessmentId,
        questionKey: input.questionKey,
        question: question.prompt,
        answer: input.answer as object,
        order: question.order,
      },
    });

    // We already have the assessment and its questionnaire definition in
    // hand from above — assemble the response from those plus one fresh
    // answers read, instead of calling getState() and re-fetching both of
    // them from scratch a second time.
    const answerRows = await this.prisma.questionnaireAnswer.findMany({ where: { assessmentId } });
    return this.assembleQuestionnaireState(assessment.id, assessment.type, assessment.status, mode, definition, answerRows);
  }

  async uploadMedia(
    userId: string,
    assessmentId: string,
    file: { buffer: Buffer; mimeType: string; originalName?: string },
    captureLabel?: string,
  ): Promise<AssessmentState> {
    const assessment = await this.findOwnedAssessment(userId, assessmentId);
    if (assessment.status !== 'IN_PROGRESS') {
      throw new BadRequestException('This assessment is no longer in progress.');
    }
    const inputMode = ASSESSMENT_INPUT_MODE_MAP[assessment.type];
    if (inputMode !== 'CAMERA_IMAGE' && inputMode !== 'MICROPHONE_AUDIO' && inputMode !== 'CAMERA_VIDEO') {
      throw new BadRequestException('This assessment does not accept media uploads.');
    }
    await this.requireMediaConsent(userId, inputMode);
    // CAMERA_VIDEO assessments (e.g. WALKING) upload frames extracted
    // client-side from the recording, not raw video — they go through the
    // same image path as CAMERA_IMAGE.
    const isAudio = inputMode === 'MICROPHONE_AUDIO';
    if (isAudio && !SUPPORTED_AUDIO_MIME_TYPES.includes(file.mimeType)) {
      throw new BadRequestException('Only WebM, WAV, MP3, MP4, or OGG audio is supported.');
    }
    if (!isAudio && !MIME_TO_IMAGE_TYPE[file.mimeType]) {
      throw new BadRequestException('Only JPEG, PNG, or WebP images are supported.');
    }

    const extension = isAudio ? (file.mimeType.split('/')[1] ?? 'webm') : 'jpg';
    const { storagePath } = await this.storage.upload({
      buffer: file.buffer,
      mimeType: file.mimeType,
      pathHint: `${assessmentId}/${captureLabel ?? (isAudio ? 'recording' : 'photo')}.${extension}`,
    });

    await this.prisma.mediaAsset.create({
      data: {
        assessmentId,
        kind: isAudio ? 'AUDIO' : 'IMAGE',
        storagePath,
        mimeType: file.mimeType,
        sizeBytes: file.buffer.byteLength,
        captureLabel: captureLabel ?? null,
      },
    });

    return this.buildMediaState(assessment.id, assessment.type, assessment.status, inputMode);
  }

  /**
   * Records one sub-test's result on a camera/interactive-mode assessment
   * (e.g. Eye Assessment's visual-acuity, color-blindness, contrast-sensitivity,
   * and dry-eye stages). Unlike answerQuestion, this isn't validated against a
   * QuestionnaireDefinition — it reuses the same QuestionnaireAnswer table as
   * a generic per-assessment key/value store so any sub-test can contribute
   * data that gets folded into the AI reasoning input alongside photos.
   */
  async recordTestResult(
    userId: string,
    assessmentId: string,
    input: RecordTestResultInput,
  ): Promise<AssessmentState> {
    const assessment = await this.findOwnedAssessment(userId, assessmentId);
    if (assessment.status !== 'IN_PROGRESS') {
      throw new BadRequestException('This assessment is no longer in progress.');
    }
    if (ASSESSMENT_INPUT_MODE_MAP[assessment.type] === 'QUESTIONNAIRE') {
      throw new BadRequestException('Use the questionnaire answer endpoint for this assessment.');
    }

    await this.prisma.questionnaireAnswer.upsert({
      where: { assessmentId_questionKey: { assessmentId, questionKey: input.key } },
      update: { answer: input.value as object },
      create: {
        assessmentId,
        questionKey: input.key,
        question: input.key,
        answer: input.value as object,
        order: 0,
      },
    });

    // Same reasoning as answerQuestion — we already have the assessment,
    // no need to re-fetch it via getState().
    return this.buildMediaState(
      assessment.id,
      assessment.type,
      assessment.status,
      ASSESSMENT_INPUT_MODE_MAP[assessment.type],
    );
  }

  /**
   * Idempotent: a repeat call while the first is still running gets the same
   * result, and a call after completion gets the saved result.
   */
  async complete(userId: string, assessmentId: string): Promise<AssessmentResult> {
    const key = `${userId}:${assessmentId}`;
    const inFlight = this.inFlightCompletions.get(key);
    if (inFlight) return inFlight;

    const run = this.runComplete(userId, assessmentId).finally(() => this.inFlightCompletions.delete(key));
    this.inFlightCompletions.set(key, run);
    return run;
  }

  private async runComplete(userId: string, assessmentId: string): Promise<AssessmentResult> {
    const assessment = await this.findOwnedAssessment(userId, assessmentId);
    // A retry after the first response was lost (proxy timeout, dropped
    // connection) gets the saved result instead of a dead-end 400.
    if (assessment.status === 'COMPLETED' && (assessment.mode ?? 'FULL') === 'FULL') {
      const saved = await this.findSavedResult(assessment.id, assessment.type);
      if (saved) return saved;
    }
    if (assessment.status !== 'IN_PROGRESS') {
      throw new BadRequestException('This assessment is not in progress.');
    }

    const mode: AssessmentMode = assessment.mode ?? 'FULL';
    await this.requireMediaConsent(userId, ASSESSMENT_INPUT_MODE_MAP[assessment.type]);

    // PULSE completions bypass the AI pipeline entirely — no Anthropic call,
    // no Score/Recommendation rows, no report. Marking the row COMPLETED is
    // all the streak computation (which reads Assessment.completedAt) needs.
    if (mode === 'PULSE') {
      const completedAt = new Date();
      await this.prisma.assessment.update({
        where: { id: assessmentId },
        data: { status: 'COMPLETED', completedAt },
      });
      return {
        assessmentId,
        type: assessment.type,
        completedAt: completedAt.toISOString(),
        score: 0,
        observations: [],
        recommendations: [],
        riskLevel: 'LOW',
        confidence: 0,
        disclaimer: '',
      };
    }

    // FULL completion sends the captured data to the AI provider; refuse
    // (403) until the user has consented. Capture and answers still work.
    await this.consent.requireConsent(userId, 'AI_PROCESSING');

    const inputMode = ASSESSMENT_INPUT_MODE_MAP[assessment.type];
    const promptTemplate = await this.prisma.aiPromptTemplate.findFirst({
      where: { assessmentType: assessment.type, isActive: true },
    });
    const systemPrompt = composeSystemPrompt(promptTemplate?.systemPrompt ?? DEFAULT_SYSTEM_PROMPT);

    // Same contract as chat: a provider failure is a retryable
    // 503 with a human message, never a bare 500. Logs the error type only:
    // provider errors can echo request text.
    const runAnalysis = () =>
      inputMode === 'QUESTIONNAIRE'
        ? this.reasonFromQuestionnaire(assessment.id, assessment.type, systemPrompt, mode)
        : this.reasonFromMedia(assessment.id, systemPrompt);
    let output: Awaited<ReturnType<typeof runAnalysis>>;
    try {
      output = await runAnalysis();
    } catch (error) {
      if (error instanceof BadRequestException) throw error;
      this.logger.error(
        `assessment analysis failed for user ${userId}: ${error instanceof Error ? error.name : 'unknown'}`,
      );
      throw new ServiceUnavailableException(RESULT_UNAVAILABLE_MESSAGE);
    }

    const completedAt = new Date();

    try {
      await this.prisma.$transaction([
        this.prisma.assessment.update({
          where: { id: assessmentId },
          data: { status: 'COMPLETED', completedAt },
        }),
        this.prisma.score.create({
          data: {
            assessmentId,
            value: output.score,
            riskLevel: output.riskLevel,
            confidence: output.confidence,
            observations: output.observations,
            disclaimer: output.disclaimer,
            recommendations: {
              create: output.recommendations.map((r) => ({
                title: r.title,
                detail: r.detail,
                priority: r.priority,
              })),
            },
          },
        }),
      ]);
    } catch (error) {
      // Another API instance completed this assessment while our AI call was
      // running (the in-process guard can't see across instances). The
      // transaction rolled back, so nothing was written twice; return theirs.
      if (isUniqueConstraintError(error)) {
        const saved = await this.findSavedResult(assessment.id, assessment.type);
        if (saved) return saved;
      }
      throw error;
    }

    await this.updateWellnessSnapshot(userId, assessment.type, output.score);
    const reportId = await this.reportsService.generateForAssessment(userId, assessmentId);
    const supportCard = await this.shouldShowSupportCard(assessment.id, assessment.type);

    return {
      ...output,
      assessmentId,
      type: assessment.type,
      completedAt: completedAt.toISOString(),
      ...(reportId ? { reportId } : {}),
      ...(supportCard ? { supportCard: true } : {}),
    };
  }

  private async findSavedResult(assessmentId: string, type: AssessmentType): Promise<AssessmentResult | null> {
    const assessment = await this.prisma.assessment.findUnique({
      where: { id: assessmentId },
      include: { score: { include: { recommendations: true } } },
    });
    if (!assessment?.score || !assessment.completedAt) return null;

    const { score } = assessment;
    const section = await this.prisma.reportSection.findFirst({
      where: { assessmentId },
      select: { reportId: true },
    });
    const supportCard = await this.shouldShowSupportCard(assessmentId, type);

    return {
      assessmentId,
      type,
      completedAt: assessment.completedAt.toISOString(),
      score: score.value,
      riskLevel: score.riskLevel,
      confidence: score.confidence,
      observations: score.observations as AssessmentResult['observations'],
      recommendations: score.recommendations.map((r) => ({ title: r.title, detail: r.detail, priority: r.priority })),
      disclaimer: score.disclaimer,
      ...(section ? { reportId: section.reportId } : {}),
      ...(supportCard ? { supportCard: true } : {}),
    };
  }

  /** Camera/video modules need CAMERA consent, audio needs MICROPHONE; interactive and questionnaire modules need neither. */
  private async requireMediaConsent(userId: string, inputMode: AssessmentInputMode): Promise<void> {
    if (inputMode === 'CAMERA_IMAGE' || inputMode === 'CAMERA_VIDEO') {
      await this.consent.requireConsent(userId, 'CAMERA');
    } else if (inputMode === 'MICROPHONE_AUDIO') {
      await this.consent.requireConsent(userId, 'MICROPHONE');
    }
  }

  /** Deterministic support-card rule over stored answers; the flag is never persisted. */
  private async shouldShowSupportCard(assessmentId: string, type: AssessmentType): Promise<boolean> {
    if (type !== 'MENTAL_WELLNESS') return false;
    const rows = await this.prisma.questionnaireAnswer.findMany({ where: { assessmentId } });
    const answers: Record<string, unknown> = {};
    for (const row of rows) answers[row.questionKey] = row.answer;
    return needsSupportCardFor(type, answers);
  }

  async abandon(userId: string, assessmentId: string): Promise<void> {
    const assessment = await this.findOwnedAssessment(userId, assessmentId);
    if (assessment.status !== 'IN_PROGRESS') {
      throw new BadRequestException('This assessment is not in progress.');
    }
    await this.prisma.assessment.update({
      where: { id: assessmentId },
      data: { status: 'ABANDONED' },
    });
  }

  // ---------------------------------------------------------------------
  // Questionnaire-mode assessments
  // ---------------------------------------------------------------------

  private async startQuestionnaire(
    userId: string,
    type: AssessmentType,
    mode: AssessmentMode = 'FULL',
  ): Promise<AssessmentState> {
    // Deliberately a lighter existence-only check (no questions include) —
    // it has to run before findOrCreateInProgress so an invalid/unconfigured
    // type is rejected before creating an assessment row for it, not after.
    const definition = await this.prisma.questionnaireDefinition.findFirst({
      where: { assessmentType: type, isActive: true },
    });
    if (!definition) {
      throw new NotFoundException(`This assessment isn't available yet. Check back soon.`);
    }

    const assessment = await this.findOrCreateInProgress(userId, type, mode);
    return this.buildQuestionnaireState(assessment.id, type, assessment.status, mode);
  }

  private async buildQuestionnaireState(
    assessmentId: string,
    type: AssessmentType,
    status: string,
    mode: AssessmentMode = 'FULL',
  ): Promise<AssessmentState> {
    // Definition and answers don't depend on each other — fetch concurrently
    // instead of one round trip at a time.
    const [definition, answerRows] = await Promise.all([
      this.prisma.questionnaireDefinition.findFirst({
        where: { assessmentType: type, isActive: true },
        include: { questions: { orderBy: { order: 'asc' } } },
      }),
      this.prisma.questionnaireAnswer.findMany({ where: { assessmentId } }),
    ]);
    if (!definition) {
      throw new NotFoundException('This assessment type has no questionnaire configured.');
    }

    return this.assembleQuestionnaireState(assessmentId, type, status, mode, definition, answerRows);
  }

  /**
   * Pure assembly, no DB access — shared by buildQuestionnaireState (which
   * fetches definition + answers fresh) and answerQuestion (which already
   * has the definition in hand and only needs a fresh answers read).
   */
  private assembleQuestionnaireState(
    assessmentId: string,
    type: AssessmentType,
    status: string,
    mode: AssessmentMode,
    definition: {
      questions: Array<{
        key: string;
        prompt: string;
        inputType: string;
        options: unknown;
        order: number;
        isRequired: boolean;
      }>;
    },
    answerRows: Array<{ questionKey: string; answer: unknown }>,
  ): AssessmentState {
    const answers: Record<string, unknown> = {};
    for (const row of answerRows) {
      answers[row.questionKey] = row.answer;
    }

    const allQuestions = definition.questions.map((q) => ({
      key: q.key,
      prompt: q.prompt,
      inputType: q.inputType as AssessmentState['questions'][number]['inputType'],
      options: (q.options as Array<{ value: string; label: string }> | null) ?? null,
      order: q.order,
      isRequired: q.isRequired,
    }));

    // PULSE narrows the question set to the curated pulse keys; FULL (every existing
    // caller) sees every question exactly as before.
    const pulseKeys = DAILY_PULSE_QUESTION_KEYS[type];
    const questions = mode === 'PULSE' && pulseKeys ? allQuestions.filter((q) => pulseKeys.includes(q.key)) : allQuestions;

    const nextQuestion = questions.find((q) => !(q.key in answers)) ?? null;
    // PULSE requires all curated questions regardless of each question's
    // own `isRequired` flag (authored for the 6-question FULL flow) — FULL's
    // semantics are completely unchanged.
    const isReadyToComplete =
      status === 'IN_PROGRESS' &&
      (mode === 'PULSE' && pulseKeys
        ? questions.every((q) => q.key in answers)
        : questions.filter((q) => q.isRequired).every((q) => q.key in answers));

    return {
      id: assessmentId,
      type,
      status: status as AssessmentState['status'],
      inputMode: 'QUESTIONNAIRE',
      questions,
      answers,
      nextQuestion,
      mediaAssets: [],
      testResults: {},
      isReadyToComplete,
      mode,
    };
  }

  private async reasonFromQuestionnaire(
    assessmentId: string,
    type: AssessmentType,
    systemPrompt: string,
    mode: AssessmentMode = 'FULL',
  ) {
    const [definition, answers] = await Promise.all([
      this.prisma.questionnaireDefinition.findFirst({
        where: { assessmentType: type, isActive: true },
        include: { questions: true },
      }),
      this.prisma.questionnaireAnswer.findMany({ where: { assessmentId } }),
    ]);
    if (!definition) {
      throw new NotFoundException('This assessment type has no questionnaire configured.');
    }

    const pulseKeys = DAILY_PULSE_QUESTION_KEYS[type];
    const relevantQuestions =
      mode === 'PULSE' && pulseKeys ? definition.questions.filter((q) => pulseKeys.includes(q.key)) : definition.questions;

    const answeredKeys = new Set(answers.map((a) => a.questionKey));
    // Mirrors assembleQuestionnaireState's isReadyToComplete logic: PULSE
    // requires all curated questions regardless of isRequired; FULL keeps
    // its existing isRequired-only semantics untouched.
    const missingRequired =
      mode === 'PULSE' && pulseKeys
        ? relevantQuestions.filter((q) => !answeredKeys.has(q.key))
        : relevantQuestions.filter((q) => q.isRequired && !answeredKeys.has(q.key));
    if (missingRequired.length > 0) {
      throw new BadRequestException(
        `Answer all required questions first: ${missingRequired.map((q) => q.key).join(', ')}`,
      );
    }

    // Naturally contains only the pulse keys for a PULSE assessment —
    // answerQuestion already rejects any other key from ever being written
    // to a PULSE row, so no extra filtering is needed here.
    const input: Record<string, unknown> = {};
    for (const answer of answers) {
      input[answer.questionKey] = answer.answer;
    }

    const output = await this.aiProvider.reason({ systemPrompt, input });
    return { ...output, observations: filterObservationsByAllowlist(type, output.observations) };
  }

  // ---------------------------------------------------------------------
  // Media-capture (camera) assessments
  // ---------------------------------------------------------------------

  private async buildMediaState(
    assessmentId: string,
    type: AssessmentType,
    status: string,
    inputMode: AssessmentInputMode,
  ): Promise<AssessmentState> {
    const [mediaAssets, testResults] = await Promise.all([
      this.prisma.mediaAsset.findMany({ where: { assessmentId }, orderBy: { createdAt: 'asc' } }),
      this.getTestResults(assessmentId),
    ]);

    return {
      id: assessmentId,
      type,
      status: status as AssessmentState['status'],
      inputMode,
      questions: [],
      answers: {},
      nextQuestion: null,
      mediaAssets: mediaAssets.map((m) => ({ id: m.id, kind: m.kind, captureLabel: m.captureLabel })),
      testResults,
      isReadyToComplete:
        status === 'IN_PROGRESS' &&
        (inputMode === 'INTERACTIVE_TEST' ? Object.keys(testResults).length > 0 : mediaAssets.length > 0),
    };
  }

  private async getTestResults(assessmentId: string): Promise<Record<string, unknown>> {
    const rows = await this.prisma.questionnaireAnswer.findMany({ where: { assessmentId } });
    const results: Record<string, unknown> = {};
    for (const row of rows) {
      results[row.questionKey] = row.answer;
    }
    return results;
  }

  private async reasonFromMedia(assessmentId: string, systemPrompt: string) {
    const mediaAssets = await this.prisma.mediaAsset.findMany({ where: { assessmentId } });
    const testResults = await this.getTestResults(assessmentId);
    if (mediaAssets.length === 0 && Object.keys(testResults).length === 0) {
      throw new BadRequestException('Capture at least one photo, recording, or test result before completing this assessment.');
    }

    const images: AiReasoningImage[] = [];
    const transcripts: string[] = [];
    for (const asset of mediaAssets) {
      const buffer = await this.storage.getBuffer(asset.storagePath);
      if (asset.kind === 'AUDIO') {
        const { text } = await this.transcription.transcribe(buffer, asset.mimeType);
        transcripts.push(text);
      } else {
        images.push({
          data: buffer.toString('base64'),
          mediaType: MIME_TO_IMAGE_TYPE[asset.mimeType] ?? 'image/jpeg',
        });
      }
    }

    // Hand Coordination's stored result is one richly-nested object
    // (round-by-round logs, per-round reaction times, etc.) — passed through
    // as-is, MockAiProvider's generic observation fallback would
    // JSON-stringify it wholesale onto the report. Flattened into clean
    // top-level fields instead, so each shows up as its own readable
    // observation row. Every other test-result key passes through untouched.
    const { handCoordination, ...otherTestResults } = testResults;

    const output = await this.aiProvider.reason({
      systemPrompt,
      input: {
        // Omitted entirely (rather than an empty array) for interactive
        // tests, which have no media at all — an empty captureLabels list
        // isn't a useful observation.
        ...(mediaAssets.length > 0
          ? {
              captureLabels: mediaAssets.map(
                (a) => a.captureLabel ?? 'capture',
              ),
            }
          : {}),
        ...(transcripts.length > 0
          ? { transcript: transcripts.join('\n') }
          : {}),
        ...otherTestResults,
        ...(handCoordination
          ? summarizeHandCoordinationResult(handCoordination)
          : {}),
      },
      images,
    });

    // The caller only passes the assessment id, so look the module up here to
    // pick its observation-label allowlist.
    const assessment = await this.prisma.assessment.findUnique({
      where: { id: assessmentId },
      select: { type: true },
    });
    return assessment
      ? { ...output, observations: filterObservationsByAllowlist(assessment.type, output.observations) }
      : output;
  }

  // ---------------------------------------------------------------------
  // Shared helpers
  // ---------------------------------------------------------------------

  private async findOrCreateInProgress(userId: string, type: AssessmentType, mode: AssessmentMode = 'FULL') {
    // Mode-scoped lookup: a FULL and a PULSE row for the same type can be
    // in-progress at once (e.g. today's quick pulse alongside a deep retake
    // started but not finished).
    const existing = await this.prisma.assessment.findFirst({
      where: { userId, type, status: 'IN_PROGRESS', mode },
    });

    if (existing) {
      // A PULSE row left mid-way on a *prior* local day shouldn't silently
      // resume as if it's today's check-in — that would score today's
      // streak off a stale yesterday-mood answer. FULL's existing
      // resume-anytime behavior is completely untouched below.
      const isStalePulse = mode === 'PULSE' && !(await this.isPulseFromToday(userId, existing.startedAt));
      if (isStalePulse) {
        await this.prisma.assessment.update({ where: { id: existing.id }, data: { status: 'ABANDONED' } });
      } else {
        return existing;
      }
    }

    return this.prisma.assessment.create({
      data: { userId, type, status: 'IN_PROGRESS', startedAt: new Date(), mode },
    });
  }

  /** Only ever called for PULSE — FULL's indefinite-resume behavior never
   * needs to know what day it is. */
  private async isPulseFromToday(userId: string, startedAt: Date | null): Promise<boolean> {
    if (!startedAt) return false;
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { timezone: true } });
    return isSameDayInZone(startedAt, new Date(), user?.timezone);
  }

  private async findOwnedAssessment(userId: string, assessmentId: string) {
    const assessment = await this.prisma.assessment.findUnique({ where: { id: assessmentId } });
    return assertOwnedResource(assessment, userId, 'Assessment');
  }

  /**
   * Appends a trend point after every scored completion, of every type.
   *
   * The snapshot is rebuilt from the latest score of each type, the same
   * computation DashboardService.getSummary runs live, instead of copying the
   * previous snapshot forward. Copying forward is how a score written under an
   * old type→dimension mapping (e.g. EYE under mentalWellness, before a remap)
   * stayed on the dashboard indefinitely.
   */
  private async updateWellnessSnapshot(userId: string, type: AssessmentType, score: number) {
    // Defensive: a row whose type predates the current enum has no dimension.
    if (!(type in ASSESSMENT_TYPE_TO_DIMENSION)) return;

    // The just-completed score goes first. It is the newest by definition, and
    // computeWellnessSummary keeps the first entry per type, so this holds
    // even if the read below doesn't see the transaction's write yet.
    const latest = await findLatestScoresByType(this.prisma, userId);
    const summary = computeWellnessSummary([{ type, score }, ...latest]);
    const overallScore = summary.overallScore ?? score;

    const columns: Record<WellnessDimensionField, number | null> = {
      cardioScore: null,
      mentalWellnessScore: null,
      nutritionScore: null,
      hydrationScore: null,
      fitnessScore: null,
      recoveryScore: null,
      sleepScore: null,
      lifestyleScore: null,
    };
    for (const dimension of summary.dimensions) {
      const column = DIMENSION_TO_SNAPSHOT_COLUMN[dimension.key];
      if (column) columns[column] = dimension.score;
    }

    await this.prisma.wellnessSnapshot.create({
      data: { userId, overallScore, ...columns, riskLevel: riskLevelForScore(overallScore) },
    });
  }
}
