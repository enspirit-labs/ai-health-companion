import {
  ForbiddenException,
  InternalServerErrorException,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { CHAT_SYSTEM_GUARDRAIL, CRISIS_SAFETY_RULES, ESCALATION_COPY } from '@aidoctor/shared';

import { PrismaService } from '../prisma/prisma.service';
import { AI_PROVIDER } from '../ai/ai-provider.interface';
import { ConsentService } from '../consent/consent.service';
import { ChatService } from './chat.service';

describe('ChatService', () => {
  let service: ChatService;
  let prisma: {
    chatSession: Record<string, jest.Mock>;
    chatMessage: Record<string, jest.Mock>;
    aiPromptTemplate: Record<string, jest.Mock>;
    activityLog: Record<string, jest.Mock>;
    wellnessSnapshot: Record<string, jest.Mock>;
    assessment: Record<string, jest.Mock>;
    consentRecord: Record<string, jest.Mock>;
    $transaction: jest.Mock;
  };
  let aiProvider: { reason: jest.Mock; summarize: jest.Mock; chat: jest.Mock; classifyRisk: jest.Mock };
  let configGet: jest.Mock;

  beforeEach(async () => {
    prisma = {
      // Batch form: the operations are already-started calls, so resolving them together is enough.
      $transaction: jest.fn((operations: Promise<unknown>[]) => Promise.all(operations)),
      chatSession: {
        findFirst: jest.fn(),
        findUnique: jest.fn(),
        findMany: jest.fn().mockResolvedValue([]),
        create: jest.fn(),
        update: jest.fn(),
      },
      chatMessage: { findMany: jest.fn().mockResolvedValue([]), create: jest.fn() },
      aiPromptTemplate: { findFirst: jest.fn().mockResolvedValue(null) },
      activityLog: { create: jest.fn().mockResolvedValue({}) },
      wellnessSnapshot: { findFirst: jest.fn().mockResolvedValue(null) },
      assessment: { findMany: jest.fn().mockResolvedValue([]) },
      // Real ConsentService over this mock; default is a current AI-processing grant.
      consentRecord: { findFirst: jest.fn().mockResolvedValue({ granted: true, createdAt: new Date('2030-01-01T00:00:00.000Z') }) },
    };
    aiProvider = { reason: jest.fn(), summarize: jest.fn(), chat: jest.fn(), classifyRisk: jest.fn().mockResolvedValue(null) };
    configGet = jest.fn();

    const moduleRef = await Test.createTestingModule({
      providers: [
        ChatService,
        ConsentService,
        { provide: PrismaService, useValue: prisma },
        { provide: AI_PROVIDER, useValue: aiProvider },
        { provide: ConfigService, useValue: { get: configGet } },
      ],
    }).compile();

    service = moduleRef.get(ChatService);
  });

  describe('getHistory', () => {
    it('creates a session on first use and returns an empty history', async () => {
      prisma.chatSession.findFirst.mockResolvedValue(null);
      prisma.chatSession.create.mockResolvedValue({ id: 'session-1', userId: 'user-1' });
      prisma.chatMessage.findMany.mockResolvedValue([]);

      const result = await service.getHistory('user-1');

      expect(prisma.chatSession.create).toHaveBeenCalledWith({ data: { userId: 'user-1' } });
      expect(result).toEqual([]);
    });

    it('reuses an existing session', async () => {
      prisma.chatSession.findFirst.mockResolvedValue({ id: 'session-1', userId: 'user-1' });
      prisma.chatMessage.findMany.mockResolvedValue([
        { id: 'm1', role: 'USER', content: 'Hi', createdAt: new Date('2026-01-01T00:00:00.000Z') },
      ]);

      const result = await service.getHistory('user-1');

      expect(prisma.chatSession.create).not.toHaveBeenCalled();
      expect(result).toHaveLength(1);
      expect(result[0].role).toBe('USER');
    });

    // with several sessions, the session-unaware entry point has
    // to land the user where they actually left off, not in their oldest thread.
    it('resolves the most recently active session for a user with several', async () => {
      prisma.chatSession.findFirst.mockResolvedValue({ id: 'session-latest', userId: 'user-1' });
      prisma.chatMessage.findMany.mockResolvedValue([]);

      await service.getHistory('user-1');

      expect(prisma.chatSession.findFirst).toHaveBeenCalledWith({
        where: { userId: 'user-1' },
        orderBy: { updatedAt: 'desc' },
      });
      expect(prisma.chatMessage.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { chatSessionId: 'session-latest' } }),
      );
    });

    it('queries without take/skip when no pagination is given', async () => {
      prisma.chatSession.findFirst.mockResolvedValue({ id: 'session-1', userId: 'user-1' });
      prisma.chatMessage.findMany.mockResolvedValue([]);

      await service.getHistory('user-1');

      expect(prisma.chatMessage.findMany).toHaveBeenCalledWith({
        where: { chatSessionId: 'session-1' },
        orderBy: { createdAt: 'asc' },
      });
    });

    it('applies take/skip when page and limit are given', async () => {
      prisma.chatSession.findFirst.mockResolvedValue({ id: 'session-1', userId: 'user-1' });
      prisma.chatMessage.findMany.mockResolvedValue([]);

      await service.getHistory('user-1', { page: 2, limit: 10 });

      expect(prisma.chatMessage.findMany).toHaveBeenCalledWith({
        where: { chatSessionId: 'session-1' },
        orderBy: { createdAt: 'asc' },
        take: 10,
        skip: 10,
      });
    });
  });

  // multiple persisted sessions per user, each scoped to its owner.
  function sessionRow(over: Record<string, unknown> = {}) {
    return {
      id: 'session-1',
      userId: 'user-1',
      title: 'Sleep advice',
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      updatedAt: new Date('2026-01-02T00:00:00.000Z'),
      _count: { messages: 4 },
      ...over,
    };
  }

  /** Stubs everything an exchange needs beyond the session lookup itself. */
  function stubExchange() {
    prisma.chatMessage.create
      .mockResolvedValueOnce({
        id: 'user-msg',
        role: 'USER',
        content: 'Am I sleeping enough?',
        createdAt: new Date('2026-01-02T00:00:00.000Z'),
      })
      .mockResolvedValueOnce({
        id: 'assistant-msg',
        role: 'ASSISTANT',
        content: 'Your sleep looks steady.',
        createdAt: new Date('2026-01-02T00:00:01.000Z'),
      });
    prisma.chatMessage.findMany.mockResolvedValue([]);
    aiProvider.chat.mockResolvedValue({ reply: 'Your sleep looks steady.' });
  }

  describe('listSessions', () => {
    // AC3 + AC4: multiple sessions are listed, and only the caller's own.
    it('lists only the calling user’s sessions, most recently active first', async () => {
      prisma.chatSession.findMany.mockResolvedValue([sessionRow(), sessionRow({ id: 'session-2' })]);

      const result = await service.listSessions('user-1');

      expect(prisma.chatSession.findMany).toHaveBeenCalledWith({
        where: { userId: 'user-1' },
        orderBy: { updatedAt: 'desc' },
        include: { _count: { select: { messages: true } } },
      });
      expect(result.map((s) => s.id)).toEqual(['session-1', 'session-2']);
    });

    // AC3: the list has to be legible — title plus activity time plus size.
    it('summarises each session with its title, timestamps and message count', async () => {
      prisma.chatSession.findMany.mockResolvedValue([sessionRow({ title: null, _count: { messages: 0 } })]);

      const [summary] = await service.listSessions('user-1');

      expect(summary).toEqual({
        id: 'session-1',
        title: null,
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-02T00:00:00.000Z',
        messageCount: 0,
      });
    });

    it('applies take/skip when page and limit are given', async () => {
      prisma.chatSession.findMany.mockResolvedValue([]);

      await service.listSessions('user-1', { page: 3, limit: 5 });

      expect(prisma.chatSession.findMany).toHaveBeenCalledWith(expect.objectContaining({ take: 5, skip: 10 }));
    });

    // AC3 boundary: a brand-new user has zero sessions — the list must render
    // as empty rather than erroring, so the web page can show its empty state.
    it('returns an empty list for a user with no sessions yet', async () => {
      prisma.chatSession.findMany.mockResolvedValue([]);

      const result = await service.listSessions('user-1');

      expect(result).toEqual([]);
    });
  });

  describe('createSession', () => {
    // AC1: a user can start a new chat session.
    it('creates the user’s first session', async () => {
      prisma.chatSession.findFirst.mockResolvedValue(null);
      prisma.chatSession.create.mockResolvedValue(sessionRow({ id: 'session-new', title: null }));

      const result = await service.createSession('user-1');

      expect(prisma.chatSession.create).toHaveBeenCalledWith({ data: { userId: 'user-1' } });
      expect(result).toEqual(expect.objectContaining({ id: 'session-new', title: null, messageCount: 0 }));
    });

    // AC1 + AC3: starting a new session must not swallow the previous thread.
    it('starts a separate session once the current one has messages in it', async () => {
      prisma.chatSession.findFirst.mockResolvedValue(sessionRow({ _count: { messages: 6 } }));
      prisma.chatSession.create.mockResolvedValue(sessionRow({ id: 'session-2', title: null }));

      const result = await service.createSession('user-1');

      expect(prisma.chatSession.create).toHaveBeenCalledWith({ data: { userId: 'user-1' } });
      expect(result.id).toBe('session-2');
    });

    it('hands back the existing session while it is still empty rather than piling up blank ones', async () => {
      prisma.chatSession.findFirst.mockResolvedValue(sessionRow({ id: 'session-blank', _count: { messages: 0 } }));

      const result = await service.createSession('user-1');

      expect(prisma.chatSession.create).not.toHaveBeenCalled();
      expect(result.id).toBe('session-blank');
    });
  });

  describe('getSessionMessages', () => {
    // AC2: messages persist and come back in the order they were sent.
    it('returns an owned session’s messages in chronological order', async () => {
      prisma.chatSession.findUnique.mockResolvedValue(sessionRow());
      prisma.chatMessage.findMany.mockResolvedValue([
        { id: 'm1', role: 'USER', content: 'first', createdAt: new Date('2026-01-01T00:00:00.000Z') },
        { id: 'm2', role: 'ASSISTANT', content: 'second', createdAt: new Date('2026-01-01T00:00:01.000Z') },
      ]);

      const result = await service.getSessionMessages('user-1', 'session-1');

      expect(prisma.chatMessage.findMany).toHaveBeenCalledWith({
        where: { chatSessionId: 'session-1' },
        orderBy: { createdAt: 'asc' },
      });
      expect(result.map((m) => m.content)).toEqual(['first', 'second']);
    });

    it('applies take/skip when page and limit are given', async () => {
      prisma.chatSession.findUnique.mockResolvedValue(sessionRow());
      prisma.chatMessage.findMany.mockResolvedValue([]);

      await service.getSessionMessages('user-1', 'session-1', { page: 2, limit: 10 });

      expect(prisma.chatMessage.findMany).toHaveBeenCalledWith(expect.objectContaining({ take: 10, skip: 10 }));
    });

    // AC2 boundary: an owned session that hasn't been sent to yet has zero
    // messages — must resolve to an empty array, not throw or return null.
    it('returns an empty array for an owned session that has no messages yet', async () => {
      prisma.chatSession.findUnique.mockResolvedValue(sessionRow({ _count: { messages: 0 } }));
      prisma.chatMessage.findMany.mockResolvedValue([]);

      const result = await service.getSessionMessages('user-1', 'session-1');

      expect(result).toEqual([]);
    });

    // AC4: ownership scoping.
    it('throws NotFoundException when the session does not exist', async () => {
      prisma.chatSession.findUnique.mockResolvedValue(null);

      await expect(service.getSessionMessages('user-1', 'missing')).rejects.toThrow(NotFoundException);
    });

    it('throws ForbiddenException when the session belongs to another user', async () => {
      prisma.chatSession.findUnique.mockResolvedValue(sessionRow({ userId: 'someone-else' }));

      await expect(service.getSessionMessages('user-1', 'session-1')).rejects.toThrow(ForbiddenException);
      expect(prisma.chatMessage.findMany).not.toHaveBeenCalled();
    });
  });

  describe('sendMessageToSession', () => {
    // AC1 + AC2: continuing a specific previous conversation persists into it.
    it('persists both turns against the requested session', async () => {
      prisma.chatSession.findUnique.mockResolvedValue(sessionRow({ id: 'session-7' }));
      stubExchange();

      const result = await service.sendMessageToSession('user-1', 'session-7', 'Am I sleeping enough?');

      expect(prisma.chatMessage.create).toHaveBeenNthCalledWith(1, {
        data: { chatSessionId: 'session-7', role: 'USER', content: 'Am I sleeping enough?', createdAt: expect.any(Date) },
      });
      expect(prisma.chatMessage.create).toHaveBeenNthCalledWith(2, {
        data: { chatSessionId: 'session-7', role: 'ASSISTANT', content: 'Your sleep looks steady.', createdAt: expect.any(Date) },
      });
      expect(result.userMessage.content).toBe('Am I sleeping enough?');
      expect(result.assistantMessage.content).toBe('Your sleep looks steady.');
    });

    // AC3: an untitled session is unidentifiable in a list, so the opening
    // message becomes its title. The same write is what bumps `updatedAt`,
    // which Prisma's @updatedAt would otherwise never see (child-row writes
    // don't touch the session).
    it('titles an untitled session from its opening message', async () => {
      prisma.chatSession.findUnique.mockResolvedValue(sessionRow({ title: null }));
      stubExchange();

      await service.sendMessageToSession('user-1', 'session-1', '  Am I   sleeping enough?  ');

      expect(prisma.chatSession.update).toHaveBeenCalledWith({
        where: { id: 'session-1' },
        data: { title: 'Am I sleeping enough?' },
      });
    });

    it('truncates a very long opening message into a list-sized title', async () => {
      prisma.chatSession.findUnique.mockResolvedValue(sessionRow({ title: null }));
      stubExchange();

      await service.sendMessageToSession('user-1', 'session-1', 'a'.repeat(80));

      const { data } = prisma.chatSession.update.mock.calls[0][0];
      expect(data.title).toBe(`${'a'.repeat(59)}…`);
      expect(data.title).toHaveLength(60);
    });

    it('keeps an existing title while still bumping the session’s activity timestamp', async () => {
      prisma.chatSession.findUnique.mockResolvedValue(sessionRow({ title: 'Sleep advice' }));
      stubExchange();

      await service.sendMessageToSession('user-1', 'session-1', 'And what about hydration?');

      expect(prisma.chatSession.update).toHaveBeenCalledWith({
        where: { id: 'session-1' },
        data: { title: 'Sleep advice' },
      });
    });

    // AC4: ownership is checked before anything is written.
    it('refuses to write into another user’s session', async () => {
      prisma.chatSession.findUnique.mockResolvedValue(sessionRow({ userId: 'someone-else' }));

      await expect(service.sendMessageToSession('user-1', 'session-1', 'hello')).rejects.toThrow(ForbiddenException);
      expect(prisma.chatMessage.create).not.toHaveBeenCalled();
      expect(aiProvider.chat).not.toHaveBeenCalled();
    });
  });

  describe('AI-processing consent', () => {
    const grantedAt = (iso: string, granted = true) =>
      prisma.consentRecord.findFirst.mockResolvedValue({ granted, createdAt: new Date(iso) });

    beforeEach(() => {
      prisma.chatSession.findFirst.mockResolvedValue({ id: 'session-1', userId: 'user-1', title: null });
      prisma.chatSession.findUnique.mockResolvedValue({ id: 'session-1', userId: 'user-1', title: null });
    });

    it.each([
      ['sendMessage', (s: ChatService) => s.sendMessage('user-1', 'How am I doing?')],
      ['sendMessageToSession', (s: ChatService) => s.sendMessageToSession('user-1', 'session-1', 'How am I doing?')],
    ])('%s is refused with CONSENT_REQUIRED_AI_PROCESSING when never consented', async (_n, send) => {
      prisma.consentRecord.findFirst.mockResolvedValue(null);
      await expect(send(service)).rejects.toMatchObject({
        status: 403,
        response: { code: 'CONSENT_REQUIRED_AI_PROCESSING' },
      });
      expect(aiProvider.chat).not.toHaveBeenCalled();
      expect(aiProvider.classifyRisk).not.toHaveBeenCalled();
      expect(prisma.chatMessage.create).not.toHaveBeenCalled();
    });

    it('does not count the old signup auto-grant (created before the valid-from date)', async () => {
      grantedAt('2026-10-26T23:59:59.999Z');
      await expect(service.sendMessage('user-1', 'hello')).rejects.toBeInstanceOf(ForbiddenException);
      expect(aiProvider.chat).not.toHaveBeenCalled();
    });

    it('is refused after a withdrawal', async () => {
      grantedAt('2026-11-01T00:00:00.000Z', false);
      await expect(service.sendMessage('user-1', 'hello')).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('allows a grant made on or after the valid-from date', async () => {
      grantedAt('2026-10-27T00:00:00.000Z');
      prisma.chatMessage.create
        .mockResolvedValueOnce({ id: 'u', role: 'USER', content: 'hello', createdAt: new Date() })
        .mockResolvedValueOnce({ id: 'a', role: 'ASSISTANT', content: 'hi', createdAt: new Date() });
      aiProvider.chat.mockResolvedValue({ reply: 'hi' });
      await expect(service.sendMessage('user-1', 'hello')).resolves.toBeDefined();
      expect(aiProvider.chat).toHaveBeenCalled();
    });

    it('still answers a crisis message with the fixed copy without AI consent (nothing is sent to the provider)', async () => {
      prisma.consentRecord.findFirst.mockResolvedValue(null);
      prisma.chatMessage.create
        .mockResolvedValueOnce({ id: 'u', role: 'USER', content: 'I want to kill myself', createdAt: new Date() })
        .mockResolvedValueOnce({ id: 'a', role: 'ASSISTANT', content: 'x', createdAt: new Date() });
      const result = await service.sendMessage('user-1', 'I want to kill myself');
      expect(result.escalation).toBeDefined();
      expect(aiProvider.chat).not.toHaveBeenCalled();
      expect(aiProvider.classifyRisk).not.toHaveBeenCalled();
    });
  });

  describe('sendMessage', () => {
    it('persists the user message, calls the AI provider with history + context, and persists the reply', async () => {
      prisma.chatSession.findFirst.mockResolvedValue({ id: 'session-1', userId: 'user-1' });
      prisma.chatMessage.create
        .mockResolvedValueOnce({
          id: 'user-msg',
          role: 'USER',
          content: 'How am I doing?',
          createdAt: new Date('2026-01-01T00:00:00.000Z'),
        })
        .mockResolvedValueOnce({
          id: 'assistant-msg',
          role: 'ASSISTANT',
          content: 'You are doing well.',
          createdAt: new Date('2026-01-01T00:00:01.000Z'),
        });
      prisma.chatMessage.findMany.mockResolvedValue([]);
      prisma.wellnessSnapshot.findFirst.mockResolvedValue({ overallScore: 80, riskLevel: 'LOW' });
      prisma.assessment.findMany.mockResolvedValue([
        { type: 'FACE', completedAt: new Date(), score: { value: 80, riskLevel: 'LOW' } },
      ]);
      aiProvider.chat.mockResolvedValue({ reply: 'You are doing well.' });

      const result = await service.sendMessage('user-1', 'How am I doing?');

      expect(prisma.chatMessage.create).toHaveBeenNthCalledWith(1, {
        data: { chatSessionId: 'session-1', role: 'USER', content: 'How am I doing?', createdAt: expect.any(Date) },
      });
      expect(aiProvider.chat).toHaveBeenCalledWith(
        expect.objectContaining({
          messages: [{ role: 'user', content: 'How am I doing?' }],
          context: expect.objectContaining({ overallScore: 80, overallRiskLevel: 'LOW' }),
        }),
      );
      expect(prisma.chatMessage.create).toHaveBeenNthCalledWith(2, {
        data: { chatSessionId: 'session-1', role: 'ASSISTANT', content: 'You are doing well.', createdAt: expect.any(Date) },
      });
      expect(result.userMessage.content).toBe('How am I doing?');
      expect(result.assistantMessage.content).toBe('You are doing well.');
    });

    it('grounds the AI call in the most recent messages, not the oldest, once history exceeds the limit', async () => {
      prisma.chatSession.findFirst.mockResolvedValue({ id: 'session-1', userId: 'user-1' });
      prisma.chatMessage.create
        .mockResolvedValueOnce({ id: 'user-msg', role: 'USER', content: 'latest', createdAt: new Date() })
        .mockResolvedValueOnce({ id: 'assistant-msg', role: 'ASSISTANT', content: 'reply', createdAt: new Date() });

      // Simulate a 25-message session queried with `orderBy: desc, take: 20`
      // — Prisma would return the newest 20 (messages 25 down to 6), newest first.
      const newestFirst = Array.from({ length: 19 }, (_, i) => {
        const n = 25 - i;
        return { id: `m${n}`, role: 'USER', content: `msg-${n}`, createdAt: new Date(2026, 0, n) };
      });
      prisma.chatMessage.findMany.mockResolvedValue(newestFirst);
      aiProvider.chat.mockResolvedValue({ reply: 'reply' });

      await service.sendMessage('user-1', 'latest');

      // 19 stored messages plus the new one still in memory = the same 20-message window.
      expect(prisma.chatMessage.findMany).toHaveBeenCalledWith({
        where: { chatSessionId: 'session-1' },
        orderBy: { createdAt: 'desc' },
        take: 19,
      });

      const { messages } = aiProvider.chat.mock.calls[0][0];
      expect(messages).toHaveLength(20);
      // Chronological order restored, and it's the most recent 20 (6..25), not the oldest 20 (1..20).
      expect(messages[0].content).toBe('msg-7');
      expect(messages[18].content).toBe('msg-25');
      expect(messages[19]).toEqual({ role: 'user', content: 'latest' });
      expect(messages.map((m: { content: string }) => m.content)).not.toContain('msg-1');
    });

    describe('system prompt composition', () => {
      function stubSend() {
        prisma.chatSession.findFirst.mockResolvedValue({ id: 'session-1', userId: 'user-1' });
        prisma.chatMessage.create
          .mockResolvedValueOnce({ id: 'user-msg', role: 'USER', content: 'hi', createdAt: new Date() })
          .mockResolvedValueOnce({ id: 'assistant-msg', role: 'ASSISTANT', content: 'reply', createdAt: new Date() });
        aiProvider.chat.mockResolvedValue({ reply: 'reply' });
      }

      it('keeps the guardrail and crisis rules when the active DB template omits them', async () => {
        stubSend();
        prisma.aiPromptTemplate.findFirst.mockResolvedValue({ systemPrompt: 'You are a cheerful coach.' });

        await service.sendMessage('user-1', 'hi');

        const [[{ systemPrompt }]] = aiProvider.chat.mock.calls as [[{ systemPrompt: string }]];
        expect(systemPrompt).toBe(`${CHAT_SYSTEM_GUARDRAIL}\n\n${CRISIS_SAFETY_RULES}\n\nYou are a cheerful coach.`);
      });

      it('does not duplicate the guardrail when the DB template already includes it', async () => {
        stubSend();
        prisma.aiPromptTemplate.findFirst.mockResolvedValue({
          systemPrompt: `${CHAT_SYSTEM_GUARDRAIL}\n\nYou are a cheerful coach.`,
        });

        await service.sendMessage('user-1', 'hi');

        const [[{ systemPrompt }]] = aiProvider.chat.mock.calls as [[{ systemPrompt: string }]];
        expect(systemPrompt.split(CHAT_SYSTEM_GUARDRAIL)).toHaveLength(2);
        expect(systemPrompt.split(CRISIS_SAFETY_RULES)).toHaveLength(2);
      });

      it('applies the guardrail and crisis rules to the code default when no template is active', async () => {
        stubSend();

        await service.sendMessage('user-1', 'hi');

        const [[{ systemPrompt }]] = aiProvider.chat.mock.calls as [[{ systemPrompt: string }]];
        expect(systemPrompt.startsWith(`${CHAT_SYSTEM_GUARDRAIL}\n\n${CRISIS_SAFETY_RULES}`)).toBe(true);
      });
    });

    describe('recentAssessments context (mixed quota)', () => {
      function stubAssessmentPools(fullItems: unknown[], pulseItems: unknown[]) {
        prisma.assessment.findMany.mockImplementation(({ where }: { where: { mode?: string } }) =>
          Promise.resolve(where.mode === 'PULSE' ? pulseItems : fullItems),
        );
      }

      beforeEach(() => {
        prisma.chatSession.findFirst.mockResolvedValue({ id: 'session-1', userId: 'user-1' });
        prisma.chatMessage.create
          .mockResolvedValueOnce({ id: 'user-msg', role: 'USER', content: 'q', createdAt: new Date() })
          .mockResolvedValueOnce({ id: 'assistant-msg', role: 'ASSISTANT', content: 'a', createdAt: new Date() });
        prisma.chatMessage.findMany.mockResolvedValue([]);
        aiProvider.chat.mockResolvedValue({ reply: 'a' });
      });

      it('reserves 3 FULL + 2 PULSE slots even when PULSE completions are more numerous and more recent', async () => {
        const fullItems = Array.from({ length: 5 }, (_, i) => ({
          type: 'FACE',
          completedAt: new Date(2026, 0, 10 - i),
          score: { value: 80, riskLevel: 'LOW' },
        }));
        // Ten daily Pulse check-ins, every one newer than any FULL item — a
        // naive "5 most recent" query would return only these.
        const pulseItems = Array.from({ length: 10 }, (_, i) => ({
          type: 'MENTAL_WELLNESS',
          completedAt: new Date(2026, 0, 25 - i),
          score: { value: 70, riskLevel: 'LOW' },
        }));
        stubAssessmentPools(fullItems, pulseItems);

        await service.sendMessage('user-1', 'q');

        const { context } = aiProvider.chat.mock.calls[0][0];
        const types = context.recentAssessments.map((a: { type: string }) => a.type);
        expect(types.filter((t: string) => t === 'FACE')).toHaveLength(3);
        expect(types.filter((t: string) => t === 'MENTAL_WELLNESS')).toHaveLength(2);
      });

      it('backfills with extra FULL items when fewer than 2 PULSE completions exist', async () => {
        const fullItems = Array.from({ length: 5 }, (_, i) => ({
          type: 'FACE',
          completedAt: new Date(2026, 0, 10 - i),
          score: { value: 80, riskLevel: 'LOW' },
        }));
        const pulseItems = [{ type: 'MENTAL_WELLNESS', completedAt: new Date(2026, 0, 20), score: { value: 70, riskLevel: 'LOW' } }];
        stubAssessmentPools(fullItems, pulseItems);

        await service.sendMessage('user-1', 'q');

        const { context } = aiProvider.chat.mock.calls[0][0];
        expect(context.recentAssessments).toHaveLength(5);
        const types = context.recentAssessments.map((a: { type: string }) => a.type);
        expect(types.filter((t: string) => t === 'MENTAL_WELLNESS')).toHaveLength(1);
        expect(types.filter((t: string) => t === 'FACE')).toHaveLength(4);
      });

      it('queries each mode with its own where clause', async () => {
        stubAssessmentPools([], []);

        await service.sendMessage('user-1', 'q');

        expect(prisma.assessment.findMany).toHaveBeenCalledWith(
          expect.objectContaining({ where: expect.objectContaining({ mode: 'FULL' }) }),
        );
        expect(prisma.assessment.findMany).toHaveBeenCalledWith(
          expect.objectContaining({ where: expect.objectContaining({ mode: 'PULSE' }) }),
        );
      });
    });
  });

  // a deterministic red-flag check runs before any model call.
  describe('chat reliability', () => {
    beforeEach(() => {
      prisma.chatSession.findUnique.mockResolvedValue(sessionRow());
    });

    it('saves nothing and answers 503 when the provider fails', async () => {
      aiProvider.chat.mockRejectedValue(new Error('upstream exploded with the message text'));

      await expect(service.sendMessageToSession('user-1', 'session-1', 'How am I doing?')).rejects.toBeInstanceOf(
        ServiceUnavailableException,
      );

      expect(prisma.chatMessage.create).not.toHaveBeenCalled();
      expect(prisma.$transaction).not.toHaveBeenCalled();
      expect(prisma.chatSession.update).not.toHaveBeenCalled();
    });

    it('maps a provider refusal (500) to 503 as well', async () => {
      aiProvider.chat.mockRejectedValue(new InternalServerErrorException('AI declined to respond to this message'));

      await expect(service.sendMessageToSession('user-1', 'session-1', 'hello')).rejects.toBeInstanceOf(
        ServiceUnavailableException,
      );
      expect(prisma.chatMessage.create).not.toHaveBeenCalled();
    });

    it('uses a friendly message that does not leak the provider error', async () => {
      aiProvider.chat.mockRejectedValue(new Error('401 invalid x-api-key'));

      const error = await service.sendMessageToSession('user-1', 'session-1', 'hello').catch((e: unknown) => e);

      expect((error as ServiceUnavailableException).message).toMatch(/try again/i);
      expect((error as ServiceUnavailableException).message).not.toContain('x-api-key');
    });

    it('does not log the message text when the provider fails', async () => {
      const errorSpy = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
      aiProvider.chat.mockRejectedValue(new Error('boom'));

      await service.sendMessageToSession('user-1', 'session-1', 'my private note').catch(() => undefined);

      expect(errorSpy.mock.calls.flat().map(String).join(' ')).not.toContain('my private note');
      errorSpy.mockRestore();
    });

    it('writes both messages and the session bump in a single transaction after the reply', async () => {
      stubExchange();

      await service.sendMessageToSession('user-1', 'session-1', 'Am I sleeping enough?');

      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
      const calls = [aiProvider.chat, prisma.$transaction].map((m) => m.mock.invocationCallOrder[0]);
      expect(calls[0]).toBeLessThan(calls[1]);
      expect(prisma.$transaction.mock.calls[0][0]).toHaveLength(3);
    });

    it('stores the user message with an earlier timestamp than the reply', async () => {
      stubExchange();

      await service.sendMessageToSession('user-1', 'session-1', 'Am I sleeping enough?');

      const [user, assistant] = prisma.chatMessage.create.mock.calls.map(
        (call) => (call[0] as { data: { createdAt: Date } }).data.createdAt,
      );
      expect(assistant.getTime()).toBeGreaterThan(user.getTime());
    });

    it('still checks consent before any provider call or write', async () => {
      prisma.consentRecord.findFirst.mockResolvedValue(null);

      await expect(service.sendMessageToSession('user-1', 'session-1', 'hello')).rejects.toBeDefined();

      expect(aiProvider.classifyRisk).not.toHaveBeenCalled();
      expect(aiProvider.chat).not.toHaveBeenCalled();
      expect(prisma.chatMessage.create).not.toHaveBeenCalled();
    });

    it('still escalates a crisis message (and saves both messages) without calling the provider', async () => {
      prisma.chatMessage.create
        .mockResolvedValueOnce({ id: 'u', role: 'USER', content: 'I want to kill myself', createdAt: new Date() })
        .mockResolvedValueOnce({ id: 'a', role: 'ASSISTANT', content: ESCALATION_COPY.CRISIS, createdAt: new Date() });

      const result = await service.sendMessageToSession('user-1', 'session-1', 'I want to kill myself');

      expect(aiProvider.chat).not.toHaveBeenCalled();
      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
      expect(result.escalation?.kind).toBe('CRISIS');
    });
  });

  describe('red-flag gate', () => {
    function stubPersist(userContent: string, assistantContent: string) {
      prisma.chatMessage.create
        .mockResolvedValueOnce({
          id: 'user-msg',
          role: 'USER',
          content: userContent,
          createdAt: new Date('2026-01-02T00:00:00.000Z'),
        })
        .mockResolvedValueOnce({
          id: 'assistant-msg',
          role: 'ASSISTANT',
          content: assistantContent,
          createdAt: new Date('2026-01-02T00:00:01.000Z'),
        });
    }

    describe('session-scoped send', () => {
      it('skips the model and persists both messages when a crisis is detected', async () => {
        prisma.chatSession.findUnique.mockResolvedValue(sessionRow({ title: 'Sleep advice' }));
        stubPersist('I want to kill myself', ESCALATION_COPY.CRISIS);

        const result = await service.sendMessageToSession('user-1', 'session-1', 'I want to kill myself');

        expect(aiProvider.chat).not.toHaveBeenCalled();
        expect(prisma.chatMessage.create).toHaveBeenCalledTimes(2);
        expect(prisma.chatMessage.create).toHaveBeenNthCalledWith(1, {
          data: { chatSessionId: 'session-1', role: 'USER', content: 'I want to kill myself', createdAt: expect.any(Date) },
        });
        expect(prisma.chatMessage.create).toHaveBeenNthCalledWith(2, {
          data: { chatSessionId: 'session-1', role: 'ASSISTANT', content: ESCALATION_COPY.CRISIS, createdAt: expect.any(Date) },
        });
        expect(result.assistantMessage.content).toBe(ESCALATION_COPY.CRISIS);
        expect(result.escalation).toEqual({ kind: 'CRISIS', category: 'SUICIDE_OR_SELF_HARM' });
        // session is still touched as usual
        expect(prisma.chatSession.update).toHaveBeenCalledWith({
          where: { id: 'session-1' },
          data: { title: 'Sleep advice' },
        });
      });

      it('uses the emergency copy for a medical emergency', async () => {
        prisma.chatSession.findUnique.mockResolvedValue(sessionRow());
        stubPersist("I can't breathe", ESCALATION_COPY.EMERGENCY);

        const result = await service.sendMessageToSession('user-1', 'session-1', "I can't breathe");

        expect(aiProvider.chat).not.toHaveBeenCalled();
        expect(result.assistantMessage.content).toBe(ESCALATION_COPY.EMERGENCY);
        expect(result.escalation).toEqual({ kind: 'EMERGENCY', category: 'BREATHING' });
      });

      it('calls the provider as before and returns no escalation when nothing matches', async () => {
        prisma.chatSession.findUnique.mockResolvedValue(sessionRow());
        stubExchange();

        const result = await service.sendMessageToSession('user-1', 'session-1', 'Am I sleeping enough?');

        expect(aiProvider.chat).toHaveBeenCalledTimes(1);
        expect(result.escalation).toBeUndefined();
        expect(result.assistantMessage.content).toBe('Your sleep looks steady.');
      });
    });

    // the session flag is an activity_logs row keyed by sessionId.
    describe('escalation activity log', () => {
      it('writes one chat.escalation row with ids and categories only', async () => {
        prisma.chatSession.findUnique.mockResolvedValue(sessionRow({ id: 'session-9' }));
        stubPersist('I want to kill myself', ESCALATION_COPY.CRISIS);

        await service.sendMessageToSession('user-1', 'session-9', 'I want to kill myself');

        expect(prisma.activityLog.create).toHaveBeenCalledTimes(1);
        expect(prisma.activityLog.create).toHaveBeenCalledWith({
          data: {
            userId: 'user-1',
            action: 'chat.escalation',
            metadata: { sessionId: 'session-9', category: 'SUICIDE_OR_SELF_HARM', kind: 'CRISIS', source: 'rules' },
          },
        });
      });

      it('never puts message content in the log row', async () => {
        prisma.chatSession.findUnique.mockResolvedValue(sessionRow());
        stubPersist('I want to kill myself', ESCALATION_COPY.CRISIS);

        await service.sendMessageToSession('user-1', 'session-1', 'I want to kill myself');

        expect(JSON.stringify(prisma.activityLog.create.mock.calls[0][0])).not.toMatch(/kill myself/i);
      });

      it('logs on the session-less path too', async () => {
        prisma.chatSession.findFirst.mockResolvedValue({ id: 'session-1', userId: 'user-1', title: null });
        stubPersist("I can't breathe", ESCALATION_COPY.EMERGENCY);

        await service.sendMessage('user-1', "I can't breathe");

        expect(prisma.activityLog.create).toHaveBeenCalledWith({
          data: {
            userId: 'user-1',
            action: 'chat.escalation',
            metadata: { sessionId: 'session-1', category: 'BREATHING', kind: 'EMERGENCY', source: 'rules' },
          },
        });
      });

      it('does not log when nothing matches', async () => {
        prisma.chatSession.findUnique.mockResolvedValue(sessionRow());
        stubExchange();

        await service.sendMessageToSession('user-1', 'session-1', 'Am I sleeping enough?');

        expect(prisma.activityLog.create).not.toHaveBeenCalled();
      });

      it('still returns the escalation response when the log write rejects', async () => {
        prisma.chatSession.findUnique.mockResolvedValue(sessionRow());
        stubPersist('I want to kill myself', ESCALATION_COPY.CRISIS);
        prisma.activityLog.create.mockRejectedValue(new Error('db down'));

        const result = await service.sendMessageToSession('user-1', 'session-1', 'I want to kill myself');

        expect(result.escalation).toEqual({ kind: 'CRISIS', category: 'SUICIDE_OR_SELF_HARM' });
        expect(result.assistantMessage.content).toBe(ESCALATION_COPY.CRISIS);
      });

      it('still returns the escalation response when the log write throws synchronously', async () => {
        prisma.chatSession.findUnique.mockResolvedValue(sessionRow());
        stubPersist('I want to kill myself', ESCALATION_COPY.CRISIS);
        prisma.activityLog.create.mockImplementation(() => {
          throw new Error('client not ready');
        });

        const result = await service.sendMessageToSession('user-1', 'session-1', 'I want to kill myself');

        expect(result.escalation?.kind).toBe('CRISIS');
      });
    });

    describe('escalation when the save fails', () => {
      it('still returns the fixed escalation card when the transaction rejects (rules match)', async () => {
        prisma.chatSession.findUnique.mockResolvedValue(sessionRow());
        prisma.$transaction.mockRejectedValue(new Error('db down'));

        const result = await service.sendMessageToSession('user-1', 'session-1', 'I want to kill myself');

        expect(aiProvider.chat).not.toHaveBeenCalled();
        expect(result.escalation).toEqual({ kind: 'CRISIS', category: 'SUICIDE_OR_SELF_HARM' });
        expect(result.assistantMessage.content).toBe(ESCALATION_COPY.CRISIS);
        expect(result.userMessage.content).toBe('I want to kill myself');
        expect(new Date(result.assistantMessage.createdAt).getTime()).toBeGreaterThan(
          new Date(result.userMessage.createdAt).getTime(),
        );
      });

      it('still returns the escalation card when the transaction rejects (classifier match)', async () => {
        prisma.chatSession.findUnique.mockResolvedValue(sessionRow());
        prisma.$transaction.mockRejectedValue(new Error('db down'));
        aiProvider.classifyRisk.mockResolvedValue({ kind: 'CRISIS', category: 'SUICIDE_OR_SELF_HARM' });

        const result = await service.sendMessageToSession(
          'user-1',
          'session-1',
          'I keep imagining my own funeral and it feels peaceful',
        );

        expect(aiProvider.chat).not.toHaveBeenCalled();
        expect(result.escalation?.kind).toBe('CRISIS');
        expect(result.assistantMessage.content).toBe(ESCALATION_COPY.CRISIS);
      });
    });

    // model-assisted second layer, only when the rules found nothing.
    describe('safety classifier', () => {
      const QUIET = 'I keep imagining my own funeral and it feels peaceful';

      function stubClassifierHit(kind: 'CRISIS' | 'EMERGENCY' = 'CRISIS') {
        aiProvider.classifyRisk.mockResolvedValue({
          kind,
          category: kind === 'CRISIS' ? 'SUICIDE_OR_SELF_HARM' : 'CARDIAC',
        });
      }

      it.each([
        ['session-scoped', async () => service.sendMessageToSession('user-1', 'session-1', QUIET)],
        ['session-less', async () => service.sendMessage('user-1', QUIET)],
      ])('escalates exactly like a rules match when the classifier flags it (%s)', async (_label, send) => {
        prisma.chatSession.findUnique.mockResolvedValue(sessionRow());
        prisma.chatSession.findFirst.mockResolvedValue(sessionRow());
        stubPersist(QUIET, ESCALATION_COPY.CRISIS);
        stubClassifierHit('CRISIS');

        const result = await send();

        expect(aiProvider.chat).not.toHaveBeenCalled();
        expect(prisma.chatMessage.create).toHaveBeenNthCalledWith(2, {
          data: { chatSessionId: 'session-1', role: 'ASSISTANT', content: ESCALATION_COPY.CRISIS, createdAt: expect.any(Date) },
        });
        expect(result.assistantMessage.content).toBe(ESCALATION_COPY.CRISIS);
        expect(result.escalation).toEqual({ kind: 'CRISIS', category: 'SUICIDE_OR_SELF_HARM' });
        expect(prisma.chatSession.update).toHaveBeenCalled();
      });

      it('uses the emergency copy for an emergency classification', async () => {
        prisma.chatSession.findUnique.mockResolvedValue(sessionRow());
        stubPersist('my arm feels strange', ESCALATION_COPY.EMERGENCY);
        stubClassifierHit('EMERGENCY');

        const result = await service.sendMessageToSession('user-1', 'session-1', 'my arm feels strange');

        expect(result.assistantMessage.content).toBe(ESCALATION_COPY.EMERGENCY);
        expect(result.escalation).toEqual({ kind: 'EMERGENCY', category: 'CARDIAC' });
      });

      it('logs source "classifier" with ids and categories only', async () => {
        prisma.chatSession.findUnique.mockResolvedValue(sessionRow({ id: 'session-7' }));
        stubPersist(QUIET, ESCALATION_COPY.CRISIS);
        stubClassifierHit('CRISIS');

        await service.sendMessageToSession('user-1', 'session-7', QUIET);

        expect(prisma.activityLog.create).toHaveBeenCalledTimes(1);
        expect(prisma.activityLog.create).toHaveBeenCalledWith({
          data: {
            userId: 'user-1',
            action: 'chat.escalation',
            metadata: {
              sessionId: 'session-7',
              category: 'SUICIDE_OR_SELF_HARM',
              kind: 'CRISIS',
              source: 'classifier',
            },
          },
        });
        expect(JSON.stringify(prisma.activityLog.create.mock.calls[0][0])).not.toMatch(/funeral/i);
      });

      it('does not call the classifier when the rules matched', async () => {
        prisma.chatSession.findUnique.mockResolvedValue(sessionRow());
        stubPersist('I want to kill myself', ESCALATION_COPY.CRISIS);

        await service.sendMessageToSession('user-1', 'session-1', 'I want to kill myself');

        expect(aiProvider.classifyRisk).not.toHaveBeenCalled();
      });

      it('continues the normal reply when the classifier returns null', async () => {
        prisma.chatSession.findUnique.mockResolvedValue(sessionRow());
        stubExchange();

        const result = await service.sendMessageToSession('user-1', 'session-1', 'Am I sleeping enough?');

        expect(aiProvider.classifyRisk).toHaveBeenCalledTimes(1);
        expect(aiProvider.chat).toHaveBeenCalledTimes(1);
        expect(result.escalation).toBeUndefined();
        expect(prisma.activityLog.create).not.toHaveBeenCalled();
      });

      it('continues the normal reply when the classifier throws unexpectedly', async () => {
        prisma.chatSession.findUnique.mockResolvedValue(sessionRow());
        stubExchange();
        aiProvider.classifyRisk.mockRejectedValue(new Error('boom'));

        const result = await service.sendMessageToSession('user-1', 'session-1', 'Am I sleeping enough?');

        expect(aiProvider.chat).toHaveBeenCalledTimes(1);
        expect(result.escalation).toBeUndefined();
      });

      it.each(['false', 'FALSE', '0', false])('does not call the classifier when disabled via %p', async (value) => {
        configGet.mockImplementation((key: string) => (key === 'SAFETY_CLASSIFIER_ENABLED' ? value : undefined));
        prisma.chatSession.findUnique.mockResolvedValue(sessionRow());
        stubExchange();

        await service.sendMessageToSession('user-1', 'session-1', 'Am I sleeping enough?');

        expect(aiProvider.classifyRisk).not.toHaveBeenCalled();
        expect(aiProvider.chat).toHaveBeenCalledTimes(1);
      });

      it.each([undefined, 'true', '1', true, 'yes'])('stays enabled when the flag is %p', async (value) => {
        configGet.mockImplementation((key: string) => (key === 'SAFETY_CLASSIFIER_ENABLED' ? value : undefined));
        prisma.chatSession.findUnique.mockResolvedValue(sessionRow());
        stubExchange();

        await service.sendMessageToSession('user-1', 'session-1', 'Am I sleeping enough?');

        expect(aiProvider.classifyRisk).toHaveBeenCalledTimes(1);
      });

      it('passes the latest message and up to two previous user messages, oldest first', async () => {
        prisma.chatSession.findUnique.mockResolvedValue(sessionRow());
        stubExchange();
        // findMany is newest-first and holds only the earlier messages: the new one is not saved yet.
        prisma.chatMessage.findMany.mockResolvedValue([
          { id: 'a2', role: 'ASSISTANT', content: 'coach reply 2', createdAt: new Date() },
          { id: 'u3', role: 'USER', content: 'third', createdAt: new Date() },
          { id: 'a1', role: 'ASSISTANT', content: 'coach reply 1', createdAt: new Date() },
          { id: 'u2', role: 'USER', content: 'second', createdAt: new Date() },
          { id: 'u1', role: 'USER', content: 'first', createdAt: new Date() },
        ]);

        await service.sendMessageToSession('user-1', 'session-1', 'latest');

        expect(aiProvider.classifyRisk).toHaveBeenCalledWith({
          latestMessage: 'latest',
          previousMessages: ['second', 'third'],
        });
      });
    });

    describe('session-less send', () => {
      it('skips the model and persists both messages when an emergency is detected', async () => {
        prisma.chatSession.findFirst.mockResolvedValue({ id: 'session-1', userId: 'user-1', title: null });
        stubPersist('I think I am having a heart attack', ESCALATION_COPY.EMERGENCY);

        const result = await service.sendMessage('user-1', 'I think I am having a heart attack');

        expect(aiProvider.chat).not.toHaveBeenCalled();
        expect(prisma.aiPromptTemplate.findFirst).not.toHaveBeenCalled();
        expect(prisma.chatMessage.create).toHaveBeenNthCalledWith(1, {
          data: { chatSessionId: 'session-1', role: 'USER', content: 'I think I am having a heart attack', createdAt: expect.any(Date) },
        });
        expect(prisma.chatMessage.create).toHaveBeenNthCalledWith(2, {
          data: { chatSessionId: 'session-1', role: 'ASSISTANT', content: ESCALATION_COPY.EMERGENCY, createdAt: expect.any(Date) },
        });
        expect(result.escalation).toEqual({ kind: 'EMERGENCY', category: 'CARDIAC' });
      });

      it('calls the provider as before when nothing matches', async () => {
        prisma.chatSession.findFirst.mockResolvedValue({ id: 'session-1', userId: 'user-1', title: null });
        stubExchange();

        const result = await service.sendMessage('user-1', 'How can I sleep better?');

        expect(aiProvider.chat).toHaveBeenCalledTimes(1);
        expect(result.escalation).toBeUndefined();
      });
    });
  });
});
