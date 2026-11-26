import { expiredSessionCookies, sessionCookies } from './session-cookies';

const tokens = { accessToken: 'a', refreshToken: 'r', accessTokenExpiresAt: '2030-01-01T00:00:00.000Z' };

describe('expiredSessionCookies', () => {
  it('expires both cookies immediately', () => {
    expect(expiredSessionCookies().map(([name, value, { maxAge }]) => [name, value, maxAge])).toEqual([
      ['ahc_access_token', '', 0],
      ['ahc_refresh_token', '', 0],
    ]);
  });

  it('uses the same path and flags the cookies were set with, so the browser actually replaces them', () => {
    const set = sessionCookies(tokens);
    const expired = expiredSessionCookies();

    expired.forEach(([name, , options], i) => {
      const [setName, , setOptions] = set[i];
      expect(name).toBe(setName);
      expect({ ...options, maxAge: undefined }).toEqual({ ...setOptions, maxAge: undefined });
    });
  });
});
