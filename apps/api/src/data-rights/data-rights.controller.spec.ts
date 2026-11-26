import { DataRightsController } from './data-rights.controller';

describe('DataRightsController', () => {
  describe('deleteMe', () => {
    it("deletes the authenticated caller's own account, taking the id from the token not the body", async () => {
      const service = { deleteAccount: jest.fn().mockResolvedValue({ message: 'ok' }) };
      const controller = new DataRightsController(service as never);

      await controller.deleteMe({ id: 'user-a', email: 'a@b.test', role: 'USER' }, { confirmation: 'DELETE', password: 'pw' });

      expect(service.deleteAccount).toHaveBeenCalledWith('user-a', { confirmation: 'DELETE', password: 'pw' });
    });
  });

  describe('exportMe', () => {
    it("exports only the authenticated caller's data", async () => {
      const service = { exportData: jest.fn().mockResolvedValue({ user: {} }) };
      const controller = new DataRightsController(service as never);

      await controller.exportMe({ id: 'user-a', email: 'a@b.test', role: 'USER' });

      expect(service.exportData).toHaveBeenCalledWith('user-a');
    });
  });
});
