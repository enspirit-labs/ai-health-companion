import { INestApplication } from '@nestjs/common';
import request from 'supertest';

import { PrismaService } from '../src/prisma/prisma.service';
import { FeatureFlagsService } from '../src/feature-flags/feature-flags.service';
import { createTestApp, uniqueTestEmail } from './utils/test-app';

describe('Assessments (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let featureFlags: FeatureFlagsService;
  let accessToken: string;
  const email = uniqueTestEmail('assessments');

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
    featureFlags = app.get(FeatureFlagsService);

    const signupRes = await request(app.getHttpServer()).post('/api/auth/signup').send({
      fullName: 'Assessment Tester',
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

    // Voice and Tongue ship switched off (fail-closed feature flags), so the
    // walk-through specs below turn them on and the last test checks they 404 when off.
    await setVoiceTongueFlags(true);
  });

  async function setVoiceTongueFlags(enabled: boolean) {
    for (const key of ['assessment_voice', 'assessment_tongue']) {
      await prisma.featureFlag.upsert({ where: { key }, update: { enabled }, create: { key, enabled } });
      featureFlags.invalidate(key);
    }
  }

  afterAll(async () => {
    await setVoiceTongueFlags(false);
    await prisma.user.deleteMany({ where: { email } });
    await app.close();
  });

  function authedPost(path: string) {
    return request(app.getHttpServer()).post(path).set('Authorization', `Bearer ${accessToken}`);
  }
  function authedGet(path: string) {
    return request(app.getHttpServer()).get(path).set('Authorization', `Bearer ${accessToken}`);
  }
  function authedPatch(path: string) {
    return request(app.getHttpServer()).patch(path).set('Authorization', `Bearer ${accessToken}`);
  }
  function authedDelete(path: string) {
    return request(app.getHttpServer()).delete(path).set('Authorization', `Bearer ${accessToken}`);
  }

  it('rejects unauthenticated access', async () => {
    await request(app.getHttpServer()).post('/api/assessments').send({ type: 'LIFESTYLE' }).expect(401);
  });

  it('rejects an invalid assessment type', async () => {
    await authedPost('/api/assessments').send({ type: 'NOT_A_TYPE' }).expect(400);
  });

  it('walks a LIFESTYLE assessment through start -> answer -> complete', async () => {
    const startRes = await authedPost('/api/assessments').send({ type: 'LIFESTYLE' }).expect(201);
    expect(startRes.body.status).toBe('IN_PROGRESS');
    expect(startRes.body.nextQuestion.key).toBe('exerciseDaysPerWeek');
    const assessmentId = startRes.body.id;

    // Resuming start returns the same in-progress assessment, not a new one
    const resumeRes = await authedPost('/api/assessments').send({ type: 'LIFESTYLE' }).expect(201);
    expect(resumeRes.body.id).toBe(assessmentId);

    const answers: Array<[string, unknown]> = [
      ['exerciseDaysPerWeek', 4],
      ['waterGlassesPerDay', 6],
      ['dietQuality', 'good'],
      ['smokes', false],
      ['alcoholFrequency', 'occasionally'],
      ['sleepHoursPerNight', 7],
    ];

    let lastState;
    for (const [questionKey, answer] of answers) {
      lastState = await authedPatch(`/api/assessments/${assessmentId}/answers`)
        .send({ questionKey, answer })
        .expect(200);
    }

    expect(lastState!.body.isReadyToComplete).toBe(true);
    expect(lastState!.body.nextQuestion).toBeNull();

    const completeRes = await authedPost(`/api/assessments/${assessmentId}/complete`).expect(200);
    expect(completeRes.body.assessmentId).toBe(assessmentId);
    expect(completeRes.body.score).toBeGreaterThanOrEqual(0);
    expect(completeRes.body.score).toBeLessThanOrEqual(100);
    expect(completeRes.body.riskLevel).toMatch(/LOW|MODERATE|ELEVATED|HIGH/);
    expect(completeRes.body.disclaimer).toMatch(/healthcare professional/i);

    // Completed assessment can no longer be answered
    await authedPatch(`/api/assessments/${assessmentId}/answers`)
      .send({ questionKey: 'exerciseDaysPerWeek', answer: 5 })
      .expect(400);

    // Completing again (a retry after a lost response) returns the saved result
    const repeatRes = await authedPost(`/api/assessments/${assessmentId}/complete`).expect(200);
    expect(repeatRes.body).toMatchObject({
      assessmentId,
      score: completeRes.body.score,
      riskLevel: completeRes.body.riskLevel,
      completedAt: completeRes.body.completedAt,
      recommendations: completeRes.body.recommendations,
    });

    // Dashboard summary now reflects the completed assessment
    const summaryRes = await authedGet('/api/dashboard/summary').expect(200);
    expect(summaryRes.body.hasData).toBe(true);
    expect(summaryRes.body.dimensions.find((d: { key: string }) => d.key === 'lifestyle').score).toBe(
      completeRes.body.score,
    );

    // A fresh start now creates a NEW assessment, since the previous one is completed
    const secondStart = await authedPost('/api/assessments').send({ type: 'LIFESTYLE' }).expect(201);
    expect(secondStart.body.id).not.toBe(assessmentId);
  });

  it('rejects completing with required questions unanswered', async () => {
    const startRes = await authedPost('/api/assessments').send({ type: 'LIFESTYLE' }).expect(201);
    const assessmentId = startRes.body.id;

    await authedPatch(`/api/assessments/${assessmentId}/answers`)
      .send({ questionKey: 'exerciseDaysPerWeek', answer: 2 })
      .expect(200);

    await authedPost(`/api/assessments/${assessmentId}/complete`).expect(400);

    await authedDelete(`/api/assessments/${assessmentId}`).expect(204);
  });

  it('rejects answering an unknown question key', async () => {
    const startRes = await authedPost('/api/assessments').send({ type: 'LIFESTYLE' }).expect(201);
    await authedPatch(`/api/assessments/${startRes.body.id}/answers`)
      .send({ questionKey: 'not_a_real_key', answer: 1 })
      .expect(400);
    await authedDelete(`/api/assessments/${startRes.body.id}`).expect(204);
  });

  it('walks a FACE assessment through start -> upload photo -> complete', async () => {
    const startRes = await authedPost('/api/assessments').send({ type: 'FACE' }).expect(201);
    expect(startRes.body.inputMode).toBe('CAMERA_IMAGE');
    expect(startRes.body.isReadyToComplete).toBe(false);
    const assessmentId = startRes.body.id;

    // Completing before any photo is captured is rejected
    await authedPost(`/api/assessments/${assessmentId}/complete`).expect(400);

    const fakeJpegBytes = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0]);
    const uploadRes = await request(app.getHttpServer())
      .post(`/api/assessments/${assessmentId}/media`)
      .set('Authorization', `Bearer ${accessToken}`)
      .field('captureLabel', 'front')
      .attach('file', fakeJpegBytes, { filename: 'front.jpg', contentType: 'image/jpeg' })
      .expect(201);

    expect(uploadRes.body.mediaAssets).toHaveLength(1);
    expect(uploadRes.body.mediaAssets[0].captureLabel).toBe('front');
    expect(uploadRes.body.isReadyToComplete).toBe(true);

    const completeRes = await authedPost(`/api/assessments/${assessmentId}/complete`).expect(200);
    expect(completeRes.body.type).toBe('FACE');
    expect(completeRes.body.score).toBeGreaterThanOrEqual(0);
    expect(completeRes.body.riskLevel).toMatch(/LOW|MODERATE|ELEVATED|HIGH/);

    // A face capture no longer feeds the Stress & Mental Wellness dimension; only the
    // MENTAL_WELLNESS questionnaire and its Daily Pulse do (claims cleanup).
    const summaryRes = await authedGet('/api/dashboard/summary').expect(200);
    expect(
      summaryRes.body.dimensions.find((d: { key: string }) => d.key === 'mentalWellness').score,
    ).toBeNull();
    // ...but it does get its own Face tile and counts in the overall score.
    expect(summaryRes.body.dimensions.find((d: { key: string }) => d.key === 'face').score).toBe(
      completeRes.body.score,
    );
    expect(summaryRes.body.includedTypes).toContain('FACE');
  });

  it('rejects uploading a non-image file to a FACE assessment', async () => {
    const startRes = await authedPost('/api/assessments').send({ type: 'FACE' }).expect(201);

    await request(app.getHttpServer())
      .post(`/api/assessments/${startRes.body.id}/media`)
      .set('Authorization', `Bearer ${accessToken}`)
      .attach('file', Buffer.from('not an image'), { filename: 'doc.pdf', contentType: 'application/pdf' })
      .expect(400);

    await authedDelete(`/api/assessments/${startRes.body.id}`).expect(204);
  });

  it('walks an EYE assessment through multi-photo capture + sub-tests -> complete', async () => {
    const startRes = await authedPost('/api/assessments').send({ type: 'EYE' }).expect(201);
    expect(startRes.body.inputMode).toBe('CAMERA_IMAGE');
    const assessmentId = startRes.body.id;

    const fakeJpegBytes = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0]);
    for (const label of ['center', 'left', 'right', 'up', 'down']) {
      await request(app.getHttpServer())
        .post(`/api/assessments/${assessmentId}/media`)
        .set('Authorization', `Bearer ${accessToken}`)
        .field('captureLabel', label)
        .attach('file', fakeJpegBytes, { filename: `${label}.jpg`, contentType: 'image/jpeg' })
        .expect(201);
    }

    const subTests: Array<[string, unknown]> = [
      ['visualAcuity', 'Good'],
      ['colorBlindness', { correct: 3, total: 4 }],
      ['contrastSensitivity', 'Normal'],
      ['dryEyeQuestionnaire', { score: 4, severity: 'Mild' }],
    ];
    let lastState;
    for (const [key, value] of subTests) {
      lastState = await authedPatch(`/api/assessments/${assessmentId}/data`)
        .send({ key, value })
        .expect(200);
    }

    expect(lastState!.body.mediaAssets).toHaveLength(5);
    expect(lastState!.body.testResults).toMatchObject({
      visualAcuity: 'Good',
      colorBlindness: { correct: 3, total: 4 },
      contrastSensitivity: 'Normal',
      dryEyeQuestionnaire: { score: 4, severity: 'Mild' },
    });
    expect(lastState!.body.isReadyToComplete).toBe(true);

    const completeRes = await authedPost(`/api/assessments/${assessmentId}/complete`).expect(200);
    expect(completeRes.body.type).toBe('EYE');
    expect(completeRes.body.score).toBeGreaterThanOrEqual(0);
    expect(completeRes.body.riskLevel).toMatch(/LOW|MODERATE|ELEVATED|HIGH/);
  });

  it('walks a TEETH assessment through start -> upload photo -> complete', async () => {
    const startRes = await authedPost('/api/assessments').send({ type: 'TEETH' }).expect(201);
    expect(startRes.body.inputMode).toBe('CAMERA_IMAGE');
    const assessmentId = startRes.body.id;

    const fakeJpegBytes = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0]);
    const uploadRes = await request(app.getHttpServer())
      .post(`/api/assessments/${assessmentId}/media`)
      .set('Authorization', `Bearer ${accessToken}`)
      .field('captureLabel', 'smile')
      .attach('file', fakeJpegBytes, { filename: 'smile.jpg', contentType: 'image/jpeg' })
      .expect(201);

    expect(uploadRes.body.isReadyToComplete).toBe(true);

    const completeRes = await authedPost(`/api/assessments/${assessmentId}/complete`).expect(200);
    expect(completeRes.body.type).toBe('TEETH');
    expect(completeRes.body.score).toBeGreaterThanOrEqual(0);
    expect(completeRes.body.riskLevel).toMatch(/LOW|MODERATE|ELEVATED|HIGH/);

    // TEETH has no wellness-dimension mapping (cosmetic/dental) — dashboard is unaffected
    const summaryRes = await authedGet('/api/dashboard/summary').expect(200);
    expect(summaryRes.body.dimensions.find((d: { key: string }) => d.key === 'lifestyle')).toBeDefined();
  });

  it('walks a HAIR assessment through start -> upload photo -> complete', async () => {
    const startRes = await authedPost('/api/assessments').send({ type: 'HAIR' }).expect(201);
    expect(startRes.body.inputMode).toBe('CAMERA_IMAGE');
    const assessmentId = startRes.body.id;

    const fakeJpegBytes = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0]);
    const uploadRes = await request(app.getHttpServer())
      .post(`/api/assessments/${assessmentId}/media`)
      .set('Authorization', `Bearer ${accessToken}`)
      .field('captureLabel', 'front')
      .attach('file', fakeJpegBytes, { filename: 'hair.jpg', contentType: 'image/jpeg' })
      .expect(201);

    expect(uploadRes.body.isReadyToComplete).toBe(true);

    const completeRes = await authedPost(`/api/assessments/${assessmentId}/complete`).expect(200);
    expect(completeRes.body.type).toBe('HAIR');
    expect(completeRes.body.score).toBeGreaterThanOrEqual(0);
    expect(completeRes.body.riskLevel).toMatch(/LOW|MODERATE|ELEVATED|HIGH/);
  });

  it('walks a VOICE assessment through start -> upload recording -> complete', async () => {
    const startRes = await authedPost('/api/assessments').send({ type: 'VOICE' }).expect(201);
    expect(startRes.body.inputMode).toBe('MICROPHONE_AUDIO');
    const assessmentId = startRes.body.id;

    const fakeWebmBytes = Buffer.from([0x1a, 0x45, 0xdf, 0xa3, 0, 0, 0, 0]);
    const uploadRes = await request(app.getHttpServer())
      .post(`/api/assessments/${assessmentId}/media`)
      .set('Authorization', `Bearer ${accessToken}`)
      .field('captureLabel', 'reading')
      .attach('file', fakeWebmBytes, { filename: 'reading.webm', contentType: 'audio/webm' })
      .expect(201);

    expect(uploadRes.body.mediaAssets).toHaveLength(1);
    expect(uploadRes.body.isReadyToComplete).toBe(true);

    const completeRes = await authedPost(`/api/assessments/${assessmentId}/complete`).expect(200);
    expect(completeRes.body.type).toBe('VOICE');
    expect(completeRes.body.score).toBeGreaterThanOrEqual(0);
    expect(completeRes.body.riskLevel).toMatch(/LOW|MODERATE|ELEVATED|HIGH/);
  });

  it('rejects uploading a non-audio file to a VOICE assessment', async () => {
    const startRes = await authedPost('/api/assessments').send({ type: 'VOICE' }).expect(201);

    await request(app.getHttpServer())
      .post(`/api/assessments/${startRes.body.id}/media`)
      .set('Authorization', `Bearer ${accessToken}`)
      .attach('file', Buffer.from('not audio'), { filename: 'photo.jpg', contentType: 'image/jpeg' })
      .expect(400);

    await authedDelete(`/api/assessments/${startRes.body.id}`).expect(204);
  });

  it('walks a WALKING assessment through start -> upload frames -> complete', async () => {
    const startRes = await authedPost('/api/assessments').send({ type: 'WALKING' }).expect(201);
    expect(startRes.body.inputMode).toBe('CAMERA_VIDEO');
    const assessmentId = startRes.body.id;

    const fakeJpegBytes = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0]);
    for (let i = 0; i < 5; i++) {
      await request(app.getHttpServer())
        .post(`/api/assessments/${assessmentId}/media`)
        .set('Authorization', `Bearer ${accessToken}`)
        .field('captureLabel', `frame-${i}`)
        .attach('file', fakeJpegBytes, { filename: `frame-${i}.jpg`, contentType: 'image/jpeg' })
        .expect(201);
    }

    const completeRes = await authedPost(`/api/assessments/${assessmentId}/complete`).expect(200);
    expect(completeRes.body.type).toBe('WALKING');
    expect(completeRes.body.score).toBeGreaterThanOrEqual(0);
    expect(completeRes.body.riskLevel).toMatch(/LOW|MODERATE|ELEVATED|HIGH/);

    // Each physical test has its own tile with its latest score.
    const summaryRes = await authedGet('/api/dashboard/summary').expect(200);
    expect(summaryRes.body.dimensions.find((d: { key: string }) => d.key === 'walking').score).toBe(
      completeRes.body.score,
    );
    expect(summaryRes.body.dimensions.some((d: { key: string }) => d.key === 'activity')).toBe(false);
    expect(summaryRes.body.includedTypes).toContain(completeRes.body.type);
  });

  it('rejects recording a test result on a questionnaire-mode assessment', async () => {
    const startRes = await authedPost('/api/assessments').send({ type: 'LIFESTYLE' }).expect(201);
    await authedPatch(`/api/assessments/${startRes.body.id}/data`)
      .send({ key: 'visualAcuity', value: 'Good' })
      .expect(400);
    await authedDelete(`/api/assessments/${startRes.body.id}`).expect(204);
  });

  it('walks a MENTAL_WELLNESS assessment through start -> answer -> complete', async () => {
    const startRes = await authedPost('/api/assessments').send({ type: 'MENTAL_WELLNESS' }).expect(201);
    expect(startRes.body.status).toBe('IN_PROGRESS');
    const assessmentId = startRes.body.id;

    const answers: Array<[string, unknown]> = [
      ['moodRating', 4],
      ['stressLevel', 'moderate'],
      ['sleepQuality', 'good'],
      ['socialConnection', 'often'],
      ['anxietyFrequency', 'rarely'],
      ['copingConfidence', 4],
    ];
    let lastState;
    for (const [questionKey, answer] of answers) {
      lastState = await authedPatch(`/api/assessments/${assessmentId}/answers`)
        .send({ questionKey, answer })
        .expect(200);
    }
    expect(lastState!.body.isReadyToComplete).toBe(true);

    const completeRes = await authedPost(`/api/assessments/${assessmentId}/complete`).expect(200);
    expect(completeRes.body.type).toBe('MENTAL_WELLNESS');
    expect(completeRes.body.score).toBeGreaterThanOrEqual(0);
    expect(completeRes.body.riskLevel).toMatch(/LOW|MODERATE|ELEVATED|HIGH/);

    const summaryRes = await authedGet('/api/dashboard/summary').expect(200);
    expect(
      summaryRes.body.dimensions.find((d: { key: string }) => d.key === 'mentalWellness').score,
    ).toBe(completeRes.body.score);
  });

  it.each(['SKIN', 'TONGUE', 'POSTURE'])(
    'walks a %s assessment through start -> upload photo -> complete',
    async (type) => {
      const startRes = await authedPost('/api/assessments').send({ type }).expect(201);
      expect(startRes.body.inputMode).toBe('CAMERA_IMAGE');
      const assessmentId = startRes.body.id;

      const fakeJpegBytes = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0]);
      const uploadRes = await request(app.getHttpServer())
        .post(`/api/assessments/${assessmentId}/media`)
        .set('Authorization', `Bearer ${accessToken}`)
        .field('captureLabel', 'front')
        .attach('file', fakeJpegBytes, { filename: 'photo.jpg', contentType: 'image/jpeg' })
        .expect(201);
      expect(uploadRes.body.isReadyToComplete).toBe(true);

      const completeRes = await authedPost(`/api/assessments/${assessmentId}/complete`).expect(200);
      expect(completeRes.body.type).toBe(type);
      expect(completeRes.body.score).toBeGreaterThanOrEqual(0);
      expect(completeRes.body.riskLevel).toMatch(/LOW|MODERATE|ELEVATED|HIGH/);
    },
  );

  it('walks a HAND_COORDINATION assessment through start -> record result -> complete', async () => {
    const startRes = await authedPost('/api/assessments').send({ type: 'HAND_COORDINATION' }).expect(201);
    expect(startRes.body.inputMode).toBe('INTERACTIVE_TEST');
    expect(startRes.body.isReadyToComplete).toBe(false);
    const assessmentId = startRes.body.id;

    await authedPost(`/api/assessments/${assessmentId}/complete`).expect(400);

    const recordRes = await authedPatch(`/api/assessments/${assessmentId}/data`)
      .send({ key: 'handCoordination', value: { averageReactionMs: 420, accuracy: 0.9, rating: 'Good' } })
      .expect(200);
    expect(recordRes.body.isReadyToComplete).toBe(true);

    const completeRes = await authedPost(`/api/assessments/${assessmentId}/complete`).expect(200);
    expect(completeRes.body.type).toBe('HAND_COORDINATION');
    expect(completeRes.body.score).toBeGreaterThanOrEqual(0);
    expect(completeRes.body.riskLevel).toMatch(/LOW|MODERATE|ELEVATED|HIGH/);

    // Each physical test has its own tile with its latest score.
    const summaryRes = await authedGet('/api/dashboard/summary').expect(200);
    expect(summaryRes.body.dimensions.find((d: { key: string }) => d.key === 'handCoordination').score).toBe(
      completeRes.body.score,
    );
    expect(summaryRes.body.dimensions.some((d: { key: string }) => d.key === 'activity')).toBe(false);
    expect(summaryRes.body.includedTypes).toContain(completeRes.body.type);
  });

  it('walks a MEMORY assessment through start -> record result -> complete', async () => {
    const startRes = await authedPost('/api/assessments').send({ type: 'MEMORY' }).expect(201);
    expect(startRes.body.inputMode).toBe('INTERACTIVE_TEST');
    const assessmentId = startRes.body.id;

    const recordRes = await authedPatch(`/api/assessments/${assessmentId}/data`)
      .send({ key: 'memoryTest', value: { longestSequence: 6, rating: 'Good' } })
      .expect(200);
    expect(recordRes.body.isReadyToComplete).toBe(true);

    const completeRes = await authedPost(`/api/assessments/${assessmentId}/complete`).expect(200);
    expect(completeRes.body.type).toBe('MEMORY');
    expect(completeRes.body.score).toBeGreaterThanOrEqual(0);
    expect(completeRes.body.riskLevel).toMatch(/LOW|MODERATE|ELEVATED|HIGH/);
  });

  describe('Daily Pulse (mode: PULSE)', () => {
    // This flag row is real and shared (the shared dev database every
    // developer points at), and defaults to disabled. Enable it only for the
    // duration of this block and restore it to disabled afterward — leaving
    // it on would silently "launch" the feature for anyone else pointed at
    // this database, not just this test run.
    beforeAll(async () => {
      await prisma.featureFlag.upsert({
        where: { key: 'daily_pulse' },
        update: { enabled: true },
        create: { key: 'daily_pulse', enabled: true },
      });
      // FeatureFlagsService caches a read for ~30s — this app instance is
      // long-lived for the whole file, so without invalidating here, a
      // stale cached read from anywhere earlier in the suite would make the
      // very first test in this block see the flag as still disabled.
      featureFlags.invalidate('daily_pulse');
    });

    afterAll(async () => {
      await prisma.featureFlag.upsert({
        where: { key: 'daily_pulse' },
        update: { enabled: false },
        create: { key: 'daily_pulse', enabled: false },
      });
      featureFlags.invalidate('daily_pulse');
    });

    it('rejects mode: PULSE for a type with no configured pulse subset', async () => {
      await authedPost('/api/assessments').send({ type: 'LIFESTYLE', mode: 'PULSE' }).expect(400);
    });

    it('walks a Daily Pulse through start -> answer 5 -> complete, without scoring or touching the dashboard dimension', async () => {
      const startRes = await authedPost('/api/assessments').send({ type: 'MENTAL_WELLNESS', mode: 'PULSE' }).expect(201);
      expect(startRes.body.mode).toBe('PULSE');
      expect(startRes.body.questions.map((q: { key: string }) => q.key)).toEqual([
        'moodRating',
        'stressLevel',
        'sleepQuality',
        'socialConnection',
        'anxietyFrequency',
      ]);
      const assessmentId = startRes.body.id;

      const answers: Array<[string, unknown]> = [
        ['moodRating', 4],
        ['stressLevel', 'low'],
        ['sleepQuality', 'good'],
        ['socialConnection', 'often'],
        ['anxietyFrequency', 'rarely'],
      ];
      let lastState;
      for (const [questionKey, answer] of answers) {
        lastState = await authedPatch(`/api/assessments/${assessmentId}/answers`)
          .send({ questionKey, answer })
          .expect(200);
      }
      expect(lastState!.body.isReadyToComplete).toBe(true);
      expect(lastState!.body.nextQuestion).toBeNull();

      // The one remaining (unasked) Mental Wellness question is not answerable
      // on this pulse row at all.
      await authedPatch(`/api/assessments/${assessmentId}/answers`)
        .send({ questionKey: 'copingConfidence', answer: 3 })
        .expect(400);

      const before = await authedGet('/api/dashboard/summary').expect(200);
      const dimensionBefore = before.body.dimensions.find((d: { key: string }) => d.key === 'mentalWellness').score;

      const completeRes = await authedPost(`/api/assessments/${assessmentId}/complete`).expect(200);
      expect(completeRes.body.type).toBe('MENTAL_WELLNESS');
      // A Daily Pulse completion bypasses the AI pipeline: it only marks the assessment completed
      // (which is what keeps the streak alive) and writes no Score, so there is nothing to score.
      expect(completeRes.body.score).toBe(0);
      expect(completeRes.body.observations).toEqual([]);
      expect(completeRes.body.recommendations).toEqual([]);

      const after = await authedGet('/api/dashboard/summary').expect(200);
      expect(after.body.dimensions.find((d: { key: string }) => d.key === 'mentalWellness').score).toBe(dimensionBefore);
    });

    it('a PULSE start does not resume a FULL Mental Wellness assessment already in progress, or vice versa', async () => {
      const fullStart = await authedPost('/api/assessments').send({ type: 'MENTAL_WELLNESS' }).expect(201);
      const pulseStart = await authedPost('/api/assessments').send({ type: 'MENTAL_WELLNESS', mode: 'PULSE' }).expect(201);

      expect(pulseStart.body.id).not.toBe(fullStart.body.id);
      expect(fullStart.body.questions).toHaveLength(6);
      expect(pulseStart.body.questions).toHaveLength(5);

      await authedDelete(`/api/assessments/${fullStart.body.id}`).expect(204);
      await authedDelete(`/api/assessments/${pulseStart.body.id}`).expect(204);
    });

    // Deliberately last in this describe block: FeatureFlagsService caches a
    // read for ~30s, so disabling the flag here poisons that cache for
    // anything that runs immediately after — running this after the
    // happy-path tests means that poisoning can't affect them.
    it('rejects mode: PULSE when the daily_pulse flag is off', async () => {
      await prisma.featureFlag.update({ where: { key: 'daily_pulse' }, data: { enabled: false } });
      featureFlags.invalidate('daily_pulse');

      await authedPost('/api/assessments').send({ type: 'MENTAL_WELLNESS', mode: 'PULSE' }).expect(404);
    });
  });

  it('returns 404 for VOICE and TONGUE when their flags are off (the shipped default)', async () => {
    await setVoiceTongueFlags(false);
    await authedPost('/api/assessments').send({ type: 'VOICE' }).expect(404);
    await authedPost('/api/assessments').send({ type: 'TONGUE' }).expect(404);
  });
});
