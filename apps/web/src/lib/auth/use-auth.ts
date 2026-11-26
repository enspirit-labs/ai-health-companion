'use client';

import { useEffect } from 'react';
import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import type {
  AuthUser,
  ForgotPasswordInput,
  LoginInput,
  ResetPasswordInput,
  SignupInput,
} from '@aidoctor/shared';

import { ClientApiError, clientFetch } from '@/lib/api/client-fetch';
import { hardNavigate } from '@/lib/navigation';

export const AUTH_QUERY_KEY = ['auth', 'me'] as const;

/** Exported for testing. Query keys aren't scoped per user, so on sign-in we
 * drop the whole cache — otherwise the new user sees the previous user's
 * dashboard/profile/chat data until a hard refresh. Done on sign-in rather
 * than sign-out: clearing while the dashboard is still mounted makes its
 * queries refetch unauthenticated and trips the global 401 "session
 * expired" redirect in providers.tsx. */
export async function resetCacheForUser(queryClient: QueryClient, user: AuthUser) {
  await queryClient.cancelQueries();
  queryClient.clear();
  queryClient.setQueryData(AUTH_QUERY_KEY, user);
}

export function useCurrentUser() {
  return useQuery<AuthUser | null>({
    queryKey: AUTH_QUERY_KEY,
    queryFn: async () => {
      try {
        return await clientFetch<AuthUser>('/api/auth/me');
      } catch (error) {
        if (error instanceof ClientApiError && error.status === 401) {
          return null;
        }
        throw error;
      }
    },
    staleTime: 60 * 1000,
    retry: false,
  });
}

export function useSignup() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: SignupInput) => clientFetch<{ user: AuthUser }>('/api/auth/signup', {
      method: 'POST',
      body: JSON.stringify(input),
    }),
    onSuccess: (data) => resetCacheForUser(queryClient, data.user),
  });
}

export function useLogin() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: LoginInput) => clientFetch<{ user: AuthUser }>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify(input),
    }),
    onSuccess: (data) => resetCacheForUser(queryClient, data.user),
  });
}

export function useLogout() {
  return useMutation({
    mutationFn: () => clientFetch('/api/auth/logout', { method: 'POST' }),
    // Full reload rather than clearing the cache in place: touching the cache
    // while the dashboard is mounted makes it refetch unauthenticated and trip
    // the global 401 handler. Runs even if the request failed, so the user is
    // never left looking at the previous session.
    onSettled: () => hardNavigate('/login'),
  });
}

export function useForgotPassword() {
  return useMutation({
    mutationFn: (input: ForgotPasswordInput) =>
      clientFetch<{ message: string; devResetToken?: string }>('/api/auth/forgot-password', {
        method: 'POST',
        body: JSON.stringify(input),
      }),
  });
}

export function useResetPassword() {
  return useMutation({
    mutationFn: (input: ResetPasswordInput) =>
      clientFetch<{ message: string }>('/api/auth/reset-password', {
        method: 'POST',
        body: JSON.stringify(input),
      }),
  });
}

/** Pure — exported for testing. `null` detected means the browser's Intl
 * couldn't resolve one; never sync in that case rather than overwriting a
 * real stored value with a false "no timezone" signal. */
export function needsTimezoneSync(detected: string | null, stored: string | null): boolean {
  return detected !== null && detected !== stored;
}

function detectBrowserTimezone(): string | null {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || null;
  } catch {
    return null;
  }
}

/**
 * Silent, one-way sync: detects the browser's IANA zone and PATCHes it to
 * the server only on a mismatch (first visit, or the user traveled/changed
 * zones) — no UI, no prompt. Safe to mount unconditionally wherever a
 * signed-in user renders; it no-ops once the stored value already matches.
 */
export function useTimezoneSync() {
  const { data: user } = useCurrentUser();
  const queryClient = useQueryClient();

  const { mutate, isPending } = useMutation({
    mutationFn: (timezone: string) =>
      clientFetch<AuthUser>('/api/proxy/auth/me', {
        method: 'PATCH',
        body: JSON.stringify({ timezone }),
      }),
    onSuccess: (data) => queryClient.setQueryData(AUTH_QUERY_KEY, data),
  });

  useEffect(() => {
    if (!user || isPending) return;
    const detected = detectBrowserTimezone();
    if (needsTimezoneSync(detected, user.timezone)) {
      mutate(detected as string);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, user?.timezone]);
}
