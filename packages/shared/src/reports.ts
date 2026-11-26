import { z } from 'zod';
import { ASSESSMENT_TYPES, RISK_LEVELS } from './assessment-types';
import { AiObservationSchema, AiRecommendationSchema } from './ai-output';

export const REPORT_STATUSES = ['GENERATING', 'READY', 'FAILED'] as const;
export type ReportStatus = (typeof REPORT_STATUSES)[number];

export const ReportSectionSchema = z.object({
  id: z.string().uuid(),
  heading: z.string(),
  order: z.number(),
  assessmentType: z.enum(ASSESSMENT_TYPES).nullable(),
  score: z.number().min(0).max(100).nullable(),
  riskLevel: z.enum(RISK_LEVELS).nullable(),
  observations: z.array(AiObservationSchema),
  recommendations: z.array(AiRecommendationSchema),
});
export type ReportSectionDto = z.infer<typeof ReportSectionSchema>;

export const ReportSchema = z.object({
  id: z.string().uuid(),
  title: z.string(),
  status: z.enum(REPORT_STATUSES),
  summary: z.string().nullable(),
  createdAt: z.string().datetime(),
  sections: z.array(ReportSectionSchema),
});
export type ReportDto = z.infer<typeof ReportSchema>;
