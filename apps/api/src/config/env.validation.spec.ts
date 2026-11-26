import { validateEnv } from './env.validation';

const REQUIRED = {
  DATABASE_URL: 'postgresql://aidoctor:aidoctor@localhost:5432/aidoctor',
  JWT_SECRET: 'test-secret-test-secret-test-secret-32',
};

describe('validateEnv', () => {
  describe('ANTHROPIC_MODEL pinning', () => {
    it('keeps the dev default outside production', () => {
      expect(validateEnv(REQUIRED).ANTHROPIC_MODEL).toBe('claude-opus-5');
    });

    it.each([undefined, '', '  '])('rejects production with ANTHROPIC_MODEL %j', (value) => {
      expect(() =>
        validateEnv({ ...REQUIRED, NODE_ENV: 'production', ANTHROPIC_MODEL: value }),
      ).toThrow(/ANTHROPIC_MODEL/);
    });

    it('accepts production with an explicit model', () => {
      expect(
        validateEnv({ ...REQUIRED, NODE_ENV: 'production', ANTHROPIC_MODEL: 'claude-opus-5' })
          .ANTHROPIC_MODEL,
      ).toBe('claude-opus-5');
    });
  });

  describe('EXPOSE_DEV_RESET_TOKEN', () => {
    it('defaults to false when unset', () => {
      expect(validateEnv(REQUIRED).EXPOSE_DEV_RESET_TOKEN).toBe(false);
    });

    it.each(['true', 'TRUE', '1'])('is true for %j', (value) => {
      expect(validateEnv({ ...REQUIRED, EXPOSE_DEV_RESET_TOKEN: value }).EXPOSE_DEV_RESET_TOKEN).toBe(true);
    });

    it.each(['false', '0', '', 'yes', 'on'])('is false for %j', (value) => {
      expect(validateEnv({ ...REQUIRED, EXPOSE_DEV_RESET_TOKEN: value }).EXPOSE_DEV_RESET_TOKEN).toBe(false);
    });
  });
});
