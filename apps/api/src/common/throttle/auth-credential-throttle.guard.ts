import { ExecutionContext, Inject, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import {
  ThrottlerGuard,
  type ThrottlerModuleOptions,
  type ThrottlerRequest,
  type ThrottlerStorage,
} from '@nestjs/throttler';
import { createHash } from 'node:crypto';

import {
  AUTH_THROTTLE_LIMITS,
  AUTH_THROTTLE_MESSAGE,
  AUTH_THROTTLE_OVERALL,
  AUTH_THROTTLE_PROFILE_KEY,
  AUTH_THROTTLER_OPTIONS,
  AUTH_THROTTLER_STORAGE,
  type AuthThrottleProfile,
} from './auth-throttle.constants';

const TOKEN_PROFILES: ReadonlySet<AuthThrottleProfile> = new Set([
  'refresh',
  'logout',
]);

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

/**
 * Per-credential budget for the public auth routes.
 *
 * The global ThrottlerGuard keys by IP, but the API only ever sees the web server's address,
 * so an IP limit on login was one bucket shared by every user: a few failed logins from anyone
 * locked everyone out. These routes skip the global throttle and use this guard instead, applied
 * with @UseGuards so it runs after the global guards without replacing or reordering them.
 *
 * Each route gets three limits: per credential per minute, per credential per hour, and an
 * overall per-route ceiling. The credential is read from the raw body (guards run before the
 * validation pipe), normalised, and hashed, so no email or token is held in the throttle store.
 */
@Injectable()
export class AuthCredentialThrottleGuard extends ThrottlerGuard {
  constructor(
    @Inject(AUTH_THROTTLER_OPTIONS) options: ThrottlerModuleOptions,
    @Inject(AUTH_THROTTLER_STORAGE) storageService: ThrottlerStorage,
    reflector: Reflector,
  ) {
    super(options, storageService, reflector);
  }

  protected override async handleRequest(
    requestProps: ThrottlerRequest,
  ): Promise<boolean> {
    const profile = this.profileOf(requestProps.context);
    if (!profile) return true;
    const name = requestProps.throttler
      .name as keyof (typeof AUTH_THROTTLE_LIMITS)[AuthThrottleProfile];
    const limit = AUTH_THROTTLE_LIMITS[profile][name];
    const getTracker =
      name === AUTH_THROTTLE_OVERALL
        ? () => Promise.resolve('all')
        : (req: Record<string, unknown>) =>
            Promise.resolve(this.credentialTracker(profile, req));
    return super.handleRequest({ ...requestProps, limit, getTracker });
  }

  /** One bucket per profile, limit name and tracker. */
  protected override generateKey(
    context: ExecutionContext,
    suffix: string,
    name: string,
  ): string {
    return sha256(
      `auth-throttle-${this.profileOf(context) ?? 'unknown'}-${name}-${suffix}`,
    );
  }

  protected override getErrorMessage(): Promise<string> {
    return Promise.resolve(AUTH_THROTTLE_MESSAGE);
  }

  private credentialTracker(
    profile: AuthThrottleProfile,
    req: Record<string, unknown>,
  ): string {
    const body = (req.body ?? {}) as Record<string, unknown>;
    if (TOKEN_PROFILES.has(profile)) {
      const token = body.refreshToken;
      return typeof token === 'string' && token.length > 0
        ? `token:${sha256(token)}`
        : 'token:missing';
    }
    const email = body.email;
    if (typeof email !== 'string' || email.trim().length === 0)
      return 'email:missing';
    return `email:${sha256(email.trim().toLowerCase())}`;
  }

  private profileOf(
    context: ExecutionContext,
  ): AuthThrottleProfile | undefined {
    return this.reflector.get<AuthThrottleProfile | undefined>(
      AUTH_THROTTLE_PROFILE_KEY,
      context.getHandler(),
    );
  }
}
