import { UserRole } from '@prisma/client';

import { IS_PUBLIC_KEY } from '../auth/decorators/public.decorator';
import { ROLES_KEY } from '../auth/decorators/roles.decorator';
import { ProviderHealthController } from './provider-health.controller';

/** The handler function itself, where SetMetadata stores route metadata. */
const handler = (name: 'getHealth' | 'getMode'): object =>
  Object.getOwnPropertyDescriptor(ProviderHealthController.prototype, name)?.value as object;

describe('ProviderHealthController', () => {
  describe('getHealth', () => {
    it('is restricted to ADMIN and is not public', () => {
      expect(Reflect.getMetadata(ROLES_KEY, handler('getHealth'))).toEqual([UserRole.ADMIN]);
      expect(Reflect.getMetadata(IS_PUBLIC_KEY, handler('getHealth'))).toBeUndefined();
    });
  });

  describe('getMode', () => {
    it('requires sign-in but no specific role', () => {
      expect(Reflect.getMetadata(IS_PUBLIC_KEY, handler('getMode'))).toBeUndefined();
      expect(Reflect.getMetadata(ROLES_KEY, handler('getMode'))).toBeUndefined();
    });
  });
});
