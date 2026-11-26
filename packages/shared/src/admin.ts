import { z } from 'zod';
import { ASSESSMENT_TYPES } from './assessment-types';

export const USER_ROLES = ['USER', 'ADMIN', 'SUPPORT'] as const;
export type UserRoleValue = (typeof USER_ROLES)[number];

export const AdminUserSchema = z.object({
  id: z.string().uuid(),
  email: z.string().email(),
  fullName: z.string(),
  role: z.enum(USER_ROLES),
  isActive: z.boolean(),
  createdAt: z.string().datetime(),
  completedAssessmentCount: z.number().int(),
});
export type AdminUserDto = z.infer<typeof AdminUserSchema>;

export const UpdateAdminUserSchema = z
  .object({
    role: z.enum(USER_ROLES).optional(),
    isActive: z.boolean().optional(),
  })
  .refine((v) => v.role !== undefined || v.isActive !== undefined, {
    message: 'Provide at least one of role or isActive.',
  });
export type UpdateAdminUserInput = z.infer<typeof UpdateAdminUserSchema>;

export const AdminAssessmentTypeCountSchema = z.object({
  type: z.enum(ASSESSMENT_TYPES),
  count: z.number().int(),
});

export const AdminStatsSchema = z.object({
  totalUsers: z.number().int(),
  activeUsers: z.number().int(),
  signupsLast30Days: z.number().int(),
  totalCompletedAssessments: z.number().int(),
  totalReports: z.number().int(),
  assessmentsByType: z.array(AdminAssessmentTypeCountSchema),
});
export type AdminStatsDto = z.infer<typeof AdminStatsSchema>;

export const AdminPromptTemplateSchema = z.object({
  id: z.string().uuid(),
  key: z.string(),
  assessmentType: z.enum(ASSESSMENT_TYPES).nullable(),
  systemPrompt: z.string(),
  version: z.number().int(),
  isActive: z.boolean(),
  updatedAt: z.string().datetime(),
});
export type AdminPromptTemplateDto = z.infer<typeof AdminPromptTemplateSchema>;

export const UpdateAdminPromptTemplateSchema = z
  .object({
    systemPrompt: z.string().min(1).optional(),
    isActive: z.boolean().optional(),
  })
  .refine((v) => v.systemPrompt !== undefined || v.isActive !== undefined, {
    message: 'Provide at least one of systemPrompt or isActive.',
  });
export type UpdateAdminPromptTemplateInput = z.infer<typeof UpdateAdminPromptTemplateSchema>;

/** Which concrete provider is wired for each switchable service. Never carries keys or URLs. */
export const AI_PROVIDER_NAMES = ['anthropic', 'mock'] as const;
export const STORAGE_PROVIDER_NAMES = ['supabase', 'local'] as const;
export const TRANSCRIPTION_PROVIDER_NAMES = ['whisper', 'mock'] as const;

export const ProviderHealthSchema = z.object({
  ai: z.object({
    provider: z.enum(AI_PROVIDER_NAMES),
    /** Configured model ID; null while the mock AI provider is active (no model is called). */
    model: z.string().nullable(),
  }),
  storage: z.object({ provider: z.enum(STORAGE_PROVIDER_NAMES) }),
  transcription: z.object({ provider: z.enum(TRANSCRIPTION_PROVIDER_NAMES) }),
  /** True when the AI or transcription provider is the mock, so output is not real model output. */
  anyMock: z.boolean(),
});
export type ProviderHealthDto = z.infer<typeof ProviderHealthSchema>;

/** Minimal flag for any signed-in user's banner: whether AI output is mocked. */
export const ProviderModeSchema = z.object({ mock: z.boolean() });
export type ProviderModeDto = z.infer<typeof ProviderModeSchema>;
