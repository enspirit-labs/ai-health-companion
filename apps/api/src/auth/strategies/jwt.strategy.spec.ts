import { ConfigService } from '@nestjs/config';

import { JwtStrategy, type JwtPayload } from './jwt.strategy';

describe('JwtStrategy', () => {
  let strategy: JwtStrategy;

  beforeEach(() => {
    const config = { get: jest.fn().mockReturnValue('a-secret-at-least-32-chars-long-x') };
    strategy = new JwtStrategy(config as unknown as ConfigService);
  });

  describe('validate', () => {
    it('maps a valid access-token payload to a RequestUser', () => {
      const payload: JwtPayload = {
        sub: 'user-1',
        email: 'a@b.com',
        role: 'USER',
        type: 'access',
      };

      expect(strategy.validate(payload)).toEqual({
        id: 'user-1',
        email: 'a@b.com',
        role: 'USER',
      });
    });

    it('rejects a refresh token presented as an access token', () => {
      // A refresh token carries the same shape but type: 'refresh'. This
      // rejection is what stops a leaked/reused refresh token from being used
      // directly against protected routes.
      const payload = {
        sub: 'user-1',
        email: 'a@b.com',
        role: 'USER',
        type: 'refresh',
      } as unknown as JwtPayload;

      expect(() => strategy.validate(payload)).toThrow('Invalid token type');
    });
  });
});
