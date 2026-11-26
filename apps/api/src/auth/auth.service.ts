import { randomBytes, createHash } from 'node:crypto';
import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import type { AuthUser, LoginInput, SignupInput } from '@aidoctor/shared';

import { PrismaService } from '../prisma/prisma.service';
import { ConsentService, type ConsentStatus } from '../consent/consent.service';
import { hasHealthProfile } from '../common/health-profile.util';
import { AUTH_PROVIDER, type AuthProvider } from './providers/auth-provider.interface';
import type { JwtPayload } from './strategies/jwt.strategy';

const RESET_TOKEN_TTL_MS = 60 * 60 * 1000; // 1 hour

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

type RequestMeta = { ipAddress?: string; userAgent?: string };

/** `sid` ties the refresh token to a Session row. Tokens issued before
 * sessions existed have none and are rejected (a one-time sign-out). */
interface RefreshPayload {
  sub: string;
  type: string;
  sid?: string;
}

export interface IssuedSession {
  user: AuthUser;
  tokens: {
    accessToken: string;
    refreshToken: string;
    accessTokenExpiresAt: string;
  };
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly consentService: ConsentService,
    @Inject(AUTH_PROVIDER) private readonly authProvider: AuthProvider,
  ) {}

  async signup(input: SignupInput, meta: { ipAddress?: string; userAgent?: string }): Promise<IssuedSession> {
    const existing = await this.prisma.user.findUnique({ where: { email: input.email } });
    if (existing) {
      throw new ConflictException('An account with this email already exists');
    }

    const { externalId, passwordHash } = await this.authProvider.createCredential({
      email: input.email,
      password: input.password,
      fullName: input.fullName,
    });

    const user = await this.prisma.$transaction(async (tx) => {
      const created = await tx.user.create({
        data: {
          email: input.email,
          fullName: input.fullName,
          passwordHash,
          supabaseAuthId: externalId,
          authProvider: 'EMAIL',
        },
      });

      await tx.consentRecord.createMany({
        data: [
          {
            userId: created.id,
            type: 'CAMERA',
            granted: input.consentCamera,
            ipAddress: meta.ipAddress,
            userAgent: meta.userAgent,
          },
          {
            userId: created.id,
            type: 'MICROPHONE',
            granted: input.consentMicrophone,
            ipAddress: meta.ipAddress,
            userAgent: meta.userAgent,
          },
          {
            userId: created.id,
            // Records exactly what the user chose: no auto-grant.
            type: 'DATA_PROCESSING',
            granted: input.consentAiProcessing,
            ipAddress: meta.ipAddress,
            userAgent: meta.userAgent,
          },
        ],
      });

      return created;
    });

    // Audit-log write has no bearing on the response — don't make the caller
    // wait on it (see logActivity).
    this.logActivity(user.id, 'auth.signup', meta, { adultDeclared: true });

    // A brand-new user can't have a health profile yet, and we already know
    // its consent from the input above — skip both round trips rather than
    // re-deriving what we just wrote.
    const sessionId = await this.createSession(user.id, meta);
    return this.issueSession(user, false, {
      camera: input.consentCamera,
      microphone: input.consentMicrophone,
      aiProcessing: input.consentAiProcessing,
    }, sessionId);
  }

  async login(input: LoginInput, meta: { ipAddress?: string; userAgent?: string }): Promise<IssuedSession> {
    const user = await this.prisma.user.findUnique({ where: { email: input.email } });
    if (!user || !user.isActive) {
      throw new UnauthorizedException('Invalid email or password');
    }

    const valid = await this.authProvider.verifyCredential({
      email: input.email,
      password: input.password,
      storedPasswordHash: user.passwordHash,
      externalId: user.supabaseAuthId,
    });

    if (!valid) {
      throw new UnauthorizedException('Invalid email or password');
    }

    this.logActivity(user.id, 'auth.login', meta);

    // Independent reads — issue them concurrently instead of one round trip
    // at a time.
    const [hasProfile, consent, sessionId] = await Promise.all([
      hasHealthProfile(this.prisma, user.id),
      this.consentService.getStatus(user.id),
      this.createSession(user.id, meta),
    ]);

    return this.issueSession(user, hasProfile, consent, sessionId);
  }

  async refresh(refreshToken: string): Promise<IssuedSession> {
    const payload = await this.verifyRefreshToken(refreshToken);

    if (!payload.sid) {
      throw new UnauthorizedException('Session no longer valid');
    }

    const [user, session] = await Promise.all([
      this.prisma.user.findUnique({ where: { id: payload.sub } }),
      this.prisma.session.findUnique({ where: { id: payload.sid } }),
    ]);

    // A valid JWT isn't enough: the session must still exist, belong to this
    // user, and not have been revoked (logout, password reset) or expired.
    if (!session || session.userId !== payload.sub || session.revokedAt || session.expiresAt < new Date()) {
      throw new UnauthorizedException('Session no longer valid');
    }

    if (!user || !user.isActive) {
      throw new UnauthorizedException('Account no longer active');
    }

    const [hasProfile, consent] = await Promise.all([
      hasHealthProfile(this.prisma, user.id),
      this.consentService.getStatus(user.id),
      // Sliding expiry, matching the freshly re-signed refresh JWT.
      this.prisma.session.update({
        where: { id: session.id },
        data: { lastUsedAt: new Date(), expiresAt: this.refreshExpiresAt() },
      }),
    ]);

    return this.issueSession(user, hasProfile, consent, session.id);
  }

  async forgotPassword(email: string): Promise<{ devResetToken?: string }> {
    const user = await this.prisma.user.findUnique({ where: { email } });
    // Always behave the same way whether or not the account exists, so the
    // endpoint can't be used to enumerate registered emails.
    if (!user) {
      return {};
    }

    const rawToken = randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + RESET_TOKEN_TTL_MS);

    await this.prisma.passwordResetToken.create({
      data: { userId: user.id, tokenHash: hashToken(rawToken), expiresAt },
    });

    const resetLink = `${this.config.get<string>('WEB_APP_URL')}/reset-password?token=${rawToken}&email=${encodeURIComponent(email)}`;

    // The token only ever leaves the server when a developer has explicitly
    // opted in (EXPOSE_DEV_RESET_TOKEN) on a non-production build — a missing
    // or mistyped NODE_ENV alone is never enough.
    const exposeDevResetToken =
      this.config.get<string>('NODE_ENV') !== 'production' &&
      String(this.config.get<boolean | string>('EXPOSE_DEV_RESET_TOKEN')) === 'true';

    if (!exposeDevResetToken) {
      // TODO: wire a transactional email provider. Until then, password reset
      // is not deliverable outside local dev, and logging the link here would
      // leak a live credential-reset link into logs.
      this.logger.log(`Password reset requested for ${email}`);
      return {};
    }

    // No email provider is configured yet — surface the link in dev logs (and
    // in the response, for local testing) instead of silently dropping it.
    this.logger.log(`[DEV ONLY] Password reset link for ${email}: ${resetLink}`);
    return { devResetToken: rawToken };
  }

  async resetPassword(params: { email: string; token: string; newPassword: string }): Promise<void> {
    const user = await this.prisma.user.findUnique({ where: { email: params.email } });
    if (!user) {
      throw new BadRequestException('Invalid or expired reset link');
    }

    const tokenHash = hashToken(params.token);
    const record = await this.prisma.passwordResetToken.findUnique({ where: { tokenHash } });

    if (!record || record.userId !== user.id || record.usedAt || record.expiresAt < new Date()) {
      throw new BadRequestException('Invalid or expired reset link');
    }

    const { passwordHash } = await this.authProvider.updateCredentialPassword({
      email: user.email,
      externalId: user.supabaseAuthId,
      newPassword: params.newPassword,
    });

    await this.prisma.$transaction([
      this.prisma.user.update({ where: { id: user.id }, data: { passwordHash } }),
      this.prisma.passwordResetToken.update({ where: { id: record.id }, data: { usedAt: new Date() } }),
      // A reset usually means the old password may be known to someone else —
      // sign out every device that was using it.
      this.prisma.session.updateMany({
        where: { userId: user.id, revokedAt: null },
        data: { revokedAt: new Date() },
      }),
    ]);
  }

  async getMe(userId: string): Promise<AuthUser> {
    // None of these three depend on each other — run them concurrently
    // instead of paying three sequential round trips.
    const [user, hasProfile, consent] = await Promise.all([
      this.prisma.user.findUniqueOrThrow({ where: { id: userId } }),
      hasHealthProfile(this.prisma, userId),
      this.consentService.getStatus(userId),
    ]);
    return this.toAuthUser(user, hasProfile, consent);
  }

  /**
   * Timezone is written here, scoped to the authenticated caller's own row
   * only — the id always comes from the JWT-derived userId, never from the
   * request body, so this can't be used to write another user's row.
   * Validation (a real IANA zone, via Intl) already happened in
   * UpdateTimezoneSchema before this is called.
   */
  async updateTimezone(userId: string, timezone: string): Promise<AuthUser> {
    const [user, hasProfile, consent] = await Promise.all([
      this.prisma.user.update({ where: { id: userId }, data: { timezone } }),
      hasHealthProfile(this.prisma, userId),
      this.consentService.getStatus(userId),
    ]);
    return this.toAuthUser(user, hasProfile, consent);
  }

  /**
   * Revokes only the session this refresh token belongs to — other devices
   * stay signed in. Keyed off the refresh token rather than the access token
   * so it still works after the 15-min access token has expired. Always
   * succeeds: an invalid or already-revoked token has nothing left to revoke,
   * and the caller clears its cookies either way.
   */
  async logout(refreshToken: string, meta: RequestMeta): Promise<void> {
    let payload: RefreshPayload;
    try {
      payload = await this.verifyRefreshToken(refreshToken);
    } catch {
      return;
    }
    if (!payload.sid) return;

    await this.prisma.session.updateMany({
      where: { id: payload.sid, userId: payload.sub, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    this.logActivity(payload.sub, 'auth.logout', meta);
  }

  private async verifyRefreshToken(refreshToken: string): Promise<RefreshPayload> {
    let payload: RefreshPayload;
    try {
      payload = await this.jwt.verifyAsync(refreshToken, { secret: this.config.get<string>('JWT_SECRET') });
    } catch {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    if (payload.type !== 'refresh') {
      throw new UnauthorizedException('Invalid token type');
    }
    return payload;
  }

  private refreshExpiresAt(): Date {
    return new Date(Date.now() + parseDurationMs(this.config.get<string>('JWT_REFRESH_TTL')!, 30 * 86_400_000));
  }

  private async createSession(userId: string, meta: RequestMeta): Promise<string> {
    const session = await this.prisma.session.create({
      data: { userId, expiresAt: this.refreshExpiresAt(), ipAddress: meta.ipAddress, userAgent: meta.userAgent },
    });
    return session.id;
  }

  /**
   * Audit-log writes are analytics, not business logic — the caller's
   * response should never block on one. Fire the insert and log (don't
   * throw) if it fails, instead of awaiting it inline on the hot path.
   */
  private logActivity(
    userId: string,
    action: string,
    meta: { ipAddress?: string; userAgent?: string },
    metadata?: Record<string, boolean>,
  ): void {
    this.prisma.activityLog
      .create({ data: { userId, action, ipAddress: meta.ipAddress, userAgent: meta.userAgent, ...(metadata ? { metadata } : {}) } })
      .catch((error: unknown) => this.logger.error(`Failed to record activity log "${action}" for user ${userId}`, error));
  }

  private toAuthUser(
    user: { id: string; email: string; fullName: string; role: string; avatarUrl: string | null; timezone?: string | null },
    hasHealthProfile: boolean,
    consent: ConsentStatus,
  ): AuthUser {
    return {
      id: user.id,
      email: user.email,
      fullName: user.fullName,
      role: user.role as AuthUser['role'],
      avatarUrl: user.avatarUrl,
      hasHealthProfile,
      consentCamera: consent.camera,
      consentMicrophone: consent.microphone,
      consentAiProcessing: consent.aiProcessing,
      // Optional on the param type (not every caller's user object carries
      // it — e.g. issueSession's callers construct a plain object at signup
      // time, before a timezone could ever be known) — null until the
      // client's first PATCH /auth/me.
      timezone: user.timezone ?? null,
    };
  }

  private async issueSession(
    user: { id: string; email: string; fullName: string; role: string; avatarUrl: string | null; timezone?: string | null },
    hasHealthProfile: boolean,
    consent: ConsentStatus,
    sessionId: string,
  ): Promise<IssuedSession> {
    // Every caller already has the user row and consent status in hand —
    // this used to re-fetch both from the DB, paying two more round trips
    // for data we already had in memory.
    const accessPayload: JwtPayload = { sub: user.id, email: user.email, role: user.role as JwtPayload['role'], type: 'access' };
    const accessTtl = this.config.get<string>('JWT_ACCESS_TTL')!;
    const refreshTtl = this.config.get<string>('JWT_REFRESH_TTL')!;

    // JwtSignOptions#expiresIn is typed against `ms`'s branded StringValue
    // literal, which a runtime env-var string can't satisfy statically even
    // though "15m"/"30d" are valid values at runtime.
    const accessToken = await this.jwt.signAsync(accessPayload, {
      expiresIn: accessTtl as unknown as number,
    });
    const refreshPayload: RefreshPayload = { sub: user.id, type: 'refresh', sid: sessionId };
    const refreshToken = await this.jwt.signAsync(refreshPayload, {
      expiresIn: refreshTtl as unknown as number,
    });

    return {
      user: this.toAuthUser(user, hasHealthProfile, consent),
      tokens: {
        accessToken,
        refreshToken,
        accessTokenExpiresAt: new Date(Date.now() + parseDurationMs(accessTtl)).toISOString(),
      },
    };
  }
}

function parseDurationMs(duration: string, fallbackMs = 15 * 60 * 1000): number {
  const match = /^(\d+)(s|m|h|d)$/.exec(duration);
  if (!match) return fallbackMs;
  const value = Number(match[1]);
  const unit = match[2];
  const unitMs = { s: 1000, m: 60_000, h: 3_600_000, d: 86_400_000 }[unit]!;
  return value * unitMs;
}
