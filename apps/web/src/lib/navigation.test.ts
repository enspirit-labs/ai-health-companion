import { safeRedirectPath } from './navigation';

describe('safeRedirectPath', () => {
  it('keeps a same-site path', () => {
    expect(safeRedirectPath('/reports/r1?tab=summary')).toBe('/reports/r1?tab=summary');
  });

  it('falls back to /dashboard when there is no redirect', () => {
    expect(safeRedirectPath(null)).toBe('/dashboard');
    expect(safeRedirectPath('')).toBe('/dashboard');
  });

  it.each(['https://evil.example', '//evil.example', '/\\evil.example', 'dashboard', 'javascript:alert(1)'])(
    'refuses %s, which could leave the site',
    (redirectTo) => {
      expect(safeRedirectPath(redirectTo)).toBe('/dashboard');
    },
  );
});
