'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { ConsentType } from '@aidoctor/shared';

import { clientFetch } from '@/lib/api/client-fetch';
import { AUTH_QUERY_KEY } from '@/lib/auth/use-auth';

export function useUpdateConsent() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ type, granted }: { type: ConsentType; granted: boolean }) =>
      clientFetch('/api/proxy/consent', {
        method: 'POST',
        body: JSON.stringify({ type, granted }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: AUTH_QUERY_KEY });
    },
  });
}
