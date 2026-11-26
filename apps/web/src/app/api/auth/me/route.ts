import { NextResponse } from 'next/server';

import { authenticatedFetch } from '@/lib/api/authenticated-fetch';
import { backendErrorResponse, noStore } from '@/lib/api/route-helpers';

export async function GET() {
  try {
    const user = await authenticatedFetch('/auth/me');
    return noStore(NextResponse.json(user));
  } catch (error) {
    return noStore(backendErrorResponse(error));
  }
}
