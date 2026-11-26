import { INestApplication } from '@nestjs/common';
import request from 'supertest';

import { PrismaService } from '../src/prisma/prisma.service';
import { createTestApp, uniqueTestEmail } from './utils/test-app';

describe('HealthProfile (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let accessToken: string;
  const email = uniqueTestEmail('health-profile');

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);

    const signupRes = await request(app.getHttpServer()).post('/api/auth/signup').send({
      fullName: 'Health Profile Tester',
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

  function patch(body: Record<string, unknown>) {
    return request(app.getHttpServer())
      .patch('/api/health-profile/me')
      .set('Authorization', `Bearer ${accessToken}`)
      .send(body);
  }

  it('rejects unauthenticated access', async () => {
    await request(app.getHttpServer()).get('/api/health-profile/me').expect(401);
  });

  it('starts with no profile and "age" as the first question', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/health-profile/me')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    expect(res.body.profile).toBeNull();
    expect(res.body.nextQuestion).toBe('age');
    expect(res.body.isComplete).toBe(false);
  });

  it('walks through the full one-question-at-a-time flow to completion', async () => {
    const steps: Array<[Record<string, unknown>, string | null]> = [
      [{ age: 34 }, 'gender'],
      [{ gender: 'FEMALE' }, 'heightCm'],
      [{ heightCm: 165 }, 'weightKg'],
      [{ weightKg: 60 }, 'bloodGroup'],
      [{ bloodGroup: 'O_POS' }, 'exerciseLevel'],
      [{ exerciseLevel: 'MODERATE' }, 'dietType'],
      [{ dietType: 'OMNIVORE' }, 'sleepHours'],
      [{ sleepHours: 7.5 }, 'smoking'],
      [{ smoking: false }, 'alcohol'],
      [{ alcohol: false }, 'existingConditions'],
      [{ existingConditions: [] }, 'medications'],
      [{ medications: [] }, 'allergies'],
      [{ allergies: ['pollen'] }, 'emergencyContact'],
      [{ emergencyContact: { name: 'Sam', relationship: 'Spouse', phone: '+15550001111' } }, null],
    ];

    for (const [body, expectedNext] of steps) {
      const res = await patch(body).expect(200);
      expect(res.body.nextQuestion).toBe(expectedNext);
    }

    const final = await request(app.getHttpServer())
      .get('/api/health-profile/me')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    expect(final.body.isComplete).toBe(true);
    expect(final.body.profile.age).toBe(34);
    expect(final.body.profile.emergencyContactName).toBe('Sam');

    const meRes = await request(app.getHttpServer())
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
    expect(meRes.body.hasHealthProfile).toBe(true);
  });

  it('rejects an invalid enum value', async () => {
    await patch({ gender: 'NOT_A_GENDER' }).expect(400);
  });
});
