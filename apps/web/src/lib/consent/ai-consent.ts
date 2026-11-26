import { CONSENT_REQUIRED_CODES } from '@aidoctor/shared';

import { ClientApiError } from '@/lib/api/client-fetch';

/** True when the API refused an AI call because AI-processing consent is missing or withdrawn. */
export function isAiConsentRequiredError(error: unknown): boolean {
  return (
    error instanceof ClientApiError &&
    error.status === 403 &&
    error.code === CONSENT_REQUIRED_CODES.AI_PROCESSING
  );
}
