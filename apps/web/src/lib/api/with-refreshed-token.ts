import 'server-only';
import type { AuthResponse } from '@aidoctor/shared';

import { clearSessionCookies, getAccessToken, getRefreshToken, setSessionCookies } from '../auth/session';
import { BackendError, backendFetch } from './backend';

/**
 * Runs `attempt` with the caller's current access token. On a 401 (expired
 * access token), refreshes via the refresh-token cookie and retries `attempt`
 * exactly once with the new token before giving up — shared by both the JSON
 * proxy fetch and the binary-safe PDF fetch, which each need this same
 * refresh-and-retry orchestration but differ in how they parse the response.
 */
export async function withRefreshedToken<T>(attempt: (accessToken: string) => Promise<T>): Promise<T> {
  const accessToken = await getAccessToken();
  if (!accessToken) {
    throw new BackendError(401, { message: 'Not authenticated' });
  }

  try {
    return await attempt(accessToken);
  } catch (error) {
    if (!(error instanceof BackendError) || error.status !== 401) {
      throw error;
    }

    const refreshToken = await getRefreshToken();
    if (!refreshToken) {
      await clearSessionCookies();
      throw error;
    }

    let refreshed: AuthResponse;
    try {
      refreshed = (await backendFetch('/auth/refresh', {
        method: 'POST',
        body: JSON.stringify({ refreshToken }),
      })) as AuthResponse;
    } catch (refreshError) {
      // Only clear cookies when the backend has definitively rejected the
      // refresh token (401) — a network error or 5xx while reaching the API
      // (e.g. a brief restart) shouldn't sign the user out.
      if (refreshError instanceof BackendError && refreshError.status === 401) {
        await clearSessionCookies();
      }
      throw error;
    }

    await setSessionCookies(refreshed.tokens);

    return attempt(refreshed.tokens.accessToken);
  }
}
