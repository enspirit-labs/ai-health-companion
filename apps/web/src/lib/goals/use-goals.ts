'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { PersonalGoal, UserGoals } from '@aidoctor/shared';

import { clientFetch } from '@/lib/api/client-fetch';

export const GOALS_QUERY_KEY = ['goals'] as const;

export function useGoals() {
  return useQuery<UserGoals>({
    queryKey: GOALS_QUERY_KEY,
    queryFn: () => clientFetch('/api/proxy/goals'),
    staleTime: 60 * 1000,
  });
}

export function useSetGoals() {
  const queryClient = useQueryClient();
  return useMutation<UserGoals, Error, PersonalGoal[]>({
    mutationFn: (goals) =>
      clientFetch('/api/proxy/goals', {
        method: 'PUT',
        body: JSON.stringify({ goals }),
      }),
    onSuccess: (data) => {
      queryClient.setQueryData(GOALS_QUERY_KEY, data);
      // Weekly actions and goal-ranked guidance both follow the goals.
      queryClient.invalidateQueries({ queryKey: ['weekly-actions'] });
    },
  });
}
