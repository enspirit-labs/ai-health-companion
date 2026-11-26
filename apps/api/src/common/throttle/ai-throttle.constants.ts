/** The AI-backed routes that carry a per-user budget. */
export type AiThrottleProfile = 'chat' | 'complete';

export const AI_THROTTLE_PROFILE_KEY = 'aiThrottleProfile';

/** Throttler names inside the AI throttle module: a short burst cap and a longer cap. */
export const AI_THROTTLE_BURST = 'burst';
export const AI_THROTTLE_HOURLY = 'hourly';

/**
 * Local DI tokens. The guard must NOT use @nestjs/throttler's own option/storage tokens:
 * ThrottlerModule.forRoot registers those globally, so a second forRoot here would replace
 * the global IP limits that app.module.ts configures for every route.
 */
export const AI_THROTTLER_OPTIONS = 'AI_THROTTLER_OPTIONS';
export const AI_THROTTLER_STORAGE = 'AI_THROTTLER_STORAGE';

export const AI_THROTTLE_BURST_TTL_MS = 60_000;
export const AI_THROTTLE_HOURLY_TTL_MS = 3_600_000;

/**
 * Env var holding the limit for each profile and window. Defaults live in
 * env.validation.ts: chat 20/min and 150/hour; complete 15/min and 60/hour.
 */
export const AI_THROTTLE_ENV_KEYS = {
  chat: {
    burst: 'AI_THROTTLE_CHAT_PER_MINUTE',
    hourly: 'AI_THROTTLE_CHAT_PER_HOUR',
  },
  complete: {
    burst: 'AI_THROTTLE_COMPLETE_PER_MINUTE',
    hourly: 'AI_THROTTLE_COMPLETE_PER_HOUR',
  },
} as const;

/** Friendly 429 text. No health content, so no clinician review needed. */
export const AI_THROTTLE_MESSAGE = "You're going a little fast. Please wait a minute and try again.";
