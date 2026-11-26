/**
 * Public auth routes that carry a per-credential budget. Each is keyed by the credential in
 * its body: the email for login, signup, forgot-password and reset-password; the refresh
 * token for refresh and logout.
 */
export type AuthThrottleProfile =
  | 'login'
  | 'signup'
  | 'forgot-password'
  | 'reset-password'
  | 'refresh'
  | 'logout';

export const AUTH_THROTTLE_PROFILE_KEY = 'authThrottleProfile';

/**
 * Throttler names inside the auth throttle module.
 * - burst / hourly: per credential (one email or one refresh token).
 * - overall: one shared bucket per route, a ceiling on total traffic, so rotating emails
 *   cannot get unlimited attempts (and unlimited bcrypt work).
 */
export const AUTH_THROTTLE_BURST = 'burst';
export const AUTH_THROTTLE_HOURLY = 'hourly';
export const AUTH_THROTTLE_OVERALL = 'overall';

/** Local DI tokens; see ai-throttle.constants.ts for why the global throttler tokens are not reused. */
export const AUTH_THROTTLER_OPTIONS = 'AUTH_THROTTLER_OPTIONS';
export const AUTH_THROTTLER_STORAGE = 'AUTH_THROTTLER_STORAGE';

export const AUTH_THROTTLE_MINUTE_MS = 60_000;
export const AUTH_THROTTLE_HOUR_MS = 3_600_000;

type Limits = Record<
  | typeof AUTH_THROTTLE_BURST
  | typeof AUTH_THROTTLE_HOURLY
  | typeof AUTH_THROTTLE_OVERALL,
  number
>;

/**
 * burst: per credential per minute. hourly: per credential per hour. overall: per route per
 * minute, across everyone.
 *
 * The API cannot see the visitor's IP (every request arrives from the web server), so these
 * replace the old per-route IP limits, which in practice were one shared bucket for all users.
 */
export const AUTH_THROTTLE_LIMITS: Record<AuthThrottleProfile, Limits> = {
  login: { burst: 10, hourly: 30, overall: 300 },
  signup: { burst: 5, hourly: 10, overall: 30 },
  'forgot-password': { burst: 5, hourly: 10, overall: 60 },
  'reset-password': { burst: 10, hourly: 30, overall: 120 },
  refresh: { burst: 20, hourly: 200, overall: 1200 },
  logout: { burst: 20, hourly: 100, overall: 600 },
};

/** Friendly 429 text. */
export const AUTH_THROTTLE_MESSAGE =
  'Too many attempts. Please wait a minute and try again.';
