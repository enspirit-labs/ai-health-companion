import { NextRequest, NextResponse } from 'next/server';

import { ACCESS_COOKIE, REFRESH_COOKIE, expiredSessionCookies, sessionCookies } from '@/lib/auth/session-cookies';
import { verifySession, type SessionCheck } from '@/lib/auth/verify-session';

const PROTECTED_PREFIXES = [
  '/dashboard',
  '/profile',
  '/onboarding',
  '/assessments',
  '/reports',
  '/chat',
  '/admin',
  '/settings',
];
const AUTH_ONLY_WHEN_LOGGED_OUT = ['/login', '/signup'];

export async function middleware(req: NextRequest) {
  const accessToken = req.cookies.get(ACCESS_COOKIE)?.value;
  const refreshToken = req.cookies.get(REFRESH_COOKIE)?.value;
  const hasSessionCookie = Boolean(accessToken ?? refreshToken);
  const { pathname } = req.nextUrl;

  const isProtected = PROTECTED_PREFIXES.some((prefix) => pathname.startsWith(prefix));
  if (isProtected && !hasSessionCookie) {
    const loginUrl = new URL('/login', req.url);
    loginUrl.searchParams.set('redirectTo', pathname);
    return NextResponse.redirect(loginUrl);
  }

  const isAuthOnlyPage = AUTH_ONLY_WHEN_LOGGED_OUT.some((prefix) => pathname.startsWith(prefix));
  if (!isAuthOnlyPage) {
    return NextResponse.next();
  }

  // Cookie presence alone isn't proof of a session: an expired, tampered or
  // deactivated one would otherwise bounce /login straight to /dashboard.
  const session: SessionCheck = hasSessionCookie
    ? await verifySession(accessToken, refreshToken)
    : { status: 'invalid' };
  const signedIn = session.status === 'valid' || session.status === 'refreshed';

  const res = signedIn ? NextResponse.redirect(new URL('/dashboard', req.url)) : NextResponse.next();
  // The redirect-or-form decision is per-user; no browser or CDN may reuse it.
  res.headers.set('Cache-Control', 'no-store');

  if (session.status === 'refreshed') {
    for (const [name, value, options] of sessionCookies(session.tokens)) {
      res.cookies.set(name, value, options);
    }
  } else if (session.status === 'invalid' && hasSessionCookie) {
    for (const [name, value, options] of expiredSessionCookies()) {
      res.cookies.set(name, value, options);
    }
  }

  return res;
}

export const config = {
  matcher: [
    '/dashboard/:path*',
    '/profile/:path*',
    '/onboarding/:path*',
    '/assessments/:path*',
    '/reports/:path*',
    '/chat/:path*',
    '/admin/:path*',
    '/settings/:path*',
    '/login',
    '/signup',
  ],
};
