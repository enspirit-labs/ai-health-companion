import type {
  AiStructuredOutput,
  PinpointContent,
  PulseDifficulty,
  PulseVibe,
  RedFlagCategory,
  RedFlagKind,
} from '@aidoctor/shared';

export interface AiReasoningImage {
  data: string; // base64
  mediaType: 'image/jpeg' | 'image/png' | 'image/webp';
}

export interface AiReasoningRequest {
  /** System prompt describing the assessment module and how to score it. */
  systemPrompt: string;
  /** Structured observations/answers collected for this assessment (questionnaire answers, capture metadata, etc.). */
  input: Record<string, unknown>;
  /** Captured photos to analyze, for camera-based assessment modules. */
  images?: AiReasoningImage[];
}

export interface AiSummaryRequest {
  /** System prompt describing how to write the summary. */
  systemPrompt: string;
  /** The score/observations/recommendations to summarize in plain language. */
  input: Record<string, unknown>;
}

export interface AiSummaryResult {
  summary: string;
}

export interface AiChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface AiChatRequest {
  /** System prompt establishing the health-coach persona and guardrails. */
  systemPrompt: string;
  /** Conversation so far, oldest first, ending with the new user message. */
  messages: AiChatMessage[];
  /** The user's own wellness data (latest snapshot, recent assessments) to ground answers in. */
  context?: Record<string, unknown>;
}

export interface AiChatResult {
  reply: string;
}

export interface AiPulseGameRequest {
  /** Only PINPOINT exists today — widen to 'CROSSCLIMB' post-hackathon. */
  gameType: 'PINPOINT';
  vibe: PulseVibe;
  difficulty: PulseDifficulty;
  /** System prompt describing the game and how to theme it — DB-backed via AiPromptTemplate, not hardcoded. */
  systemPrompt: string;
}

export type AiPulseGameResult = PinpointContent;

export interface AiRiskClassificationRequest {
  /** The user's newest message. */
  latestMessage: string;
  /** Up to the two user messages before it (oldest first), as context only. */
  previousMessages?: string[];
}

/** A risk the classifier found. `null` from classifyRisk means no risk found OR it could not classify. */
export interface AiRiskClassification {
  kind: RedFlagKind;
  category: RedFlagCategory;
}

export const AI_PROVIDER = Symbol('AI_PROVIDER');

/**
 * Decouples assessment scoring from which LLM actually runs it. Every
 * implementation must return the exact AiStructuredOutput shape — callers
 * validate the result against AiStructuredOutputSchema regardless, but a
 * well-behaved provider should never fail that validation.
 */
export interface AiProvider {
  reason(request: AiReasoningRequest): Promise<AiStructuredOutput>;
  /** Writes a short plain-language summary of an already-scored result — used by Reports. */
  summarize(request: AiSummaryRequest): Promise<AiSummaryResult>;
  /** Free-text conversational reply — used by the AI Chat Health Coach. */
  chat(request: AiChatRequest): Promise<AiChatResult>;
  /** Generates today's "Something new to try" game content — used by the Daily Pulse dashboard card. */
  generatePulseGame(request: AiPulseGameRequest): Promise<AiPulseGameResult>;
  /**
   * Safety layer behind the deterministic red-flag rules. Never
   * throws: returns null when no risk is found and also when classification
   * fails for any reason, so it can never block the chat.
   */
  classifyRisk(request: AiRiskClassificationRequest): Promise<AiRiskClassification | null>;
}
