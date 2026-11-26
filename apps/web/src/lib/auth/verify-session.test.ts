/** @jest-environment node */
import { verifySession } from './verify-session';

const tokens = {
  accessToken: 'new-access',
  refreshToken: 'new-refresh',
  accessTokenExpiresAt: '2030-01-01T00:00:00.000Z',
};

function respond(status: number, body: unknown = {}) {
  return new Response(JSON.stringify(body), { status });
}

describe('verifySession', () => {
  const fetchMock = jest.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    global.fetch = fetchMock;
  });

  it('is invalid without calling the backend when there are no cookies', async () => {
    expect(await verifySession(undefined, undefined)).toEqual({ status: 'invalid' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('is valid when the access token is accepted', async () => {
    fetchMock.mockResolvedValueOnce(respond(200, { id: 'user-1' }));

    expect(await verifySession('access', 'refresh')).toEqual({ status: 'valid' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toMatch(/\/auth\/me$/);
  });

  it('refreshes when the access token is expired but the refresh token is good', async () => {
    fetchMock.mockResolvedValueOnce(respond(401)).mockResolvedValueOnce(respond(200, { tokens }));

    expect(await verifySession('expired', 'refresh')).toEqual({ status: 'refreshed', tokens });
    expect(fetchMock.mock.calls[1][0]).toMatch(/\/auth\/refresh$/);
  });

  it('refreshes when only the refresh cookie is left (access cookie already expired)', async () => {
    fetchMock.mockResolvedValueOnce(respond(200, { tokens }));

    expect(await verifySession(undefined, 'refresh')).toEqual({ status: 'refreshed', tokens });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('is invalid when both tokens are rejected', async () => {
    fetchMock.mockResolvedValueOnce(respond(401)).mockResolvedValueOnce(respond(401));

    expect(await verifySession('expired', 'expired')).toEqual({ status: 'invalid' });
  });

  it('is unavailable, not invalid, when the backend errors or is unreachable', async () => {
    fetchMock.mockResolvedValueOnce(respond(503));
    expect(await verifySession('access', 'refresh')).toEqual({ status: 'unavailable' });

    fetchMock.mockRejectedValueOnce(new TypeError('fetch failed'));
    expect(await verifySession('access', 'refresh')).toEqual({ status: 'unavailable' });
  });
});
