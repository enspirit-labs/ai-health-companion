import { SetMetadata } from '@nestjs/common';

import { AI_THROTTLE_PROFILE_KEY, type AiThrottleProfile } from './ai-throttle.constants';

/** Marks a route with its per-user AI budget; read by AiUserThrottleGuard. */
export const AiThrottle = (profile: AiThrottleProfile) => SetMetadata(AI_THROTTLE_PROFILE_KEY, profile);
