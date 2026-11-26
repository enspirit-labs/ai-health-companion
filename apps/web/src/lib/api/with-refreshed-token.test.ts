import { BackendError } from './backend';
import { withRefreshedToken } from './with-refreshed-token';

jest.mock('../auth/session', () => ({
  getAccessToken: jest.fn(),
  getRefreshToken: jest.fn(),
  setSessionCookies: jest.fn(),
  clearSessionCookies: jest.fn(),
}));

jest.mock('./backend', () => {
  const actual = jest.requireActual('./backend');
  return { ...actual, backendFetch: jest.fn() };
});

import { clearSessionCookies, getAccessToken, getRefreshToken, setSessionCookies } from '../auth/session';
import { backendFetch } from './backend';

const mockGetAccessToken = getAccessToken as jest.Mock;
const mockGetRefreshToken = getRefreshToken as jest.Mock;
const mockSetSessionCookies = setSessionCookies as jest.Mock;
const mockClearSessionCookies = clearSessionCookies as jest.Mock;
const mockBackendFetch = backendFetch as jest.Mock;

describe('withRefreshedToken', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('throws a 401 BackendError immediately when there is no access token', async () => {
    mockGetAccessToken.mockResolvedValue(undefined);
    const attempt = jest.fn();

    await expect(withRefreshedToken(attempt)).rejects.toMatchObject({ status: 401 });
    expect(attempt).not.toHaveBeenCalled();
  });

  it('returns the result of attempt() on success, with no refresh call', async () => {
    mockGetAccessToken.mockResolvedValue('token-1');
    const attempt = jest.fn().mockResolvedValue('ok');

    await expect(withRefreshedToken(attempt)).resolves.toBe('ok');
    expect(attempt).toHaveBeenCalledWith('token-1');
    expect(mockBackendFetch).not.toHaveBeenCalled();
  });

  it('refreshes and retries once on a 401, then succeeds', async () => {
    mockGetAccessToken.mockResolvedValue('expired-token');
    mockGetRefreshToken.mockResolvedValue('refresh-token');
    mockBackendFetch.mockResolvedValue({
      user: {},
      tokens: { accessToken: 'new-token', refreshToken: 'new-refresh', accessTokenExpiresAt: '2026-01-01' },
    });

    const attempt = jest
      .fn()
      .mockRejectedValueOnce(new BackendError(401, {}))
      .mockResolvedValueOnce('ok-after-refresh');

    await expect(withRefreshedToken(attempt)).resolves.toBe('ok-after-refresh');
    expect(attempt).toHaveBeenNthCalledWith(1, 'expired-token');
    expect(attempt).toHaveBeenNthCalledWith(2, 'new-token');
    expect(mockSetSessionCookies).toHaveBeenCalledWith({
      accessToken: 'new-token',
      refreshToken: 'new-refresh',
      accessTokenExpiresAt: '2026-01-01',
    });
  });

  it('clears cookies and rethrows when there is no refresh token', async () => {
    mockGetAccessToken.mockResolvedValue('expired-token');
    mockGetRefreshToken.mockResolvedValue(undefined);
    const original = new BackendError(401, {});
    const attempt = jest.fn().mockRejectedValue(original);

    await expect(withRefreshedToken(attempt)).rejects.toBe(original);
    expect(mockClearSessionCookies).toHaveBeenCalled();
    expect(attempt).toHaveBeenCalledTimes(1);
  });

  it('clears cookies and rethrows the original error when the refresh call itself fails', async () => {
    mockGetAccessToken.mockResolvedValue('expired-token');
    mockGetRefreshToken.mockResolvedValue('refresh-token');
    mockBackendFetch.mockRejectedValue(new BackendError(401, {}));
    const original = new BackendError(401, {});
    const attempt = jest.fn().mockRejectedValue(original);

    await expect(withRefreshedToken(attempt)).rejects.toBe(original);
    expect(mockClearSessionCookies).toHaveBeenCalled();
    expect(attempt).toHaveBeenCalledTimes(1);
  });

  it('keeps cookies and rethrows the original error when the refresh call fails with a network error', async () => {
    mockGetAccessToken.mockResolvedValue('expired-token');
    mockGetRefreshToken.mockResolvedValue('refresh-token');
    mockBackendFetch.mockRejectedValue(new TypeError('fetch failed'));
    const original = new BackendError(401, {});
    const attempt = jest.fn().mockRejectedValue(original);

    await expect(withRefreshedToken(attempt)).rejects.toBe(original);
    expect(mockClearSessionCookies).not.toHaveBeenCalled();
    expect(attempt).toHaveBeenCalledTimes(1);
  });

  it('keeps cookies and rethrows the original error when the refresh call fails with a 500', async () => {
    mockGetAccessToken.mockResolvedValue('expired-token');
    mockGetRefreshToken.mockResolvedValue('refresh-token');
    mockBackendFetch.mockRejectedValue(new BackendError(500, {}));
    const original = new BackendError(401, {});
    const attempt = jest.fn().mockRejectedValue(original);

    await expect(withRefreshedToken(attempt)).rejects.toBe(original);
    expect(mockClearSessionCookies).not.toHaveBeenCalled();
    expect(attempt).toHaveBeenCalledTimes(1);
  });

  it('propagates non-401 errors without attempting a refresh', async () => {
    mockGetAccessToken.mockResolvedValue('token-1');
    const original = new Error('boom');
    const attempt = jest.fn().mockRejectedValue(original);

    await expect(withRefreshedToken(attempt)).rejects.toBe(original);
    expect(mockGetRefreshToken).not.toHaveBeenCalled();
  });
});
