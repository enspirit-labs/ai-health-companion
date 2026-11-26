import { describe, expect, it } from 'vitest';
import { needsSupportCard, needsSupportCardFor } from './support-card';

// Rule signed off by a clinician on 28 Oct 2026 (Q1): mood at the lowest two
// points AND at least one further marker (frequent anxiety, high or severe stress, coping
// confidence 1 or 2, or rare social connection). The cases below are written from that
// principle, not from the evaluation set.
const calm = { stressLevel: 'low', anxietyFrequency: 'never', socialConnection: 'often', copingConfidence: 4 };
const lowMood = { moodRating: 1, ...calm };

describe('needsSupportCard', () => {
  it('fires for the lowest mood option with frequent anxiety (the original rule)', () => {
    expect(needsSupportCard({ ...lowMood, anxietyFrequency: 'often' })).toBe(true);
  });

  it.each([
    ['high stress', { stressLevel: 'high' }],
    ['severe stress', { stressLevel: 'severe' }],
    ['coping confidence 2', { copingConfidence: 2 }],
    ['coping confidence 1', { copingConfidence: 1 }],
    ['coping confidence as a numeric string', { copingConfidence: '1' }],
    ['rare social connection', { socialConnection: 'rarely' }],
    ['frequent anxiety', { anxietyFrequency: 'often' }],
  ])('fires at the lowest mood with one further marker: %s', (_label, marker) => {
    expect(needsSupportCard({ ...lowMood, ...marker })).toBe(true);
  });

  it('fires at the mood edge (2) and not just above it (3), with a further marker', () => {
    expect(needsSupportCard({ ...lowMood, moodRating: 2, stressLevel: 'severe' })).toBe(true);
    expect(needsSupportCard({ ...lowMood, moodRating: 3, stressLevel: 'severe' })).toBe(false);
  });

  it('never fires on mood alone with no further marker', () => {
    expect(needsSupportCard(lowMood)).toBe(false);
    expect(needsSupportCard({ moodRating: 1 })).toBe(false);
  });

  it('does not fire on further markers when mood is not in the lowest two points', () => {
    expect(
      needsSupportCard({ moodRating: 4, stressLevel: 'severe', anxietyFrequency: 'often', copingConfidence: 1, socialConnection: 'rarely' }),
    ).toBe(false);
    expect(needsSupportCard({ anxietyFrequency: 'often' })).toBe(false);
  });

  it('does not treat moderate stress, coping 3, sometimes anxious or sometimes social as a marker', () => {
    expect(
      needsSupportCard({ moodRating: 2, stressLevel: 'moderate', anxietyFrequency: 'sometimes', copingConfidence: 3, socialConnection: 'sometimes' }),
    ).toBe(false);
  });

  it('never fires for missing, empty or unreadable answers', () => {
    expect(needsSupportCard({})).toBe(false);
    expect(needsSupportCard(null)).toBe(false);
    expect(needsSupportCard(undefined)).toBe(false);
    expect(needsSupportCard({ moodRating: '', anxietyFrequency: 'often' })).toBe(false);
    expect(needsSupportCard({ moodRating: 'low', anxietyFrequency: 'often' })).toBe(false);
    expect(needsSupportCard({ moodRating: null, anxietyFrequency: 'often' })).toBe(false);
  });

  it('does not count an unreadable marker as present', () => {
    expect(needsSupportCard({ moodRating: 1, copingConfidence: 'unsure', stressLevel: 42 })).toBe(false);
  });
});

describe('needsSupportCardFor', () => {
  it('fires for MENTAL_WELLNESS only', () => {
    const answers = { ...lowMood, stressLevel: 'severe' };
    expect(needsSupportCardFor('MENTAL_WELLNESS', answers)).toBe(true);
    expect(needsSupportCardFor('LIFESTYLE', answers)).toBe(false);
    expect(needsSupportCardFor('SKIN', answers)).toBe(false);
  });
});
