import { describe, expect, it } from 'vitest';

import {
  AI_PROCESSING_CONSENT_VALID_FROM,
  AuthUserSchema,
  LoginSchema,
  ResetPasswordSchema,
  SignupSchema,
  UpdateConsentSchema,
  UpdateTimezoneSchema,
} from './auth';

describe('SignupSchema', () => {
  const base = {
    fullName: 'Jane Doe',
    email: 'jane@example.com',
    password: 'Passw0rd1',
    confirmPassword: 'Passw0rd1',
    consentCamera: true,
    consentMicrophone: true,
    confirmedAdult: true as const,
    acceptedTerms: true as const,
  };

  it('accepts a valid signup payload', () => {
    expect(SignupSchema.safeParse(base).success).toBe(true);
  });

  it('rejects mismatched passwords', () => {
    const result = SignupSchema.safeParse({ ...base, confirmPassword: 'Different1' });
    expect(result.success).toBe(false);
  });

  it('rejects a password without a number', () => {
    const result = SignupSchema.safeParse({ ...base, password: 'NoDigitsHere', confirmPassword: 'NoDigitsHere' });
    expect(result.success).toBe(false);
  });

  it('rejects when terms are not accepted', () => {
    const result = SignupSchema.safeParse({ ...base, acceptedTerms: false });
    expect(result.success).toBe(false);
  });

  it('rejects a missing 18+ declaration', () => {
    const { confirmedAdult: _omit, ...withoutDeclaration } = base;
    expect(SignupSchema.safeParse(withoutDeclaration).success).toBe(false);
  });

  it('rejects a false 18+ declaration', () => {
    const result = SignupSchema.safeParse({ ...base, confirmedAdult: false });
    expect(result.success).toBe(false);
    expect(!result.success && result.error.issues[0].path).toEqual(['confirmedAdult']);
  });

  it('accepts a true 18+ declaration', () => {
    expect(SignupSchema.safeParse({ ...base, confirmedAdult: true }).success).toBe(true);
  });

  it('defaults AI-processing consent to false when the field is omitted (signup without it is allowed)', () => {
    const result = SignupSchema.safeParse(base);
    expect(result.success && result.data.consentAiProcessing).toBe(false);
  });

  it('keeps exactly what the user chose for AI-processing consent', () => {
    const granted = SignupSchema.safeParse({ ...base, consentAiProcessing: true });
    const declined = SignupSchema.safeParse({ ...base, consentAiProcessing: false });
    expect(granted.success && granted.data.consentAiProcessing).toBe(true);
    expect(declined.success && declined.data.consentAiProcessing).toBe(false);
  });

  it('rejects a non-boolean AI-processing consent', () => {
    expect(SignupSchema.safeParse({ ...base, consentAiProcessing: 'yes' }).success).toBe(false);
  });
});

describe('UpdateConsentSchema', () => {
  it('accepts granting and withdrawing DATA_PROCESSING (AI processing)', () => {
    expect(UpdateConsentSchema.safeParse({ type: 'DATA_PROCESSING', granted: true }).success).toBe(true);
    expect(UpdateConsentSchema.safeParse({ type: 'DATA_PROCESSING', granted: false }).success).toBe(true);
  });

  it('rejects an unknown consent type', () => {
    expect(UpdateConsentSchema.safeParse({ type: 'NOPE', granted: true }).success).toBe(false);
  });
});

describe('AuthUserSchema', () => {
  it('requires consentAiProcessing alongside camera and microphone', () => {
    const user = {
      id: '3f2b8d5e-4f3a-4c1b-9a77-2d1e5c0b9a10',
      email: 'jane@example.com',
      fullName: 'Jane Doe',
      role: 'USER',
      avatarUrl: null,
      hasHealthProfile: false,
      consentCamera: false,
      consentMicrophone: false,
      timezone: null,
    };
    expect(AuthUserSchema.safeParse(user).success).toBe(false);
    expect(AuthUserSchema.safeParse({ ...user, consentAiProcessing: false }).success).toBe(true);
  });
});

describe('AI_PROCESSING_CONSENT_VALID_FROM', () => {
  it('is 2026-10-27T00:00:00.000Z', () => {
    expect(AI_PROCESSING_CONSENT_VALID_FROM.toISOString()).toBe('2026-10-27T00:00:00.000Z');
  });
});

describe('LoginSchema', () => {
  it('rejects an invalid email', () => {
    expect(LoginSchema.safeParse({ email: 'not-an-email', password: 'x' }).success).toBe(false);
  });
});

describe('ResetPasswordSchema', () => {
  it('rejects mismatched new passwords', () => {
    const result = ResetPasswordSchema.safeParse({
      email: 'jane@example.com',
      token: 'abc',
      password: 'Passw0rd1',
      confirmPassword: 'Passw0rd2',
    });
    expect(result.success).toBe(false);
  });
});

describe('UpdateTimezoneSchema', () => {
  it('accepts a real IANA zone', () => {
    expect(UpdateTimezoneSchema.safeParse({ timezone: 'Asia/Kolkata' }).success).toBe(true);
    expect(UpdateTimezoneSchema.safeParse({ timezone: 'UTC' }).success).toBe(true);
    expect(UpdateTimezoneSchema.safeParse({ timezone: 'America/New_York' }).success).toBe(true);
  });

  it('rejects a garbage zone name', () => {
    expect(UpdateTimezoneSchema.safeParse({ timezone: 'Not/AZone' }).success).toBe(false);
  });

  it('rejects an empty string', () => {
    expect(UpdateTimezoneSchema.safeParse({ timezone: '' }).success).toBe(false);
  });

  it('rejects a non-string', () => {
    expect(UpdateTimezoneSchema.safeParse({ timezone: 123 }).success).toBe(false);
  });
});
