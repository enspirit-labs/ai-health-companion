import { access } from 'node:fs/promises';
import { resolve } from 'node:path';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';

import { PrismaService } from '../src/prisma/prisma.service';
import { STORAGE_PROVIDER, type StorageProvider } from '../src/storage/storage-provider.interface';
import { createTestApp, uniqueTestEmail } from './utils/test-app';

const PASSWORD = 'Passw0rd123';

async function exists(storagePath: string): Promise<boolean> {
  try {
    await access(resolve(process.cwd(), '.data', 'media', storagePath));
    return true;
  } catch {
    return false;
  }
}

describe('Data rights (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let storage: StorageProvider;

  async function signup(prefix: string) {
    const email = uniqueTestEmail(prefix);
    const res = await request(app.getHttpServer()).post('/api/auth/signup').send({
      fullName: 'E2E Data Rights',
      email,
      password: PASSWORD,
      confirmPassword: PASSWORD,
      consentCamera: true,
      consentMicrophone: true,
      consentAiProcessing: true,
      confirmedAdult: true,
      acceptedTerms: true,
    });
    return { email, id: res.body.user.id as string, token: res.body.tokens.accessToken as string };
  }

  async function seedData(userId: string) {
    const assessment = await prisma.assessment.create({
      data: { userId, type: 'FACE', status: 'COMPLETED', completedAt: new Date() },
    });
    const { storagePath } = await storage.upload({ buffer: Buffer.from('raw'), mimeType: 'image/jpeg', pathHint: 'e2e.jpg' });
    await prisma.mediaAsset.create({
      data: { assessmentId: assessment.id, kind: 'IMAGE', storagePath, mimeType: 'image/jpeg', sizeBytes: 3 },
    });
    await prisma.score.create({
      data: { assessmentId: assessment.id, value: 80, riskLevel: 'LOW', confidence: 0.9, observations: {}, disclaimer: 'x' },
    });
    await prisma.report.create({ data: { userId, title: 'Report', status: 'READY' } });
    const chat = await prisma.chatSession.create({ data: { userId } });
    await prisma.chatMessage.create({ data: { chatSessionId: chat.id, role: 'USER', content: 'hello' } });
    await prisma.feedback.create({ data: { userId, category: 'GENERAL', message: 'hi' } });
    return { storagePath };
  }

  async function countUserRows(userId: string) {
    const [users, sessions, consents, assessments, media, scores, reports, chats, messages, feedback, logs] = await Promise.all([
      prisma.user.count({ where: { id: userId } }),
      prisma.session.count({ where: { userId } }),
      prisma.consentRecord.count({ where: { userId } }),
      prisma.assessment.count({ where: { userId } }),
      prisma.mediaAsset.count({ where: { assessment: { userId } } }),
      prisma.score.count({ where: { assessment: { userId } } }),
      prisma.report.count({ where: { userId } }),
      prisma.chatSession.count({ where: { userId } }),
      prisma.chatMessage.count({ where: { chatSession: { userId } } }),
      prisma.feedback.count({ where: { userId } }),
      prisma.activityLog.count({ where: { userId } }),
    ]);
    return { users, sessions, consents, assessments, media, scores, reports, chats, messages, feedback, logs };
  }

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
    storage = app.get<StorageProvider>(STORAGE_PROVIDER);
  });

  afterAll(async () => {
    await app.close();
  });

  it('exports only the caller\'s own data and no secrets', async () => {
    const a = await signup('dr-exp-a');
    const b = await signup('dr-exp-b');
    await seedData(a.id);
    await seedData(b.id);

    const res = await request(app.getHttpServer()).get('/api/auth/me/export').set('Authorization', `Bearer ${a.token}`);

    expect(res.status).toBe(200);
    expect(res.body.user.id).toBe(a.id);
    expect(res.body.assessments).toHaveLength(1);
    expect(res.body.reports).toHaveLength(1);
    expect(res.body.chatSessions[0].messages[0].content).toBe('hello');
    expect(JSON.stringify(res.body)).not.toMatch(/passwordHash|storagePath|refreshToken|"accessToken"/);
    expect(JSON.stringify(res.body)).not.toContain(b.id);
    expect(JSON.stringify(res.body)).not.toContain(b.email);

    await request(app.getHttpServer()).get('/api/auth/me/export').expect(401);

    for (const u of [a, b]) {
      await request(app.getHttpServer())
        .delete('/api/auth/me')
        .set('Authorization', `Bearer ${u.token}`)
        .send({ confirmation: 'DELETE', password: PASSWORD })
        .expect(200);
    }
  });

  it('deletes the user, every user-scoped row and the stored media, and leaves other users alone', async () => {
    const a = await signup('dr-a');
    const b = await signup('dr-b');
    const seededA = await seedData(a.id);
    const seededB = await seedData(b.id);

    expect(await countUserRows(a.id)).toMatchObject({ users: 1, assessments: 1, media: 1, reports: 1 });
    expect(await exists(seededA.storagePath)).toBe(true);

    const wrongPassword = await request(app.getHttpServer())
      .delete('/api/auth/me')
      .set('Authorization', `Bearer ${a.token}`)
      .send({ confirmation: 'DELETE', password: 'wrong-password' });
    expect(wrongPassword.status).toBe(403);
    expect((await countUserRows(a.id)).users).toBe(1);

    const noConfirmation = await request(app.getHttpServer())
      .delete('/api/auth/me')
      .set('Authorization', `Bearer ${a.token}`)
      .send({ password: PASSWORD });
    expect(noConfirmation.status).toBe(400);

    const res = await request(app.getHttpServer())
      .delete('/api/auth/me')
      .set('Authorization', `Bearer ${a.token}`)
      .send({ confirmation: 'DELETE', password: PASSWORD });
    expect(res.status).toBe(200);

    expect(await countUserRows(a.id)).toEqual({
      users: 0,
      sessions: 0,
      consents: 0,
      assessments: 0,
      media: 0,
      scores: 0,
      reports: 0,
      chats: 0,
      messages: 0,
      feedback: 0,
      logs: 0,
    });
    expect(await exists(seededA.storagePath)).toBe(false);

    // User B is untouched.
    expect(await countUserRows(b.id)).toMatchObject({ users: 1, assessments: 1, media: 1, reports: 1 });
    expect(await exists(seededB.storagePath)).toBe(true);

    // DELETE /auth/me is throttled to 5 calls a minute and this file has already used them,
    // so user B is cleaned up directly instead of through the endpoint.
    await storage.delete(seededB.storagePath);
    await prisma.user.delete({ where: { id: b.id } });
    expect(await exists(seededB.storagePath)).toBe(false);
  });
});
