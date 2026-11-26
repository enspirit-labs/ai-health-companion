import { INestApplication } from '@nestjs/common';
import request from 'supertest';

import { PrismaService } from '../src/prisma/prisma.service';
import { createTestApp, uniqueTestEmail } from './utils/test-app';

describe('Reports (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let accessToken: string;
  const email = uniqueTestEmail('reports');

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);

    const signupRes = await request(app.getHttpServer()).post('/api/auth/signup').send({
      fullName: 'Reports Tester',
      email,
      password: 'Passw0rd123',
      confirmPassword: 'Passw0rd123',
      consentCamera: true,
      consentMicrophone: true,
      consentAiProcessing: true,
      confirmedAdult: true,
      acceptedTerms: true,
    });
    accessToken = signupRes.body.tokens.accessToken;
  });

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { email } });
    await app.close();
  });

  function authedGet(path: string) {
    return request(app.getHttpServer()).get(path).set('Authorization', `Bearer ${accessToken}`);
  }
  function authedPost(path: string) {
    return request(app.getHttpServer()).post(path).set('Authorization', `Bearer ${accessToken}`);
  }
  function authedPatch(path: string) {
    return request(app.getHttpServer()).patch(path).set('Authorization', `Bearer ${accessToken}`);
  }

  it('rejects unauthenticated access', async () => {
    await request(app.getHttpServer()).get('/api/reports').expect(401);
  });

  it('has no reports before any assessment is completed', async () => {
    const res = await authedGet('/api/reports').expect(200);
    expect(res.body).toEqual([]);
  });

  it('generates a report automatically when a LIFESTYLE assessment completes', async () => {
    const startRes = await authedPost('/api/assessments').send({ type: 'LIFESTYLE' }).expect(201);
    const assessmentId = startRes.body.id;

    const answers: Array<[string, unknown]> = [
      ['exerciseDaysPerWeek', 3],
      ['waterGlassesPerDay', 5],
      ['dietQuality', 'good'],
      ['smokes', false],
      ['alcoholFrequency', 'occasionally'],
      ['sleepHoursPerNight', 7],
    ];
    for (const [questionKey, answer] of answers) {
      await authedPatch(`/api/assessments/${assessmentId}/answers`).send({ questionKey, answer }).expect(200);
    }
    await authedPost(`/api/assessments/${assessmentId}/complete`).expect(200);

    const listRes = await authedGet('/api/reports').expect(200);
    expect(listRes.body).toHaveLength(1);
    expect(listRes.body[0].status).toBe('READY');
    expect(listRes.body[0].title).toContain('Lifestyle');

    const reportId = listRes.body[0].id;
    const detailRes = await authedGet(`/api/reports/${reportId}`).expect(200);
    expect(detailRes.body.status).toBe('READY');
    expect(detailRes.body.summary).toEqual(expect.any(String));
    expect(detailRes.body.sections).toHaveLength(1);
    expect(detailRes.body.sections[0].assessmentType).toBe('LIFESTYLE');
    expect(detailRes.body.sections[0].score).toBeGreaterThanOrEqual(0);

    const pdfRes = await authedGet(`/api/reports/${reportId}/pdf`).expect(200);
    expect(pdfRes.headers['content-type']).toBe('application/pdf');
    expect(pdfRes.body.length).toBeGreaterThan(0);
    expect(pdfRes.body.slice(0, 4).toString('latin1')).toBe('%PDF');
  });

  it('rejects fetching a report belonging to another user', async () => {
    const otherEmail = uniqueTestEmail('reports-other');
    const otherSignup = await request(app.getHttpServer()).post('/api/auth/signup').send({
      fullName: 'Other Reports Tester',
      email: otherEmail,
      password: 'Passw0rd123',
      confirmPassword: 'Passw0rd123',
      consentCamera: true,
      consentMicrophone: true,
      consentAiProcessing: true,
      confirmedAdult: true,
      acceptedTerms: true,
    });
    const otherToken = otherSignup.body.tokens.accessToken;

    const listRes = await authedGet('/api/reports').expect(200);
    const reportId = listRes.body[0].id;

    await request(app.getHttpServer())
      .get(`/api/reports/${reportId}`)
      .set('Authorization', `Bearer ${otherToken}`)
      .expect(403);

    await prisma.user.deleteMany({ where: { email: otherEmail } });
  });

  it('rejects fetching a report that does not exist', async () => {
    await authedGet('/api/reports/00000000-0000-0000-0000-000000000000').expect(404);
  });
});
