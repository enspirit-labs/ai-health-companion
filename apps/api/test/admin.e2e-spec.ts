import { randomUUID } from 'crypto';
import { INestApplication } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import request from 'supertest';

import { PrismaService } from '../src/prisma/prisma.service';
import { createTestApp, uniqueTestEmail } from './utils/test-app';

describe('Admin (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let adminToken: string;
  let regularToken: string;
  let regularUserId: string;
  const regularEmail = uniqueTestEmail('admin-regular');
  // The seed no longer ships a default admin login, so the suite
  // creates its own throwaway admin instead of relying on seeded credentials.
  const adminEmail = uniqueTestEmail('admin');
  const adminPassword = `Adm1n-${randomUUID()}`;

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);

    await prisma.user.create({
      data: {
        email: adminEmail,
        passwordHash: await bcrypt.hash(adminPassword, 4),
        fullName: 'E2E Admin',
        role: 'ADMIN',
        authProvider: 'EMAIL',
        isActive: true,
        emailVerifiedAt: new Date(),
      },
    });
    const adminLoginRes = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: adminEmail, password: adminPassword });
    adminToken = adminLoginRes.body.tokens.accessToken;

    const signupRes = await request(app.getHttpServer()).post('/api/auth/signup').send({
      fullName: 'Regular User',
      email: regularEmail,
      password: 'Passw0rd123',
      confirmPassword: 'Passw0rd123',
      consentCamera: true,
      consentMicrophone: true,
      consentAiProcessing: true,
      confirmedAdult: true,
      acceptedTerms: true,
    });
    regularToken = signupRes.body.tokens.accessToken;
    regularUserId = signupRes.body.user.id;
  });

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { email: { in: [regularEmail, adminEmail] } } });
    await app.close();
  });

  function asAdmin(method: 'get' | 'patch', path: string) {
    return request(app.getHttpServer())[method](path).set('Authorization', `Bearer ${adminToken}`);
  }
  function asRegular(method: 'get' | 'patch', path: string) {
    return request(app.getHttpServer())[method](path).set('Authorization', `Bearer ${regularToken}`);
  }

  it('rejects unauthenticated access', async () => {
    await request(app.getHttpServer()).get('/api/admin/users').expect(401);
  });

  it('rejects a regular (non-admin) user with 403', async () => {
    await asRegular('get', '/api/admin/users').expect(403);
    await asRegular('get', '/api/admin/stats').expect(403);
  });

  it('lists users as admin, including the admin and the new regular user', async () => {
    const res = await asAdmin('get', '/api/admin/users').expect(200);
    const emails = res.body.map((u: { email: string }) => u.email);
    expect(emails).toContain(adminEmail);
    expect(emails).toContain(regularEmail);
  });

  it('returns system-wide stats', async () => {
    const res = await asAdmin('get', '/api/admin/stats').expect(200);
    expect(res.body.totalUsers).toBeGreaterThanOrEqual(2);
    expect(res.body.assessmentsByType).toHaveLength(14);
  });

  it('lets an admin deactivate a different user', async () => {
    const res = await asAdmin('patch', `/api/admin/users/${regularUserId}`)
      .send({ isActive: false })
      .expect(200);
    expect(res.body.isActive).toBe(false);

    // The deactivated user can no longer log in
    await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: regularEmail, password: 'Passw0rd123' })
      .expect(401);

    // Reactivate for cleanup / further tests
    await asAdmin('patch', `/api/admin/users/${regularUserId}`).send({ isActive: true }).expect(200);
  });

  it('rejects a regular user attempting to update another user', async () => {
    await asRegular('patch', `/api/admin/users/${regularUserId}`).send({ role: 'ADMIN' }).expect(403);
  });

  it('lists and updates AI prompt templates', async () => {
    const listRes = await asAdmin('get', '/api/admin/prompt-templates').expect(200);
    expect(listRes.body.length).toBeGreaterThan(0);

    const template = listRes.body.find((t: { key: string }) => t.key === 'assessment.LIFESTYLE.system');
    expect(template).toBeDefined();

    const updateRes = await asAdmin('patch', `/api/admin/prompt-templates/${template.id}`)
      .send({ systemPrompt: `${template.systemPrompt}\n\nAdditional admin-edited guidance.` })
      .expect(200);
    expect(updateRes.body.systemPrompt).toContain('Additional admin-edited guidance.');

    // Restore original prompt so re-running this suite doesn't drift the seed data
    await asAdmin('patch', `/api/admin/prompt-templates/${template.id}`)
      .send({ systemPrompt: template.systemPrompt })
      .expect(200);
  });
});
