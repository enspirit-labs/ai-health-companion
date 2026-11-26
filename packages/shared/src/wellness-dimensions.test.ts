import { describe, expect, it } from 'vitest';
import { ASSESSMENT_TYPES } from './assessment-types';
import {
  ASSESSMENT_TYPE_TO_DIMENSION,
  WELLNESS_DIMENSION_KEYS,
  assessmentTypesForDimension,
  computeWellnessSummary,
} from './wellness-dimensions';

const scoreOf = (summary: ReturnType<typeof computeWellnessSummary>, key: string) =>
  summary.dimensions.find((d) => d.key === key)?.score;

describe('ASSESSMENT_TYPE_TO_DIMENSION', () => {
  it('maps every assessment type to a known dimension', () => {
    for (const type of ASSESSMENT_TYPES) {
      expect(WELLNESS_DIMENSION_KEYS).toContain(ASSESSMENT_TYPE_TO_DIMENSION[type]);
    }
  });

  it('feeds Stress & Mental Wellness only from the Mental Wellness questionnaire', () => {
    expect(assessmentTypesForDimension('mentalWellness')).toEqual(['MENTAL_WELLNESS']);
  });

  it('gives every dimension exactly one source assessment, and every type its own dimension', () => {
    for (const key of WELLNESS_DIMENSION_KEYS) {
      expect(assessmentTypesForDimension(key)).toHaveLength(1);
    }
    expect(new Set(Object.values(ASSESSMENT_TYPE_TO_DIMENSION)).size).toBe(ASSESSMENT_TYPES.length);
  });

  it('has no combined activity dimension', () => {
    expect(WELLNESS_DIMENSION_KEYS as readonly string[]).not.toContain('activity');
  });
});

describe('computeWellnessSummary', () => {
  it('returns no overall score and empty dimensions when nothing is completed', () => {
    const summary = computeWellnessSummary([]);
    expect(summary.overallScore).toBeNull();
    expect(summary.includedTypes).toEqual([]);
    expect(summary.dimensions.every((d) => d.score === null)).toBe(true);
    expect(summary.dimensions.map((d) => d.key)).toEqual([...WELLNESS_DIMENSION_KEYS]);
  });

  it('shows each completed type under its own label and counts all of them in the overall score', () => {
    // The production account from the bug report.
    const summary = computeWellnessSummary([
      { type: 'FACE', score: 72 },
      { type: 'EYE', score: 82 },
      { type: 'SKIN', score: 74 },
      { type: 'LIFESTYLE', score: 65 },
      { type: 'MEMORY', score: 28 },
      { type: 'TEETH', score: 62 },
    ]);

    expect(scoreOf(summary, 'face')).toBe(72);
    expect(scoreOf(summary, 'eye')).toBe(82);
    expect(scoreOf(summary, 'skin')).toBe(74);
    expect(scoreOf(summary, 'lifestyle')).toBe(65);
    expect(scoreOf(summary, 'memory')).toBe(28);
    expect(scoreOf(summary, 'teeth')).toBe(62);
    expect(summary.overallScore).toBeCloseTo((72 + 82 + 74 + 65 + 28 + 62) / 6);
    expect(summary.includedTypes).toHaveLength(6);
  });

  it('leaves Stress & Mental Wellness empty when only an Eye result exists', () => {
    const summary = computeWellnessSummary([{ type: 'EYE', score: 82 }]);
    expect(scoreOf(summary, 'mentalWellness')).toBeNull();
    expect(scoreOf(summary, 'eye')).toBe(82);
  });

  it('shows each physical test under its own tile instead of a combined Activity score', () => {
    const summary = computeWellnessSummary([
      { type: 'SQUATS', score: 60 },
      { type: 'HAND_COORDINATION', score: 80 },
    ]);
    expect(scoreOf(summary, 'squats')).toBe(60);
    expect(scoreOf(summary, 'handCoordination')).toBe(80);
    expect(scoreOf(summary, 'walking')).toBeNull();
    expect(summary.overallScore).toBe(70);
    expect(summary.includedTypes).toEqual(['SQUATS', 'HAND_COORDINATION']);
  });

  it('uses only the first entry when a type is passed twice', () => {
    const summary = computeWellnessSummary([
      { type: 'SKIN', score: 90 },
      { type: 'SKIN', score: 10 },
    ]);
    expect(scoreOf(summary, 'skin')).toBe(90);
    expect(summary.overallScore).toBe(90);
  });
});
