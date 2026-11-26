/** @jest-environment node */
import { NextRequest } from 'next/server';

import { verifySession } from './lib/auth/verify-session';
import { config, middleware } from './middleware';

jest.mock('./lib/auth/verify-session', () => ({
  ...jest.requireActual('./lib/auth/verify-session'),
  verifySession: jest.fn(),
}));

const verifySessionMock = verifySession as jest.MockedFunction<typeof verifySession>;

function request(path: string, cookies: Record<string, string> = {}) {
  const cookie = Object.entries(cookies)
    .map(([name, value]) => `${name}=${value}`)
    .join('; ');
  return new NextRequest(`http://localhost${path}`, { headers: cookie ? { cookie } : {} });
}

const SESSION = { ahc_access_token: 'access', ahc_refresh_token: 'refresh' };

function setCookies(res: Response) {
  return res.headers.getSetCookie().join('\n');
}

describe('middleware', () => {
  beforeEach(() => verifySessionMock.mockReset());

  describe.each(['/login', '/signup'])('%s', (path) => {
    it('valid session: redirects to /dashboard', async () => {
      verifySessionMock.mockResolvedValueOnce({ status: 'valid' });

      const res = await middleware(request(path, SESSION));

      expect(res.headers.get('location')).toBe('http://localhost/dashboard');
      expect(verifySessionMock).toHaveBeenCalledWith('access', 'refresh');
    });

    it('no session: shows the page without calling the backend', async () => {
      const res = await middleware(request(path));

      expect(res.headers.get('location')).toBeNull();
      expect(verifySessionMock).not.toHaveBeenCalled();
    });

    it('expired or tampered session: shows the page and expires both cookies', async () => {
      verifySessionMock.mockResolvedValueOnce({ status: 'invalid' });

      const res = await middleware(request(path, { ahc_access_token: 'tampered.jwt', ahc_refresh_token: 'tampered.jwt' }));

      expect(res.headers.get('location')).toBeNull();
      expect(setCookies(res)).toMatch(/ahc_access_token=;.*Path=\/;.*Max-Age=0/);
      expect(setCookies(res)).toMatch(/ahc_refresh_token=;.*Path=\/;.*Max-Age=0/);
    });

    it('access token expired but refresh token valid: redirects and stores the new tokens', async () => {
      verifySessionMock.mockResolvedValueOnce({
        status: 'refreshed',
        tokens: { accessToken: 'new-access', refreshToken: 'new-refresh', accessTokenExpiresAt: '2030-01-01T00:00:00.000Z' },
      });

      const res = await middleware(request(path, SESSION));

      expect(res.headers.get('location')).toBe('http://localhost/dashboard');
      expect(setCookies(res)).toContain('ahc_access_token=new-access');
      expect(setCookies(res)).toContain('ahc_refresh_token=new-refresh');
    });

    it('backend unavailable: shows the page but keeps the cookies', async () => {
      verifySessionMock.mockResolvedValueOnce({ status: 'unavailable' });

      const res = await middleware(request(path, SESSION));

      expect(res.headers.get('location')).toBeNull();
      expect(res.headers.getSetCookie()).toEqual([]);
    });

    it.each([
      ['redirect', { status: 'valid' as const }, SESSION],
      ['form', { status: 'invalid' as const }, SESSION],
      ['form (no cookie)', null, {}],
    ])('never lets the %s response be cached', async (_label, session, cookies) => {
      if (session) verifySessionMock.mockResolvedValueOnce(session);

      const res = await middleware(request(path, cookies));

      expect(res.headers.get('cache-control')).toBe('no-store');
    });
  });

  it.each(['/privacy', '/terms'])('%s is public: signed-out users are not redirected', async (path) => {
    const res = await middleware(request(path));

    expect(res.headers.get('location')).toBeNull();
    expect(verifySessionMock).not.toHaveBeenCalled();
  });

  it('does not run on /privacy or /terms at all', () => {
    const matchers = config.matcher.map((m) => m.replace(/\/:path\*$/, ''));
    expect(matchers).not.toContain('/privacy');
    expect(matchers).not.toContain('/terms');
  });

  it.each(['/settings/privacy', '/settings/data', '/settings/goals'])(
    '%s is protected: signed-out users are sent to /login with a redirectTo',
    async (path) => {
      const res = await middleware(request(path));

      expect(res.headers.get('location')).toBe(`http://localhost/login?redirectTo=${encodeURIComponent(path)}`);
      expect(verifySessionMock).not.toHaveBeenCalled();
    },
  );

  it.each(['/settings/privacy', '/settings/data', '/settings/goals'])(
    '%s lets a user with a session cookie through',
    async (path) => {
      const res = await middleware(request(path, SESSION));

      expect(res.headers.get('location')).toBeNull();
    },
  );

  it('runs on /settings pages', () => {
    expect(config.matcher).toContain('/settings/:path*');
  });

  it.each(['/privacy', '/terms', '/login', '/signup'])('%s stays public: a signed-out visitor is not bounced to login', async (path) => {
    const res = await middleware(request(path));

    expect(res.headers.get('location') ?? '').not.toContain('redirectTo');
  });

  it('still sends signed-out users from protected pages to /login', async () => {
    const res = await middleware(request('/dashboard'));

    expect(res.headers.get('location')).toBe('http://localhost/login?redirectTo=%2Fdashboard');
    expect(verifySessionMock).not.toHaveBeenCalled();
  });
});
