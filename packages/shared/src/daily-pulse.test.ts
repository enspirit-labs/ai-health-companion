import { describe, expect, it } from 'vitest';

import { DAILY_PULSE_QUESTION_KEYS, supportsDailyPulse } from './daily-pulse';

describe('DAILY_PULSE_QUESTION_KEYS', () => {
  it('covers exactly the 5 state-like Mental Wellness questions', () => {
    expect(DAILY_PULSE_QUESTION_KEYS.MENTAL_WELLNESS).toEqual([
      'moodRating',
      'stressLevel',
      'sleepQuality',
      'socialConnection',
      'anxietyFrequency',
    ]);
  });

  it('deliberately excludes LIFESTYLE (habit-framed, not daily-volatile)', () => {
    expect(DAILY_PULSE_QUESTION_KEYS.LIFESTYLE).toBeUndefined();
  });
});

describe('supportsDailyPulse', () => {
  it('is true only for MENTAL_WELLNESS', () => {
    expect(supportsDailyPulse('MENTAL_WELLNESS')).toBe(true);
    expect(supportsDailyPulse('LIFESTYLE')).toBe(false);
    expect(supportsDailyPulse('SKIN')).toBe(false);
  });
});
