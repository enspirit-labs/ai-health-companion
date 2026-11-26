import { createHash } from 'node:crypto';
import { Injectable, InternalServerErrorException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod';
import {
  AiStructuredOutputSchema,
  PinpointContentSchema,
  OUTPUT_FILTER_FALLBACK,
  RED_FLAG_CATEGORIES,
  collectAssessmentText,
  fallbackAssessmentOutput,
  findConditionTerms,
  hasMedicationAdvice,
  kindForRedFlagCategory,
  type AiStructuredOutput,
} from '@aidoctor/shared';

import {
  AiChatRequest,
  AiChatResult,
  AiProvider,
  AiPulseGameRequest,
  AiPulseGameResult,
  AiReasoningRequest,
  AiRiskClassification,
  AiRiskClassificationRequest,
  AiSummaryRequest,
  AiSummaryResult,
} from '../ai-provider.interface';
import { SAFETY_CLASSIFIER_SYSTEM_PROMPT, buildClassifierInput } from '../safety-classifier-prompt';

const SUMMARY_SCHEMA = {
  type: 'object',
  properties: {
    summary: { type: 'string', description: 'A short 2-4 sentence plain-language summary.' },
  },
  required: ['summary'],
  additionalProperties: false,
} as const;

const PINPOINT_SCHEMA = {
  type: 'object',
  properties: {
    theme: {
      type: 'string',
      description:
        "The category all the clue words share — this is the answer the player types, e.g. \"Words that come before 'rain'\" or 'Types of knot'. Not a mood label.",
    },
    clues: {
      type: 'array',
      items: { type: 'string' },
      description:
        'Single words or very short terms (1-2 words) that all belong to the category, ordered from hardest to place first to most giveaway last.',
    },
  },
  required: ['theme', 'clues'],
  additionalProperties: false,
} as const;

const RESULT_SCHEMA = {
  type: 'object',
  properties: {
    score: { type: 'number', description: 'Overall wellness score for this assessment, 0-100.' },
    observations: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          label: { type: 'string' },
          value: { type: 'string' },
          severity: { type: 'string', enum: ['LOW', 'MODERATE', 'ELEVATED', 'HIGH'] },
        },
        required: ['label', 'value'],
        additionalProperties: false,
      },
    },
    recommendations: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          title: { type: 'string' },
          detail: { type: 'string' },
          priority: { type: 'string', enum: ['LOW', 'MEDIUM', 'HIGH'] },
        },
        required: ['title', 'detail', 'priority'],
        additionalProperties: false,
      },
    },
    riskLevel: { type: 'string', enum: ['LOW', 'MODERATE', 'ELEVATED', 'HIGH'] },
    confidence: { type: 'number', description: 'How confident this assessment is, 0-100.' },
    disclaimer: { type: 'string' },
  },
  required: ['score', 'observations', 'recommendations', 'riskLevel', 'confidence', 'disclaimer'],
  additionalProperties: false,
} as const;

/**
 * Explicit SDK limits instead of the SDK defaults (10 min, 2 retries),
 * so a hung provider can't hold a request open. The client-wide values cover
 * assessment scoring and summaries (image-heavy, so a longer budget); chat is
 * interactive and gets a tighter per-request budget.
 */
const CLIENT_TIMEOUT_MS = 60_000;
const CLIENT_MAX_RETRIES = 2;
const CHAT_TIMEOUT_MS = 30_000;
const CHAT_MAX_RETRIES = 1;

const DEFAULT_SAFETY_MODEL = 'claude-haiku-5-5';
/** Hard cap so the classifier can never stall the chat. */
const SAFETY_TIMEOUT_MS = 4000;

const RISK_SCHEMA = {
  type: 'object',
  properties: {
    risk: { type: 'string', enum: ['NONE', 'CRISIS', 'EMERGENCY'] },
    category: { anyOf: [{ type: 'string', enum: [...RED_FLAG_CATEGORIES] }, { type: 'null' }] },
  },
  required: ['risk', 'category'],
  additionalProperties: false,
} as const;

const RiskResultSchema = z.object({
  risk: z.enum(['NONE', 'CRISIS', 'EMERGENCY']),
  category: z.enum(RED_FLAG_CATEGORIES).nullable(),
});

type SafetyFailureKind = 'timeout' | 'refusal' | 'invalid_output' | 'error';

/**
 * Log-safe fingerprint of a raw model response. The text itself can contain
 * health observations, so it must never be written to logs — only its length,
 * the stop reason and a short hash (enough to correlate repeat failures).
 */
function describeRawOutput(text: string, stopReason: string | null): string {
  const hash = createHash('sha256').update(text).digest('hex').slice(0, 12);
  return `length=${text.length} stop_reason=${stopReason ?? 'unknown'} sha256=${hash}`;
}

/** Schema-failure summary that names the failing paths and issue codes, never the received values. */
function describeSchemaIssues(issues: ReadonlyArray<{ path: PropertyKey[]; code: string }>): string {
  return issues.map((issue) => `${issue.path.map(String).join('.') || '(root)'}:${issue.code}`).join(', ');
}

/**
 * Real AI reasoning via the Claude API. Activated automatically once
 * ANTHROPIC_API_KEY is set — see AiModule's provider factory. Uses
 * structured outputs (output_config.format) so the model's response is
 * guaranteed to match AiStructuredOutputSchema's shape.
 */
@Injectable()
export class AnthropicAiProvider implements AiProvider {
  private readonly logger = new Logger(AnthropicAiProvider.name);
  private clientInstance: Anthropic | undefined;

  constructor(private readonly config: ConfigService) {}

  private get client(): Anthropic {
    if (!this.clientInstance) {
      this.clientInstance = new Anthropic({
        apiKey: this.config.get<string>('ANTHROPIC_API_KEY'),
        timeout: CLIENT_TIMEOUT_MS,
        maxRetries: CLIENT_MAX_RETRIES,
      });
    }
    return this.clientInstance;
  }

  /**
   * Output filter: model text is checked before it can be saved or
   * returned. A hit regenerates once; a second hit returns fixed fallback copy.
   * Logs surface, attempt and kind only, never the text.
   */
  private async generateFiltered<T>(
    surface: 'assessment' | 'summary' | 'chat',
    generate: () => Promise<T>,
    textsOf: (result: T) => string[],
    fallback: (last: T) => T,
    { blockMedication = false }: { blockMedication?: boolean } = {},
  ): Promise<T> {
    let last: T | undefined;
    for (let attempt = 1; attempt <= 2; attempt += 1) {
      last = await generate();
      const texts = textsOf(last);
      const kind = texts.some((text) => findConditionTerms(text).length > 0)
        ? 'condition'
        : blockMedication && texts.some(hasMedicationAdvice)
          ? 'medication'
          : null;
      if (!kind) return last;
      this.logger.warn(`output_filter_hit surface=${surface} attempt=${attempt} kind=${kind}`);
    }
    return fallback(last as T);
  }

  reason(request: AiReasoningRequest): Promise<AiStructuredOutput> {
    return this.generateFiltered('assessment', () => this.reasonOnce(request), collectAssessmentText, fallbackAssessmentOutput);
  }

  summarize(request: AiSummaryRequest): Promise<AiSummaryResult> {
    return this.generateFiltered(
      'summary',
      () => this.summarizeOnce(request),
      (result) => [result.summary],
      () => ({ summary: OUTPUT_FILTER_FALLBACK.summary }),
    );
  }

  chat(request: AiChatRequest): Promise<AiChatResult> {
    return this.generateFiltered(
      'chat',
      () => this.chatOnce(request),
      (result) => [result.reply],
      () => ({ reply: OUTPUT_FILTER_FALLBACK.chat }),
      { blockMedication: true },
    );
  }

  private async reasonOnce({ systemPrompt, input, images }: AiReasoningRequest): Promise<AiStructuredOutput> {
    const model = this.config.get<string>('ANTHROPIC_MODEL')!;

    const imageBlocks: Anthropic.ImageBlockParam[] = (images ?? []).map((image) => ({
      type: 'image',
      source: { type: 'base64', media_type: image.mediaType, data: image.data },
    }));

    const response = await this.client.messages.create({
      model,
      max_tokens: 2048,
      system: systemPrompt,
      output_config: { format: { type: 'json_schema', schema: RESULT_SCHEMA } },
      messages: [
        {
          role: 'user',
          content: [
            ...imageBlocks,
            {
              type: 'text',
              text: `Score this wellness assessment based on the following structured input:\n\n${JSON.stringify(input, null, 2)}`,
            },
          ],
        },
      ],
    });

    if (response.stop_reason === 'refusal') {
      throw new InternalServerErrorException('AI declined to score this assessment');
    }

    const textBlock = response.content.find((block) => block.type === 'text');
    if (!textBlock || textBlock.type !== 'text') {
      throw new InternalServerErrorException('AI response did not include a result');
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(textBlock.text);
    } catch {
      this.logger.error(`Failed to parse AI response as JSON (${describeRawOutput(textBlock.text, response.stop_reason)})`);
      throw new InternalServerErrorException('AI response was not valid JSON');
    }

    const result = AiStructuredOutputSchema.safeParse(parsed);
    if (!result.success) {
      this.logger.error(
        `AI response failed schema validation [${describeSchemaIssues(result.error.issues)}] (${describeRawOutput(textBlock.text, response.stop_reason)})`,
      );
      throw new InternalServerErrorException('AI response did not match the expected format');
    }

    return result.data;
  }

  private async summarizeOnce({ systemPrompt, input }: AiSummaryRequest): Promise<AiSummaryResult> {
    const model = this.config.get<string>('ANTHROPIC_MODEL')!;

    const response = await this.client.messages.create({
      model,
      max_tokens: 512,
      system: systemPrompt,
      output_config: { format: { type: 'json_schema', schema: SUMMARY_SCHEMA } },
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: `Summarize this assessment result:\n\n${JSON.stringify(input, null, 2)}`,
            },
          ],
        },
      ],
    });

    if (response.stop_reason === 'refusal') {
      throw new InternalServerErrorException('AI declined to summarize this report');
    }

    const textBlock = response.content.find((block) => block.type === 'text');
    if (!textBlock || textBlock.type !== 'text') {
      throw new InternalServerErrorException('AI response did not include a result');
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(textBlock.text);
    } catch {
      this.logger.error(`Failed to parse AI summary response as JSON (${describeRawOutput(textBlock.text, response.stop_reason)})`);
      throw new InternalServerErrorException('AI response was not valid JSON');
    }

    if (typeof (parsed as { summary?: unknown })?.summary !== 'string') {
      throw new InternalServerErrorException('AI response did not match the expected format');
    }

    return { summary: (parsed as { summary: string }).summary };
  }

  async generatePulseGame({ vibe, difficulty, systemPrompt }: AiPulseGameRequest): Promise<AiPulseGameResult> {
    const model = this.config.get<string>('ANTHROPIC_MODEL')!;
    const clueCount = difficulty === 'EASY' ? 3 : 5;
    const themeHint = vibe.dayTags.length > 0 ? `, especially around: ${vibe.dayTags.join(', ')}` : '';

    const response = await this.client.messages.create({
      model,
      max_tokens: 512,
      system: systemPrompt,
      output_config: { format: { type: 'json_schema', schema: PINPOINT_SCHEMA } },
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: `Generate today's Pinpoint puzzle with exactly ${clueCount} clue words. Pick subject matter suited to someone whose day feels ${vibe.energy.toLowerCase()}-energy and ${vibe.calm ? 'calm' : 'stressed'}${themeHint} — the tone guides the topic only, never the category wording itself.`,
            },
          ],
        },
      ],
    });

    if (response.stop_reason === 'refusal') {
      throw new InternalServerErrorException('AI declined to generate a puzzle');
    }

    const textBlock = response.content.find((block) => block.type === 'text');
    if (!textBlock || textBlock.type !== 'text') {
      throw new InternalServerErrorException('AI response did not include a puzzle');
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(textBlock.text);
    } catch {
      this.logger.error(
        `Failed to parse AI pulse-game response as JSON (${describeRawOutput(textBlock.text, response.stop_reason)})`,
      );
      throw new InternalServerErrorException('AI response was not valid JSON');
    }

    const result = PinpointContentSchema.safeParse(parsed);
    if (!result.success) {
      this.logger.error(
        `AI pulse-game response failed schema validation [${describeSchemaIssues(result.error.issues)}] (${describeRawOutput(textBlock.text, response.stop_reason)})`,
      );
      throw new InternalServerErrorException('AI response did not match the expected format');
    }

    return result.data;
  }

  /**
   * Model-assisted safety layer behind the red-flag rules. Never
   * throws and never logs message text: every failure returns null after a
   * `safety_classifier_failed kind=<kind>` warning, which is what tells a clean
   * NONE apart from a broken classifier (bad model id, revoked key, timeouts).
   */
  async classifyRisk({ latestMessage, previousMessages }: AiRiskClassificationRequest): Promise<AiRiskClassification | null> {
    const fail = (kind: SafetyFailureKind): null => {
      this.logger.warn(`safety_classifier_failed kind=${kind}`);
      return null;
    };

    try {
      const model = this.config.get<string>('ANTHROPIC_SAFETY_MODEL') || DEFAULT_SAFETY_MODEL;

      const response = await this.client.messages.create(
        {
          model,
          max_tokens: 120,
          // No `temperature`: claude-haiku-5-5 rejects it with a 400 ("deprecated
          // for this model"), which made every classifier call fail safe to the
          // rules. The JSON schema already constrains the answer.
          // Thinking off: by default the model thinks on ambiguous messages (the
          // ones this layer exists for), spends the 120-token cap and returns no
          // text, which also failed safe to the rules. Off keeps it under 4 s.
          thinking: { type: 'disabled' },
          system: SAFETY_CLASSIFIER_SYSTEM_PROMPT,
          output_config: { format: { type: 'json_schema', schema: RISK_SCHEMA } },
          messages: [
            {
              role: 'user',
              content: [{ type: 'text', text: buildClassifierInput(latestMessage, previousMessages ?? []) }],
            },
          ],
        },
        { timeout: SAFETY_TIMEOUT_MS, maxRetries: 0 },
      );

      if (response.stop_reason === 'refusal') return fail('refusal');

      const textBlock = response.content.find((block) => block.type === 'text');
      if (!textBlock || textBlock.type !== 'text') return fail('invalid_output');

      let parsed: unknown;
      try {
        parsed = JSON.parse(textBlock.text);
      } catch {
        return fail('invalid_output');
      }

      const result = RiskResultSchema.safeParse(parsed);
      if (!result.success) return fail('invalid_output');

      const { risk, category } = result.data;
      if (risk === 'NONE') return null;
      // A risk needs a category whose kind agrees with it; anything else is an unusable answer.
      if (category === null || kindForRedFlagCategory(category) !== risk) return fail('invalid_output');

      return { kind: risk, category };
    } catch (error) {
      return fail(error instanceof Anthropic.APIConnectionTimeoutError ? 'timeout' : 'error');
    }
  }

  private async chatOnce({ systemPrompt, messages, context }: AiChatRequest): Promise<AiChatResult> {
    const model = this.config.get<string>('ANTHROPIC_MODEL')!;

    const system = context
      ? `${systemPrompt}\n\nThe user's own wellness data (use this to ground your answer, but only mention it if relevant):\n${JSON.stringify(context, null, 2)}`
      : systemPrompt;

    const response = await this.client.messages.create(
      {
        model,
        max_tokens: 1024,
        system,
        messages: messages.map((m) => ({
          role: m.role,
          content: [{ type: 'text' as const, text: m.content }],
        })),
      },
      { timeout: CHAT_TIMEOUT_MS, maxRetries: CHAT_MAX_RETRIES },
    );

    if (response.stop_reason === 'refusal') {
      throw new InternalServerErrorException('AI declined to respond to this message');
    }

    const textBlock = response.content.find((block) => block.type === 'text');
    if (!textBlock || textBlock.type !== 'text') {
      throw new InternalServerErrorException('AI response did not include a reply');
    }

    return { reply: textBlock.text };
  }
}
