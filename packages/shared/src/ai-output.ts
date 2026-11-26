import { z } from 'zod';
import { RISK_LEVELS } from './assessment-types';

/**
 * Every AI reasoning call (vision, voice, questionnaire scoring, aggregation)
 * must return this exact shape. Enforced both when parsing the LLM response
 * (backend) and when rendering results (frontend) so a malformed model
 * output fails loudly instead of silently reaching the UI.
 */
export const AiObservationSchema = z.object({
  label: z.string().min(1),
  value: z.string().min(1),
  severity: z.enum(RISK_LEVELS).optional(),
});
export type AiObservation = z.infer<typeof AiObservationSchema>;

export const AiRecommendationSchema = z.object({
  title: z.string().min(1),
  detail: z.string().min(1),
  priority: z.enum(['LOW', 'MEDIUM', 'HIGH']).default('MEDIUM'),
});
export type AiRecommendation = z.infer<typeof AiRecommendationSchema>;

export const AiStructuredOutputSchema = z.object({
  score: z.number().min(0).max(100),
  observations: z.array(AiObservationSchema),
  recommendations: z.array(AiRecommendationSchema),
  riskLevel: z.enum(RISK_LEVELS),
  confidence: z.number().min(0).max(100),
  disclaimer: z.string().min(1),
});
export type AiStructuredOutput = z.infer<typeof AiStructuredOutputSchema>;

export const OverallWellnessSchema = z.object({
  overallScore: z.number().min(0).max(100),
  cardioScore: z.number().min(0).max(100).nullable(),
  mentalWellnessScore: z.number().min(0).max(100).nullable(),
  nutritionScore: z.number().min(0).max(100).nullable(),
  hydrationScore: z.number().min(0).max(100).nullable(),
  fitnessScore: z.number().min(0).max(100).nullable(),
  recoveryScore: z.number().min(0).max(100).nullable(),
  sleepScore: z.number().min(0).max(100).nullable(),
  lifestyleScore: z.number().min(0).max(100).nullable(),
  riskLevel: z.enum(RISK_LEVELS),
  generatedAt: z.string().datetime(),
});
export type OverallWellness = z.infer<typeof OverallWellnessSchema>;
