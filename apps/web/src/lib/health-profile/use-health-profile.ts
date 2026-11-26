'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { AuthUser, HealthProfileQuestionKey, HealthProfileUpdateInput } from '@aidoctor/shared';

import { clientFetch } from '@/lib/api/client-fetch';
import { AUTH_QUERY_KEY } from '@/lib/auth/use-auth';

export interface HealthProfileRecord {
  id: string;
  userId: string;
  age: number | null;
  gender: string | null;
  heightCm: number | null;
  weightKg: number | null;
  bloodGroup: string;
  exerciseLevel: string | null;
  dietType: string | null;
  sleepHours: number | null;
  smoking: boolean;
  alcohol: boolean;
  existingConditions: string[];
  medications: string[];
  allergies: string[];
  emergencyContactName: string | null;
  emergencyContactRelationship: string | null;
  emergencyContactPhone: string | null;
  answeredQuestionKeys: string[];
}

export interface HealthProfileState {
  profile: HealthProfileRecord | null;
  isComplete: boolean;
  nextQuestion: HealthProfileQuestionKey | null;
}

export const HEALTH_PROFILE_QUERY_KEY = ['health-profile', 'me'] as const;

export function useHealthProfile() {
  return useQuery<HealthProfileState>({
    queryKey: HEALTH_PROFILE_QUERY_KEY,
    queryFn: () => clientFetch<HealthProfileState>('/api/proxy/health-profile/me'),
    staleTime: 10 * 1000,
  });
}

export function useAnswerHealthProfileQuestion() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (patch: HealthProfileUpdateInput) =>
      clientFetch<HealthProfileState>('/api/proxy/health-profile/me', {
        method: 'PATCH',
        body: JSON.stringify(patch),
      }),
    onSuccess: (data) => {
      queryClient.setQueryData(HEALTH_PROFILE_QUERY_KEY, data);
      // The HealthProfile row is created on the very first answer, so
      // hasHealthProfile flips to true immediately — patch the cache
      // directly rather than invalidating, since invalidateQueries() only
      // refetches queries with an active observer, and nothing observes
      // ['auth','me'] while the user is still on the onboarding page.
      if (data.profile) {
        queryClient.setQueryData<AuthUser | null>(AUTH_QUERY_KEY, (current) =>
          current ? { ...current, hasHealthProfile: true } : current,
        );
      }
    },
  });
}
