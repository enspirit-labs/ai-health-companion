import nextConfig, { SECURITY_HEADERS } from './next.config';

function headerValue(key: string): string | undefined {
  return SECURITY_HEADERS.find((h) => h.key === key)?.value;
}

describe('next.config', () => {
  describe('security headers', () => {
    it('applies the security headers to every route', async () => {
      const rules = await nextConfig.headers!();
      const all = rules.find((r) => r.source === '/:path*');
      expect(all?.headers).toEqual(SECURITY_HEADERS);
    });

    it('keeps the long cache on the MediaPipe assets', async () => {
      const rules = await nextConfig.headers!();
      const cv = rules.find((r) => r.source === '/cv/:path*');
      expect(cv?.headers).toEqual([{ key: 'Cache-Control', value: 'public, max-age=604800' }]);
    });

    it('refuses to be framed by any site', () => {
      expect(headerValue('X-Frame-Options')).toBe('DENY');
      expect(headerValue('Content-Security-Policy')).toContain("frame-ancestors 'none'");
    });

    it('forces HTTPS for a year without committing the domain to the preload list', () => {
      const hsts = headerValue('Strict-Transport-Security');
      expect(hsts).toContain('max-age=31536000');
      expect(hsts).not.toContain('preload');
    });

    it('allows camera and microphone for this origin only, which the assessments need', () => {
      const policy = headerValue('Permissions-Policy');
      expect(policy).toContain('camera=(self)');
      expect(policy).toContain('microphone=(self)');
    });

    it('does not restrict the clipboard, which chat uses to copy replies', () => {
      expect(headerValue('Permissions-Policy')).not.toMatch(/clipboard/);
    });

    it('does not set a script or style CSP that could block the MediaPipe runtime', () => {
      expect(headerValue('Content-Security-Policy')).not.toMatch(/script-src|style-src|default-src/);
    });
  });

  it('does not advertise the framework', () => {
    expect(nextConfig.poweredByHeader).toBe(false);
  });
});
