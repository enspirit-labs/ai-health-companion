import type { AuthResponse, SessionTokens } from '@aidoctor/shared';

const BACKEND_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/api';

export type SessionCheck =
  | { status: 'valid' }
  | { status: 'refreshed'; tokens: SessionTokens }
  | { status: 'invalid' }
  // Backend down or erroring — we can't tell, so don't treat the user as
  // signed in, but don't wipe their cookies either.
  | { status: 'unavailable' };

/**
 * Edge-safe session check for middleware: cookie *presence* isn't proof of a
 * session (an expired or deactivated one would otherwise bounce /login to
 * /dashboard). Mirrors authenticatedFetch's access-then-refresh order, but
 * returns refreshed tokens instead of writing cookies, since middleware sets
 * them on its own response.
 */
export async function verifySession(accessToken?: string, refreshToken?: string): Promise<SessionCheck> {
  if (!accessToken && !refreshToken) return { status: 'invalid' };

  try {
    if (accessToken) {
      const res = await fetch(`${BACKEND_URL}/auth/me`, {
        headers: { Authorization: `Bearer ${accessToken}` },
        cache: 'no-store',
      });
      if (res.ok) return { status: 'valid' };
      if (res.status >= 500) return { status: 'unavailable' };
    }

    if (refreshToken) {
      const res = await fetch(`${BACKEND_URL}/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken }),
        cache: 'no-store',
      });
      if (res.ok) {
        const body = (await res.json()) as AuthResponse;
        return { status: 'refreshed', tokens: body.tokens };
      }
      if (res.status >= 500) return { status: 'unavailable' };
    }

    return { status: 'invalid' };
  } catch {
    return { status: 'unavailable' };
  }
}
