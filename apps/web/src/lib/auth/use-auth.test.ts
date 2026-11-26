import { createElement, type ReactNode } from 'react';
import { act, renderHook } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { AuthUser } from '@aidoctor/shared';

import { clientFetch } from '@/lib/api/client-fetch';
import { hardNavigate } from '@/lib/navigation';
import { AUTH_QUERY_KEY, needsTimezoneSync, resetCacheForUser, useLogin, useLogout } from './use-auth';

jest.mock('@/lib/api/client-fetch', () => ({
  ...jest.requireActual('@/lib/api/client-fetch'),
  clientFetch: jest.fn(),
}));
jest.mock('@/lib/navigation', () => ({ hardNavigate: jest.fn() }));

const clientFetchMock = clientFetch as jest.MockedFunction<typeof clientFetch>;
const hardNavigateMock = hardNavigate as jest.MockedFunction<typeof hardNavigate>;

function withClient(queryClient: QueryClient) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return createElement(QueryClientProvider, { client: queryClient }, children);
  };
}

describe('switching users in the same tab', () => {
  beforeEach(() => {
    clientFetchMock.mockReset();
    hardNavigateMock.mockReset();
  });

  it("logging in as User B never leaves User A's data in the cache", async () => {
    const queryClient = new QueryClient();
    queryClient.setQueryData(AUTH_QUERY_KEY, { id: 'user-a' });
    queryClient.setQueryData(['dashboard', 'summary'], { owner: 'user-a' });
    const userB = { id: 'user-b' } as AuthUser;
    clientFetchMock.mockResolvedValueOnce({ user: userB });

    const { result } = renderHook(() => useLogin(), { wrapper: withClient(queryClient) });
    await act(() => result.current.mutateAsync({ email: 'b@example.com', password: 'password' }));

    expect(queryClient.getQueryData(['dashboard', 'summary'])).toBeUndefined();
    expect(queryClient.getQueryData(AUTH_QUERY_KEY)).toBe(userB);
  });

  it('logout does a full page reload to /login', async () => {
    clientFetchMock.mockResolvedValueOnce({ message: 'Logged out.' });

    const { result } = renderHook(() => useLogout(), { wrapper: withClient(new QueryClient()) });
    await act(() => result.current.mutateAsync());

    expect(clientFetchMock).toHaveBeenCalledWith('/api/auth/logout', { method: 'POST' });
    expect(hardNavigateMock).toHaveBeenCalledWith('/login');
  });

  it('logout still reloads to /login when the logout request fails', async () => {
    clientFetchMock.mockRejectedValueOnce(new Error('network down'));

    const { result } = renderHook(() => useLogout(), { wrapper: withClient(new QueryClient()) });
    await act(() => result.current.mutateAsync().catch(() => undefined));

    expect(hardNavigateMock).toHaveBeenCalledWith('/login');
  });
});

describe('resetCacheForUser', () => {
  it("drops the previous user's cached data and stores the new user", async () => {
    const queryClient = new QueryClient();
    queryClient.setQueryData(AUTH_QUERY_KEY, { id: 'user-1' });
    queryClient.setQueryData(['dashboard', 'summary'], { owner: 'user-1' });
    queryClient.setQueryData(['health-profile'], { owner: 'user-1' });

    const user2 = { id: 'user-2' } as AuthUser;
    await resetCacheForUser(queryClient, user2);

    expect(queryClient.getQueryData(['dashboard', 'summary'])).toBeUndefined();
    expect(queryClient.getQueryData(['health-profile'])).toBeUndefined();
    expect(queryClient.getQueryData(AUTH_QUERY_KEY)).toBe(user2);
  });
});

describe('needsTimezoneSync', () => {
  it('is true when the detected zone differs from the stored one', () => {
    expect(needsTimezoneSync('Asia/Kolkata', 'UTC')).toBe(true);
  });

  it('is true on first visit, when nothing is stored yet', () => {
    expect(needsTimezoneSync('Asia/Kolkata', null)).toBe(true);
  });

  it('is false when the detected zone already matches the stored one', () => {
    expect(needsTimezoneSync('Asia/Kolkata', 'Asia/Kolkata')).toBe(false);
  });

  it('is false when detection failed, even if something else is stored — never overwrite a real value with an unknown', () => {
    expect(needsTimezoneSync(null, 'Asia/Kolkata')).toBe(false);
  });

  it('is false when neither is known', () => {
    expect(needsTimezoneSync(null, null)).toBe(false);
  });
});
