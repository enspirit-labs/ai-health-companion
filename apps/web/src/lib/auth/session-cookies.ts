import type { SessionTokens } from '@aidoctor/shared';

// No `server-only` / `next/headers` here — middleware (edge runtime) writes
// these cookies on a NextResponse, while session.ts writes them via cookies().
export const ACCESS_COOKIE = 'ahc_access_token';
export const REFRESH_COOKIE = 'ahc_refresh_token';
// Both cookies live for the full refresh window (mirrors JWT_REFRESH_TTL).
const SESSION_MAX_AGE_S = 60 * 60 * 24 * 30; // 30 days

const isProd = process.env.NODE_ENV === 'production';
const BASE_OPTIONS = { httpOnly: true, secure: isProd, sameSite: 'lax' as const, path: '/' };

type CookieOptions = {
  httpOnly: boolean;
  secure: boolean;
  sameSite: 'lax';
  path: string;
  maxAge: number;
};

export function sessionCookies(tokens: SessionTokens): Array<[string, string, CookieOptions]> {
  // IMPORTANT: do NOT expire the access cookie at the JWT's 15-min TTL. If the
  // browser dropped the cookie when the JWT expired, authenticatedFetch would
  // see no token and throw a hard 401 WITHOUT ever reaching the refresh-on-401
  // path — leaving every request 401 until a full logout/login. Instead the
  // cookie outlives the JWT: the (expired) token still gets sent, the backend
  // returns a real 401, and that triggers refresh-and-retry. The JWT inside is
  // still short-lived and the cookie is httpOnly, so this leaks nothing.
  const options = { ...BASE_OPTIONS, maxAge: SESSION_MAX_AGE_S };
  return [
    [ACCESS_COOKIE, tokens.accessToken, options],
    [REFRESH_COOKIE, tokens.refreshToken, options],
  ];
}

/** Overwrites both cookies with Max-Age=0 and the same name/path/flags they
 * were set with — a mismatched path or flag would leave the original cookie
 * in place and the user still "signed in" after logout. */
export function expiredSessionCookies(): Array<[string, string, CookieOptions]> {
  const options = { ...BASE_OPTIONS, maxAge: 0 };
  return [
    [ACCESS_COOKIE, '', options],
    [REFRESH_COOKIE, '', options],
  ];
}
