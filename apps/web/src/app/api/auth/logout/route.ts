import { NextResponse } from 'next/server';

import { backendFetch } from '@/lib/api/backend';
import { clearSessionCookies, getRefreshToken } from '@/lib/auth/session';

export async function POST() {
  const refreshToken = await getRefreshToken();
  if (refreshToken) {
    try {
      // Revokes this device's session server-side, so the refresh token is
      // dead even if it was copied before logout. Keyed off the refresh token
      // (not the access token) so it works after the 15-min access JWT has
      // expired, and with plain backendFetch since there's nothing to refresh.
      await backendFetch('/auth/logout', {
        method: 'POST',
        body: JSON.stringify({ refreshToken }),
      });
    } catch {
      // Even if the backend call fails, we still want to drop the local
      // session cookies.
    }
  }
  await clearSessionCookies();
  return NextResponse.json({ message: 'Logged out.' });
}
