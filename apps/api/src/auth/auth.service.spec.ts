import { ConflictException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';

import { PrismaService } from '../prisma/prisma.service';
import { ConsentService } from '../consent/consent.service';
import { AuthService } from './auth.service';
import { AUTH_PROVIDER } from './providers/auth-provider.interface';

function buildUser(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'user-1',
    email: 'jane@example.com',
    fullName: 'Jane Doe',
    role: 'USER',
    avatarUrl: null,
    passwordHash: 'hashed',
    supabaseAuthId: null,
    isActive: true,
    ...overrides,
  };
}

describe('AuthService', () => {
  let authService: AuthService;
  let prisma: {
    user: Record<string, jest.Mock>;
    consentRecord: Record<string, jest.Mock>;
    activityLog: Record<string, jest.Mock>;
    healthProfile: Record<string, jest.Mock>;
    passwordResetToken: Record<string, jest.Mock>;
    session: Record<string, jest.Mock>;
    $transaction: jest.Mock;
  };
  let jwt: { signAsync: jest.Mock; verifyAsync: jest.Mock };
  let authProvider: Record<string, jest.Mock>;
  let configValues: Record<string, string | boolean | undefined>;

  beforeEach(async () => {
    configValues = {
      JWT_SECRET: 'test-secret-test-secret-test-secret-32',
      JWT_ACCESS_TTL: '15m',
      JWT_REFRESH_TTL: '30d',
      WEB_APP_URL: 'http://localhost:3000',
      NODE_ENV: 'test',
    };

    prisma = {
      user: { findUnique: jest.fn(), findUniqueOrThrow: jest.fn(), create: jest.fn(), update: jest.fn() },
      consentRecord: { createMany: jest.fn(), findFirst: jest.fn().mockResolvedValue(null) },
      activityLog: { create: jest.fn().mockResolvedValue(undefined) },
      healthProfile: { count: jest.fn().mockResolvedValue(0) },
      passwordResetToken: { create: jest.fn(), findUnique: jest.fn(), update: jest.fn() },
      session: {
        create: jest.fn().mockResolvedValue({ id: 'session-1' }),
        findUnique: jest.fn(),
        update: jest.fn().mockResolvedValue(undefined),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      $transaction: jest.fn(),
    };
    jwt = { signAsync: jest.fn().mockResolvedValue('signed.jwt.token'), verifyAsync: jest.fn() };

    authProvider = {
      createCredential: jest.fn().mockResolvedValue({ externalId: null, passwordHash: 'hashed' }),
      verifyCredential: jest.fn(),
      updateCredentialPassword: jest.fn(),
    };

    const moduleRef = await Test.createTestingModule({
      providers: [
        AuthService,
        ConsentService,
        { provide: PrismaService, useValue: prisma },
        { provide: JwtService, useValue: jwt },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string) => configValues[key]),
          },
        },
        { provide: AUTH_PROVIDER, useValue: authProvider },
      ],
    }).compile();

    authService = moduleRef.get(AuthService);
  });

  describe('signup', () => {
    it('rejects when the email is already registered', async () => {
      prisma.user.findUnique.mockResolvedValue(buildUser());

      await expect(
        authService.signup(
          {
            fullName: 'Jane Doe',
            email: 'jane@example.com',
            password: 'Passw0rd1',
            confirmPassword: 'Passw0rd1',
            consentCamera: true,
            consentMicrophone: true,
            consentAiProcessing: false,
            confirmedAdult: true,
            acceptedTerms: true,
          },
          {},
        ),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    describe.each([
      ['with', true],
      ['without', false],
    ])('%s AI-processing consent', (_label, chosen) => {
      it('creates the user, records exactly the consents chosen (no auto-grant), and issues a session', async () => {
        prisma.user.findUnique.mockResolvedValue(null);
        prisma.user.findUniqueOrThrow.mockResolvedValue(buildUser());
        const createMany = jest.fn();
        prisma.$transaction.mockImplementation(async (fn: any) => {
          const tx = {
            user: { create: jest.fn().mockResolvedValue(buildUser()) },
            consentRecord: { createMany },
            activityLog: { create: jest.fn() },
          };
          return fn(tx);
        });

        const result = await authService.signup(
          {
            fullName: 'Jane Doe',
            email: 'jane@example.com',
            password: 'Passw0rd1',
            confirmPassword: 'Passw0rd1',
            consentCamera: true,
            consentMicrophone: false,
            consentAiProcessing: chosen,
            confirmedAdult: true,
            acceptedTerms: true,
          },
          { ipAddress: '127.0.0.1', userAgent: 'jest' },
        );

        expect(authProvider.createCredential).toHaveBeenCalledWith(
          expect.objectContaining({ email: 'jane@example.com' }),
        );
        const rows = (createMany.mock.calls[0][0] as { data: { type: string; granted: boolean }[] }).data;
        expect(rows.map((r) => [r.type, r.granted])).toEqual([
          ['CAMERA', true],
          ['MICROPHONE', false],
          ['DATA_PROCESSING', chosen],
        ]);
        expect(prisma.activityLog.create).toHaveBeenCalledWith({
          data: expect.objectContaining({
            action: 'auth.signup',
            metadata: { adultDeclared: true },
          }),
        });
        expect(result.user.email).toBe('jane@example.com');
        expect(result.user.consentAiProcessing).toBe(chosen);
        expect(result.tokens.accessToken).toBe('signed.jwt.token');
      });
    });
  });

  describe('login', () => {
    it('rejects an unknown email without revealing whether it exists', async () => {
      prisma.user.findUnique.mockResolvedValue(null);

      await expect(
        authService.login({ email: 'ghost@example.com', password: 'whatever' }, {}),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('rejects a deactivated account', async () => {
      prisma.user.findUnique.mockResolvedValue(buildUser({ isActive: false }));

      await expect(
        authService.login({ email: 'jane@example.com', password: 'Passw0rd1' }, {}),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('rejects an incorrect password', async () => {
      prisma.user.findUnique.mockResolvedValue(buildUser());
      authProvider.verifyCredential.mockResolvedValue(false);

      await expect(
        authService.login({ email: 'jane@example.com', password: 'wrong' }, {}),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('issues a session on valid credentials', async () => {
      prisma.user.findUnique.mockResolvedValue(buildUser());
      prisma.user.findUniqueOrThrow.mockResolvedValue(buildUser());
      authProvider.verifyCredential.mockResolvedValue(true);

      const result = await authService.login({ email: 'jane@example.com', password: 'Passw0rd1' }, {});

      expect(result.user.hasHealthProfile).toBe(false);
      expect(result.tokens.refreshToken).toBe('signed.jwt.token');
    });

    it('creates a session for this device and ties the refresh token to it', async () => {
      prisma.user.findUnique.mockResolvedValue(buildUser());
      authProvider.verifyCredential.mockResolvedValue(true);

      await authService.login(
        { email: 'jane@example.com', password: 'Passw0rd1' },
        { ipAddress: '10.0.0.1', userAgent: 'jest' },
      );

      expect(prisma.session.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ userId: 'user-1', ipAddress: '10.0.0.1', userAgent: 'jest' }),
      });
      expect(jwt.signAsync).toHaveBeenCalledWith(
        { sub: 'user-1', type: 'refresh', sid: 'session-1' },
        expect.anything(),
      );
    });
  });

  describe('refresh', () => {
    const activeSession = () => ({
      id: 'session-1',
      userId: 'user-1',
      revokedAt: null,
      expiresAt: new Date(Date.now() + 60_000),
    });

    beforeEach(() => {
      jwt.verifyAsync.mockResolvedValue({ sub: 'user-1', type: 'refresh', sid: 'session-1' });
      prisma.user.findUnique.mockResolvedValue(buildUser());
    });

    it('issues new tokens for a live session and extends it', async () => {
      prisma.session.findUnique.mockResolvedValue(activeSession());

      const result = await authService.refresh('refresh.token');

      expect(result.tokens.accessToken).toBe('signed.jwt.token');
      expect(prisma.session.update).toHaveBeenCalledWith({
        where: { id: 'session-1' },
        data: { lastUsedAt: expect.any(Date), expiresAt: expect.any(Date) },
      });
      expect(jwt.signAsync).toHaveBeenCalledWith(
        { sub: 'user-1', type: 'refresh', sid: 'session-1' },
        expect.anything(),
      );
    });

    it('rejects a refresh token whose session was revoked by logout', async () => {
      prisma.session.findUnique.mockResolvedValue({ ...activeSession(), revokedAt: new Date() });

      await expect(authService.refresh('refresh.token')).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('rejects an expired session', async () => {
      prisma.session.findUnique.mockResolvedValue({ ...activeSession(), expiresAt: new Date(Date.now() - 1) });

      await expect(authService.refresh('refresh.token')).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('rejects a session that no longer exists', async () => {
      prisma.session.findUnique.mockResolvedValue(null);

      await expect(authService.refresh('refresh.token')).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it("rejects a token pointing at another user's session", async () => {
      prisma.session.findUnique.mockResolvedValue({ ...activeSession(), userId: 'user-2' });

      await expect(authService.refresh('refresh.token')).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('rejects a legacy refresh token issued before sessions existed', async () => {
      jwt.verifyAsync.mockResolvedValue({ sub: 'user-1', type: 'refresh' });

      await expect(authService.refresh('legacy.token')).rejects.toBeInstanceOf(UnauthorizedException);
      expect(prisma.session.findUnique).not.toHaveBeenCalled();
    });

    it('rejects a tampered or expired JWT', async () => {
      jwt.verifyAsync.mockRejectedValue(new Error('invalid signature'));

      await expect(authService.refresh('tampered.token')).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('rejects a deactivated account even with a live session', async () => {
      prisma.session.findUnique.mockResolvedValue(activeSession());
      prisma.user.findUnique.mockResolvedValue(buildUser({ isActive: false }));

      await expect(authService.refresh('refresh.token')).rejects.toBeInstanceOf(UnauthorizedException);
    });
  });

  describe('logout', () => {
    it("revokes only this device's session", async () => {
      jwt.verifyAsync.mockResolvedValue({ sub: 'user-1', type: 'refresh', sid: 'session-1' });

      await authService.logout('refresh.token', {});

      expect(prisma.session.updateMany).toHaveBeenCalledWith({
        where: { id: 'session-1', userId: 'user-1', revokedAt: null },
        data: { revokedAt: expect.any(Date) },
      });
    });

    it('is a no-op (not an error) for an invalid token', async () => {
      jwt.verifyAsync.mockRejectedValue(new Error('invalid signature'));

      await expect(authService.logout('garbage', {})).resolves.toBeUndefined();
      expect(prisma.session.updateMany).not.toHaveBeenCalled();
    });

    it('is a no-op for a legacy token without a session id', async () => {
      jwt.verifyAsync.mockResolvedValue({ sub: 'user-1', type: 'refresh' });

      await expect(authService.logout('legacy.token', {})).resolves.toBeUndefined();
      expect(prisma.session.updateMany).not.toHaveBeenCalled();
    });

    it('refuses to treat an access token as a refresh token', async () => {
      jwt.verifyAsync.mockResolvedValue({ sub: 'user-1', type: 'access' });

      await authService.logout('access.token', {});

      expect(prisma.session.updateMany).not.toHaveBeenCalled();
    });
  });

  describe('forgotPassword', () => {
    it('does not leak whether the account exists', async () => {
      prisma.user.findUnique.mockResolvedValue(null);

      const result = await authService.forgotPassword('ghost@example.com');

      expect(result).toEqual({});
      expect(prisma.passwordResetToken.create).not.toHaveBeenCalled();
    });

    it('creates a reset token for a known account but does not return it by default', async () => {
      prisma.user.findUnique.mockResolvedValue(buildUser());

      const result = await authService.forgotPassword('jane@example.com');

      expect(prisma.passwordResetToken.create).toHaveBeenCalled();
      expect(result).toEqual({});
    });

    it('does not return the token when NODE_ENV is unset and the opt-in flag is off', async () => {
      configValues.NODE_ENV = undefined;
      prisma.user.findUnique.mockResolvedValue(buildUser());

      const result = await authService.forgotPassword('jane@example.com');

      expect(result).toEqual({});
    });

    it.each([true, 'true'])(
      'returns the token outside production when EXPOSE_DEV_RESET_TOKEN is %p',
      async (flag) => {
        configValues.EXPOSE_DEV_RESET_TOKEN = flag;
        prisma.user.findUnique.mockResolvedValue(buildUser());

        const result = await authService.forgotPassword('jane@example.com');

        expect(result.devResetToken).toMatch(/^[0-9a-f]{64}$/);
      },
    );

    it('never returns the token in production, even with the opt-in flag set', async () => {
      configValues.NODE_ENV = 'production';
      configValues.EXPOSE_DEV_RESET_TOKEN = true;
      prisma.user.findUnique.mockResolvedValue(buildUser());

      const result = await authService.forgotPassword('jane@example.com');

      expect(prisma.passwordResetToken.create).toHaveBeenCalled();
      expect(result).toEqual({});
    });
  });

  describe('resetPassword', () => {
    it('rejects when the token is expired', async () => {
      prisma.user.findUnique.mockResolvedValue(buildUser());
      prisma.passwordResetToken.findUnique.mockResolvedValue({
        id: 'token-1',
        userId: 'user-1',
        usedAt: null,
        expiresAt: new Date(Date.now() - 1000),
      });

      await expect(
        authService.resetPassword({ email: 'jane@example.com', token: 'abc', newPassword: 'NewPassw0rd1' }),
      ).rejects.toThrow();
    });

    it('rejects an already-used token', async () => {
      prisma.user.findUnique.mockResolvedValue(buildUser());
      prisma.passwordResetToken.findUnique.mockResolvedValue({
        id: 'token-1',
        userId: 'user-1',
        usedAt: new Date(),
        expiresAt: new Date(Date.now() + 1000 * 60),
      });

      await expect(
        authService.resetPassword({ email: 'jane@example.com', token: 'abc', newPassword: 'NewPassw0rd1' }),
      ).rejects.toThrow();
    });

    it('updates the password when the token is valid', async () => {
      prisma.user.findUnique.mockResolvedValue(buildUser());
      prisma.passwordResetToken.findUnique.mockResolvedValue({
        id: 'token-1',
        userId: 'user-1',
        usedAt: null,
        expiresAt: new Date(Date.now() + 1000 * 60),
      });
      authProvider.updateCredentialPassword.mockResolvedValue({ passwordHash: 'new-hash' });
      prisma.$transaction.mockResolvedValue(undefined);

      await authService.resetPassword({ email: 'jane@example.com', token: 'abc', newPassword: 'NewPassw0rd1' });

      expect(authProvider.updateCredentialPassword).toHaveBeenCalled();
      expect(prisma.$transaction).toHaveBeenCalled();
    });

    it('signs out every device as part of the reset', async () => {
      prisma.user.findUnique.mockResolvedValue(buildUser());
      prisma.passwordResetToken.findUnique.mockResolvedValue({
        id: 'token-1',
        userId: 'user-1',
        usedAt: null,
        expiresAt: new Date(Date.now() + 1000 * 60),
      });
      authProvider.updateCredentialPassword.mockResolvedValue({ passwordHash: 'new-hash' });
      prisma.$transaction.mockResolvedValue(undefined);

      await authService.resetPassword({ email: 'jane@example.com', token: 'abc', newPassword: 'NewPassw0rd1' });

      expect(prisma.session.updateMany).toHaveBeenCalledWith({
        where: { userId: 'user-1', revokedAt: null },
        data: { revokedAt: expect.any(Date) },
      });
    });
  });

  describe('updateTimezone', () => {
    it('writes the timezone scoped to the given userId only', async () => {
      prisma.user.update.mockResolvedValue(buildUser({ timezone: 'Asia/Kolkata' }));

      await authService.updateTimezone('user-1', 'Asia/Kolkata');

      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: 'user-1' },
        data: { timezone: 'Asia/Kolkata' },
      });
    });

    it('returns the updated timezone on the resulting AuthUser', async () => {
      prisma.user.update.mockResolvedValue(buildUser({ timezone: 'Asia/Kolkata' }));

      const result = await authService.updateTimezone('user-1', 'Asia/Kolkata');

      expect(result.timezone).toBe('Asia/Kolkata');
    });
  });
});
