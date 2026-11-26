import { describe, expect, it } from 'vitest';
import { rankRecommendationsByGoals, SetGoalsSchema } from './goals';

describe('SetGoalsSchema', () => {
  it('accepts one or two distinct goals', () => {
    expect(SetGoalsSchema.safeParse({ goals: ['SLEEP'] }).success).toBe(true);
    expect(SetGoalsSchema.safeParse({ goals: ['SLEEP', 'STRESS'] }).success).toBe(true);
  });

  it('rejects none, three, duplicates and unknown goals', () => {
    expect(SetGoalsSchema.safeParse({ goals: [] }).success).toBe(false);
    expect(SetGoalsSchema.safeParse({ goals: ['SLEEP', 'STRESS', 'MOVEMENT'] }).success).toBe(false);
    expect(SetGoalsSchema.safeParse({ goals: ['SLEEP', 'SLEEP'] }).success).toBe(false);
    expect(SetGoalsSchema.safeParse({ goals: ['FLYING'] }).success).toBe(false);
  });
});

describe('rankRecommendationsByGoals', () => {
  const faceHigh = { priority: 'HIGH', sourceAssessment: 'FACE' } as const;
  const squatsLow = { priority: 'LOW', sourceAssessment: 'SQUATS' } as const;
  const postureMed = { priority: 'MEDIUM', sourceAssessment: 'POSTURE' } as const;

  it('returns the list unchanged without goals', () => {
    expect(rankRecommendationsByGoals([faceHigh, squatsLow], [])).toEqual([faceHigh, squatsLow]);
  });

  it('puts goal-related guidance first, then by priority', () => {
    expect(rankRecommendationsByGoals([faceHigh, squatsLow, postureMed], ['MOVEMENT'])).toEqual([
      postureMed,
      squatsLow,
      faceHigh,
    ]);
  });

  it('can drop unrelated guidance', () => {
    expect(rankRecommendationsByGoals([faceHigh, squatsLow], ['MOVEMENT'], { onlyGoalRelated: true })).toEqual([
      squatsLow,
    ]);
  });
});
