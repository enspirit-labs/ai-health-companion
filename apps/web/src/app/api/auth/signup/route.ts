import { NextRequest, NextResponse } from 'next/server';
import type { AuthResponse } from '@aidoctor/shared';

import { backendFetch } from '@/lib/api/backend';
import { backendErrorResponse } from '@/lib/api/route-helpers';
import { setSessionCookies } from '@/lib/auth/session';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const result = (await backendFetch('/auth/signup', {
      method: 'POST',
      body: JSON.stringify(body),
    })) as AuthResponse;

    await setSessionCookies(result.tokens);
    return NextResponse.json({ user: result.user });
  } catch (error) {
    return backendErrorResponse(error);
  }
}
