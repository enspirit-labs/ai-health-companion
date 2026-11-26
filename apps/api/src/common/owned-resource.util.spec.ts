import { ForbiddenException, NotFoundException } from '@nestjs/common';

import { assertOwnedResource } from './owned-resource.util';

describe('assertOwnedResource', () => {
  it('returns the resource when it exists and belongs to the user', () => {
    const resource = { id: '1', userId: 'user-1' };
    expect(assertOwnedResource(resource, 'user-1', 'Assessment')).toBe(resource);
  });

  it('throws NotFoundException when the resource is missing', () => {
    expect(() => assertOwnedResource(null, 'user-1', 'Assessment')).toThrow(NotFoundException);
    expect(() => assertOwnedResource(null, 'user-1', 'Assessment')).toThrow('Assessment not found');
  });

  it('throws ForbiddenException when the resource belongs to another user', () => {
    const resource = { id: '1', userId: 'user-2' };
    expect(() => assertOwnedResource(resource, 'user-1', 'Report')).toThrow(ForbiddenException);
    expect(() => assertOwnedResource(resource, 'user-1', 'Report')).toThrow(
      'This report belongs to another account',
    );
  });
});
