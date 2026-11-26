import { z } from 'zod';

export const GENDERS = ['MALE', 'FEMALE', 'NON_BINARY', 'PREFER_NOT_TO_SAY'] as const;
export const BLOOD_GROUPS = [
  'A_POS',
  'A_NEG',
  'B_POS',
  'B_NEG',
  'AB_POS',
  'AB_NEG',
  'O_POS',
  'O_NEG',
  'UNKNOWN',
] as const;
export const EXERCISE_LEVELS = ['SEDENTARY', 'LIGHT', 'MODERATE', 'ACTIVE', 'ATHLETE'] as const;
export const DIET_TYPES = [
  'OMNIVORE',
  'VEGETARIAN',
  'VEGAN',
  'PESCATARIAN',
  'KETO',
  'OTHER',
] as const;

export const EmergencyContactSchema = z.object({
  name: z.string().min(1, 'Emergency contact name is required'),
  relationship: z.string().min(1, 'Relationship is required'),
  phone: z.string().min(7, 'Enter a valid phone number'),
});
export type EmergencyContact = z.infer<typeof EmergencyContactSchema>;

export const HealthProfileSchema = z.object({
  // 18+ only; existing profiles under 18 are not migrated.
  age: z.coerce.number().int().min(18, 'You must be 18 or older to use this app').max(120),
  gender: z.enum(GENDERS),
  heightCm: z.coerce.number().min(30).max(272),
  weightKg: z.coerce.number().min(2).max(400),
  bloodGroup: z.enum(BLOOD_GROUPS).default('UNKNOWN'),
  existingConditions: z.array(z.string()).default([]),
  smoking: z.boolean().default(false),
  alcohol: z.boolean().default(false),
  exerciseLevel: z.enum(EXERCISE_LEVELS),
  dietType: z.enum(DIET_TYPES),
  sleepHours: z.coerce.number().min(0).max(24),
  medications: z.array(z.string()).default([]),
  allergies: z.array(z.string()).default([]),
  emergencyContact: EmergencyContactSchema,
});
export type HealthProfileInput = z.infer<typeof HealthProfileSchema>;

export const HealthProfileUpdateSchema = z.object({
  age: HealthProfileSchema.shape.age.optional(),
  gender: HealthProfileSchema.shape.gender.optional(),
  heightCm: HealthProfileSchema.shape.heightCm.optional(),
  weightKg: HealthProfileSchema.shape.weightKg.optional(),
  bloodGroup: HealthProfileSchema.shape.bloodGroup.optional(),
  existingConditions: HealthProfileSchema.shape.existingConditions.optional(),
  smoking: HealthProfileSchema.shape.smoking.optional(),
  alcohol: HealthProfileSchema.shape.alcohol.optional(),
  exerciseLevel: HealthProfileSchema.shape.exerciseLevel.optional(),
  dietType: HealthProfileSchema.shape.dietType.optional(),
  sleepHours: HealthProfileSchema.shape.sleepHours.optional(),
  medications: HealthProfileSchema.shape.medications.optional(),
  allergies: HealthProfileSchema.shape.allergies.optional(),
  emergencyContact: EmergencyContactSchema.partial().optional(),
});
export type HealthProfileUpdateInput = z.infer<typeof HealthProfileUpdateSchema>;

/** Used by the one-question-at-a-time conversational profile flow. */
export const HEALTH_PROFILE_QUESTION_ORDER = [
  'age',
  'gender',
  'heightCm',
  'weightKg',
  'bloodGroup',
  'exerciseLevel',
  'dietType',
  'sleepHours',
  'smoking',
  'alcohol',
  'existingConditions',
  'medications',
  'allergies',
  'emergencyContact',
] as const satisfies readonly (keyof HealthProfileInput)[];

export type HealthProfileQuestionKey = (typeof HEALTH_PROFILE_QUESTION_ORDER)[number];

export const HEALTH_PROFILE_QUESTION_COPY: Record<HealthProfileQuestionKey, string> = {
  age: 'How old are you?',
  gender: 'What is your gender?',
  heightCm: "What's your height (in cm)?",
  weightKg: "What's your weight (in kg)?",
  bloodGroup: 'Do you know your blood group?',
  exerciseLevel: 'How would you describe your typical activity level?',
  dietType: 'What best describes your diet?',
  sleepHours: 'On average, how many hours do you sleep per night?',
  smoking: 'Do you currently smoke?',
  alcohol: 'Do you drink alcohol?',
  existingConditions: 'Do you have any existing medical conditions? (list any, or skip)',
  medications: 'Are you currently taking any medications? (list any, or skip)',
  allergies: 'Do you have any known allergies? (list any, or skip)',
  emergencyContact: "Lastly, who should we contact in case of an emergency?",
};

/**
 * Given the set of question keys already answered (as tracked by the API's
 * HealthProfile.answeredQuestionKeys — not by inspecting field values, since
 * several fields have DB defaults like `smoking: false` that must not be
 * mistaken for an answer), returns the next unanswered key or null when done.
 */
export function getNextHealthProfileQuestion(answeredKeys: readonly string[]): HealthProfileQuestionKey | null {
  const answered = new Set(answeredKeys);
  return HEALTH_PROFILE_QUESTION_ORDER.find((key) => !answered.has(key)) ?? null;
}
