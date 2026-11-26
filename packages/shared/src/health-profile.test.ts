import { describe, expect, it } from 'vitest';

import {
  getNextHealthProfileQuestion,
  HEALTH_PROFILE_QUESTION_ORDER,
  HealthProfileUpdateSchema,
} from './health-profile';

describe('getNextHealthProfileQuestion', () => {
  it('returns the first question when nothing has been answered', () => {
    expect(getNextHealthProfileQuestion([])).toBe('age');
  });

  it('returns the next unanswered question in order, ignoring order of the input array', () => {
    expect(getNextHealthProfileQuestion(['gender', 'age'])).toBe('heightCm');
  });

  it('does not skip a question just because a later one was somehow answered out of order', () => {
    expect(getNextHealthProfileQuestion(['age', 'sleepHours'])).toBe('gender');
  });

  it('returns null once every question has been answered', () => {
    expect(getNextHealthProfileQuestion([...HEALTH_PROFILE_QUESTION_ORDER])).toBeNull();
  });

  it('ignores unknown keys mixed into the answered list', () => {
    expect(getNextHealthProfileQuestion(['age', 'not-a-real-question'])).toBe('gender');
  });
});

describe('HealthProfileUpdateSchema', () => {
  it('accepts a single-field partial update', () => {
    const result = HealthProfileUpdateSchema.safeParse({ age: 30 });
    expect(result.success).toBe(true);
  });

  it('accepts an empty object (no answer submitted yet)', () => {
    expect(HealthProfileUpdateSchema.safeParse({}).success).toBe(true);
  });

  it('rejects an invalid enum value', () => {
    expect(HealthProfileUpdateSchema.safeParse({ gender: 'ROBOT' }).success).toBe(false);
  });

  it('rejects an out-of-range age', () => {
    expect(HealthProfileUpdateSchema.safeParse({ age: 200 }).success).toBe(false);
  });

  it('rejects an age of 17 and accepts 18 (adults only)', () => {
    expect(HealthProfileUpdateSchema.safeParse({ age: 17 }).success).toBe(false);
    expect(HealthProfileUpdateSchema.safeParse({ age: 18 }).success).toBe(true);
  });

  it('rejects ages below 17 and above 120 and accepts the upper bound', () => {
    expect(HealthProfileUpdateSchema.safeParse({ age: 1 }).success).toBe(false);
    expect(HealthProfileUpdateSchema.safeParse({ age: 120 }).success).toBe(true);
    expect(HealthProfileUpdateSchema.safeParse({ age: 121 }).success).toBe(false);
  });

  it('accepts a partial emergency contact', () => {
    const result = HealthProfileUpdateSchema.safeParse({ emergencyContact: { name: 'Sam' } });
    expect(result.success).toBe(true);
  });
});
