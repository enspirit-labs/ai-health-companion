import { INestApplication } from '@nestjs/common';
import request from 'supertest';

import { PrismaService } from '../src/prisma/prisma.service';
import { createTestApp, uniqueTestEmail } from './utils/test-app';

describe('Auth (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const email = uniqueTestEmail('auth');
  const password = 'Passw0rd123';

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
  });

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { email } });
    await app.close();
  });

  const signupPayload = {
    fullName: 'E2E Test User',
    email,
    password,
    confirmPassword: password,
    consentCamera: true,
    consentMicrophone: true,
    consentAiProcessing: true,
    confirmedAdult: true,
    acceptedTerms: true,
  };

  it('rejects signup with a weak password', async () => {
    await request(app.getHttpServer())
      .post('/api/auth/signup')
      .send({ ...signupPayload, password: 'weak', confirmPassword: 'weak' })
      .expect(400);
  });

  it('signs up a new user and returns tokens', async () => {
    const res = await request(app.getHttpServer()).post('/api/auth/signup').send(signupPayload).expect(201);

    expect(res.body.user.email).toBe(email);
    expect(res.body.user.hasHealthProfile).toBe(false);
    expect(res.body.tokens.accessToken).toEqual(expect.any(String));
    expect(res.body.tokens.refreshToken).toEqual(expect.any(String));
  });

  it('rejects a duplicate signup', async () => {
    await request(app.getHttpServer()).post('/api/auth/signup').send(signupPayload).expect(409);
  });

  it('rejects unauthenticated access to /auth/me', async () => {
    await request(app.getHttpServer()).get('/api/auth/me').expect(401);
  });

  it('rejects login with the wrong password', async () => {
    await request(app.getHttpServer()).post('/api/auth/login').send({ email, password: 'wrong' }).expect(401);
  });

  it('logs in with correct credentials and fetches the profile via /auth/me', async () => {
    const loginRes = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email, password })
      .expect(200);

    const { accessToken, refreshToken } = loginRes.body.tokens;

    const meRes = await request(app.getHttpServer())
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
    expect(meRes.body.email).toBe(email);

    const refreshRes = await request(app.getHttpServer())
      .post('/api/auth/refresh')
      .send({ refreshToken })
      .expect(200);
    expect(refreshRes.body.tokens.accessToken).toEqual(expect.any(String));

    await request(app.getHttpServer())
      .post('/api/auth/logout')
      .send({ refreshToken })
      .expect(200);

    // Logout revokes the session server-side: the same refresh token — still
    // a validly signed, unexpired JWT — must no longer work.
    await request(app.getHttpServer()).post('/api/auth/refresh').send({ refreshToken }).expect(401);
  });

  it('rejects an invalid refresh token', async () => {
    await request(app.getHttpServer()).post('/api/auth/refresh').send({ refreshToken: 'not-a-token' }).expect(401);
  });

  it('persists a valid IANA timezone and rejects a garbage one (PATCH /auth/me)', async () => {
    const loginRes = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email, password })
      .expect(200);
    const { accessToken } = loginRes.body.tokens;

    const patchRes = await request(app.getHttpServer())
      .patch('/api/auth/me')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ timezone: 'Asia/Kolkata' })
      .expect(200);
    expect(patchRes.body.timezone).toBe('Asia/Kolkata');

    const meRes = await request(app.getHttpServer())
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
    expect(meRes.body.timezone).toBe('Asia/Kolkata');

    await request(app.getHttpServer())
      .patch('/api/auth/me')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ timezone: 'Not/AZone' })
      .expect(400);

    const meAfterRejectRes = await request(app.getHttpServer())
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
    expect(meAfterRejectRes.body.timezone).toBe('Asia/Kolkata');
  });

  it('rejects an unauthenticated PATCH /auth/me', async () => {
    await request(app.getHttpServer()).patch('/api/auth/me').send({ timezone: 'UTC' }).expect(401);
  });

  it('completes the forgot-password / reset-password round trip', async () => {
    const forgotRes = await request(app.getHttpServer())
      .post('/api/auth/forgot-password')
      .send({ email })
      .expect(200);

    const token = forgotRes.body.devResetToken;
    expect(token).toEqual(expect.any(String));

    const newPassword = 'BrandNewPassw0rd1';
    await request(app.getHttpServer())
      .post('/api/auth/reset-password')
      .send({ email, token, password: newPassword, confirmPassword: newPassword })
      .expect(200);

    await request(app.getHttpServer()).post('/api/auth/login').send({ email, password }).expect(401);

    await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email, password: newPassword })
      .expect(200);

    // Token is single-use
    await request(app.getHttpServer())
      .post('/api/auth/reset-password')
      .send({ email, token, password: 'AnotherOne123', confirmPassword: 'AnotherOne123' })
      .expect(400);
  });

  it('does not reveal whether an email is registered', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/auth/forgot-password')
      .send({ email: uniqueTestEmail('ghost') })
      .expect(200);

    expect(res.body.devResetToken).toBeUndefined();
  });
});
