import { SetMetadata } from '@nestjs/common';

import {
  AUTH_THROTTLE_PROFILE_KEY,
  type AuthThrottleProfile,
} from './auth-throttle.constants';

/** Marks a public auth route with its per-credential budget; read by AuthCredentialThrottleGuard. */
export const AuthThrottle = (profile: AuthThrottleProfile) =>
  SetMetadata(AUTH_THROTTLE_PROFILE_KEY, profile);
