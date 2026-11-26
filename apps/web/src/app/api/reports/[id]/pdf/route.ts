import { NextRequest, NextResponse } from 'next/server';

import { BackendError, BACKEND_URL } from '@/lib/api/backend';
import { withRefreshedToken } from '@/lib/api/with-refreshed-token';

/**
 * Dedicated (non-proxy) route for PDF download: the generic /api/proxy/[...path]
 * route always parses the backend response as JSON, which would corrupt a
 * binary PDF body. This streams the raw bytes through instead, sharing the
 * same refresh-and-retry-on-401 orchestration as the generic proxy.
 */
async function fetchPdf(id: string, accessToken: string): Promise<Response> {
  const res = await fetch(`${BACKEND_URL}/reports/${id}/pdf`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: 'no-store',
  });
  if (res.status === 401) {
    throw new BackendError(401, { message: 'Not authenticated' });
  }
  return res;
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  let res: Response;
  try {
    res = await withRefreshedToken((accessToken) => fetchPdf(id, accessToken));
  } catch (error) {
    if (error instanceof BackendError && error.status === 401) {
      return NextResponse.json({ message: 'Not authenticated' }, { status: 401 });
    }
    throw error;
  }

  if (!res.ok) {
    const body = await res.json().catch(() => ({ message: 'Failed to generate PDF' }));
    return NextResponse.json(body, { status: res.status });
  }

  const buffer = await res.arrayBuffer();
  return new NextResponse(buffer, {
    status: 200,
    headers: {
      'Content-Type': res.headers.get('content-type') ?? 'application/pdf',
      'Content-Disposition': res.headers.get('content-disposition') ?? 'attachment; filename="report.pdf"',
    },
  });
}
