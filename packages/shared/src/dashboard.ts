import { z } from 'zod';
import { ASSESSMENT_STATUS, ASSESSMENT_TYPES, RISK_LEVELS } from './assessment-types';
import { ASSESSMENT_MODES } from './assessment-engine';
import { PulseGameSchema } from './daily-pulse-games';
import { WELLNESS_DIMENSION_KEYS } from './wellness-dimensions';

export const WellnessTrendPointSchema = z.object({
  capturedAt: z.string().datetime(),
  overallScore: z.number().min(0).max(100),
});
export type WellnessTrendPoint = z.infer<typeof WellnessTrendPointSchema>;

export const AssessmentHistoryItemSchema = z.object({
  id: z.string().uuid(),
  type: z.enum(ASSESSMENT_TYPES),
  status: z.enum(ASSESSMENT_STATUS),
  score: z.number().min(0).max(100).nullable(),
  riskLevel: z.enum(RISK_LEVELS).nullable(),
  completedAt: z.string().datetime().nullable(),
  /** Optional — omission reads as FULL. Lets history distinguish a Daily
   * Pulse check-in from a full Mental Wellness Questionnaire. */
  mode: z.enum(ASSESSMENT_MODES).optional(),
});
export type AssessmentHistoryItem = z.infer<typeof AssessmentHistoryItemSchema>;

/** Derived, not stored — see DashboardService.getStreak. */
export const StreakSummarySchema = z.object({
  currentStreak: z.number().int().min(0),
  completedToday: z.boolean(),
  goalDays: z.literal(30),
  /** Days with at least one completion, ever. Never reset by a lapse. */
  totalActiveDays: z.number().int().min(0),
  /**
   * Active before, but the streak has broken. Drives the no-blame welcome-back
   * state and a lighter suggestion; also the lapse signal for weekly actions.
   */
  lapsed: z.boolean(),
});
export type StreakSummary = z.infer<typeof StreakSummarySchema>;

export const RecommendedAssessmentSchema = z.object({
  type: z.enum(ASSESSMENT_TYPES),
});
export type RecommendedAssessment = z.infer<typeof RecommendedAssessmentSchema>;

/**
 * "Something new to try" — recommends a stale assessment (`ASSESSMENT`)
 * until today's Daily Pulse is complete, then switches to a generated game
 * (`GAME`) themed on today's answers. See DashboardService.getRecommendedAssessment.
 */
export const SomethingNewToTrySchema = z.discriminatedUnion('kind', [
  RecommendedAssessmentSchema.extend({ kind: z.literal('ASSESSMENT') }),
  z.object({
    kind: z.literal('GAME'),
    game: PulseGameSchema,
    /**
     * One line tying today's puzzle back to the check-in that produced it, so
     * the dashboard tile can explain *why* this game ("You logged a stressful
     * day — here's something calmer") instead of just showing a board.
     */
    blurb: z.string().min(1),
    /** Drives the tile's completed state and the streak tie-in copy. */
    solvedToday: z.boolean(),
    /** Surfaced on the tile so the player knows what they're in for. */
    difficulty: z.enum(['EASY', 'STANDARD']),
  }),
]);
export type SomethingNewToTry = z.infer<typeof SomethingNewToTrySchema>;

/** Server-enforced kill-switches — see apps/api/src/feature-flags. */
export const FeatureFlagsSchema = z.object({
  dailyPulse: z.boolean(),
  slackReminders: z.boolean(),
  /** Assessment kill-switches — see ASSESSMENT_TYPE_FEATURE_FLAGS. */
  assessmentVoice: z.boolean(),
  assessmentTongue: z.boolean(),
});
export type FeatureFlags = z.infer<typeof FeatureFlagsSchema>;

export const RecentReportItemSchema = z.object({
  id: z.string().uuid(),
  title: z.string(),
  status: z.enum(['GENERATING', 'READY', 'FAILED']),
  createdAt: z.string().datetime(),
});
export type RecentReportItem = z.infer<typeof RecentReportItemSchema>;

export const DashboardRecommendationSchema = z.object({
  title: z.string(),
  detail: z.string(),
  priority: z.enum(['LOW', 'MEDIUM', 'HIGH']),
  sourceAssessment: z.enum(ASSESSMENT_TYPES),
});
export type DashboardRecommendation = z.infer<typeof DashboardRecommendationSchema>;

export const DashboardSummarySchema = z.object({
  hasData: z.boolean(),
  overallScore: z.number().min(0).max(100).nullable(),
  riskLevel: z.enum(RISK_LEVELS).nullable(),
  dimensions: z.array(
    z.object({
      key: z.enum(WELLNESS_DIMENSION_KEYS),
      label: z.string(),
      score: z.number().min(0).max(100).nullable(),
    }),
  ),
  /** The assessment types overallScore is based on (latest score of each). */
  includedTypes: z.array(z.enum(ASSESSMENT_TYPES)),
  /** completedAt of the most recent assessment the summary includes. */
  generatedAt: z.string().datetime().nullable(),
});
export type DashboardSummary = z.infer<typeof DashboardSummarySchema>;
