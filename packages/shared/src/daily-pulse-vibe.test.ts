import { describe, expect, it } from 'vitest';

import { computeVibe, type PulseAnswers } from './daily-pulse-vibe';

const baseAnswers: PulseAnswers = {
  moodRating: 3,
  stressLevel: 'moderate',
  sleepQuality: 'good',
  socialConnection: 'sometimes',
  anxietyFrequency: 'rarely',
};

describe('computeVibe', () => {
  it('is calm and STANDARD difficulty for a typical, unremarkable day', () => {
    const vibe = computeVibe(baseAnswers);
    expect(vibe.calm).toBe(true);
    expect(vibe.difficulty).toBe('STANDARD');
  });

  it('is not calm and EASY when stress is high/severe', () => {
    const vibe = computeVibe({ ...baseAnswers, stressLevel: 'high' });
    expect(vibe.calm).toBe(false);
    expect(vibe.difficulty).toBe('EASY');
  });

  it('is not calm and EASY when anxiety is frequent', () => {
    const vibe = computeVibe({ ...baseAnswers, anxietyFrequency: 'often' });
    expect(vibe.calm).toBe(false);
    expect(vibe.difficulty).toBe('EASY');
  });

  it('buckets energy LOW on a low mood rating or poor sleep', () => {
    expect(computeVibe({ ...baseAnswers, moodRating: 1 }).energy).toBe('LOW');
    expect(computeVibe({ ...baseAnswers, sleepQuality: 'poor' }).energy).toBe('LOW');
  });

  it('buckets energy HIGH on a high mood rating without high stress', () => {
    expect(computeVibe({ ...baseAnswers, moodRating: 5 }).energy).toBe('HIGH');
    expect(computeVibe({ ...baseAnswers, moodRating: 5, stressLevel: 'high' }).energy).not.toBe('HIGH');
  });

  it('buckets connection HIGH only for often/always', () => {
    expect(computeVibe({ ...baseAnswers, socialConnection: 'often' }).connection).toBe('HIGH');
    expect(computeVibe({ ...baseAnswers, socialConnection: 'always' }).connection).toBe('HIGH');
    expect(computeVibe({ ...baseAnswers, socialConnection: 'rarely' }).connection).toBe('LOW');
  });

  it('passes dayTags through verbatim, defaulting to empty', () => {
    expect(computeVibe(baseAnswers).dayTags).toEqual([]);
    expect(computeVibe({ ...baseAnswers, dayTags: ['Big win'] }).dayTags).toEqual(['Big win']);
  });
});
