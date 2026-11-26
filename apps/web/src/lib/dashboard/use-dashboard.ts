'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  AssessmentHistoryItem,
  AssessmentType,
  DashboardRecommendation,
  DashboardSummary,
  PulseGameCompletedInput,
  RecentReportItem,
  SomethingNewToTry,
  StreakSummary,
  WellnessTrendPoint,
} from '@aidoctor/shared';

import { clientFetch } from '@/lib/api/client-fetch';

export function useDashboardSummary() {
  return useQuery<DashboardSummary>({
    queryKey: ['dashboard', 'summary'],
    queryFn: () => clientFetch('/api/proxy/dashboard/summary'),
    staleTime: 60 * 1000,
  });
}

export function useDashboardTrends(days = 30) {
  return useQuery<WellnessTrendPoint[]>({
    queryKey: ['dashboard', 'trends', days],
    queryFn: () => clientFetch(`/api/proxy/dashboard/trends?days=${days}`),
    staleTime: 60 * 1000,
  });
}

export function useAssessmentHistory() {
  return useQuery<AssessmentHistoryItem[]>({
    queryKey: ['dashboard', 'assessment-history'],
    queryFn: () => clientFetch('/api/proxy/dashboard/assessments/history'),
    staleTime: 60 * 1000,
  });
}

export function useUpcomingAssessments() {
  return useQuery<AssessmentType[]>({
    queryKey: ['dashboard', 'upcoming-assessments'],
    queryFn: () => clientFetch('/api/proxy/dashboard/assessments/upcoming'),
    staleTime: 60 * 1000,
  });
}

export function useRecentReports() {
  return useQuery<RecentReportItem[]>({
    queryKey: ['dashboard', 'recent-reports'],
    queryFn: () => clientFetch('/api/proxy/dashboard/reports/recent'),
    staleTime: 60 * 1000,
  });
}

export function useDashboardRecommendations() {
  return useQuery<DashboardRecommendation[]>({
    queryKey: ['dashboard', 'recommendations'],
    queryFn: () => clientFetch('/api/proxy/dashboard/recommendations'),
    staleTime: 60 * 1000,
  });
}

/** Only rendered behind the daily_pulse flag — see useFeatureFlags. */
export function useDashboardStreak(enabled = true) {
  return useQuery<StreakSummary>({
    queryKey: ['dashboard', 'streak'],
    queryFn: () => clientFetch('/api/proxy/dashboard/streak'),
    staleTime: 60 * 1000,
    // The endpoint answers 404 while daily_pulse is off, so don't request it then.
    enabled,
  });
}

/**
 * "Something new to try" — an ASSESSMENT suggestion until today's Daily
 * Pulse is done, then a generated GAME themed on today's answers. Only
 * rendered behind the daily_pulse flag — see useFeatureFlags.
 */
export function useRecommendedAssessment() {
  return useQuery<SomethingNewToTry>({
    queryKey: ['dashboard', 'recommended-assessment'],
    queryFn: () => clientFetch('/api/proxy/dashboard/assessments/recommended'),
    staleTime: 60 * 1000,
  });
}

/**
 * Fire-and-forget engagement signal for whichever game the user just solved.
 * Carries time/hints/guesses so decisions about the game roster can be
 * made on how the games actually played, not just that they were opened.
 *
 * Invalidates the recommendation query so the dashboard tile flips to its
 * "Solved" state when the player navigates back.
 */
export function useLogPulseGameCompleted() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: PulseGameCompletedInput) =>
      clientFetch('/api/proxy/dashboard/pulse-game/completed', {
        method: 'POST',
        body: JSON.stringify(input),
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['dashboard', 'recommended-assessment'] });
      void queryClient.invalidateQueries({ queryKey: ['dashboard', 'streak'] });
    },
  });
}
