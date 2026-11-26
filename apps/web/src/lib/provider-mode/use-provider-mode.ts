'use client';

import { useQuery } from '@tanstack/react-query';
import type { ProviderModeDto } from '@aidoctor/shared';

import { clientFetch } from '@/lib/api/client-fetch';

/** Whether the AI provider is the mock. Drives the persistent mock-mode banner. */
export function useProviderMode() {
  return useQuery<ProviderModeDto>({
    queryKey: ['provider-mode'],
    queryFn: () => clientFetch('/api/proxy/providers/mode'),
    staleTime: 5 * 60 * 1000,
    retry: false,
  });
}
