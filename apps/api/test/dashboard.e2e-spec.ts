import { INestApplication } from '@nestjs/common';
import request from 'supertest';

import { PrismaService } from '../src/prisma/prisma.service';
import { FeatureFlagsService } from '../src/feature-flags/feature-flags.service';
import { createTestApp, uniqueTestEmail } from './utils/test-app';

describe('Dashboard (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let featureFlags: FeatureFlagsService;
  let accessToken: string;
  let userId: string;
  const email = uniqueTestEmail('dashboard');

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
    featureFlags = app.get(FeatureFlagsService);

    // getStreak/getRecommendedAssessment are gated by this real, shared flag
    // row (same dev DB every developer points at) — enable it
    // for the whole file, restore it to disabled afterward. See the
    // dedicated flag-off tests at the end of this file, which toggle it off
    // and back on around themselves.
    await prisma.featureFlag.upsert({
      where: { key: 'daily_pulse' },
      update: { enabled: true },
      create: { key: 'daily_pulse', enabled: true },
    });
    featureFlags.invalidate('daily_pulse');

    const signupRes = await request(app.getHttpServer()).post('/api/auth/signup').send({
      fullName: 'Dashboard Tester',
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
    userId = signupRes.body.user.id;
  });

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { email } });
    await prisma.featureFlag.upsert({
      where: { key: 'daily_pulse' },
      update: { enabled: false },
      create: { key: 'daily_pulse', enabled: false },
    });
    featureFlags.invalidate('daily_pulse');
    await app.close();
  });

  function get(path: string) {
    return request(app.getHttpServer()).get(path).set('Authorization', `Bearer ${accessToken}`);
  }

  it('rejects unauthenticated access', async () => {
    await request(app.getHttpServer()).get('/api/dashboard/summary').expect(401);
  });

  describe('before any assessments exist', () => {
    it('summary reports hasData=false', async () => {
      const res = await get('/api/dashboard/summary').expect(200);
      expect(res.body.hasData).toBe(false);
      expect(res.body.overallScore).toBeNull();
    });

    it('trends is empty', async () => {
      const res = await get('/api/dashboard/trends').expect(200);
      expect(res.body).toEqual([]);
    });

    it('assessment history is empty', async () => {
      const res = await get('/api/dashboard/assessments/history').expect(200);
      expect(res.body).toEqual([]);
    });

    it('upcoming assessments lists all 14 types', async () => {
      const res = await get('/api/dashboard/assessments/upcoming').expect(200);
      expect(res.body).toHaveLength(14);
    });

    it('recent reports is empty', async () => {
      const res = await get('/api/dashboard/reports/recent').expect(200);
      expect(res.body).toEqual([]);
    });

    it('recommendations is empty', async () => {
      const res = await get('/api/dashboard/recommendations').expect(200);
      expect(res.body).toEqual([]);
    });

    it('streak reports 0 and completedToday=false', async () => {
      const res = await get('/api/dashboard/streak').expect(200);
      expect(res.body).toEqual({ currentStreak: 0, completedToday: false, goalDays: 30, totalActiveDays: 0, lapsed: false });
    });
  });

  describe('after seeding assessment and snapshot data', () => {
    beforeAll(async () => {
      await prisma.wellnessSnapshot.create({
        data: {
          userId,
          overallScore: 82,
          cardioScore: 90,
          mentalWellnessScore: 70,
          nutritionScore: 60,
          hydrationScore: 55,
          fitnessScore: 88,
          recoveryScore: 75,
          sleepScore: 65,
          lifestyleScore: 80,
          riskLevel: 'LOW',
        },
      });

      const assessment = await prisma.assessment.create({
        data: {
          userId,
          type: 'FACE',
          status: 'COMPLETED',
          completedAt: new Date(),
          score: {
            create: {
              value: 88,
              riskLevel: 'LOW',
              confidence: 92,
              observations: { skinTexture: 'Dry' },
              disclaimer: 'Wellness screening only.',
              recommendations: {
                create: [{ title: 'Moisturize daily', detail: 'Use a fragrance-free moisturizer.', priority: 'MEDIUM' }],
              },
            },
          },
        },
      });

      await prisma.report.create({
        data: { userId, title: 'Weekly Wellness Report', status: 'READY' },
      });

      expect(assessment.id).toBeDefined();
    });

    it('summary is computed from completed scores, not from the stored snapshot', async () => {
      const res = await get('/api/dashboard/summary').expect(200);
      expect(res.body.hasData).toBe(true);
      // The seeded snapshot says 82; the only completed assessment (FACE) scored 88.
      expect(res.body.overallScore).toBe(88);
      expect(res.body.riskLevel).toBe('LOW');
      expect(res.body.includedTypes).toEqual(['FACE']);
      expect(res.body.dimensions.find((d: { key: string }) => d.key === 'face').score).toBe(88);
    });

    it('trends includes the seeded snapshot', async () => {
      const res = await get('/api/dashboard/trends?days=30').expect(200);
      expect(res.body).toHaveLength(1);
      expect(res.body[0].overallScore).toBe(82);
    });

    it('assessment history includes the completed FACE assessment', async () => {
      const res = await get('/api/dashboard/assessments/history').expect(200);
      expect(res.body).toHaveLength(1);
      expect(res.body[0]).toMatchObject({ type: 'FACE', score: 88, riskLevel: 'LOW' });
    });

    it('upcoming assessments excludes FACE', async () => {
      const res = await get('/api/dashboard/assessments/upcoming').expect(200);
      expect(res.body).toHaveLength(13);
      expect(res.body).not.toContain('FACE');
    });

    it('recent reports includes the seeded report', async () => {
      const res = await get('/api/dashboard/reports/recent').expect(200);
      expect(res.body).toHaveLength(1);
      expect(res.body[0].title).toBe('Weekly Wellness Report');
    });

    it('recommendations includes the seeded recommendation', async () => {
      const res = await get('/api/dashboard/recommendations').expect(200);
      expect(res.body).toHaveLength(1);
      expect(res.body[0]).toMatchObject({ title: 'Moisturize daily', sourceAssessment: 'FACE' });
    });

    it('streak counts the completed FACE assessment as today — any of the 14 types keeps it alive', async () => {
      const res = await get('/api/dashboard/streak').expect(200);
      expect(res.body).toEqual({ currentStreak: 1, completedToday: true, goalDays: 30, totalActiveDays: 1, lapsed: false });
    });
  });

  describe('mode-aware surfacing', () => {
    const pulseEmail = uniqueTestEmail('dashboard-pulse');
    let pulseAccessToken: string;

    beforeAll(async () => {
      const signupRes = await request(app.getHttpServer()).post('/api/auth/signup').send({
        fullName: 'Dashboard Pulse Tester',
        email: pulseEmail,
        password: 'Passw0rd123',
        confirmPassword: 'Passw0rd123',
        consentCamera: true,
        consentMicrophone: true,
        consentAiProcessing: true,
        confirmedAdult: true,
        acceptedTerms: true,
      });
      pulseAccessToken = signupRes.body.tokens.accessToken;

      await prisma.assessment.create({
        data: {
          userId: signupRes.body.user.id,
          type: 'MENTAL_WELLNESS',
          status: 'COMPLETED',
          mode: 'PULSE',
          completedAt: new Date(),
          score: {
            create: {
              value: 75,
              riskLevel: 'LOW',
              confidence: 90,
              observations: { mood: 'Good' },
              disclaimer: 'Wellness screening only.',
              recommendations: {
                create: [{ title: 'Keep up your check-ins', detail: 'Consistency helps.', priority: 'MEDIUM' }],
              },
            },
          },
        },
      });

      await prisma.assessment.create({
        data: {
          userId: signupRes.body.user.id,
          type: 'SKIN',
          status: 'COMPLETED',
          mode: 'FULL',
          completedAt: new Date(),
          score: {
            create: {
              value: 82,
              riskLevel: 'LOW',
              confidence: 90,
              observations: { skinTexture: 'Normal' },
              disclaimer: 'Wellness screening only.',
              recommendations: {
                create: [{ title: 'Use sunscreen daily', detail: 'SPF 30+.', priority: 'MEDIUM' }],
              },
            },
          },
        },
      });
    });

    afterAll(async () => {
      await prisma.user.deleteMany({ where: { email: pulseEmail } });
    });

    it('a PULSE completion does not remove its type from the upcoming (FULL-only) list, but a FULL one does', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/dashboard/assessments/upcoming')
        .set('Authorization', `Bearer ${pulseAccessToken}`)
        .expect(200);
      expect(res.body).toContain('MENTAL_WELLNESS');
      expect(res.body).not.toContain('SKIN');
    });

    it('history labels each completion with its own mode', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/dashboard/assessments/history')
        .set('Authorization', `Bearer ${pulseAccessToken}`)
        .expect(200);
      expect(res.body).toHaveLength(2);
      const byType = Object.fromEntries(res.body.map((item: { type: string; mode: string }) => [item.type, item.mode]));
      expect(byType.MENTAL_WELLNESS).toBe('PULSE');
      expect(byType.SKIN).toBe('FULL');
    });

    it('recommendations feed includes both the FULL- and PULSE-sourced recommendation', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/dashboard/recommendations')
        .set('Authorization', `Bearer ${pulseAccessToken}`)
        .expect(200);
      const sources = res.body.map((r: { sourceAssessment: string }) => r.sourceAssessment);
      expect(sources).toContain('SKIN');
      expect(sources).toContain('MENTAL_WELLNESS');
    });
  });

  describe('recommended assessment (sub-task 12)', () => {
    it('recommends a real assessment type, never MENTAL_WELLNESS (already served by Daily Pulse)', async () => {
      const res = await get('/api/dashboard/assessments/recommended').expect(200);
      expect(res.body.type).toEqual(expect.any(String));
      expect(res.body.type).not.toBe('MENTAL_WELLNESS');
    });
  });

  // Deliberately last: getStreak/getRecommendedAssessment are gated by the
  // same real, shared daily_pulse flag row that the outer beforeAll enabled
  // for this whole file. FeatureFlagsService caches a read for ~30s, so
  // disabling it here would poison that cache for anything running
  // immediately after — putting this last means that poisoning can't affect
  // any other test in this file.
  describe('daily_pulse flag gating', () => {
    afterAll(async () => {
      await prisma.featureFlag.update({ where: { key: 'daily_pulse' }, data: { enabled: true } });
      featureFlags.invalidate('daily_pulse');
    });

    it('rejects both streak and recommended-assessment reads when the flag is off', async () => {
      await prisma.featureFlag.update({ where: { key: 'daily_pulse' }, data: { enabled: false } });
      featureFlags.invalidate('daily_pulse');

      await get('/api/dashboard/streak').expect(404);
      await get('/api/dashboard/assessments/recommended').expect(404);
    });
  });
});
