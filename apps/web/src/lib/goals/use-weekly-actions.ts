'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { WeeklyActions } from '@aidoctor/shared';

import { clientFetch } from '@/lib/api/client-fetch';

/** `lapsed` swaps in the lighter set of actions (welcome-back state). */
export function useWeeklyActions(lapsed = false) {
  return useQuery<WeeklyActions>({
    queryKey: ['weekly-actions', { lapsed }],
    queryFn: () => clientFetch(`/api/proxy/weekly-actions?lapsed=${lapsed}`),
    staleTime: 60 * 1000,
  });
}

export function useToggleWeeklyAction() {
  const queryClient = useQueryClient();
  return useMutation<unknown, Error, { actionId: string; completed: boolean }>({
    mutationFn: ({ actionId, completed }) =>
      clientFetch(`/api/proxy/weekly-actions/${encodeURIComponent(actionId)}/complete`, {
        method: completed ? 'POST' : 'DELETE',
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['weekly-actions'] });
    },
  });
}
