import { NextResponse } from 'next/server';
import type { AuthResponse } from '@aidoctor/shared';

import { backendFetch } from '@/lib/api/backend';
import { backendErrorResponse } from '@/lib/api/route-helpers';
import { clearSessionCookies, getRefreshToken, setSessionCookies } from '@/lib/auth/session';

export async function POST() {
  try {
    const refreshToken = await getRefreshToken();
    if (!refreshToken) {
      return NextResponse.json({ message: 'No session to refresh' }, { status: 401 });
    }

    const result = (await backendFetch('/auth/refresh', {
      method: 'POST',
      body: JSON.stringify({ refreshToken }),
    })) as AuthResponse;

    await setSessionCookies(result.tokens);
    return NextResponse.json({ user: result.user });
  } catch (error) {
    await clearSessionCookies();
    return backendErrorResponse(error);
  }
}
