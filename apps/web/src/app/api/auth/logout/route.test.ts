/** @jest-environment node */
import { backendFetch } from '@/lib/api/backend';
import { clearSessionCookies, getRefreshToken } from '@/lib/auth/session';
import { POST } from './route';

jest.mock('server-only', () => ({}));
jest.mock('@/lib/api/backend', () => ({ backendFetch: jest.fn() }));
jest.mock('@/lib/auth/session', () => ({ clearSessionCookies: jest.fn(), getRefreshToken: jest.fn() }));

const backendFetchMock = backendFetch as jest.MockedFunction<typeof backendFetch>;
const getRefreshTokenMock = getRefreshToken as jest.MockedFunction<typeof getRefreshToken>;
const clearSessionCookiesMock = clearSessionCookies as jest.MockedFunction<typeof clearSessionCookies>;

describe('POST /api/auth/logout', () => {
  beforeEach(() => jest.clearAllMocks());

  it('revokes the session server-side with the refresh token, then clears the cookies', async () => {
    getRefreshTokenMock.mockResolvedValueOnce('refresh.token');

    const res = await POST();

    expect(res.status).toBe(200);
    expect(backendFetchMock).toHaveBeenCalledWith('/auth/logout', {
      method: 'POST',
      body: JSON.stringify({ refreshToken: 'refresh.token' }),
    });
    expect(clearSessionCookiesMock).toHaveBeenCalled();
  });

  it('still clears the cookies when the backend call fails', async () => {
    getRefreshTokenMock.mockResolvedValueOnce('refresh.token');
    backendFetchMock.mockRejectedValueOnce(new Error('backend down'));

    const res = await POST();

    expect(res.status).toBe(200);
    expect(clearSessionCookiesMock).toHaveBeenCalled();
  });

  it('skips the backend call when there is no session cookie', async () => {
    getRefreshTokenMock.mockResolvedValueOnce(undefined);

    await POST();

    expect(backendFetchMock).not.toHaveBeenCalled();
    expect(clearSessionCookiesMock).toHaveBeenCalled();
  });
});
