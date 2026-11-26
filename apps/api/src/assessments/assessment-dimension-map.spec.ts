import { WELLNESS_DIMENSION_KEYS } from '@aidoctor/shared';

import { DIMENSION_TO_SNAPSHOT_COLUMN } from './assessment-dimension-map';

describe('DIMENSION_TO_SNAPSHOT_COLUMN', () => {
  it('stores each dimension in a distinct snapshot column', () => {
    const columns = Object.values(DIMENSION_TO_SNAPSHOT_COLUMN);
    expect(new Set(columns).size).toBe(columns.length);
  });

  it('only maps real dashboard dimensions', () => {
    for (const key of Object.keys(DIMENSION_TO_SNAPSHOT_COLUMN)) {
      expect(WELLNESS_DIMENSION_KEYS).toContain(key);
    }
  });

  it('no longer writes the old combined Activity column', () => {
    expect(Object.values(DIMENSION_TO_SNAPSHOT_COLUMN)).not.toContain('fitnessScore');
  });

  it('keeps Stress & Mental Wellness in its own column', () => {
    expect(DIMENSION_TO_SNAPSHOT_COLUMN.mentalWellness).toBe('mentalWellnessScore');
  });
});
