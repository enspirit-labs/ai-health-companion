import { NextRequest, NextResponse } from 'next/server';

import { backendFetch } from '@/lib/api/backend';
import { backendErrorResponse } from '@/lib/api/route-helpers';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const result = await backendFetch('/auth/reset-password', {
      method: 'POST',
      body: JSON.stringify(body),
    });
    return NextResponse.json(result);
  } catch (error) {
    return backendErrorResponse(error);
  }
}
