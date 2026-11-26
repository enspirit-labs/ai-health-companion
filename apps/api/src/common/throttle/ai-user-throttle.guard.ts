import { ExecutionContext, Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import {
  ThrottlerGuard,
  type ThrottlerModuleOptions,
  type ThrottlerRequest,
  type ThrottlerStorage,
} from '@nestjs/throttler';
import { createHash } from 'node:crypto';
import { detectRedFlag } from '@aidoctor/shared';

import {
  AI_THROTTLER_OPTIONS,
  AI_THROTTLER_STORAGE,
  AI_THROTTLE_BURST,
  AI_THROTTLE_ENV_KEYS,
  AI_THROTTLE_MESSAGE,
  AI_THROTTLE_PROFILE_KEY,
  type AiThrottleProfile,
} from './ai-throttle.constants';

/**
 * Per-user budget for the AI endpoints (OWASP LLM10).
 *
 * The global ThrottlerGuard keys by IP and runs before JwtAuthGuard, so it cannot
 * see the user. Route guards run after the global ones, so this one is applied
 * with @UseGuards on the routes and keys by `request.user.id`. It never replaces
 * or reorders the global guards.
 *
 * Crisis and emergency messages are never throttled: when the deterministic
 * red-flag rules match the chat body, the guard skips, so the escalation card is
 * always returned. The model-based safety classifier runs inside the chat service
 * and cannot run here.
 */
@Injectable()
export class AiUserThrottleGuard extends ThrottlerGuard {
  constructor(
    @Inject(AI_THROTTLER_OPTIONS) options: ThrottlerModuleOptions,
    @Inject(AI_THROTTLER_STORAGE) storageService: ThrottlerStorage,
    reflector: Reflector,
    private readonly config: ConfigService,
  ) {
    super(options, storageService, reflector);
  }

  protected override shouldSkip(context: ExecutionContext): Promise<boolean> {
    const { req } = this.getRequestResponse(context) as {
      req: { body?: { content?: unknown } };
    };
    const content = req.body?.content;
    return Promise.resolve(typeof content === 'string' && detectRedFlag(content) !== null);
  }

  protected override getTracker(req: Record<string, unknown>): Promise<string> {
    const userId = (req.user as { id?: unknown } | undefined)?.id;
    return Promise.resolve(typeof userId === 'string' && userId.length > 0 ? `user:${userId}` : `ip:${String(req.ip)}`);
  }

  /** One bucket per user and profile, shared by every route of that profile. */
  protected override generateKey(context: ExecutionContext, suffix: string, name: string): string {
    const profile = this.profileOf(context);
    return createHash('sha256')
      .update(`ai-throttle-${profile ?? 'unknown'}-${name}-${suffix}`)
      .digest('hex');
  }

  protected override async handleRequest(requestProps: ThrottlerRequest): Promise<boolean> {
    const profile = this.profileOf(requestProps.context);
    if (!profile) return true;
    const window = requestProps.throttler.name === AI_THROTTLE_BURST ? 'burst' : 'hourly';
    const limit = this.config.getOrThrow<number>(AI_THROTTLE_ENV_KEYS[profile][window]);
    return super.handleRequest({ ...requestProps, limit });
  }

  protected override getErrorMessage(): Promise<string> {
    return Promise.resolve(AI_THROTTLE_MESSAGE);
  }

  private profileOf(context: ExecutionContext): AiThrottleProfile | undefined {
    return this.reflector.get<AiThrottleProfile | undefined>(AI_THROTTLE_PROFILE_KEY, context.getHandler());
  }
}
