import { Module } from '@nestjs/common';
import { ThrottlerStorageService } from '@nestjs/throttler';

import {
  AI_THROTTLER_OPTIONS,
  AI_THROTTLER_STORAGE,
  AI_THROTTLE_BURST,
  AI_THROTTLE_BURST_TTL_MS,
  AI_THROTTLE_HOURLY,
  AI_THROTTLE_HOURLY_TTL_MS,
} from './ai-throttle.constants';
import { AiUserThrottleGuard } from './ai-user-throttle.guard';

// Its own throttler options and storage under local tokens, deliberately NOT
// ThrottlerModule.forRoot (which would override the global IP throttle in app.module.ts).
// The limits here are placeholders: AiUserThrottleGuard resolves the real per-route limit
// from config, so one module serves chat and complete.
@Module({
  providers: [
    {
      provide: AI_THROTTLER_OPTIONS,
      useValue: [
        { name: AI_THROTTLE_BURST, ttl: AI_THROTTLE_BURST_TTL_MS, limit: 1 },
        { name: AI_THROTTLE_HOURLY, ttl: AI_THROTTLE_HOURLY_TTL_MS, limit: 1 },
      ],
    },
    { provide: AI_THROTTLER_STORAGE, useClass: ThrottlerStorageService },
    AiUserThrottleGuard,
  ],
  exports: [AI_THROTTLER_OPTIONS, AI_THROTTLER_STORAGE, AiUserThrottleGuard],
})
export class AiThrottleModule {}
