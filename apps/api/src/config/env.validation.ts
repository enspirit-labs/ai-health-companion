import { z } from 'zod';

/** Treats an empty-string env var the same as an unset one (common with .env placeholders). */
const optionalString = () =>
  z.preprocess((val) => (val === '' ? undefined : val), z.string().optional());

const optionalUrl = () =>
  z.preprocess((val) => (val === '' ? undefined : val), z.string().url().optional());

/** Opt-in flag: only 'true' or '1' (case-insensitive) turn it on; unset or anything else is false. */
const optionalFlag = () =>
  z.preprocess(
    (val) => (typeof val === 'string' ? ['true', '1'].includes(val.trim().toLowerCase()) : val),
    z.boolean().default(false),
  );

/** Opt-out flag: on unless set to 'false' or '0' (case-insensitive). */
const defaultOnFlag = () =>
  z.preprocess(
    (val) => (typeof val === 'string' ? !['false', '0'].includes(val.trim().toLowerCase()) : val),
    z.boolean().default(true),
  );

/** Positive integer env var with a safe default (empty string counts as unset). */
const positiveInt = (fallback: number) =>
  z.preprocess((val) => (val === '' ? undefined : val), z.coerce.number().int().positive().default(fallback));

export const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().default(3001),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters'),
  JWT_ACCESS_TTL: z.string().default('15m'),
  JWT_REFRESH_TTL: z.string().default('30d'),

  SUPABASE_URL: optionalUrl(),
  SUPABASE_ANON_KEY: optionalString(),
  SUPABASE_SERVICE_ROLE_KEY: optionalString(),
  SUPABASE_STORAGE_BUCKET: z.string().default('health-media'),

  ANTHROPIC_API_KEY: optionalString(),
  ANTHROPIC_MODEL: z.string().default('claude-opus-5'),
  // Small fast model for the chat safety classifier; defaults in the provider.
  ANTHROPIC_SAFETY_MODEL: optionalString(),
  // Second safety layer behind the red-flag rules. On unless 'false' or '0'.
  SAFETY_CLASSIFIER_ENABLED: defaultOnFlag(),
  OPENAI_API_KEY: optionalString(),

  // Per-user limits on the AI endpoints: chat send and assessment complete.
  // Each has a per-minute burst cap and an hourly cap. Raise them for load tests or e2e.
  AI_THROTTLE_CHAT_PER_MINUTE: positiveInt(20),
  AI_THROTTLE_CHAT_PER_HOUR: positiveInt(150),
  AI_THROTTLE_COMPLETE_PER_MINUTE: positiveInt(15),
  AI_THROTTLE_COMPLETE_PER_HOUR: positiveInt(60),

  WEB_APP_URL: z.string().url().default('http://localhost:3000'),

  // Local-testing only: return the password-reset token in the forgot-password
  // response. Ignored when NODE_ENV=production.
  EXPOSE_DEV_RESET_TOKEN: optionalFlag(),
});

export type EnvConfig = z.infer<typeof envSchema>;

export function validateEnv(config: Record<string, unknown>): EnvConfig {
  const parsed = envSchema.safeParse(config);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
      .join('\n');
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }
  // The model default exists for local dev only. Production must pin it explicitly so a
  // deploy never silently picks up a changed default.
  const nodeEnv = typeof config.NODE_ENV === 'string' ? config.NODE_ENV.trim() : '';
  const model = typeof config.ANTHROPIC_MODEL === 'string' ? config.ANTHROPIC_MODEL.trim() : '';
  if (nodeEnv === 'production' && model === '') {
    throw new Error(
      'Invalid environment configuration:\nANTHROPIC_MODEL: must be set explicitly when NODE_ENV=production',
    );
  }
  return parsed.data;
}
