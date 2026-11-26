import 'server-only';
import { NextResponse } from 'next/server';

import { BackendError } from './backend';

/** Marks a per-user response as uncacheable, so no browser, proxy or CDN can
 * serve one user's data (or a stale signed-in/out answer) to a later request. */
export function noStore<T extends Response>(res: T): T {
  res.headers.set('Cache-Control', 'no-store');
  return res;
}

/** Maps a BackendError to the equivalent Next.js Route Handler response. */
export function backendErrorResponse(error: unknown): NextResponse {
  if (error instanceof BackendError) {
    return NextResponse.json(error.body ?? { message: error.message }, { status: error.status });
  }
  // eslint-disable-next-line no-console
  console.error('Unexpected route handler error', error);
  return NextResponse.json({ message: 'Something went wrong. Please try again.' }, { status: 500 });
}
