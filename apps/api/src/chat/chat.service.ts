import { Inject, Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'node:crypto';
import { ESCALATION_COPY, WELLNESS_DISCLAIMER, detectRedFlag } from '@aidoctor/shared';
import type {
  ChatMessageDto,
  ChatSessionSummaryDto,
  RedFlagMatch,
  SendChatMessageResponse,
} from '@aidoctor/shared';

import { PrismaService } from '../prisma/prisma.service';
import { findLatestWellnessSnapshot } from '../common/wellness-snapshot.util';
import { assertOwnedResource } from '../common/owned-resource.util';
import { toPrismaPageArgs, type PaginationParams } from '../common/pagination.util';
import { selectMixedQuota } from '../common/mixed-quota.util';
import { AI_PROVIDER, type AiChatMessage, type AiProvider } from '../ai/ai-provider.interface';
import { composeSystemPrompt } from '../ai/compose-system-prompt';
import { ConsentService } from '../consent/consent.service';

const CHAT_PROMPT_KEY = 'chat.health_coach.system';
const DEFAULT_CHAT_SYSTEM_PROMPT = WELLNESS_DISCLAIMER;
const HISTORY_MESSAGE_LIMIT = 20;
// The classifier sees the latest message plus up to this many earlier user messages.
const CLASSIFIER_CONTEXT_MESSAGES = 2;

// Shown when the AI provider fails or times out. Nothing was saved,
// so retrying the same message is safe.
const CHAT_UNAVAILABLE_MESSAGE =
  "The coach couldn't reply just now. Your message wasn't sent, so please try again in a moment.";

type EscalationSource = 'rules' | 'classifier';

// Sessions are titled from their opening message rather than by the user —
// enough to tell threads apart in a list without a rename endpoint the
// acceptance criteria never asked for.
const CHAT_SESSION_TITLE_MAX_LENGTH = 60;

// A daily Pulse check-in would otherwise flood this context with 5 nearly
// identical mood/stress/sleep entries within a week, crowding out the
// richer FULL assessments (camera/mic-based) that actually carry the most
// diagnostic signal for the coach — so FULL and PULSE each get a reserved
// share, one backfilling the other when scarce (see selectMixedQuota).
const CHAT_CONTEXT_FULL_QUOTA = 3;
const CHAT_CONTEXT_PULSE_QUOTA = 2;
const CHAT_CONTEXT_TOTAL_QUOTA = CHAT_CONTEXT_FULL_QUOTA + CHAT_CONTEXT_PULSE_QUOTA;

@Injectable()
export class ChatService {
  private readonly logger = new Logger(ChatService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(AI_PROVIDER) private readonly aiProvider: AiProvider,
    private readonly config: ConfigService,
    private readonly consent: ConsentService,
  ) {}

  /** every conversation this user owns, most recently active first. */
  async listSessions(userId: string, pagination?: PaginationParams): Promise<ChatSessionSummaryDto[]> {
    const sessions = await this.prisma.chatSession.findMany({
      where: { userId },
      orderBy: { updatedAt: 'desc' },
      include: { _count: { select: { messages: true } } },
      ...toPrismaPageArgs(pagination),
    });
    return sessions.map((session) => this.toSessionDto(session));
  }

  /**
   * start a new conversation. Idempotent while the newest
   * session is still empty — repeatedly hitting "New chat" without saying
   * anything hands back the same blank session instead of filling the list
   * with indistinguishable empty rows.
   */
  async createSession(userId: string): Promise<ChatSessionSummaryDto> {
    const latest = await this.prisma.chatSession.findFirst({
      where: { userId },
      orderBy: { updatedAt: 'desc' },
      include: { _count: { select: { messages: true } } },
    });
    if (latest && latest._count.messages === 0) {
      return this.toSessionDto(latest);
    }
    const created = await this.prisma.chatSession.create({ data: { userId } });
    return this.toSessionDto({ ...created, _count: { messages: 0 } });
  }

  /** messages of one owned session, in the order they were sent. */
  async getSessionMessages(
    userId: string,
    sessionId: string,
    pagination?: PaginationParams,
  ): Promise<ChatMessageDto[]> {
    const session = await this.findOwnedSession(userId, sessionId);
    return this.findMessages(session.id, pagination);
  }

  /** continue a specific previous conversation. */
  async sendMessageToSession(userId: string, sessionId: string, content: string): Promise<SendChatMessageResponse> {
    const session = await this.findOwnedSession(userId, sessionId);
    return this.exchange(userId, session, content);
  }

  /**
   * The user's current conversation — the one they'd land in without picking a
   * session explicitly. Ordered by last activity rather than creation, so
   * "current" tracks where the user actually left off once they have several;
   * with a single session it resolves to the same row as before.
   */
  private async resolveCurrentSession(userId: string) {
    const existing = await this.prisma.chatSession.findFirst({ where: { userId }, orderBy: { updatedAt: 'desc' } });
    if (existing) return existing;
    return this.prisma.chatSession.create({ data: { userId } });
  }

  /** Ownership gate for every `:sessionId` route — house pattern (see owned-resource.util). */
  private async findOwnedSession(userId: string, sessionId: string) {
    const session = await this.prisma.chatSession.findUnique({ where: { id: sessionId } });
    return assertOwnedResource(session, userId, 'Chat session');
  }

  /** Session-unaware entry point, kept for clients that don't manage sessions. */
  async getHistory(userId: string, pagination?: PaginationParams): Promise<ChatMessageDto[]> {
    const session = await this.resolveCurrentSession(userId);
    return this.findMessages(session.id, pagination);
  }

  /** Session-unaware entry point, kept for clients that don't manage sessions. */
  async sendMessage(userId: string, content: string): Promise<SendChatMessageResponse> {
    const session = await this.resolveCurrentSession(userId);
    return this.exchange(userId, session, content);
  }

  private async findMessages(sessionId: string, pagination?: PaginationParams): Promise<ChatMessageDto[]> {
    const messages = await this.prisma.chatMessage.findMany({
      where: { chatSessionId: sessionId },
      orderBy: { createdAt: 'asc' },
      ...toPrismaPageArgs(pagination),
    });
    return messages.map(this.toDto);
  }

  /** One user turn + the coach's reply, both persisted against `session`. */
  private async exchange(
    userId: string,
    session: { id: string; title: string | null },
    content: string,
  ): Promise<SendChatMessageResponse> {
    // Safety gate: a deterministic check on the new message runs
    // BEFORE any model call. On a match the model is skipped entirely and the
    // reply is fixed copy, so a crisis or emergency is never handed to the LLM.
    const redFlag = detectRedFlag(content);

    // AI-processing consent. Everything past this point sends the
    // user's text to the AI provider. The deterministic escalation above sends
    // nothing anywhere, so it still answers a user who hasn't consented: a
    // crisis message must never be met with a consent error. Checked before the
    // message is persisted so a refused send leaves no orphan message behind.
    if (!redFlag) {
      await this.consent.requireConsent(userId, 'AI_PROCESSING');
    }

    // Nothing is written until there is a reply to write: a failed
    // AI call leaves no orphan user message, and the user can simply retry.
    const sentAt = new Date();

    if (redFlag) {
      return this.escalate(userId, session, content, sentAt, redFlag, 'rules');
    }

    const [recentMessagesDesc, promptTemplate, context] = await Promise.all([
      this.prisma.chatMessage.findMany({
        where: { chatSessionId: session.id },
        orderBy: { createdAt: 'desc' },
        // One slot is kept for the new message, which is not stored yet.
        take: HISTORY_MESSAGE_LIMIT - 1,
      }),
      this.prisma.aiPromptTemplate.findFirst({ where: { key: CHAT_PROMPT_KEY, isActive: true } }),
      this.buildContext(userId),
    ]);

    // Second safety layer: only reached when the rules found nothing.
    // Cost/latency: one extra small-model call per message the rules did not
    // catch, bounded by the provider's 4 s timeout (no retries). It reuses the
    // history fetched above, so there is no extra query.
    const classified = await this.classifyRisk(content, recentMessagesDesc);
    if (classified) {
      return this.escalate(userId, session, content, sentAt, classified, 'classifier');
    }

    // Fetched most-recent-first (`desc`) so `take` bounds to the latest
    // messages, then reversed back to chronological order for the AI.
    const priorMessages = recentMessagesDesc.reverse();

    const systemPrompt = composeSystemPrompt(promptTemplate?.systemPrompt ?? DEFAULT_CHAT_SYSTEM_PROMPT);
    const conversation: AiChatMessage[] = [
      ...priorMessages.map(
        (m): AiChatMessage => ({ role: m.role === 'ASSISTANT' ? 'assistant' : 'user', content: m.content }),
      ),
      { role: 'user', content },
    ];

    let reply: string;
    try {
      ({ reply } = await this.aiProvider.chat({ systemPrompt, messages: conversation, context }));
    } catch (error) {
      // Logs the error type only: provider errors can echo request text.
      this.logger.error(`chat provider failed for user ${userId}: ${error instanceof Error ? error.name : 'unknown'}`);
      throw new ServiceUnavailableException(CHAT_UNAVAILABLE_MESSAGE);
    }

    const [userMessage, assistantMessage] = await this.saveExchange(session, content, sentAt, reply);

    return {
      userMessage: this.toDto(userMessage),
      assistantMessage: this.toDto(assistantMessage),
    };
  }

  /**
   * Both messages and the session bump in one transaction. The
   * timestamps are set explicitly because the database `now()` is the
   * transaction start time, which would give the pair identical `createdAt`
   * values and an ambiguous order.
   */
  private async saveExchange(
    session: { id: string; title: string | null },
    content: string,
    sentAt: Date,
    reply: string,
  ) {
    const repliedAt = new Date(Math.max(Date.now(), sentAt.getTime() + 1));
    const [userMessage, assistantMessage] = await this.prisma.$transaction([
      this.prisma.chatMessage.create({
        data: { chatSessionId: session.id, role: 'USER', content, createdAt: sentAt },
      }),
      this.prisma.chatMessage.create({
        data: { chatSessionId: session.id, role: 'ASSISTANT', content: reply, createdAt: repliedAt },
      }),
      this.prisma.chatSession.update({
        where: { id: session.id },
        data: { title: session.title ?? this.deriveSessionTitle(content) },
      }),
    ]);
    return [userMessage, assistantMessage] as const;
  }

  /** Persists the fixed escalation copy and builds the response; shared by the rules and classifier paths. */
  private async escalate(
    userId: string,
    session: { id: string; title: string | null },
    content: string,
    sentAt: Date,
    match: RedFlagMatch,
    source: EscalationSource,
  ): Promise<SendChatMessageResponse> {
    const copy = ESCALATION_COPY[match.kind];
    let userMessage: { id: string; role: string; content: string; createdAt: Date };
    let assistantMessage: { id: string; role: string; content: string; createdAt: Date };
    try {
      [userMessage, assistantMessage] = await this.saveExchange(session, content, sentAt, copy);
    } catch (error) {
      // The escalation card is fixed copy and needs no database: a failed save
      // must never turn a crisis or emergency into an error response. The
      // exchange is returned unsaved (error type only is logged).
      this.logger.error(
        `failed to save escalation exchange for user ${userId}: ${error instanceof Error ? error.name : 'unknown'}`,
      );
      userMessage = { id: randomUUID(), role: 'USER', content, createdAt: sentAt };
      assistantMessage = {
        id: randomUUID(),
        role: 'ASSISTANT',
        content: copy,
        createdAt: new Date(Math.max(Date.now(), sentAt.getTime() + 1)),
      };
    }
    this.logEscalation(userId, session.id, match, source);
    return {
      userMessage: this.toDto(userMessage),
      assistantMessage: this.toDto(assistantMessage),
      escalation: { kind: match.kind, category: match.category },
    };
  }

  /** Off only when SAFETY_CLASSIFIER_ENABLED is 'false' or '0' (any case). */
  private isClassifierEnabled(): boolean {
    const raw = this.config.get<boolean | string>('SAFETY_CLASSIFIER_ENABLED');
    return !['false', '0'].includes(String(raw ?? '').trim().toLowerCase());
  }

  /**
   * Defence in depth: the provider contract is "never throws", but a classifier
   * problem of any kind must still fall through to the normal reply.
   */
  private async classifyRisk(
    content: string,
    recentMessagesDesc: { role: string; content: string }[],
  ): Promise<RedFlagMatch | null> {
    if (!this.isClassifierEnabled()) return null;
    try {
      const previousMessages = recentMessagesDesc
        .filter((m) => m.role === 'USER')
        .slice(0, CLASSIFIER_CONTEXT_MESSAGES)
        .reverse()
        .map((m) => m.content);
      const result = await this.aiProvider.classifyRisk({ latestMessage: content, previousMessages });
      return result ? { kind: result.kind, category: result.category } : null;
    } catch {
      this.logger.warn('safety_classifier_failed kind=error');
      return null;
    }
  }

  /**
   * session flag: one `activity_logs` row per escalation, keyed by
   * `metadata.sessionId`. There is deliberately no schema change, so this row
   * IS the flag. Ids, categories, kinds and the detecting layer only — never message content.
   *
   * Fire-and-forget (same as AuthService.logActivity): a failed write is
   * logged but must never block or delay the escalation response.
   */
  private logEscalation(userId: string, sessionId: string, redFlag: RedFlagMatch, source: EscalationSource): void {
    const metadata = { sessionId, category: redFlag.category, kind: redFlag.kind, source };
    const onFailure = (error: unknown) =>
      this.logger.error(`Failed to record chat.escalation activity log for user ${userId}`, error);
    try {
      Promise.resolve(this.prisma.activityLog.create({ data: { userId, action: 'chat.escalation', metadata } })).catch(
        onFailure,
      );
    } catch (error) {
      onFailure(error);
    }
  }

  private deriveSessionTitle(content: string): string {
    const normalized = content.trim().replace(/\s+/g, ' ');
    return normalized.length > CHAT_SESSION_TITLE_MAX_LENGTH
      ? `${normalized.slice(0, CHAT_SESSION_TITLE_MAX_LENGTH - 1).trimEnd()}…`
      : normalized;
  }

  /** Grounds the coach's replies in the user's own recent wellness data. */
  private async buildContext(userId: string): Promise<Record<string, unknown>> {
    const [latestSnapshot, fullAssessments, pulseAssessments] = await Promise.all([
      findLatestWellnessSnapshot(this.prisma, userId),
      this.prisma.assessment.findMany({
        where: { userId, status: 'COMPLETED', mode: 'FULL' },
        orderBy: { completedAt: 'desc' },
        take: CHAT_CONTEXT_TOTAL_QUOTA,
        include: { score: true },
      }),
      this.prisma.assessment.findMany({
        where: { userId, status: 'COMPLETED', mode: 'PULSE' },
        orderBy: { completedAt: 'desc' },
        take: CHAT_CONTEXT_TOTAL_QUOTA,
        include: { score: true },
      }),
    ]);

    const recentAssessments = selectMixedQuota(
      fullAssessments,
      pulseAssessments,
      CHAT_CONTEXT_FULL_QUOTA,
      CHAT_CONTEXT_PULSE_QUOTA,
      (a, b) => (b.completedAt?.getTime() ?? 0) - (a.completedAt?.getTime() ?? 0),
    );

    return {
      overallScore: latestSnapshot?.overallScore ?? null,
      overallRiskLevel: latestSnapshot?.riskLevel ?? null,
      recentAssessments: recentAssessments.map((a) => ({
        type: a.type,
        score: a.score?.value ?? null,
        riskLevel: a.score?.riskLevel ?? null,
        completedAt: a.completedAt?.toISOString() ?? null,
      })),
    };
  }

  private toSessionDto(session: {
    id: string;
    title: string | null;
    createdAt: Date;
    updatedAt: Date;
    _count: { messages: number };
  }): ChatSessionSummaryDto {
    return {
      id: session.id,
      title: session.title,
      createdAt: session.createdAt.toISOString(),
      updatedAt: session.updatedAt.toISOString(),
      messageCount: session._count.messages,
    };
  }

  private toDto(message: { id: string; role: string; content: string; createdAt: Date }): ChatMessageDto {
    return {
      id: message.id,
      role: message.role as ChatMessageDto['role'],
      content: message.content,
      createdAt: message.createdAt.toISOString(),
    };
  }
}
