import { z } from 'zod';
import { ASSESSMENT_STATUS, ASSESSMENT_TYPES, type AssessmentInputMode, type AssessmentType } from './assessment-types';
import { AiStructuredOutputSchema } from './ai-output';

export const QUESTION_INPUT_TYPES = [
  'TEXT',
  'NUMBER',
  'SINGLE_CHOICE',
  'MULTI_CHOICE',
  'BOOLEAN',
  'SCALE',
] as const;
export type QuestionInputType = (typeof QUESTION_INPUT_TYPES)[number];

export const QuestionnaireQuestionSchema = z.object({
  key: z.string(),
  prompt: z.string(),
  inputType: z.enum(QUESTION_INPUT_TYPES),
  options: z.array(z.object({ value: z.string(), label: z.string() })).nullable(),
  order: z.number(),
  isRequired: z.boolean(),
});
export type QuestionnaireQuestionDto = z.infer<typeof QuestionnaireQuestionSchema>;

/**
 * FULL is every assessment's existing behavior. PULSE is the Daily Pulse
 * habit-loop check-in (see DAILY_PULSE_QUESTION_KEYS in ./daily-pulse) —
 * currently only meaningful for MENTAL_WELLNESS.
 */
export const ASSESSMENT_MODES = ['FULL', 'PULSE'] as const;
export type AssessmentMode = (typeof ASSESSMENT_MODES)[number];

export const StartAssessmentSchema = z.object({
  type: z.enum(ASSESSMENT_TYPES),
  /** Optional so every existing caller (web client, tests, fixtures) is
   * unaffected — omission means FULL, matching current behavior exactly. */
  mode: z.enum(ASSESSMENT_MODES).optional(),
});
export type StartAssessmentInput = z.infer<typeof StartAssessmentSchema>;

export const AnswerAssessmentQuestionSchema = z.object({
  questionKey: z.string().min(1),
  answer: z.union([z.string(), z.number(), z.boolean(), z.array(z.string())]),
});
export type AnswerAssessmentQuestionInput = z.infer<typeof AnswerAssessmentQuestionSchema>;

/**
 * Records one sub-test's result on a non-questionnaire assessment (e.g. Eye
 * Assessment's visual-acuity / color-blindness / contrast-sensitivity /
 * dry-eye stages) — free-form, unlike answerQuestion which validates against
 * a QuestionnaireDefinition. `value` is folded into the AI reasoning input
 * alongside any captured photos.
 */
export const RecordTestResultSchema = z.object({
  key: z.string().min(1),
  value: z.union([z.string(), z.number(), z.boolean(), z.array(z.string()), z.record(z.string(), z.unknown())]),
});
export type RecordTestResultInput = z.infer<typeof RecordTestResultSchema>;

/**
 * Optional label sent alongside an uploaded capture (e.g. `front`, `left`,
 * `frame-0`, `reading`). It becomes part of the storage path, so it is held to
 * a strict slug — no dots or slashes, which rules out path traversal.
 */
export const CAPTURE_LABEL_PATTERN = /^[a-z0-9-]{1,32}$/;
export const CaptureLabelSchema = z.string().regex(CAPTURE_LABEL_PATTERN).optional();
export type CaptureLabel = z.infer<typeof CaptureLabelSchema>;

export const MEDIA_ASSET_KINDS = ['IMAGE', 'VIDEO', 'AUDIO'] as const;
export type MediaAssetKind = (typeof MEDIA_ASSET_KINDS)[number];

export const MediaAssetSchema = z.object({
  id: z.string().uuid(),
  kind: z.enum(MEDIA_ASSET_KINDS),
  captureLabel: z.string().nullable(),
});
export type MediaAssetDto = z.infer<typeof MediaAssetSchema>;

export const AssessmentStateSchema = z.object({
  id: z.string().uuid(),
  type: z.enum(ASSESSMENT_TYPES),
  status: z.enum(ASSESSMENT_STATUS),
  inputMode: z.enum([
    'CAMERA_IMAGE',
    'CAMERA_VIDEO',
    'MICROPHONE_AUDIO',
    'QUESTIONNAIRE',
    'INTERACTIVE_TEST',
    'FILE_UPLOAD',
  ]),
  questions: z.array(QuestionnaireQuestionSchema),
  answers: z.record(z.string(), z.unknown()),
  nextQuestion: QuestionnaireQuestionSchema.nullable(),
  mediaAssets: z.array(MediaAssetSchema),
  testResults: z.record(z.string(), z.unknown()),
  isReadyToComplete: z.boolean(),
  /** Optional for the same reason as StartAssessmentSchema.mode — no
   * existing AssessmentState-shaped fixture/mock needs updating. */
  mode: z.enum(ASSESSMENT_MODES).optional(),
});
export type AssessmentState = z.infer<typeof AssessmentStateSchema>;

export const AssessmentResultSchema = AiStructuredOutputSchema.extend({
  assessmentId: z.string().uuid(),
  type: z.enum(ASSESSMENT_TYPES),
  completedAt: z.string().datetime(),
  /** Set for FULL-mode assessments; absent for PULSE (no report is generated). */
  reportId: z.string().uuid().optional(),
  /** True when the deterministic support-card rule fired (FULL Mental Wellness only). */
  supportCard: z.boolean().optional(),
});
export type AssessmentResult = z.infer<typeof AssessmentResultSchema>;

/** Which capture mechanism each assessment module uses — drives which UI the runner page renders. */
export const ASSESSMENT_INPUT_MODE_MAP: Record<AssessmentType, AssessmentInputMode> = {
  FACE: 'CAMERA_IMAGE',
  EYE: 'CAMERA_IMAGE',
  HAIR: 'CAMERA_IMAGE',
  SKIN: 'CAMERA_IMAGE',
  TEETH: 'CAMERA_IMAGE',
  TONGUE: 'CAMERA_IMAGE',
  VOICE: 'MICROPHONE_AUDIO',
  WALKING: 'CAMERA_VIDEO',
  POSTURE: 'CAMERA_IMAGE',
  HAND_COORDINATION: 'INTERACTIVE_TEST',
  MEMORY: 'INTERACTIVE_TEST',
  SQUATS: 'INTERACTIVE_TEST',
  MENTAL_WELLNESS: 'QUESTIONNAIRE',
  LIFESTYLE: 'QUESTIONNAIRE',
};
