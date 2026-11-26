import 'server-only';
import { cookies } from 'next/headers';
import type { SessionTokens } from '@aidoctor/shared';

import { ACCESS_COOKIE, REFRESH_COOKIE, expiredSessionCookies, sessionCookies } from './session-cookies';

export async function setSessionCookies(tokens: SessionTokens) {
  const store = await cookies();
  for (const [name, value, options] of sessionCookies(tokens)) {
    store.set(name, value, options);
  }
}

export async function clearSessionCookies() {
  const store = await cookies();
  for (const [name, value, options] of expiredSessionCookies()) {
    store.set(name, value, options);
  }
}

export async function getAccessToken(): Promise<string | undefined> {
  const store = await cookies();
  return store.get(ACCESS_COOKIE)?.value;
}

export async function getRefreshToken(): Promise<string | undefined> {
  const store = await cookies();
  return store.get(REFRESH_COOKIE)?.value;
}
