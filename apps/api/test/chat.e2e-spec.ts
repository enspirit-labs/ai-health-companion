import { INestApplication } from '@nestjs/common';
import request from 'supertest';

import { PrismaService } from '../src/prisma/prisma.service';
import { createTestApp, uniqueTestEmail } from './utils/test-app';

describe('Chat (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let accessToken: string;
  const email = uniqueTestEmail('chat');

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);

    const signupRes = await request(app.getHttpServer()).post('/api/auth/signup').send({
      fullName: 'Chat Tester',
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

  it('rejects unauthenticated access', async () => {
    await request(app.getHttpServer()).get('/api/chat/messages').expect(401);
  });

  it('starts with an empty message history', async () => {
    const res = await authedGet('/api/chat/messages').expect(200);
    expect(res.body).toEqual([]);
  });

  it('rejects an empty message', async () => {
    await authedPost('/api/chat/messages').send({ content: '' }).expect(400);
  });

  it('sends a message and gets an AI reply back, both persisted in history', async () => {
    const sendRes = await authedPost('/api/chat/messages')
      .send({ content: 'How is my wellness looking?' })
      .expect(201);

    expect(sendRes.body.userMessage.role).toBe('USER');
    expect(sendRes.body.userMessage.content).toBe('How is my wellness looking?');
    expect(sendRes.body.assistantMessage.role).toBe('ASSISTANT');
    expect(sendRes.body.assistantMessage.content.length).toBeGreaterThan(0);

    const historyRes = await authedGet('/api/chat/messages').expect(200);
    expect(historyRes.body).toHaveLength(2);
    expect(historyRes.body[0].role).toBe('USER');
    expect(historyRes.body[1].role).toBe('ASSISTANT');
  });

  it('continues the same ongoing session across multiple messages', async () => {
    await authedPost('/api/chat/messages').send({ content: 'Second message' }).expect(201);

    const historyRes = await authedGet('/api/chat/messages').expect(200);
    expect(historyRes.body).toHaveLength(4);
  });

  it('keeps working once the session exceeds the 20-message context window', async () => {
    // 4 messages already exist from earlier tests; send enough more to cross 20 total.
    for (let i = 0; i < 9; i++) {
      await authedPost('/api/chat/messages').send({ content: `Filler message ${i}` }).expect(201);
    }

    const historyRes = await authedGet('/api/chat/messages').expect(200);
    expect(historyRes.body.length).toBeGreaterThan(20);

    // Sending one more must still succeed — this is the path where the prior-messages
    // query (`orderBy desc, take 20`, then reversed) is exercised beyond the limit.
    const res = await authedPost('/api/chat/messages').send({ content: 'One more after the limit' }).expect(201);
    expect(res.body.assistantMessage.content.length).toBeGreaterThan(0);
  });
});
