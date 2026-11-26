'use client';

import * as React from 'react';
import { ThemeProvider } from 'next-themes';
import { MutationCache, QueryCache, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { toast } from 'sonner';

import { ClientApiError } from '@/lib/api/client-fetch';

// Module-level, not component state: every query in the app shares one
// QueryCache, and several can reject with 401 in the same tick (the
// dashboard alone fires 6 parallel requests) — this guards against firing
// the redirect/toast more than once for that single logical event.
let isRedirectingToLogin = false;

function handleSessionExpired(error: unknown) {
  if (!(error instanceof ClientApiError) || error.status !== 401) return;
  if (typeof window === 'undefined' || isRedirectingToLogin) return;
  if (window.location.pathname === '/login') return;

  isRedirectingToLogin = true;
  toast.error('Your session has expired. Please sign in again.');
  const redirectTo = encodeURIComponent(window.location.pathname);
  // middleware.ts only checks whether the session cookies are *present*,
  // not whether they're still valid — so if we navigate to /login while
  // the stale cookies are still sitting there, middleware immediately
  // bounces /login back to /dashboard and this becomes an infinite loop.
  // Clear them server-side first (same endpoint a normal sign-out uses),
  // then do a full navigation — a stale QueryClient cache and component
  // tree shouldn't survive an invalidated session either.
  fetch('/api/auth/logout', { method: 'POST' }).finally(() => {
    window.location.assign(`/login?redirectTo=${redirectTo}`);
  });
}

function makeQueryClient() {
  return new QueryClient({
    // Queries and mutations are separate caches with separate onError
    // hooks — starting/answering/completing an assessment, logging out,
    // etc. all go through useMutation, so without this the redirect only
    // ever fired for read (useQuery) failures like the dashboard cards.
    queryCache: new QueryCache({ onError: handleSessionExpired }),
    mutationCache: new MutationCache({ onError: handleSessionExpired }),
    defaultOptions: {
      queries: {
        staleTime: 30 * 1000,
        // Retrying a 401 is pointless — the session is gone, not flaky —
        // so fail immediately and let handleSessionExpired redirect right
        // away instead of making the user wait through one dead retry.
        retry: (failureCount, error) => {
          if (error instanceof ClientApiError && error.status === 401) return false;
          return failureCount < 1;
        },
      },
    },
  });
}

let browserQueryClient: QueryClient | undefined;

function getQueryClient() {
  if (typeof window === 'undefined') {
    return makeQueryClient();
  }
  if (!browserQueryClient) {
    browserQueryClient = makeQueryClient();
  }
  return browserQueryClient;
}

export function Providers({ children }: { children: React.ReactNode }) {
  const queryClient = getQueryClient();

  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </ThemeProvider>
  );
}
