'use client';

import { useQuery } from '@tanstack/react-query';
import type { FeatureFlags } from '@aidoctor/shared';

import { clientFetch } from '@/lib/api/client-fetch';

/** Server-enforced kill-switches — gate rendering of Daily Pulse/Streak and
 * Slack-reminder UI on these, mirroring the backend's own gating so a
 * disabled feature never shows a UI whose API calls would 404. */
export function useFeatureFlags() {
  return useQuery<FeatureFlags>({
    queryKey: ['feature-flags'],
    queryFn: () => clientFetch('/api/proxy/feature-flags'),
    staleTime: 60 * 1000,
  });
}
