import { createHash } from 'node:crypto';
import { Injectable, Logger } from '@nestjs/common';
import { WELLNESS_DISCLAIMER, type AiStructuredOutput } from '@aidoctor/shared';

import { riskLevelForScore } from '../../common/risk-level.util';
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

/**
 * Deterministic mock puzzles, keyed by vibe so a given (energy, calm) pairing
 * always yields the same puzzle in tests — no real domain intelligence. Shaped
 * like genuine Pinpoint rounds: `theme` is the category to guess and `clues`
 * are single words that belong to it (hardest to place first).
 */
const MOCK_PINPOINT_THEMES: Record<string, { theme: string; clues: string[] }> = {
  'LOW-true': {
    theme: 'Types of tea',
    clues: ['Oolong', 'Rooibos', 'Earl Grey', 'Chamomile', 'Green'],
  },
  'LOW-false': {
    theme: "Words that come before 'fall'",
    clues: ['Pit', 'Wind', 'Night', 'Rain', 'Water'],
  },
  'MED-true': {
    theme: 'Board games',
    clues: ['Go', 'Cluedo', 'Backgammon', 'Scrabble', 'Monopoly'],
  },
  'MED-false': {
    theme: "Words that come before 'light'",
    clues: ['Twi', 'Lime', 'Spot', 'Candle', 'Day'],
  },
  'HIGH-true': {
    theme: 'Things in a toolbox',
    clues: ['Awl', 'Spanner', 'Chisel', 'Pliers', 'Hammer'],
  },
  'HIGH-false': {
    theme: 'Types of cloud',
    clues: ['Cirrus', 'Stratus', 'Nimbus', 'Cumulus', 'Thunder'],
  },
};

/** Object-valued inputs (e.g. an interactive test's {averageReactionMs, accuracy,
 * rating} result) would otherwise stringify to the useless "[object Object]". */
function stringifyObservationValue(value: unknown): string {
  if (Array.isArray(value)) return value.map(String).join(', ');
  if (typeof value === 'object' && value !== null) return JSON.stringify(value);
  return String(value);
}

/** When the input carries a recognized qualitative `rating` (as Hand
 * Coordination's cleaned-up summary does — see hand-coordination-summary.ts),
 * tailor the mock recommendation to it instead of the generic placeholder.
 * Anything else (no rating, or a value we don't recognize) falls back to the
 * exact same generic text as before, so no other assessment type's mock
 * recommendation changes. */
const RATING_RECOMMENDATIONS: Record<string, { title: string; detail: string }> = {
  Excellent: {
    title: 'Great reaction control',
    detail: 'Your reaction speed, accuracy, and consistency were all strong — keep it up with regular practice.',
  },
  Good: {
    title: 'Solid reaction performance',
    detail: 'You reacted quickly and consistently — a bit more practice could push this into excellent territory.',
  },
  Fair: {
    title: 'Room to build consistency',
    detail: 'Your reaction times varied more than ideal — relaxed, focused practice sessions can help steady your timing.',
  },
  'Needs improvement': {
    title: 'Focus on steady, careful taps',
    detail: 'Prioritize accuracy over speed for now — consistent, careful reactions will improve your timing naturally.',
  },
};

const GENERIC_MOCK_RECOMMENDATION = {
  title: 'Keep up your wellness routine',
  detail: 'This is a mock assessment result. Configure ANTHROPIC_API_KEY for real AI-generated guidance.',
};

function recommendationsFor(input: Record<string, unknown>): AiStructuredOutput['recommendations'] {
  const tailored = typeof input.rating === 'string' ? RATING_RECOMMENDATIONS[input.rating] : undefined;
  return [{ ...(tailored ?? GENERIC_MOCK_RECOMMENDATION), priority: 'MEDIUM' }];
}

/**
 * Deterministic stand-in for a real LLM call — used whenever ANTHROPIC_API_KEY
 * is not configured (see AiModule's provider factory). Derives a stable score
 * from a hash of the input so repeated runs against the same answers are
 * reproducible in tests, without pretending to any real domain intelligence.
 * Swap in AnthropicAiProvider by setting ANTHROPIC_API_KEY — no other code changes.
 */
@Injectable()
export class MockAiProvider implements AiProvider {
  private readonly logger = new Logger(MockAiProvider.name);

  async reason({ input, images }: AiReasoningRequest): Promise<AiStructuredOutput> {
    this.logger.warn('Using MockAiProvider — set ANTHROPIC_API_KEY for real AI scoring.');

    const hashInput = JSON.stringify(input) + (images ?? []).map((i) => i.data.length).join(',');
    const hash = createHash('sha256').update(hashInput).digest();
    const score = 55 + (hash[0] % 40); // 55-94, deterministic per input

    const observations =
      images && images.length > 0
        ? [{ label: 'capture', value: `${images.length} photo(s) received` }]
        : Object.entries(input)
            .slice(0, 5)
            .map(([label, value]) => ({ label, value: stringifyObservationValue(value) }));

    return {
      score,
      observations,
      recommendations: recommendationsFor(input),
      riskLevel: riskLevelForScore(score),
      confidence: 50,
      disclaimer: WELLNESS_DISCLAIMER,
    };
  }

  async summarize({ input }: AiSummaryRequest): Promise<AiSummaryResult> {
    this.logger.warn('Using MockAiProvider — set ANTHROPIC_API_KEY for real AI summaries.');

    const type = typeof input.assessmentType === 'string' ? input.assessmentType : 'assessment';
    const score = typeof input.score === 'number' ? Math.round(input.score) : null;

    return {
      summary:
        `This is a mock report summary for your ${type} assessment` +
        (score !== null ? ` (score ${score}/100).` : '.') +
        ' Configure ANTHROPIC_API_KEY for a real AI-generated summary.',
    };
  }

  async generatePulseGame({ vibe, difficulty }: AiPulseGameRequest): Promise<AiPulseGameResult> {
    this.logger.warn('Using MockAiProvider — set ANTHROPIC_API_KEY for real AI-generated puzzles.');

    const key = `${vibe.energy}-${vibe.calm}`;
    const { theme, clues } = MOCK_PINPOINT_THEMES[key] ?? MOCK_PINPOINT_THEMES['MED-true'];
    const clueCount = difficulty === 'EASY' ? 3 : 5;

    return { theme, clues: clues.slice(0, clueCount) };
  }

  async chat({ messages, context }: AiChatRequest): Promise<AiChatResult> {
    this.logger.warn('Using MockAiProvider — set ANTHROPIC_API_KEY for real AI chat replies.');

    const lastUserMessage = [...messages].reverse().find((m) => m.role === 'user');
    const overallScore =
      context && typeof context.overallScore === 'number' ? Math.round(context.overallScore) : null;

    return {
      reply:
        `This is a mock reply to "${lastUserMessage?.content ?? ''}".` +
        (overallScore !== null ? ` Your latest overall wellness score is ${overallScore}/100.` : '') +
        ' Configure ANTHROPIC_API_KEY for real AI-generated coaching.',
    };
  }

  /** The deterministic rules layer already covers the mock/dev path, so the mock never classifies. */
  async classifyRisk(_request: AiRiskClassificationRequest): Promise<AiRiskClassification | null> {
    return null;
  }
}
