import 'server-only';

export const BACKEND_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/api';

export class BackendError extends Error {
  constructor(
    public readonly status: number,
    public readonly body: unknown,
  ) {
    super(
      typeof body === 'object' && body && 'message' in body
        ? String((body as Record<string, unknown>).message)
        : 'Request failed',
    );
  }
}

/** Calls the NestJS API directly. Only for unauthenticated endpoints — see authenticatedFetch for the rest. */
export async function backendFetch(path: string, init?: RequestInit) {
  const res = await fetch(`${BACKEND_URL}${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...init?.headers },
    cache: 'no-store',
  });

  const body = await res.json().catch(() => null);
  if (!res.ok) {
    throw new BackendError(res.status, body);
  }
  return body;
}
