import type { PulseVibe } from '@aidoctor/shared';
import { MockAiProvider } from './mock-ai.provider';

function vibe(overrides: Partial<PulseVibe> = {}): PulseVibe {
  return { energy: 'MED', calm: true, connection: 'LOW', difficulty: 'STANDARD', dayTags: [], ...overrides };
}

describe('MockAiProvider', () => {
  let provider: MockAiProvider;

  beforeEach(() => {
    provider = new MockAiProvider();
  });

  describe('classifyRisk', () => {
    it('returns null (the rules layer covers the mock path)', async () => {
      await expect(provider.classifyRisk({ latestMessage: 'I want to disappear' })).resolves.toBeNull();
    });
  });

  describe('reason', () => {
    it('tailors the recommendation to a recognized rating', async () => {
      const result = await provider.reason({
        systemPrompt: 'test',
        input: {
          accuracy: '91%',
          averageReactionTime: '1.20s',
          consistency: 'Excellent',
          rating: 'Excellent',
        },
      });

      expect(result.recommendations).toHaveLength(1);
      expect(result.recommendations[0].title).not.toBe(
        'Keep up your wellness routine',
      );
      expect(result.recommendations[0].detail).toMatch(/reaction/i);
    });

    it.each(['Excellent', 'Good', 'Fair', 'Needs improvement'])(
      'produces a distinct recommendation for rating "%s"',
      async (rating) => {
        const result = await provider.reason({
          systemPrompt: 'test',
          input: { rating },
        });
        expect(result.recommendations[0].title).not.toBe(
          'Keep up your wellness routine',
        );
      },
    );

    it('falls back to the generic recommendation when there is no rating field', async () => {
      const result = await provider.reason({
        systemPrompt: 'test',
        input: { moodRating: 3, stressLevel: 'moderate' },
      });
      expect(result.recommendations).toEqual([
        {
          title: 'Keep up your wellness routine',
          detail:
            'This is a mock assessment result. Configure ANTHROPIC_API_KEY for real AI-generated guidance.',
          priority: 'MEDIUM',
        },
      ]);
    });

    it('falls back to the generic recommendation for an unrecognized rating value', async () => {
      const result = await provider.reason({
        systemPrompt: 'test',
        input: { rating: 'Superb' },
      });
      expect(result.recommendations[0].title).toBe(
        'Keep up your wellness routine',
      );
    });

    it('still builds observations from the first 5 input entries as before', async () => {
      const result = await provider.reason({
        systemPrompt: 'test',
        input: {
          accuracy: '91%',
          averageReactionTime: '1.20s',
          consistency: 'Excellent',
          missPattern: 'No misses — perfect accuracy',
          rating: 'Excellent',
        },
      });

      expect(result.observations).toEqual([
        { label: 'accuracy', value: '91%' },
        { label: 'averageReactionTime', value: '1.20s' },
        { label: 'consistency', value: 'Excellent' },
        { label: 'missPattern', value: 'No misses — perfect accuracy' },
        { label: 'rating', value: 'Excellent' },
      ]);
    });

    it('reports photo-based observations instead when images are provided', async () => {
      const result = await provider.reason({
        systemPrompt: 'test',
        input: { rating: 'Good' },
        images: [{ data: 'abc', mediaType: 'image/jpeg' }],
      });

      expect(result.observations).toEqual([
        { label: 'capture', value: '1 photo(s) received' },
      ]);
    });
  });

  describe('generatePulseGame', () => {
    it('returns a theme and clues for any vibe', async () => {
      const result = await provider.generatePulseGame({
        gameType: 'PINPOINT',
        vibe: vibe(),
        difficulty: 'STANDARD',
        systemPrompt: 'test',
      });

      expect(result.theme.length).toBeGreaterThan(0);
      expect(result.clues.length).toBeGreaterThan(0);
    });

    it('is deterministic for the same vibe', async () => {
      const request = { gameType: 'PINPOINT' as const, vibe: vibe({ energy: 'LOW', calm: false }), difficulty: 'STANDARD' as const, systemPrompt: 'test' };
      const first = await provider.generatePulseGame(request);
      const second = await provider.generatePulseGame(request);
      expect(second).toEqual(first);
    });

    it('produces distinct themes for distinct vibes', async () => {
      const calmLow = await provider.generatePulseGame({
        gameType: 'PINPOINT',
        vibe: vibe({ energy: 'LOW', calm: true }),
        difficulty: 'STANDARD',
        systemPrompt: 'test',
      });
      const stressedHigh = await provider.generatePulseGame({
        gameType: 'PINPOINT',
        vibe: vibe({ energy: 'HIGH', calm: false }),
        difficulty: 'STANDARD',
        systemPrompt: 'test',
      });
      expect(calmLow.theme).not.toBe(stressedHigh.theme);
    });

    it('returns fewer clues on EASY difficulty', async () => {
      const easy = await provider.generatePulseGame({
        gameType: 'PINPOINT',
        vibe: vibe(),
        difficulty: 'EASY',
        systemPrompt: 'test',
      });
      const standard = await provider.generatePulseGame({
        gameType: 'PINPOINT',
        vibe: vibe(),
        difficulty: 'STANDARD',
        systemPrompt: 'test',
      });
      expect(easy.clues.length).toBeLessThan(standard.clues.length);
    });
  });
});
