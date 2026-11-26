import type { INestApplication } from '@nestjs/common';
import { NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { NextFunction, Request, Response } from 'express';
import request from 'supertest';

import { AiUserThrottleGuard } from '../common/throttle/ai-user-throttle.guard';
import { FeatureFlagsService } from '../feature-flags/feature-flags.service';
import { PrismaService } from '../prisma/prisma.service';
import { AssessmentsController } from './assessments.controller';
import { AssessmentsService } from './assessments.service';

const USER = { id: 'user-1', email: 'user@example.com', role: 'USER' as const };

describe('AssessmentsController', () => {
  let app: INestApplication;
  let controller: AssessmentsController;
  let assessmentsService: { start: jest.Mock; uploadMedia: jest.Mock };
  let prisma: { featureFlag: Record<string, jest.Mock> };

  beforeEach(async () => {
    assessmentsService = {
      start: jest.fn().mockResolvedValue({ id: 'assessment-1' }),
      uploadMedia: jest.fn().mockResolvedValue({ id: 'media-1' }),
    };
    // The real FeatureFlagsService over a hand-mocked Prisma, so the start
    // tests exercise the actual fail-closed behaviour rather than a stub of it.
    prisma = { featureFlag: { findUnique: jest.fn().mockResolvedValue(null) } };

    const moduleRef = await Test.createTestingModule({
      controllers: [AssessmentsController],
      providers: [
        FeatureFlagsService,
        { provide: AssessmentsService, useValue: assessmentsService },
        { provide: PrismaService, useValue: prisma },
      ],
    })
      // The per-user AI throttle has its own spec; stubbed so it stays out of these.
      .overrideGuard(AiUserThrottleGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = moduleRef.get(AssessmentsController);

    app = moduleRef.createNestApplication();
    // Stands in for the global JwtAuthGuard, which isn't registered here.
    app.use((req: Request & { user?: unknown }, _res: Response, next: NextFunction) => {
      req.user = USER;
      next();
    });
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  describe('start', () => {
    it.each(['VOICE', 'TONGUE'] as const)(
      'refuses to start %s with a not-available 404 when its flag row is missing',
      async (type) => {
        await expect(controller.start(USER, { type })).rejects.toThrow(
          new NotFoundException(`This assessment isn't available yet. Check back soon.`),
        );
        expect(assessmentsService.start).not.toHaveBeenCalled();
      },
    );

    it('refuses to start Voice when its flag row is explicitly disabled', async () => {
      prisma.featureFlag.findUnique.mockResolvedValue({ key: 'assessment_voice', enabled: false });

      await expect(controller.start(USER, { type: 'VOICE' })).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.featureFlag.findUnique).toHaveBeenCalledWith({ where: { key: 'assessment_voice' } });
    });

    it('starts Tongue once its flag is enabled', async () => {
      prisma.featureFlag.findUnique.mockResolvedValue({ key: 'assessment_tongue', enabled: true });

      await expect(controller.start(USER, { type: 'TONGUE' })).resolves.toEqual({ id: 'assessment-1' });
      expect(assessmentsService.start).toHaveBeenCalledWith('user-1', 'TONGUE', undefined);
    });

    it('starts an ungated type without consulting any flag', async () => {
      await controller.start(USER, { type: 'FACE', mode: 'FULL' });

      expect(prisma.featureFlag.findUnique).not.toHaveBeenCalled();
      expect(assessmentsService.start).toHaveBeenCalledWith('user-1', 'FACE', 'FULL');
    });
  });

  describe('uploadMedia', () => {
    const upload = (captureLabel?: string) => {
      const req = request(app.getHttpServer())
        .post('/assessments/assessment-1/media')
        .attach('file', Buffer.from('img'), { filename: 'photo.jpg', contentType: 'image/jpeg' });
      return captureLabel === undefined ? req : req.field('captureLabel', captureLabel);
    };

    it.each(['front', 'left', 'frame-0', 'reading'])('passes a valid capture label (%s) through', async (label) => {
      await upload(label).expect(201);

      expect(assessmentsService.uploadMedia).toHaveBeenCalledWith(
        USER.id,
        'assessment-1',
        expect.objectContaining({ mimeType: 'image/jpeg' }),
        label,
      );
    });

    it('accepts an upload with no capture label', async () => {
      await upload().expect(201);

      expect(assessmentsService.uploadMedia).toHaveBeenCalledWith(
        USER.id,
        'assessment-1',
        expect.any(Object),
        undefined,
      );
    });

    it.each(['../../../../tmp/pwned', '..', 'a/b', 'front.jpg', 'FRONT', 'x'.repeat(33)])(
      'rejects a capture label that is not a strict slug (%s) before reaching the service',
      async (label) => {
        await upload(label).expect(400);

        expect(assessmentsService.uploadMedia).not.toHaveBeenCalled();
      },
    );
  });
});
