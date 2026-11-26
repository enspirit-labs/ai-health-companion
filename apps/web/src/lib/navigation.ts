/**
 * Full page load rather than a client-side route change. Used whenever the
 * signed-in identity changes (login, logout): a reload throws away everything
 * the previous session left in memory — React Query cache, router cache, auth
 * state — so nothing from the old user can render for the new one.
 */
export function hardNavigate(path: string) {
  window.location.assign(path);
}

/** `redirectTo` comes from the URL, so only same-origin paths are honoured —
 * `//evil.example` or `/\evil.example` would otherwise leave the site. */
export function safeRedirectPath(redirectTo: string | null, fallback = '/dashboard'): string {
  if (!redirectTo || !redirectTo.startsWith('/') || redirectTo.startsWith('//') || redirectTo.startsWith('/\\')) {
    return fallback;
  }
  return redirectTo;
}
