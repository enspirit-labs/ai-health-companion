'use client';

export class ClientApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly fieldErrors?: Array<{ path: string; message: string }>,
    /** Machine-readable API error code, e.g. CONSENT_REQUIRED_AI_PROCESSING. */
    public readonly code?: string,
  ) {
    super(message);
  }
}

/** Calls this Next.js app's own /api/* routes (same-origin — cookies attach automatically). */
export async function clientFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...init?.headers },
  });

  const body = await res.json().catch(() => null);

  if (!res.ok) {
    const message = typeof body?.message === 'string' ? body.message : 'Something went wrong';
    throw new ClientApiError(res.status, message, body?.errors, typeof body?.code === 'string' ? body.code : undefined);
  }

  return body as T;
}
