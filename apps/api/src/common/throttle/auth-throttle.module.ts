import { Module } from '@nestjs/common';
import { ThrottlerStorageService } from '@nestjs/throttler';

import {
  AUTH_THROTTLE_BURST,
  AUTH_THROTTLE_HOUR_MS,
  AUTH_THROTTLE_HOURLY,
  AUTH_THROTTLE_MINUTE_MS,
  AUTH_THROTTLE_OVERALL,
  AUTH_THROTTLER_OPTIONS,
  AUTH_THROTTLER_STORAGE,
} from './auth-throttle.constants';
import { AuthCredentialThrottleGuard } from './auth-credential-throttle.guard';

// Own options and storage under local tokens, deliberately NOT ThrottlerModule.forRoot (which
// would override the global IP throttle in app.module.ts). The limits here are placeholders:
// AuthCredentialThrottleGuard resolves the real limit per route from AUTH_THROTTLE_LIMITS.
@Module({
  providers: [
    {
      provide: AUTH_THROTTLER_OPTIONS,
      useValue: [
        { name: AUTH_THROTTLE_BURST, ttl: AUTH_THROTTLE_MINUTE_MS, limit: 1 },
        { name: AUTH_THROTTLE_HOURLY, ttl: AUTH_THROTTLE_HOUR_MS, limit: 1 },
        { name: AUTH_THROTTLE_OVERALL, ttl: AUTH_THROTTLE_MINUTE_MS, limit: 1 },
      ],
    },
    { provide: AUTH_THROTTLER_STORAGE, useClass: ThrottlerStorageService },
    AuthCredentialThrottleGuard,
  ],
  exports: [
    AUTH_THROTTLER_OPTIONS,
    AUTH_THROTTLER_STORAGE,
    AuthCredentialThrottleGuard,
  ],
})
export class AuthThrottleModule {}
