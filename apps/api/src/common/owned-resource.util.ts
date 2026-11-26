import { ForbiddenException, NotFoundException } from '@nestjs/common';

/**
 * Standard "does this resource exist, and does it belong to this user"
 * check used across services that expose per-user resources by id.
 */
export function assertOwnedResource<T extends { userId: string }>(
  resource: T | null,
  userId: string,
  resourceLabel: string,
): T {
  if (!resource) {
    throw new NotFoundException(`${resourceLabel} not found`);
  }
  if (resource.userId !== userId) {
    throw new ForbiddenException(`This ${resourceLabel.toLowerCase()} belongs to another account`);
  }
  return resource;
}
