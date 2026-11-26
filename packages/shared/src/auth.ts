import { z } from 'zod';

const passwordSchema = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .regex(/[A-Z]/, 'Password must include an uppercase letter')
  .regex(/[a-z]/, 'Password must include a lowercase letter')
  .regex(/[0-9]/, 'Password must include a number');

export const SignupSchema = z
  .object({
    fullName: z.string().min(2, 'Enter your full name'),
    email: z.string().email('Enter a valid email'),
    password: passwordSchema,
    confirmPassword: z.string(),
    consentCamera: z.boolean(),
    consentMicrophone: z.boolean(),
    /** Explicit consent for sending data to the AI provider (stored as DATA_PROCESSING). Optional; a user may sign up without it. */
    consentAiProcessing: z.boolean().default(false),
    /** 18+ declaration: must be explicitly true. */
    confirmedAdult: z.literal(true, {
      errorMap: () => ({ message: 'You must confirm you are 18 or older to continue' }),
    }),
    acceptedTerms: z.literal(true, {
      errorMap: () => ({ message: 'You must accept the terms to continue' }),
    }),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  });
export type SignupInput = z.infer<typeof SignupSchema>;

export const LoginSchema = z.object({
  email: z.string().email('Enter a valid email'),
  password: z.string().min(1, 'Password is required'),
});
export type LoginInput = z.infer<typeof LoginSchema>;

export const ForgotPasswordSchema = z.object({
  email: z.string().email('Enter a valid email'),
});
export type ForgotPasswordInput = z.infer<typeof ForgotPasswordSchema>;

export const ResetPasswordSchema = z
  .object({
    email: z.string().email('Enter a valid email'),
    token: z.string().min(1),
    password: passwordSchema,
    confirmPassword: z.string(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  });
export type ResetPasswordInput = z.infer<typeof ResetPasswordSchema>;

export const RefreshTokenSchema = z.object({
  refreshToken: z.string().min(1),
});
export type RefreshTokenInput = z.infer<typeof RefreshTokenSchema>;

export const AuthUserSchema = z.object({
  id: z.string().uuid(),
  email: z.string().email(),
  fullName: z.string(),
  role: z.enum(['USER', 'ADMIN', 'SUPPORT']),
  avatarUrl: z.string().nullable(),
  hasHealthProfile: z.boolean(),
  consentCamera: z.boolean(),
  consentMicrophone: z.boolean(),
  consentAiProcessing: z.boolean(),
  /** IANA zone (e.g. "Asia/Kolkata"), null until the client's next visit
   * after this field shipped. Used to bucket streak days in the user's own
   * calendar day rather than UTC's. */
  timezone: z.string().nullable(),
});
export type AuthUser = z.infer<typeof AuthUserSchema>;

/**
 * Validated by asking Intl itself whether it recognizes the zone, rather
 * than maintaining a static IANA list — `Intl.DateTimeFormat` throws
 * `RangeError` synchronously for an unrecognized zone name, so a real
 * garbage/spoofed string is rejected here before it ever reaches
 * date.util.ts's UTC-fallback path (that fallback exists for values that
 * predate this validation or a corrupted DB row, not as this endpoint's
 * primary defense).
 */
export const UpdateTimezoneSchema = z.object({
  timezone: z.string().refine((tz) => {
    try {
      new Intl.DateTimeFormat('en-US', { timeZone: tz });
      return true;
    } catch {
      return false;
    }
  }, 'Not a recognized time zone'),
});
export type UpdateTimezoneInput = z.infer<typeof UpdateTimezoneSchema>;

/**
 * AI-processing consent is the DATA_PROCESSING consent type. Before
 * every signup auto-granted DATA_PROCESSING without telling the user their
 * data goes to an AI provider (Anthropic), so those records are not valid
 * consent. A DATA_PROCESSING grant only counts if it was created at or after
 * this instant. Trade-off: every existing user, including ones who would have
 * agreed, is asked once more; we accept that over relying on consent that was
 * never informed.
 */
export const AI_PROCESSING_CONSENT_VALID_FROM = new Date('2026-10-27T00:00:00.000Z');

export const CONSENT_TYPES = ['CAMERA', 'MICROPHONE', 'DATA_PROCESSING', 'MARKETING'] as const;
export type ConsentType = (typeof CONSENT_TYPES)[number];

/** Stable machine-readable codes returned with a 403 when the server refuses
 * to proceed because the user hasn't granted (or has withdrawn) a consent. */
export const CONSENT_REQUIRED_CODES = {
  CAMERA: 'CONSENT_REQUIRED_CAMERA',
  MICROPHONE: 'CONSENT_REQUIRED_MICROPHONE',
  AI_PROCESSING: 'CONSENT_REQUIRED_AI_PROCESSING',
} as const;
export type ConsentRequiredCode = (typeof CONSENT_REQUIRED_CODES)[keyof typeof CONSENT_REQUIRED_CODES];

export const UpdateConsentSchema = z.object({
  type: z.enum(CONSENT_TYPES),
  granted: z.boolean(),
});
export type UpdateConsentInput = z.infer<typeof UpdateConsentSchema>;

export const SessionTokensSchema = z.object({
  accessToken: z.string(),
  refreshToken: z.string(),
  accessTokenExpiresAt: z.string().datetime(),
});
export type SessionTokens = z.infer<typeof SessionTokensSchema>;

export const AuthResponseSchema = z.object({
  user: AuthUserSchema,
  tokens: SessionTokensSchema,
});
export type AuthResponse = z.infer<typeof AuthResponseSchema>;
