import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { UserRole } from '@prisma/client';

import { ROLES_KEY } from '../auth/decorators/roles.decorator';
import { RolesGuard } from '../auth/guards/roles.guard';
import { AdminMetricsController } from './admin-metrics.controller';
import { AdminMetricsService } from './admin-metrics.service';

function contextFor(role: UserRole): ExecutionContext {
  return {
    // eslint-disable-next-line @typescript-eslint/unbound-method -- only read for its metadata
    getHandler: () => AdminMetricsController.prototype.getPilotMetrics,
    getClass: () => AdminMetricsController,
    switchToHttp: () => ({
      getRequest: () => ({ user: { id: 'u1', email: 'a@b.com', role } }),
    }),
  } as unknown as ExecutionContext;
}

describe('AdminMetricsController', () => {
  it('is restricted to ADMIN via @Roles on the controller', () => {
    expect(Reflect.getMetadata(ROLES_KEY, AdminMetricsController)).toEqual([
      UserRole.ADMIN,
    ]);
  });

  describe('RolesGuard on the metrics route', () => {
    const guard = new RolesGuard(new Reflector());

    it('lets an ADMIN through', () => {
      expect(guard.canActivate(contextFor(UserRole.ADMIN))).toBe(true);
    });

    it.each([UserRole.USER, UserRole.SUPPORT])(
      'rejects a %s with ForbiddenException',
      (role) => {
        expect(() => guard.canActivate(contextFor(role))).toThrow(
          ForbiddenException,
        );
      },
    );
  });

  describe('getPilotMetrics', () => {
    it('passes the validated query to the service', async () => {
      const service = {
        getPilotMetrics: jest.fn().mockResolvedValue({ cohortSize: 0 }),
      };
      const controller = new AdminMetricsController(
        service as unknown as AdminMetricsService,
      );

      await controller.getPilotMetrics({ cohortStart: '2026-10-01' });

      expect(service.getPilotMetrics).toHaveBeenCalledWith({
        cohortStart: '2026-10-01',
      });
    });
  });
});
