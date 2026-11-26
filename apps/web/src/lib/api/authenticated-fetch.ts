import 'server-only';

import { backendFetch } from './backend';
import { withRefreshedToken } from './with-refreshed-token';

/**
 * Calls the NestJS API with the caller's access-token cookie attached. On a
 * 401 (expired access token), attempts exactly one refresh-and-retry using
 * the refresh-token cookie before giving up — mirrors what a client-side
 * interceptor would do, but server-side since tokens live in httpOnly cookies
 * the browser's JS can't read directly.
 */
export function authenticatedFetch(path: string, init?: RequestInit): Promise<unknown> {
  return withRefreshedToken((accessToken) =>
    backendFetch(path, {
      ...init,
      headers: { ...init?.headers, Authorization: `Bearer ${accessToken}` },
    }),
  );
}
