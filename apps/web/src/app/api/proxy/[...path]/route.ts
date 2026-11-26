import { NextRequest, NextResponse } from 'next/server';

import { authenticatedFetch } from '@/lib/api/authenticated-fetch';
import { backendErrorResponse, noStore } from '@/lib/api/route-helpers';

/**
 * Same-origin proxy to the NestJS API for every authenticated feature
 * (health profile, assessments, reports, chat, …) so the browser never needs
 * to see the access token — it lives only in an httpOnly cookie on this
 * Next.js app's own domain. See lib/api/authenticated-fetch.ts for the
 * refresh-on-401 behavior.
 *
 * Bodies are forwarded as raw bytes (not decoded as text) so binary payloads
 * — multipart file uploads in particular — aren't corrupted, and the
 * original Content-Type (including the multipart boundary) is forwarded
 * verbatim instead of being overwritten with the default JSON header.
 */
async function proxy(req: NextRequest, path: string[]) {
  try {
    const search = req.nextUrl.search;
    const hasBody = req.method !== 'GET' && req.method !== 'HEAD';
    const bodyBuffer = hasBody ? await req.arrayBuffer() : undefined;
    const contentType = req.headers.get('content-type');

    const result = await authenticatedFetch(`/${path.join('/')}${search}`, {
      method: req.method,
      headers: contentType ? { 'Content-Type': contentType } : undefined,
      body: bodyBuffer && bodyBuffer.byteLength > 0 ? bodyBuffer : undefined,
    });
    return noStore(NextResponse.json(result));
  } catch (error) {
    return noStore(backendErrorResponse(error));
  }
}

type RouteParams = { params: Promise<{ path: string[] }> };

export async function GET(req: NextRequest, { params }: RouteParams) {
  return proxy(req, (await params).path);
}
export async function POST(req: NextRequest, { params }: RouteParams) {
  return proxy(req, (await params).path);
}
export async function PATCH(req: NextRequest, { params }: RouteParams) {
  return proxy(req, (await params).path);
}
export async function PUT(req: NextRequest, { params }: RouteParams) {
  return proxy(req, (await params).path);
}
export async function DELETE(req: NextRequest, { params }: RouteParams) {
  return proxy(req, (await params).path);
}
