/** @jest-environment node */
import { NextRequest } from 'next/server';

import { authenticatedFetch } from '@/lib/api/authenticated-fetch';
import { BackendError } from '@/lib/api/backend';
import { GET as getMe } from './auth/me/route';
import { GET as proxyGet, POST as proxyPost } from './proxy/[...path]/route';

jest.mock('server-only', () => ({}));
jest.mock('@/lib/api/authenticated-fetch', () => ({ authenticatedFetch: jest.fn() }));

const authenticatedFetchMock = authenticatedFetch as jest.MockedFunction<typeof authenticatedFetch>;

const params = (path: string[]) => ({ params: Promise.resolve({ path }) });

// Per-user responses must never be cached by a browser, proxy or CDN — that's
// how one user's data (or a stale signed-in answer) could reach another.
describe('Cache-Control: no-store on per-user API responses', () => {
  beforeEach(() => authenticatedFetchMock.mockReset());

  it('/api/auth/me when signed in', async () => {
    authenticatedFetchMock.mockResolvedValueOnce({ id: 'user-1' });

    const res = await getMe();

    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toBe('no-store');
  });

  it('/api/auth/me when signed out (401)', async () => {
    authenticatedFetchMock.mockRejectedValueOnce(new BackendError(401, { message: 'Not authenticated' }));

    const res = await getMe();

    expect(res.status).toBe(401);
    expect(res.headers.get('cache-control')).toBe('no-store');
  });

  it('/api/proxy/* on success', async () => {
    authenticatedFetchMock.mockResolvedValueOnce({ score: 72 });

    const res = await proxyGet(new NextRequest('http://localhost/api/proxy/dashboard/summary'), params(['dashboard', 'summary']));

    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toBe('no-store');
  });

  it('/api/proxy/* on error', async () => {
    authenticatedFetchMock.mockRejectedValueOnce(new BackendError(401, { message: 'Not authenticated' }));

    const res = await proxyPost(
      new NextRequest('http://localhost/api/proxy/chat/messages', { method: 'POST', body: '{}' }),
      params(['chat', 'messages']),
    );

    expect(res.status).toBe(401);
    expect(res.headers.get('cache-control')).toBe('no-store');
  });
});
